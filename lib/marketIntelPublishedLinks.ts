import {load} from 'cheerio';
import {readPublicPage,sameCompanySite} from './companyWebsiteNews';
import {collectionKey,readCollectionRow,writeCollectionRow} from './marketIntelCollectionStore';
import {collectedInCurrentCycle} from './marketIntelCadence';

export type PublishedWebsiteLink={url:string;title:string;published:string};
/** Use a site's advertised public publishing API to discover recent URLs.
 * CMS records select work; the reader still verifies each public article. */
export async function discoverPublishedWebsiteLinks(domain:string):Promise<PublishedWebsiteLink[]>{
 const id=`market-intel:published-links:${collectionKey(domain)}`;
 try {
  const saved=(await readCollectionRow(id))?.catalog;
  if(saved?.links && collectedInCurrentCycle(saved.at))return saved.links;
  const home=await readPublicPage(`https://${domain}`),$=load(home.html);
  const href=$('link[rel="https://api.w.org/"]').attr('href');
  if(!href || !sameCompanySite(href,domain))return [];
  const root=new URL(href,home.url);if(!/^https?:$/.test(root.protocol))return [];
  const get=async(url:URL)=>{
   if(!sameCompanySite(url.href,domain))throw Error('Off-site publishing API');
   const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`Publishing API HTTP ${r.status}`);
   return {data:await r.json(),pages:Number(r.headers.get('x-wp-totalpages')||1)};
  };
  const types=await get(new URL('wp/v2/types',root));
  const sources=Object.values(types.data).filter((t:any)=>/post|news|blog|insight|resource|press|publication|event/i.test(`${t.slug} ${t.name} ${t.rest_base}`)) as any[];
  const links:PublishedWebsiteLink[]=[];let next=0,complete=true;
  await Promise.all(Array.from({length:Math.min(3,sources.length)},async()=>{
   while(next<sources.length){const source=sources[next++],endpoint=source._links?.['wp:items']?.[0]?.href;
    if(!endpoint)continue;
    try{
     const url=new URL(endpoint);url.search=new URLSearchParams({after:new Date(Date.now()-90*86400_000).toISOString().slice(0,19),per_page:'100',_fields:'link,date_gmt,title',orderby:'date',order:'desc'}).toString();
     let pages=1;
     for(let page=1;page<=pages;page++){
      url.searchParams.set('page',String(page));const result=await get(url);pages=result.pages;
      if(!Array.isArray(result.data))throw Error('Invalid publishing feed');
      for(const item of result.data){
       if(typeof item.link!=='string'||!sameCompanySite(item.link,domain)||!item.date_gmt||!item.title?.rendered)continue;
       const published=item.date_gmt+'Z';if(!Number.isFinite(Date.parse(published))||Date.parse(published)>Date.now())continue;
       links.push({url:item.link,title:load(item.title.rendered).text(),published});
      }
      if(page>=20 && pages>page){complete=false;break;}
     }
    }catch{complete=false;}
   }
  }));
  const unique=[...new Map(links.map(item=>[item.url,item])).values()].sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));
  if(complete)await writeCollectionRow(id,{links:unique,at:new Date().toISOString()});
  return unique;
 }catch{return [];}
}
