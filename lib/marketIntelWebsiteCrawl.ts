import { load } from 'cheerio';
import { discoverPublishedWebsiteLinks } from './marketIntelPublishedLinks';
import { selectWebsiteArticleLinks } from './marketIntelWebsiteSelection';
import { articleFromHtml, isNewsIndex, sameCompanySite, readPublicPage, type DirectSiteResult } from './companyWebsiteNews';
import { collectionKey, readCollectionRow, writeCollectionRow } from './marketIntelCollectionStore';
import { collectedInCurrentCycle } from './marketIntelCadence';
import { requestRenderedNewsPage } from './marketIntelSearch';
import type { FeedNews } from './marketIntelFeed';

const SECTION = /news|press|media|blog|insights|perspectives|resources|education[-/]hub|publications|announcements|releases/i;
const AGE = 90 * 86400_000;
export function isWebsiteListing(url:string) {
  const path=new URL(url).pathname.replace(/\/$/,'');
  return /\/(?:news|newsroom|press|press-releases|media|blog|insights|perspectives|resources|education-hub|publications|announcements|releases)$|\/page\/\d+$/i.test(path) || !path;
}
export const websitePageKey = (url:string) => `market-intel:website-page:${collectionKey(url.replace(/\/$/,''))}`;
export const websiteMapKey = (domain:string) => `market-intel:website-map:${collectionKey(domain)}`;

export function websiteArticlePriority(url:string,now=Date.now()):number {
  const match=new URL(url).pathname.match(/\/(20\d{2})\/(0?[1-9]|1[0-2])(?:\/|$)/);
  if(!match)return 0;
  const month=Date.UTC(Number(match[1]),Number(match[2])-1,1);
  // URL dates only order work; publication dates still require page evidence.
  return month>=now-AGE-31*86400_000 ? month : -1;
}

/** Persist parsed provider pages, including archive pages with no recent article.
 * The daily pass can discover new URLs without buying the archive again. */
export async function rememberWebsitePage(domain:string, url:string, html:string) {
  if(!sameCompanySite(url,domain)) return null;
  const item=articleFromHtml(html,url,domain);
  const $=load(html);
  $('header, footer, nav, aside').remove();
  const links:string[]=[];
  $('a[href]').each((_,el)=>{
    try { const u=new URL($(el).attr('href')!,url);u.hash='';
      const label=$(el).text().replace(/\s+/g,' ').trim();
      const articleLink=label.length>=35 && u.pathname.split('/').filter(Boolean).length>=2;
      if(sameCompanySite(u.href,domain)&&(SECTION.test(u.pathname)||articleLink)&&! /\.(pdf|png|jpe?g|svg|zip|mp4)$/i.test(u.pathname)) links.push(u.href);
    }catch{}
  });
  const value={linkVersion:3,parserVersion:3,item,links:[...new Set(links)],at:new Date().toISOString(),url};
  await writeCollectionRow(websitePageKey(url),value);
  return value;
}

/** Follow redirects issued by the supplied official site, rather than guessing
 * a replacement domain from search. Cache successful resolution for one day. */
export async function resolveWebsiteDomain(domain:string):Promise<string> {
  const id=`market-intel:website-origin:${collectionKey(domain)}`;
  const prior=(await readCollectionRow(id))?.catalog;
  if(prior?.domain && Date.now()-Date.parse(prior.at)<86400_000)return prior.domain;
  try {
    const page=await readPublicPage(`https://${domain}`);
    const resolved=new URL(page.url).hostname.replace(/^www\./,'');
    await writeCollectionRow(id,{domain:resolved,at:new Date().toISOString()});
    return resolved;
  } catch { return domain; }
}

/** Firecrawl discovers public URLs; headlines and dates come from the actual
 * page, never generated search prose. Called by the existing daily site job. */
export async function collectFirecrawlWebsite(domain:string,key:string,options:{fastInitial?:boolean}={}):Promise<DirectSiteResult> {
  domain=await resolveWebsiteDomain(domain);
  const errors:string[]=[];
  const publishedLinks=await discoverPublishedWebsiteLinks(domain);

  const mapId=websiteMapKey(domain);
  let map=(await readCollectionRow(mapId))?.catalog;
  if(!map?.links || !collectedInCurrentCycle(map.at)) {
    const response=await fetch('https://api.firecrawl.dev/v2/map',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({url:`https://${domain}`,sitemap:'include',includeSubdomains:true,ignoreQueryParameters:true,limit:5000,timeout:60000}),
      signal:AbortSignal.timeout(65000),
    });
    const data=await response.json();
    if(!response.ok||!data.success||!Array.isArray(data.links)) throw new Error(`Website discovery HTTP ${response.status}`);
    map={links:data.links,at:new Date().toISOString()};
    await writeCollectionRow(mapId,map);
  }
  const normalize=(url:string)=>url.replace(/\/$/,'');
  const queue=new Set<string>();
  for(const link of map.links) {
    if(sameCompanySite(link.url,domain)&&SECTION.test(new URL(link.url).pathname)&&! /\.(pdf|png|jpe?g|svg|zip|mp4)$/i.test(new URL(link.url).pathname)) queue.add(normalize(link.url));
  }
  const selected=await selectWebsiteArticleLinks(domain,map.links);
  if(selected?.failed)errors.push("AI article selection was incomplete; discovery also used website links.");
  if(selected){
    if(!selected.failed)queue.clear();
    for(const url of [...selected.listings,...selected.articles])queue.add(normalize(url));
  }
  for(const link of publishedLinks)queue.add(normalize(link.url));
  const publishedDates=new Map(publishedLinks.map(link=>[normalize(link.url),Date.parse(link.published)]));
  const mappedUrls=new Set(queue);

  const entries=[...new Set([...(selected?.listings??[]).map(normalize),...[...queue].filter(isWebsiteListing)])];
  // Refresh listing pages before processing the archive: their links expose new
  // articles even when the search/map index has not caught up yet.
  const linksByListing=new Map<string,string[]>();
  const visited=new Set<string>();const updates=new Map<string,FeedNews>();let pagesRead=0;
  const scan=async(url:string)=>{
    if(visited.has(url))return;visited.add(url);
    try {
      let page=(await readCollectionRow(websitePageKey(url)))?.catalog;
      const isIndex=isWebsiteListing(url)||entries.includes(url);
      const fresh=page && (page.item || page.parserVersion===3) && (isIndex ? page.linkVersion===3 && collectedInCurrentCycle(page.at) : Date.now()-Date.parse(page.at)<7*86400_000);
      if(!fresh){
        const html=await requestRenderedNewsPage(url,key,{website:true,refresh:isIndex && !collectedInCurrentCycle(page?.at)});
        if(!html)throw new Error('Firecrawl could not read this page');
        page=await rememberWebsitePage(domain,url,html);
      }
      pagesRead++;
      if(page?.item && !isNewsIndex(url) && !isWebsiteListing(url) && !entries.includes(url) && Date.now()-Date.parse(page.item.published)<AGE) updates.set(normalize(page.item.url),page.item);
      if(isIndex) linksByListing.set(url,(page?.links??[]).map(normalize));
    }catch(e){errors.push(`${url}: ${e instanceof Error?e.message:'unreadable'}`);}
  };
  // Current landing pages expose new stories. Paginated archives must not
  // consume the first pass before any of those stories are read.
  const primaryEntries=entries.filter(url=>! /\/page\/\d+(?:[/?]|$)/i.test(url));
  const runWorkers=async(urls:string[],deadline=Infinity)=>{
    let next=0;
    await Promise.all(Array.from({length:Math.min(6,urls.length)},async()=>{
      while(next<urls.length && Date.now()<deadline)await scan(urls[next++]);
    }));
  };
  const initialDeadline=options.fastInitial ? Date.now()+35_000 : Infinity;
  // Onboarding needs a useful first briefing, not a complete reread of a
  // company's historical resource library. Recent publication-feed URLs and
  // current landing pages are enough for that first pass; the daily refresh
  // resumes from the saved page cache and walks the remaining archive.
  const firstPublished=(options.fastInitial ? [...publishedLinks]
    .sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)).slice(0,12) : publishedLinks)
    .map(link=>normalize(link.url));
  await runWorkers(firstPublished,initialDeadline);
  await runWorkers(options.fastInitial ? primaryEntries.slice(0,4) : primaryEntries,initialDeadline);
  // The newsroom orders current stories ahead of archives. Read those links
  // before the map backlog, which may contain years of older pages.
  // Interleave each current listing so one large archive cannot starve another.
  const listingLinks=new Set<string>();
  const lists=entries.map(url=>linksByListing.get(url)??[]);
  for(let i=0;i<Math.max(0,...lists.map(list=>list.length));i++)
    for(const list of lists)if(list[i])listingLinks.add(list[i]);
  const unseen=[...listingLinks].filter(url=>!mappedUrls.has(url));
  const more=unseen.length ? await selectWebsiteArticleLinks(domain,unseen.map(url=>({url}))) : null;
  if(more?.failed)errors.push("Some new website links could not be classified; link discovery was retained.");
  const articleLinks=more&&!more.failed ? [...listingLinks].filter(url=>mappedUrls.has(url)||more.articles.some(article=>normalize(article)===url)) : [...listingLinks];
  // A public CMS publication feed is authoritative for its recent dated
  // content. Once available, supplement it with current listing links instead
  // of rereading every AI-selected URL from years of mapped archives.
  const candidateArticles=publishedLinks.length ? articleLinks : [...articleLinks,...queue];
  const newlyLinked=[...new Set(candidateArticles)].filter(url=>!visited.has(url))
    .sort((a,b)=>(publishedDates.get(b)??websiteArticlePriority(b))-(publishedDates.get(a)??websiteArticlePriority(a)));
  // Give actual article reads their own pass after discovery/AI selection.
  // Slow archive discovery previously exhausted this allowance with no news read.
  await runWorkers(options.fastInitial ? newlyLinked.slice(0,18) : newlyLinked,
    options.fastInitial ? initialDeadline : Date.now()+120_000);
  const remaining=newlyLinked.filter(url=>!visited.has(url)).length;
  if(remaining && !options.fastInitial)errors.push(`${remaining} website pages remain to be checked in a later refresh; saved pages will be reused.`);
  return {updates:[...updates.values()].sort((a,b)=>Date.parse(b.published!)-Date.parse(a.published!)),failed:pagesRead===0,pagesRead,errors,entryPoints:entries.sort((a,b)=>a.length-b.length).slice(0,5)};
}
