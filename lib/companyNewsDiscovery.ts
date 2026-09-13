import { load } from "cheerio";
import { requestMarketIntelSearch, requestMarketIntelWebSearch, requestMarketIntelNewsSearch, requestMarketIntelSourceSearch } from './marketIntelSearch';
import { cleanSourceLabel, type FeedNews } from './marketIntelFeed';
import { dedupeCompanyNews, isNewsIndex, filterCompanyNews, hydrateCompanyNews, publishedDate, readPublicPage } from './companyWebsiteNews';

/** A clipped search headline is only a prefix, not a different announcement. */
export function sameAnnouncementTitle(a:string,b:string):boolean {
  const normalize=(s:string)=>s.toLowerCase().replace(/[’']/g,'').replace(/(?:\.{3}|…)\s*$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  const x=normalize(a),y=normalize(b);
  if(x.length<45||y.length<45)return false;
  return x===y || (/(?:\.{3}|…)\s*$/.test(a)&&y.startsWith(x)) || (/(?:\.{3}|…)\s*$/.test(b)&&x.startsWith(y));
}

/** Verify the original date of transaction announcements, independently of a
 * republisher's changing page date. References come from search, never fixtures. */
export async function staleTransactionNews(name:string,items:{i:number;title:string}[],key:string):Promise<Set<number>> {
  const rejected=new Set<number>();
  const transactions=items.filter(n=>/\bacquir|\bacquisition|\bmerg(?:er|es|ed|ing)\b/i.test(n.title));
  for(let at=0;at<transactions.length;at+=5){
    const batch=transactions.slice(at,at+5);
    const data=await requestMarketIntelSearch({query:batch.map(n=>`"${name.replace(/"/g,'')}" ${n.title}`),max_results:20,max_tokens_per_page:1000},key,'news-publication-history',name,'search');
    const {resolveArticleEvidence}=await import('./marketIntelSummarize');
    for(const item of batch){
      const older=(data.results||[]).filter((hit:any)=>typeof hit.title==='string'&&typeof hit.url==='string'&&publishedDate(hit.date)&&Date.now()-Date.parse(hit.date)>90*86400_000&&/\bacquir|\bacquisition|\bmerger\b/i.test(hit.title));
      for(const hit of older.slice(0,4)){
        const evidence=await resolveArticleEvidence(hit.url);
        if(evidence?.published && Date.now()-Date.parse(evidence.published)>90*86400_000 && sameAnnouncementTitle(item.title,evidence.title)){rejected.add(item.i);break;}
      }
    }
  }
  return rejected;
}

/** Initial discovery searches raw results, then follows the stories it found.
 * URLs and dates always come from search or publisher evidence, never model prose. */
export async function discoverInitialCompanyNews(name:string,domain:string|null,key:string|undefined,officialInput:FeedNews[]|Promise<FeedNews[]>=[],identityQuery?:string,webSearchToken?:string,fastInitial=false):Promise<{news:FeedNews[];cost:number;failed:boolean}>{
  const clean=name.replace(/["\r\n]/g,' ').trim();
  const after=new Date(Date.now()-90*86400_000).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const excluded=['-linkedin.com','-facebook.com','-instagram.com','-youtube.com',...(domain?[`-${domain}`]:[])];
  let cost=0;const candidates:FeedNews[]=[];let failed=false;
  const search=async(query:string[],omit=excluded,dated=true)=>{
    if(!key)throw new Error('Perplexity search is not configured.');
    const data=await requestMarketIntelSearch({query,max_results:20,max_tokens_per_page:1200,...(dated ? {search_after_date_filter:after} : {}),search_domain_filter:omit},key,'company-news-discovery',name,'search');
    cost+=data.usage?.cost?.total_cost||0;
    for(const hit of data.results||[]){
      if(typeof hit.url!=='string'||typeof hit.title!=='string')continue;
      try { candidates.push({url:hit.url,title:hit.title,source:cleanSourceLabel(new URL(hit.url).hostname),published:publishedDate(hit.date),excerpt:typeof hit.snippet==='string'?hit.snippet:undefined}); }catch{}
    }
  };
  const initialSearch = search([`"${clean}" news announcements`,`"${clean}" press releases`,...(identityQuery ? [identityQuery] : [])]).catch(()=>{failed=true;});
  const officialUpdates = await officialInput;
  await initialSearch;
  if(webSearchToken){
    if(!candidates.length)try{
      const found=await requestMarketIntelNewsSearch(clean,webSearchToken,name);
      cost+=found.cost;failed ||= found.failed;
      for(const hit of found.items){
        if(typeof hit.url!=='string'||typeof hit.title!=='string')continue;
        try{candidates.push({url:hit.url,title:hit.title,source:typeof hit.source==='string'?hit.source:hit.source?.title||cleanSourceLabel(new URL(hit.url).hostname),published:publishedDate(hit.published||hit.date)});}catch{}
      }
    }catch{failed=true;}
    try {
      const omit=domain?` -site:${domain}`:'';
      const titles=officialUpdates.map(n=>n.title).filter(t=>t.length>=30);
      const found=await requestMarketIntelWebSearch([`"${clean}" news${omit}`,`"${clean}" news after:${new Date(Date.now()-90*86400_000).toISOString().slice(0,10)}${omit}`,...titles.slice(0,fastInitial ? 2 : 6).map(t=>`"${clean}" ${t}${omit} -site:linkedin.com`)],webSearchToken,name);
      cost+=found.cost;
      failed ||= found.failed;
      for(const page of found.pages)for(const hit of [...(page.organicResults||[]),...(page.imageResults||[])]){
        const url=hit.url||hit.link;
        if(typeof url!=='string'||typeof hit.title!=='string')continue;
        try{candidates.push({url,title:hit.title,source:cleanSourceLabel(new URL(url).hostname),published:publishedDate(hit.date),excerpt:hit.description});}catch{}
      }
      // Search snippets sometimes quote a neighbouring article instead of the
      // page title. Search that discovered publisher for the company itself.
      if(!fastInitial){
        const publishers=[...new Set(candidates.filter(n=>!n.title.toLowerCase().includes(clean.toLowerCase())&&n.excerpt?.toLowerCase().includes(clean.toLowerCase())).map(n=>new URL(n.url).hostname))].filter(h=>!/(?:linkedin|facebook|instagram|youtube)\.com$/.test(h)).slice(0,8);
        for(let at=0;at<publishers.length;at+=4)await search(publishers.slice(at,at+4).map(host=>`site:${host} "${clean}"`),excluded,false);
      }
    }catch{failed=true;}
  }
  /* A newly tracked company should become useful quickly. The searches above
     already cover independent news, press releases, the company identity
     query, Google/Apify web results and official headline syndication hints.
     Deep publisher expansion, archive walking and historical date forensics
     remain available to the standing refresh, but keeping them on the
     onboarding request made a normal company sit on step 2 for 5-8 minutes.
     Read a bounded, diverse set now; the daily collector can broaden it later. */
  if(fastInitial){
    const seenHosts=new Set<string>();
    const ordered=filterCompanyNews(candidates,name,domain,90*86400_000,false)
      .sort((a,b)=>Number(!!b.published)-Number(!!a.published));
    const selected:FeedNews[]=[];
    for(const item of ordered){
      let host='';try{host=new URL(item.url).hostname.replace(/^www\./,'');}catch{continue;}
      if(seenHosts.has(host) && selected.length<6)continue;
      seenHosts.add(host);selected.push(item);
      if(selected.length>=8)break;
    }
    const news=await hydrateCompanyNews(selected,name,domain,false);
    return {news:dedupeCompanyNews(news).filter(n=>n.published && Date.now()-Date.parse(n.published)<90*86400_000),cost,failed};
  }
  const headlines=[...new Set([...officialUpdates.filter(n=>/news|press|announc/i.test(new URL(n.url).pathname)),...filterCompanyNews(candidates,name,domain)].map(n=>n.title.replace(/(?:\.{3}|…)\s*$/,'').trim()).filter(t=>t.length>=35))].slice(0,4);
  if(headlines.length){
    try {await search(headlines.map(title=>`"${clean}" ${title} original release syndicated news`));}catch{failed=true;}
  }
  // A final bounded search prevents the same high-ranking publishers taking every slot.
  const covered=[...new Set(candidates.filter(n=>!(/press releases$/i.test(n.title)||/\/sources\//.test(n.url))).map(n=>{try{return '-'+new URL(n.url).hostname.replace(/^www\./,'');}catch{return '';}}))].filter(Boolean);
  try {await search([`"${clean}" news press release`,...headlines.slice(0,2).map(t=>`"${clean}" ${t}`)],[...new Set([...excluded,...covered])].slice(0,20));}catch{failed=true;}
  const shortHeadlines=headlines.slice(0,2).map(t=>t.split(/\W+/).filter(w=>w.length>2 && !/^(extends?|expands?|announces?|launches?|introduces?|full|clinical|data|lifecycle|across|with|from|that|this|the|and|for|into|new|release|news)$/i.test(w) && !name.toLowerCase().split(/\W+/).includes(w.toLowerCase())).slice(0,2).join(' '));
  const allCovered=[...new Set(candidates.map(n=>{try{return '-'+new URL(n.url).hostname.replace(/^www\./,'');}catch{return '';}}))].filter(Boolean);
  try {if(shortHeadlines.length) await search(shortHeadlines.map(t=>`"${clean}" ${t}`),[...new Set([...excluded,...allCovered])].slice(0,20),false);}catch{failed=true;}
  // Google News clusters syndicated stories and can rotate the one publisher
  // it exposes. Repeat the web search once with already-found publishers
  // excluded, so their copies do not occupy the same first two result pages.
  if(webSearchToken && shortHeadlines.length){
    const queries=headlines.slice(0,2).flatMap(title=>{
      const publishers=new Map<string,number>();
      for(const item of candidates.filter(item=>sameAnnouncementTitle(item.title,title)&&!isNewsIndex(item.url))){
        try{const host=new URL(item.url).hostname.replace(/^www\./,'');if(host==='news.google.com')continue;publishers.set(host,(publishers.get(host)||0)+1);}catch{}
      }
      const omit=[domain,'linkedin.com',...[...publishers].sort(([a,x],[b,y])=>y-x||a.localeCompare(b)).slice(0,10).map(([host])=>host)].filter(Boolean).map(host=>`-site:${host}`).join(' ');
      const headline=title.replace(/["\r\n]/g,' ');
      return [`${title.toLowerCase().includes(clean.toLowerCase()) ? '' : `"${clean}" `}"${headline}" ${omit}`,`"${clean}" ${headline} ${omit}`];
    });
    try{
      const found=await requestMarketIntelWebSearch(queries,webSearchToken,name,4);
      cost+=found.cost;failed ||= found.failed;
      for(const page of found.pages)for(const hit of page.organicResults||[]){
        const url=hit.url||hit.link;if(typeof url!=='string'||typeof hit.title!=='string')continue;
        try{candidates.push({url,title:hit.title,source:cleanSourceLabel(new URL(url).hostname),published:publishedDate(hit.date),excerpt:hit.description});}catch{}
      }
    }catch{failed=true;}
  }
  const sourceSearchKey=process.env.OPENAI_API_KEY;
  if(sourceSearchKey){
    const queries=headlines.slice(0,2).map((title,i)=>{
      const date=[...officialUpdates,...candidates].find(n=>n.title===title)?.published;
      const month=date?new Date(date).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}):'';
      const known=[...new Set(candidates.filter(n=>sameAnnouncementTitle(n.title,title)).map(n=>new URL(n.url).hostname))].slice(0,20);
      return `Find publisher coverage of ${clean} (${domain||'official domain unavailable'}): ${title}. Published around ${month||'the last 90 days'}. Already discovered publishers: ${known.join(', ')||'none'}. Find additional independent outlets, including syndicated copies. Exclude social profiles and the company website. Search using the headline, then vary the query based on results. URLs must be actual tool sources.`;
    });
    if(!queries.length)queries.push(`"${clean}" news${domain?` -site:${domain}`:''} -site:linkedin.com`);
    await Promise.all(queries.map(async query=>{try{
      const found=await requestMarketIntelSourceSearch(query,sourceSearchKey,name);cost+=found.cost;
      for(const url of found.urls)candidates.push({url,title:'',source:cleanSourceLabel(new URL(url).hostname),published:null});
    }catch{failed=true;}}));
  }
  // Check distinct discovered stories without a recency filter. A republisher's
  // fresh crawl date must not disguise an acquisition announced years earlier.
  const storyTitles=[...new Set(filterCompanyNews(candidates,name,domain).map(n=>n.title))].filter(t=>t.length>35).slice(0,20);
  const historyBatches=Array.from({length:Math.ceil(storyTitles.length/5)},(_,i)=>storyTitles.slice(i*5,i*5+5));
  for(let at=0;at<historyBatches.length;at+=2) await Promise.all(historyBatches.slice(at,at+2).map(async batch=>{
    try {await search(batch.map(title=>`"${clean}" "${title.replace(/["\r\n]/g,' ').slice(0,160)}"`),excluded,false);}catch{failed=true;}
  }));
  // Follow publisher result pages to their real article links before filtering indexes.
  const indexScore=(item:FeedNews)=>Number(item.title.toLowerCase().includes(clean.toLowerCase()))*2+Number((item.excerpt||'').toLowerCase().includes(clean.toLowerCase()));
  const indexes=[...new Map(candidates.filter(n=>isNewsIndex(n.url)).map(n=>[n.url,n])).values()].sort((a,b)=>indexScore(b)-indexScore(a));
  const indexQueue=indexes.slice(0,8).map(index=>({...index,depth:0}));
  const visitedIndexes=new Set<string>();
  for(let cursor=0;cursor<indexQueue.length && cursor<12;){
    const batch=indexQueue.slice(cursor,Math.min(cursor+3,12));
    cursor+=batch.length;
    await Promise.all(batch.map(async index=>{
    if(visitedIndexes.has(index.url))return;visitedIndexes.add(index.url);
    try {
      const page=await readPublicPage(index.url);const $=load(page.html);
      $('a[href]').each((_,el)=>{const title=$(el).text().replace(/\s+/g,' ').trim();if(title.length<35||!title.toLowerCase().includes(name.toLowerCase()))return;
        try {const url=new URL($(el).attr('href')!,index.url);if(url.hostname!==new URL(index.url).hostname||url.pathname===new URL(index.url).pathname)return;candidates.push({title,url:url.href,source:index.source,published:null});}catch{}
      });
      const current=new URL(index.url);
      const pageNumber=Number(current.pathname.match(/\/(?:page|bpage|p)\/(\d+)/)?.[1]||current.searchParams.get('page')||1);
      const next=$('a[href]').toArray().map(el=>({href:$(el).attr('href')!,label:$(el).text().trim(),rel:$(el).attr('rel')})).find(link=>{
        try{const target=new URL(link.href,current);return target.hostname===current.hostname&&
          (link.rel==='next'||/^(?:next|older)(?: page| posts| articles)?[\s»›→]*$/i.test(link.label)||
          (link.label===String(pageNumber+1)&&(/\/(?:page|bpage|p)\/\d+/.test(target.pathname)||target.searchParams.has('page'))));}catch{return false;}
      });
      if(next){
        if(index.depth<2 && indexQueue.length<12)indexQueue.push({...index,url:new URL(next.href,current).href,depth:index.depth+1});
        // The bounded index walk already covered the newest pages. Older
        // archive pagination is deferred without marking usable discovery as
        // failed.
      }
    }catch{failed=true;}
    }));
  }
  const normalized=(title:string)=>title.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();
  const oldTitles=new Set<string>();
  const recentTitles=new Set(candidates.filter(n=>n.published && Date.now()-Date.parse(n.published)<=90*86400_000).map(n=>normalized(n.title)));
  const {resolveArticleEvidence}=await import('./marketIntelSummarize');
  const dateChecks=candidates.filter(n=>n.published && Date.now()-Date.parse(n.published)>90*86400_000 && recentTitles.has(normalized(n.title))).slice(0,8);
  for(let at=0;at<dateChecks.length;at+=3) await Promise.all(dateChecks.slice(at,at+3).map(async candidate=>{
    const original=await resolveArticleEvidence(candidate.url);
    if(original?.published && Date.now()-Date.parse(original.published)>90*86400_000) oldTitles.add(normalized(candidate.title));
  }));
  const eligible=candidates.filter(n=>!oldTitles.has(normalized(n.title)));
  // Plausible headlines with only partial text are retained for the labeling
  // retry queue. They do not make otherwise successful source discovery fail.
  const news=await hydrateCompanyNews(filterCompanyNews(eligible,name,domain,90*86400_000,false),name,domain,true);
  return {news:dedupeCompanyNews(news).filter(n=>n.published && Date.now()-Date.parse(n.published)<90*86400_000),cost,failed};
}
