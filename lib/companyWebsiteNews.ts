import { linkedInIdentifier } from "./marketIntelLinks";
import { load } from "cheerio";
import type { FeedNews } from "./marketIntelFeed";

const MAX_AGE = 90 * 86400_000;
const SECTION = /news|press|media|investor|announcements|releases|blog|insights|perspectives|education[- /]hub|resources|publications/i;
const INDEX = /^(news|newsroom|press releases?|media|media cent(?:re|er)|investors?|investor relations|blog|insights|home|latest news|all news|read more|learn more|results and presentations|managers[’']? transactions)$/i;
const BLOCKED = /just a moment|access denied|attention required|request rejected|page not found/i;
const text = (value: string) => value.replace(/\s+/g, " ").trim();

export function isAccessChallengeTitle(title:string):boolean {
  return /checking your browser|just a moment|access denied|attention required|making sure you.{0,8}re not a bot|verify (?:that )?you are human|security verification|captcha/i.test(title);
}

export function sameCompanySite(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.port && (host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}

export function publishedDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed <= Date.now() + 86400_000 ? (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : new Date(parsed).toISOString()) : null;
}

/** Visible bylines can be older than CMS import timestamps in JSON-LD. */
export function visiblePublicationDate(html: string): string | null {
  const $ = load(html);
  // Numeric day.month.year datelines are common on European wire services.
  // Only inspect short siblings immediately below the headline, never body events.
  const heading=$('h1').first();
  // Newsrooms place the dateline either immediately above or below the title.
  // Curebase uses a plain span before h1, without a semantic date class.
  const adjacent=[
    ...heading.prevAll().slice(0,2).not('aside,nav,footer').toArray().reverse(),
    ...heading.nextAll().slice(0,2).not('aside,nav,footer').toArray(),
  ];
  for (const el of adjacent) {
    const line = text($(el).text());
    const match = line.length < 180 && line.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})(?:\s|$)/);
    if (match) {
      const iso = `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
      const parsed = publishedDate(iso);
      if (parsed && new Date(parsed).toISOString().slice(0,10) === iso) return iso;
    }
    const namedDate = line.length < 180 && line.match(/^(?:Written by .{1,100}\s+)?(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,?\s+)?((?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?)\s+20\d{2})$/i);
    if (namedDate && publishedDate(namedDate[1])) return publishedDate(namedDate[1])!.slice(0,10);
  }
  // Prefer the article's own semantic dateline over unrelated dated cards.
  const primaryDate = $('h1').first().parent().find('[itemprop="datePublished"],time[datetime]').first();
  const semanticDate = primaryDate.length ? primaryDate : $('[itemprop="datePublished"]').not('meta').first();
  const semanticValue = semanticDate.attr('datetime') || semanticDate.find('time').first().attr('datetime') || semanticDate.text().trim();
  if (semanticValue && publishedDate(semanticValue)) return publishedDate(semanticValue)!.slice(0,10);
  $('aside,nav,footer,[role="dialog"],[class*="drawer"],[class*="related"],[class*="latest-post"]').remove();
  let dateText = ($('[class*="date-wrap"],.entry-date,[class*="publish-date"],[class*="published-date"],[class*="post-date"],[class*="article-date"]').first().html() || "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
  const monthDate=/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/i;
  if(!dateText){
    // A standalone dateline immediately after the article heading is also
    // publication evidence. Do not scan body event dates or site calendars.
    dateText=$('h1').first().nextAll().slice(0,2).map((_,el)=>text($(el).text())).get().find(value=>value.length<60&&value.match(monthDate)?.[0]===value)||'';
  }
  const labeled=$('time,span,i,p,div').map((_,el)=>text($(el).text())).get().find(value=>value.length<100&&/^(?:press release date|publication date|published(?: on)?)\s*:?\s*(?:\d|[A-Z])/i.test(value));
  const raw = dateText.match(monthDate)?.[0] || dateText.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || labeled?.replace(/^(?:press release date|publication date|published(?: on)?)\s*:?\s*/i,'');
  const parsed = publishedDate(raw);
  return parsed?.slice(0,10) ?? null;
}

/** Some CMSes describe news as WebPage rather than Article. Only use the
 * current page's publication date, never a related page or dateModified. */
export function pagePublicationDate(html: string, url: string): string | null {
  const normalize=(value:string)=>value.split('#')[0].replace(/\/$/,'');
  const $=load(html);let date:string|null=null;
  const visit=(value:any)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(value['@type']==='WebPage' && typeof (value.url||value['@id'])==='string' && normalize(value.url||value['@id'])===normalize(url)) date=publishedDate(value.datePublished)||date;
    if(value['@graph'])visit(value['@graph']);
  };
  $('script[type="application/ld+json"]').each((_,el)=>{try{visit(JSON.parse($(el).text()));}catch{}});
  return date;
}

export function isNewsIndex(url: string): boolean {
  try { if(/^\/(?:[a-z]{2}\/)?authors?\//i.test(new URL(url).pathname)) return true;
    if([...new URL(url).searchParams.keys()].some(k=>/^(?:before_id|after_id|cursor)$/i.test(k))) return true;
    if(/^\/(?:[a-z]{2}\/)?(?:info|information|actualidad|newsroom|latest-news|updates|blog|insights|perspectives|resources|globe[+ -]?newswire)\/?$/i.test(new URL(url).pathname))return true;
    if([...new URL(url).searchParams.keys()].some(k=>/article|story|release|newsid|^id$/i.test(k))) return false;
    if(new URL(url).pathname==='/')return true;
    if(/^\/(?:news|news-posts?|press-releases?|topics|sources|category|tag)(?:\/[^/]+)*\/(?:page|bpage|p)\/\d+\/?$/.test(new URL(url).pathname))return true;
    return /^\/(?:news|news-posts?|press-releases?|topics|sources|category|tag)(?:\/[^/]+)?\/?$/.test(new URL(url).pathname) &&
    (/^\/(?:topics|sources|category|tag)\//.test(new URL(url).pathname) || new URL(url).pathname.split('/').filter(Boolean).length===1); } catch { return false; }
}

export async function readPublicPage(url: string, domain?: string): Promise<{ html: string; url: string }> {
  let target = url;
  let triedWww = false;
  for (let redirect = 0; redirect < 5; redirect++) {
    if (domain && !sameCompanySite(target, domain)) throw new Error("Redirect leaves the company website");
    let response: Response;
    try { response = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "Accept-Language": "en", Accept: "text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9" },
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    } catch (error) {
      const parsed = new URL(target);
      // Some company apex hosts have broken DNS/TLS while their canonical www
      // site is healthy. Try that standard hostname, keeping TLS checks on.
      if (domain && !triedWww && parsed.hostname === domain && !domain.startsWith("www.")) {
        triedWww = true; parsed.hostname = `www.${domain}`; target = parsed.href; continue;
      }
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      target = new URL(response.headers.get("location")!, target).href;
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 3_000_000) { await reader.cancel(); throw new Error("Page exceeds collection limit"); }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    if (BLOCKED.test(load(html)("head > title").first().text())) throw new Error("Website blocked automated reading");
    return { html, url: target };
  }
  throw new Error("Too many redirects");
}

export function articleFromHtml(html: string, url: string, domain: string): FeedNews | null {
  if (!sameCompanySite(url, domain) || isNewsIndex(url)) return null;
  const $ = load(html);
  const objects: any[] = [];
  const walk = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (/Article|NewsArticle|BlogPosting|PressRelease/.test(String(value["@type"]))) objects.push(value);
    if (value["@graph"]) walk(value["@graph"]);
  };
  $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text())); } catch {} });
  const article = objects[0];
  const rawTitle = text(load(`<span>${article?.headline || $('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("head > title").first().text()}</span>`)("span").text());
  const withoutSiteSuffix=rawTitle.replace(/\s+[|·]\s+[^|·]{2,80}$/,'').trim();
  const title=withoutSiteSuffix.length>=18 ? withoutSiteSuffix : rawTitle;
  const published = visiblePublicationDate(html) || publishedDate(article?.datePublished || $('meta[property="article:published_time"],meta[name="date"],meta[name="pubdate"],meta[name="published-date"],meta[name="release-date"],meta[itemprop="datePublished"]').first().attr("content") || $('main time[datetime],article time[datetime]').first().attr("datetime") || $('main [class*="displaydate"],main [class*="publish-date"],article .entry-date').first().text().trim()) || pagePublicationDate(html,url);
  const path = new URL(url).pathname;
  const isDetail = !!article || $('meta[property="og:type"]').attr("content") === "article" || (SECTION.test(path) && (path.split("/").filter(Boolean).some((part) => part.length > 28) || /20\d\d[-/]\d\d/.test(path)));
  if (/results-and-presentations|managers-transactions|contact|media-library|overview|privacy/i.test(path)) return null;
  if (!isDetail || !title || title.length < (article || $('meta[property="og:type"]').attr("content") === "article" ? 3 : 18) || INDEX.test(title) || BLOCKED.test(title) || !published || Date.now() - Date.parse(published) > MAX_AGE) return null;
  return { title: title.slice(0, 300), url, published, source: domain };
}

export function newsFromXml(xml: string, officialDomain?: string): FeedNews[] {
  const $ = load(xml, { xml: true });
  const news: FeedNews[] = [];
  $("item,entry").each((_, el) => {
    const row = $(el);
    const url = row.find("link").first().attr("href") || row.find("link").first().text();
    const title = text(row.find("title").first().text());
    const published = publishedDate(row.find("pubDate,published").first().text());
    const source = text(row.find("source").first().text()) || (officialDomain ?? "");
    if (!url || !title || !published || Date.now() - Date.parse(published) > MAX_AGE || (officialDomain && !sameCompanySite(url, officialDomain))) return;
    try { if (!/^https?:$/.test(new URL(url).protocol)) return; } catch { return; }
    const suffix = ` - ${source}`;
    news.push({ title: title.endsWith(suffix) ? title.slice(0, -suffix.length) : title, url, published, source, ...(row.find("source").attr("url") ? {publisherUrl:row.find("source").attr("url")} : {}) });
  });
  return news;
}

export async function readGoogleNews(query: string): Promise<{ news: FeedNews[]; failed: boolean }> {
  try {
    const url = `https://news.google.com/rss/search?${new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" })}`;
    const { html } = await readPublicPage(url);
    if (!/<rss[\s>]/i.test(html)) throw new Error("News search did not return a feed");
    return { news: newsFromXml(html), failed: false };
  } catch { return { news: [], failed: true }; }
}

export function companyNewsQuery(name: string): string {
  const clean = name.replace(/["\r\n]/g, " ").trim();
  return `"${clean}" when:90d`;
}

export function filterCompanyNews(items: FeedNews[], name: string, domain?: string | null, maxAge=MAX_AGE, requireName=true): FeedNews[] {
  const words=name.toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>=2 && !/^(inc|ltd|co|of|global|company|group|the|and|eli)$/.test(word));
  const distinctive=words.filter(word=>!/^(health|healthcare|medical|clinical|life|sciences|services|solutions|consulting|regulatory|partners|international)$/.test(word));
  const tokens=distinctive.length ? distinctive : [words.join(' ')].filter(Boolean);
  const seen=new Set<string>();
  return items.filter(item=>{
    if (item.label?.isCompanyNews === false || isNewsIndex(item.url)) return false;
    const title=item.title.toLowerCase();
    const normalizedTitle=title.replace(/[^a-z0-9]+/g,' ').trim();
    const normalizedName=name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    // Bare app-store, directory and company-profile results often consist of
    // only the company name. They are not news without a fully read article.
    if(normalizedTitle===normalizedName && (!item.articleText || item.articleTextPartial))return false;
    if(/^globe\s*newswire(?:\s+new)?(?:\s*[-|]|$)/i.test(title))return false;
    // A login/landing page may mention the company in a promoted article.
    // Discover that article's link, but never publish the landing page as news.
    if(/(?:^|[\s-])(?:log[ -]?in|sign[ -]?in)(?:$|[\s–—-])|\bmembers(?:hip)?(?: area| lounge)?$/i.test(title))return false;
    const evidence=item.articleText||item.excerpt||'';
    if(/public\s*source/i.test(evidence)&&/public\s*post/i.test(evidence)&&/(?:read|reading|view).*?(?:full|complete|original)\s+post/i.test(evidence))return false;
    if (/^(?:category: )?press releases$|^.+ press releases$|^news from .+ portfolio$/.test(title)) return false;
    try { if (/^\/(?:leadership|team|firms|companies|providers|meetings-events|events?|conferences?)(?:\/|$)/i.test(new URL(item.url).pathname) || /\/(?:jobs?|careers?)\//i.test(new URL(item.url).pathname)) return false; } catch { return false; }
    try { if (/\/(?:event\/contact|speakers?|people|team|bios?|profiles?)\//i.test(new URL(item.url).pathname)) return false; } catch { return false; }
    let host="";try{host=new URL(item.publisherUrl || item.url).hostname;}catch{return false;}
    if(/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|reddit\.com|youtube\.com|glassdoor\.com|indeed\.com|statusgator\.com|crunchbase\.com|ambitionbox\.com|himalayas\.app|reveliolabs\.com|tofler\.in|jooble\.org|bebee\.com|simplyhired\.com|careerbeacon\.com|jobright\.ai|ziprecruiter\.com|remoterocketship\.com|mediabistro\.com|startup\.jobs|appsruntheworld\.com|dailyremote\.com)$/.test(host))return false;
    if(/careers|jobs\.|^directory\./.test(host) || (domain && sameCompanySite(item.publisherUrl || item.url,domain)))return false;
    if(requireName && !tokens.some(token=>new RegExp(`\\b${token}\\b`,"i").test(`${title} ${item.excerpt || item.summary || ""}`)))return false;
    if(/\bsalar(?:y|ies)\b|\bjob listings?\b|\bemployee (?:count|reviews?)\b|\bnumber of employees\b|\bheadcount data\b|company profile|venture-backed company|is down|having an outage|job (opening|search|in)|open to new opportunities|\bintern(ship)?\b|time to buy|buy, hold|top stock reports|price target|stock price|smarter dividend buy|reasons? to buy|buy .*stock|stock.*\b(buy|sell|hold)\b/i.test(title))return false;
    if (/market (?:research|report)|market.*\bCAGR\b|^top \d+ best |^(?:top|best)\b.*\b(?:platforms|tools|software|vendors|providers)\b/i.test(item.title)) return false;
    if(/buy (?:this|the) report|download (?:a )?free sample|request (?:a )?sample/i.test(item.excerpt??'')&&/market|forecast|industry.analysis/i.test(`${item.title} ${item.url}`))return false;
    if(item.published && (!publishedDate(item.published) || Date.now()-Date.parse(item.published)>maxAge))return false;
    const identity=`${item.url.split("#")[0]}|${host}`;
    if(seen.has(identity))return false;seen.add(identity);return true;
  });
}

export type DirectSiteResult = { updates: FeedNews[]; failed: boolean; pagesRead: number; errors: string[]; entryPoints: string[] };
/** Discover from real links, RSS and sitemaps; never construct an article URL or headline. */
export async function collectCompanyWebsite(domain: string): Promise<DirectSiteResult> {
  const visited = new Set<string>();
  const candidates = new Set<string>();
  const indexes = new Set<string>();
  const feeds = new Set<string>();
  const updates = new Map<string, FeedNews>();
  const errors: string[] = [];
  let pagesRead = 0;
  let htmlPagesRead = 0;
  const scan = async (url: string, discover: boolean) => {
    if (visited.has(url) || !sameCompanySite(url, domain)) return;
    visited.add(url);
    try {
      const page = await readPublicPage(url, domain); pagesRead++;
      if (/<(?:rss|feed)[\s>]/i.test(page.html.slice(0, 2000))) {
        for (const item of newsFromXml(page.html, domain)) updates.set(item.url, item);
        return;
      }
      if(load(page.html)('title,h1,main,article').length) htmlPagesRead++;
      const item = articleFromHtml(page.html, page.url, domain);
      if (item) updates.set(item.url, item);
      if (!discover) return;
      const $ = load(page.html);
      $('link[type*="rss"],link[type*="atom"]').each((_, el) => {
        try { const u = new URL($(el).attr("href")!, page.url).href; if (sameCompanySite(u, domain)) feeds.add(u); } catch {}
      });
      $("a[href]").each((_, el) => {
        const label = text($(el).text());
        try {
          const u = new URL($(el).attr("href")!, page.url); u.hash = "";
          if (!sameCompanySite(u.href, domain) || /\.(pdf|png|jpe?g|svg|webp|zip|mp4)$/i.test(u.pathname)) return;
          if (/rss|\.xml(?:$|\?)/i.test(u.href)) feeds.add(u.href);
          if (/\/(?:tag|author|category)\//i.test(u.pathname)) return;
          if (!SECTION.test(`${u.pathname} ${label}`)) return;
          if (/\/page\/\d+\/?$/.test(u.pathname)) {
            if (/^(?:page )?next$/i.test(label) || $(el).attr("rel") === "next") indexes.add(u.href);
            return;
          }
          if (/^(?:page )?next$/i.test(label) || $(el).attr("rel") === "next") { indexes.add(u.href); return; }
          let card = $(el).parent();
          let listingDate: string | null = null;
          for (let depth=0; depth<4 && card.length; depth++,card=card.parent()) {
            const content = text(card.text());
            if (content.length > 2000) break;
            const date = card.find('time[datetime]').first().attr('datetime') || content.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
            listingDate = publishedDate(date);
            if (listingDate) break;
          }
          if (listingDate && Date.now()-Date.parse(listingDate)>MAX_AGE) return;
          if (label.length >= 25 && !INDEX.test(label) && !/all |more |contact|subscribe|sign up|cookie|privacy|careers/i.test(label)) candidates.add(u.href);
          else indexes.add(u.href);
        } catch {}
      });
    } catch (error) { errors.push(`${url}: ${error instanceof Error ? error.message : "unreadable"}`); }
  };
  await scan(`https://${domain}`, true);
  const priority = (url: string) => /\/page\/\d+\/?$/.test(url) ? 4 : /press.?releases|media\/releases|media\/news|newsroom|\/news\/?$|\/blogs?\/?$/.test(url) ? 3 : /media|press|news/.test(url) ? 2 : 1;
  for (let wave = 0; wave < 4; wave++) {
    const next = [...indexes].filter(u=>!visited.has(u)).sort((a,b)=>priority(b)-priority(a)).slice(0,4);
    if (!next.length) break;
    await Promise.all(next.map(url=>scan(url,true)));
  }
  await Promise.all([...feeds].slice(0, 4).map((url) => scan(url, false)));
  // Sitemaps are a fallback when the homepage is a JS shell or the newsroom is not linked.
  if (candidates.size < 6) {
    const sitemapUrls = new Set([`https://${domain}/sitemap.xml`]);
    try {
      const robots = await readPublicPage(`https://${domain}/robots.txt`, domain);
      for (const match of robots.html.matchAll(/^Sitemap:\s*(\S+)/gim)) if (sameCompanySite(match[1], domain)) sitemapUrls.add(match[1]);
    } catch {}
    for (const url of [...sitemapUrls].slice(0, 3)) {
      try {
        const page = await readPublicPage(url, domain); pagesRead++;
        const $ = load(page.html, { xml: true });
        const children = $("sitemap loc").map((_, el) => $(el).text()).get().filter((u) => sameCompanySite(u, domain)).sort((a,b) => Number(SECTION.test(b))-Number(SECTION.test(a))).slice(0,3);
        const maps = children.length ? await Promise.all(children.map((u) => readPublicPage(u, domain).catch(() => null))) : [page];
        for (const map of maps) {
          if (!map) continue;
          const xml = load(map.html, { xml: true });
          xml("url").each((_, el) => {
            const u = xml(el).find("loc").text();
            const date = publishedDate(xml(el).find("lastmod").text());
            if (sameCompanySite(u, domain) && SECTION.test(u) && (!date || Date.now()-Date.parse(date)<MAX_AGE)) candidates.add(u);
          });
        }
      } catch {}
    }
  }
  const pending = [...candidates].filter((u) => !visited.has(u));
  const queue = pending.slice(0, 120);
  if (pending.length > queue.length) errors.push("Website article limit reached; some discovered articles remain unread.");
  for (let start=0; start<queue.length; start+=6) await Promise.all(queue.slice(start,start+6).map((url) => scan(url, false)));
  return { updates: [...updates.values()].sort((a,b) => Date.parse(b.published!)-Date.parse(a.published!)), failed: htmlPagesRead === 0 && updates.size === 0, pagesRead, errors, entryPoints: [...indexes].sort((a,b) => priority(b)-priority(a)).slice(0,3) };
}

/** A company can have a valid LinkedIn page without any public posts. Only
 * accept that fallback when its own website explicitly links to the page. */
export async function websiteConfirmsLinkedIn(domain: string, slug: string): Promise<boolean> {
  try {
    const page = await readPublicPage(`https://${domain}`, domain);
    const $ = load(page.html);
    return $("a[href]").toArray().some(el => linkedInIdentifier($(el).attr("href") || "", "company")?.toLowerCase() === slug.toLowerCase());
  } catch { return false; }
}

/** Only an unambiguous company link published by the official website is discovered. */
export function linkedInCompanyFromHtml(html: string): string | null {
  const $=load(html);
  const slugs=new Set($("a[href]").toArray().map(el=>linkedInIdentifier($(el).attr("href") || "", "company")).filter(Boolean));
  return slugs.size===1 ? `https://www.linkedin.com/company/${[...slugs][0]}` : null;
}

/** Broad and sector searches complement each other: a headline need not name
 * the company. Those candidates require a mention in the actual article body. */
export async function readCompanyNewsSearch(name: string, domain?: string | null, query?: string): Promise<{news:FeedNews[];failed:boolean}> {
  const base=query || companyNewsQuery(name);
  const broad=companyNewsQuery(name);
  const searches=await Promise.all([...new Set([broad,base,`${base} (site:prnewswire.com OR site:businesswire.com)`,...(domain ? [`${broad} -site:${domain}`] : [])])].map(readGoogleNews));
  const candidates=filterCompanyNews(searches.flatMap(r=>r.news),name,domain,MAX_AGE,false);
  return {news:await hydrateCompanyNews(candidates,name,domain),failed:searches.every(r=>r.failed)};
}

/** Read the article, not navigation chrome, before rejecting body-only mentions.
 * Resolve Google redirects so the same publisher article has one stored URL. */
export async function hydrateCompanyNews(candidates:FeedNews[],name:string,domain?:string|null,followLinks=true,onUnread?:(url:string)=>void):Promise<FeedNews[]> {
  // Search providers repeatedly return the same URL across queries. Read each
  // publisher article once, while retaining distinct publishers of the story.
  candidates=dedupeCompanyNews(candidates);
  const out:FeedNews[]=[];
  const discovered=new Map<string,FeedNews>();
  const known=new Set(candidates.map(n=>n.url.split('#')[0].replace(/\/$/,'')));
  const hydrate=async (item:FeedNews):Promise<FeedNews|null>=>{
      const {resolveArticleEvidence,decodeGoogleNewsUrl}=await import("./marketIntelSummarize");
      const resolved = item.url.includes("news.google.com") ? await decodeGoogleNewsUrl(item.url) : item.url;
      if(resolved && !resolved.includes("news.google.com")) item = {...item,url:resolved,publisherUrl:resolved};
      const evidence=await resolveArticleEvidence(item.url);
      // A search snippet may quote a neighbouring story. Without article
      // evidence, only an independently relevant headline can enter the feed.
      if(!evidence && !filterCompanyNews([{...item,excerpt:undefined,summary:undefined}],name,domain).length)return null;
      if((!evidence||evidence.partial)&&filterCompanyNews([item],name,domain,MAX_AGE,false).length&&
        `${item.title} ${new URL(item.url).pathname}`.toLowerCase().includes(name.toLowerCase()))onUnread?.(item.url);
      if(followLinks)for(const link of evidence?.articleLinks??[]){
        if(!link.title.toLowerCase().includes(name.toLowerCase())||known.has(link.url.split('#')[0].replace(/\/$/,'')))continue;
        const candidate={...link,published:null,source:new URL(link.url).hostname};
        if(filterCompanyNews([candidate],name,domain).length)discovered.set(link.url,candidate);
      }
      const pos=evidence?.text.toLowerCase().indexOf(name.toLowerCase()) ?? -1;
      const candidate:FeedNews=evidence ? {...item,url:evidence.url,publisherUrl:evidence.url,
        title:evidence.title.length>=18 ? evidence.title : item.title,
        articleText:evidence.text,articleReadAt:new Date().toISOString(),articleTextPartial:evidence.partial||false,
        ...(evidence.published ? {published:evidence.published} : {}),
        excerpt:evidence.text.slice(0,1000) + (pos>1000 ? " … " + evidence.text.slice(Math.max(0,pos-150),pos+900) : "")} : {...item,articleTextPartial:true};
      return filterCompanyNews([candidate],name,domain).length ? candidate : null;
  };
  // Keep six readers busy; a slow publisher must not hold up the other five.
  let cursor=0;
  const hydrated:(FeedNews|null)[]=new Array(candidates.length).fill(null);
  await Promise.all(Array.from({length:Math.min(6,candidates.length)},async()=>{
    while(cursor<candidates.length){const index=cursor++;hydrated[index]=await hydrate(candidates[index]);}
  }));
  out.push(...hydrated.filter((item):item is FeedNews=>item!==null));
  if(discovered.size)out.push(...await hydrateCompanyNews([...discovered.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(0,50).map(([,item])=>item),name,domain,false,onUnread));
  return dedupeCompanyNews(out);
}

/** Preserve separate publishers; collapse a Google redirect and its direct article. */
export function dedupeCompanyNews(items: FeedNews[]): FeedNews[] {
  const out: FeedNews[]=[];
  const host=(n:FeedNews)=>{try{return new URL(n.publisherUrl||n.url).hostname.replace(/^www\./,'');}catch{return '';}};
  const title=(n:FeedNews)=>n.title.toLowerCase().replace(/(?:\.{3}|…)\s*$/,'').replace(/\s+/g,' ').trim();
  for(const item of items){
    const prior=out.find(n=>n.url.split(/[?#]/)[0].replace(/\/$/,'')===item.url.split(/[?#]/)[0].replace(/\/$/,'') ||
      (host(n)===host(item) && host(n)!=='news.google.com' && n.published?.slice(0,10)===item.published?.slice(0,10) &&
      (title(n)===title(item) || (/(?:\.{3}|…)\s*$/.test(n.title)&&title(n).length>35&&title(item).startsWith(title(n))) || (/(?:\.{3}|…)\s*$/.test(item.title)&&title(item).length>35&&title(n).startsWith(title(item))))));
    if(!prior){out.push({...item});continue;}
    const aliases=[prior.url,item.url,...(prior.alternateUrls??[]),...(item.alternateUrls??[])];
    if(prior.url.includes('news.google.com')&&!item.url.includes('news.google.com')) prior.url=item.url;
    prior.alternateUrls=[...new Set(aliases)].filter(url=>url!==prior.url);
    if(/(?:\.{3}|…)\s*$/.test(prior.title)&&!/(?:\.{3}|…)\s*$/.test(item.title))prior.title=item.title;
    prior.label??=item.label;prior.summary??=item.summary;prior.excerpt??=item.excerpt;
    const legacyEncoded=!!prior.articleText&&prior.articleText.includes('kAm')&&prior.articleText.includes('k^Am');
    if(item.articleText&&(!prior.articleText||legacyEncoded||(item.articleTextPartial===false&&(prior.articleTextPartial||item.articleText.length>prior.articleText.length)))){
      prior.articleText=item.articleText;prior.articleReadAt=item.articleReadAt;prior.articleTextPartial=item.articleTextPartial;
      if(legacyEncoded)prior.summary=item.summary;
    }
  }
  return out;
}
