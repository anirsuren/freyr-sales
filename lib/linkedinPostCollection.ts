import type { FeedPost } from "./marketIntelFeed";
import { publishedDate } from "./companyWebsiteNews";

export function toPost(i: any): FeedPost | null {
  if (!hasLinkedInPostContent(i)) return null;
  return {
    url: linkedInActivityId(i) ? `https://www.linkedin.com/feed/update/urn:li:activity:${linkedInActivityId(i)}/` : i.post_url || i.url,
    text: String(i.text || ""),
    ...(i.media?.type ? { mediaType: String(i.media.type) } : {}),
    date: Number.isFinite(linkedInPostedAt(i)) ? publishedDate(new Date(linkedInPostedAt(i)).toISOString()) : null,
    reactions: i.stats?.total_reactions ?? null,
    comments: i.stats?.comments ?? null,
    reposts: i.stats?.reposts ?? null,
  };
}

export function hasLinkedInPostContent(item: any): boolean {
  return !!(item?.post_url || item?.url) && !!(item.text || item.media?.items?.length || item.attachment || item.document || item.reshared_post);
}

export function linkedInActivityId(item: {activity_urn?:string;post_url?:string;url?:string}): string | null {
  const supplied=String(item.activity_urn || "").match(/(?:^|:)(\d{18,20})$/)?.[1];
  return supplied || (item.post_url || item.url || "").match(/activity[:-](\d{18,20})/)?.[1] || null;
}

/** Activity IDs encode the UTC creation time; scraper timestamps can include
 * the scraper host's local offset. Invalid/non-activity IDs use source dates. */
export function linkedInPostedAt(item:any): number {
  const id=linkedInActivityId(item);
  if(id){const stamp=Number(BigInt(id)>>BigInt(22));if(stamp>=Date.UTC(2010,0,1)&&stamp<=Date.now()+86400_000)return stamp;}
  const raw=item.posted_at?.timestamp;
  return typeof raw==="number"?(raw<1e12?raw*1000:raw):Date.parse(raw);
}

/** The actor's page_number advances in blocks of 100, independently of limit.
 * A small daily probe is safe only when it overlaps stored coverage. Otherwise
 * reread that SAME page at its full size before advancing; never skip a block. */
export async function collectLinkedInPostPages(
  run: (input: {company_name:string;limit:number;page_number:number;sort:"recent"}) => Promise<any[]>,
  slug:string,
  options: { knownUrls?: string[]; maxPosts?: number; pageSize?: number; since?: number } = {},
): Promise<{items:any[];cost:number;truncated:boolean; error?:string}> {
  const pageWidth=100, maxPosts=Math.max(1,Math.min(500,options.maxPosts ?? 500));
  const key=(url:string)=>url.match(/activity[:-](\d+)/)?.[1] || url.split('?')[0];
  const known=new Set((options.knownUrls || []).map(key)), seen=new Set<string>(), items:any[]=[];
  const since=options.since ?? Date.now()-90*86400_000;
  let cost=0;
  let probe=known.size>0 && (options.pageSize ?? pageWidth)<pageWidth;
  for(let page=1;page<=Math.ceil(maxPosts/pageWidth)+1;) {
    const limit=probe?Math.max(5,Math.min(pageWidth,options.pageSize!)):pageWidth;
    let batch:any[];
    try { batch=await run({company_name:`linkedin.com/company/${slug}`,limit,page_number:page,sort:"recent"}); }
    catch(error){return {items,cost,truncated:true,error:error instanceof Error?error.message:String(error)};}
    if(!Array.isArray(batch))return {items,cost,truncated:true,error:"LinkedIn returned an invalid response."};
    cost+=typeof (batch as any).collectionCostUsd === "number" ? (batch as any).collectionCostUsd : batch.length*.005;
    if(batch.length===1 && batch[0]?.message)return {items,cost,truncated:true,error:String(batch[0].message)};
    let overlap=false,added=0,old=0;
    for(const item of batch){
      const url=item?.post_url || item?.url;if(!url)continue;
      const id=linkedInActivityId(item) || key(url);if(known.has(id))overlap=true;
      const timestamp=linkedInPostedAt(item);
      if(Number.isFinite(timestamp)&&timestamp<since){old++;continue;}
      if(!seen.has(id)){seen.add(id);items.push(item);added++;}
    }
    if(items.length>maxPosts)return {items:items.slice(0,maxPosts),cost,truncated:true};
    if(overlap || batch.length===0)return {items,cost,truncated:false};
    if(probe){probe=false;continue;}
    // An old pinned item alone is not a retention boundary. A full old page is.
    if(old===batch.length || batch.length<pageWidth || (batch.length>=5 && batch.slice(-5).every(item=>linkedInPostedAt(item)<since)))return {items,cost,truncated:false};
    if(!added || items.length>=maxPosts)return {items,cost,truncated:true};
    page++;
  }
  return {items,cost,truncated:true};
}
