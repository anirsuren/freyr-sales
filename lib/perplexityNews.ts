import { discoverInitialCompanyNews } from "./companyNewsDiscovery";
import { requestMarketIntelSearch, requestMarketIntelWebSearch } from "./marketIntelSearch";
import { cleanSourceLabel, type FeedNews } from "./marketIntelFeed";
import { notePerplexityError } from "./marketIntelRefresh";
import type { CompanySource } from "./marketIntelSources";
import { companyNewsQuery, dedupeCompanyNews, hydrateCompanyNews, filterCompanyNews, publishedDate, readGoogleNews } from "./companyWebsiteNews";
import { companyDomain } from "./marketIntelDuplicates";

/**
 * SAME-DAY NEWS, FOR EVERY COMPANY, EVERY RUN (Anir, Aug 13: "There's always
 * gonna be news unless there truly is no news").
 *
 * The Google News actor ranks by relevance and cannot be told to rank by
 * date, so buying a deeper page was the only way to catch today's stories —
 * at ~$0.11 a company, which the per-run dollar cap turns into a rotation
 * that visits each company roughly once a day. This module is the cheap
 * counterpart: one Perplexity search (~$0.006, real cost read back from the
 * response) with `search_recency_filter: "day"`, so the freshness question
 * is answered for the whole watchlist once a day no matter where the Apify
 * rotation is.
 *
 * TRUST SPLIT, deliberately uneven:
 * - The MODEL decides which search results are real stories. Raw results are
 *   full of share-price quote pages, liveblogs and other companies (verified
 *   against the live API: a "Dr. Reddy's news" search returned Yahoo Finance
 *   quote pages, a LinkedIn internship post, and DRDGOLD). Filtering junk is
 *   judgment, which is what the model is for.
 * - The URL and DATE come only from the cited search result, never from the
 *   model's own text. `sourceIndex` points each story at the search result it
 *   came from; an item whose index resolves to nothing is dropped. The model
 *   cannot invent a link.
 */

// When the response omits its own cost breakdown: $5/1k searches plus a few
// hundred tokens of sonar.
const FALLBACK_COST_USD = 0.006;
// A "past day" search still surfaces evergreen quote pages whose indexed date
// is months old (live probe: a January share-price page inside a day-filtered
// August search). A dated result older than this is not today's news.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
// Social posts belong in the posts column; encyclopedias are never news.
const JUNK_HOSTS =
  /linkedin\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|wikipedia\.org|reddit\.com/i;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
          source: { type: "string" },
          sourceIndex: { type: "integer" },
        },
        required: ["headline", "source", "sourceIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You are a news scanner for a sales intelligence feed. From your web search results, pick only REAL news stories: announcements, deals, acquisitions, approvals, launches, partnerships, results, leadership changes, lawsuits, recalls. Never include stock-quote pages, share-price liveblogs or tickers, company profile pages, social media posts, or stories that are mainly about a different company. A share-price move only counts if a result reports the specific event behind it. If the only results are quote pages and liveblogs, return an empty list; an empty list is a good answer. Plain text only, no markdown.";

export type FreshNewsResult = { news: FeedNews[]; cost: number; failed: boolean };

export async function scrapeFreshNews(
  source: Pick<CompanySource, "name" | "newsQ" | "site">,
  key: string | undefined,
  options: { initial?: boolean; officialUpdates?: FeedNews[] | Promise<FeedNews[]>; webSearchToken?:string } = {},
): Promise<FreshNewsResult> {
  const maxAge=options.initial ? 90*86400_000 : MAX_AGE_MS;
  const query = (source.newsQ || (source.site ? companyNewsQuery(source.name) : `"${source.name.replace(/"/g, "")}"`)).replace(/when:\S+/g, "");
  const domain = source.site ? companyDomain(source.site) : null;
  const discovery = options.initial ? discoverInitialCompanyNews(source.name,domain,key,options.officialUpdates,source.newsQ,options.webSearchToken,true).catch(()=>({news:[] as FeedNews[],cost:0,failed:true})) : null;
  const direct = await readGoogleNews(`${query} when:${options.initial ? "90d" : "3d"}${domain ? ` -site:${domain}` : ""}`);
  direct.news = filterCompanyNews(direct.news,source.name,domain,maxAge,false);
  const hydrateDaily = async (news:FeedNews[]) => filterCompanyNews(await hydrateCompanyNews(news,source.name,domain),source.name,domain,maxAge);
  if (options.initial) {
    try {
      const directFirstPass=direct.news.slice(0,10);
      const [found,additional]=await Promise.all([
        discovery!,
        hydrateCompanyNews(directFirstPass,source.name,domain),
      ]);
      return {...found,failed:found.failed||direct.failed,news:dedupeCompanyNews([...found.news,...additional])};
    } catch(error) {
      notePerplexityError(error instanceof Error ? error.message : String(error));
      return {news:direct.news,cost:0,failed:true};
    }
  }
  let discoveryCost=0;
  let discoveryFailed=false;
  if(options.webSearchToken) {
    try {
      const after=new Date(Date.now()-maxAge).toISOString().slice(0,10);
      const found=await requestMarketIntelWebSearch([`${query} after:${after}${domain ? ` -site:${domain}` : ''} -site:linkedin.com`],options.webSearchToken,source.name);
      discoveryCost=found.cost;discoveryFailed=found.failed;
      for(const page of found.pages)for(const hit of page.organicResults??[]) {
        const url=hit.url||hit.link;
        if(typeof url!=='string'||typeof hit.title!=='string')continue;
        try {direct.news.push({url,title:hit.title,source:cleanSourceLabel(new URL(url).hostname),published:publishedDate(hit.date),excerpt:hit.description});}catch{}
      }
    }catch {discoveryFailed=true;}
  }
  if (!key) return { news: await hydrateDaily(direct.news), cost: discoveryCost, failed: discoveryFailed || direct.failed };
  const topic = source.newsQ || source.name;
  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `News about ${topic}${domain ? `, the company at ${domain}` : ""} from the past ${options.initial ? "90 days" : "day"}. Include third-party coverage and syndicated releases from different publications, and articles mentioning the company in the body even when absent from the headline. Keep each distinct publisher URL, including multiple publications covering the same announcement. For each article give: headline, a one-sentence summary, the publication name, and sourceIndex = the 1-based position of the search result the story comes from.`,
      },
    ],
    ...(options.initial ? {search_after_date_filter:new Date(Date.now()-maxAge).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"})} : {search_recency_filter:"day"}),
    web_search_options: { search_context_size: options.initial ? "medium" : "low" },
    response_format: { type: "json_schema", json_schema: { schema: RESPONSE_SCHEMA } },
    max_tokens: options.initial ? 2200 : 700,
  };

  // One retry, same as the Apify runner: these APIs flake intermittently and
  // a single hiccup should not cost a company its freshness window.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await requestMarketIntelSearch(body, key, "company-news", source.name);
      const cost =
        typeof data?.usage?.cost?.total_cost === "number"
          ? data.usage.cost.total_cost
          : FALLBACK_COST_USD;
      const results: any[] = Array.isArray(data?.search_results)
        ? data.search_results
        : [];
      let parsed: any = null;
      try {
        parsed = JSON.parse(
          String(data?.choices?.[0]?.message?.content ?? "").replace(
            /^```(?:json)?|```$/g,
            ""
          )
        );
      } catch {
        // A malformed body counts as a failed attempt, not as "no news".
        throw new Error("perplexity returned unparseable JSON");
      }
      const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
      const seen = new Set<string>();
      const news: FeedNews[] = [];
      for (const item of items) {
        const hit = results[Number(item?.sourceIndex) - 1];
        const url = typeof hit?.url === "string" ? hit.url : null;
        const title = String(hit?.title ?? "").replace(/\*+/g, "").trim();
        if (!url || !title) continue;
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          continue;
        }
        if (JUNK_HOSTS.test(host)) continue;
        const dated = Date.parse(publishedDate(hit?.date) || "");
        if (dated && Date.now() - dated > maxAge) continue;
        const dedupe = url.split(/[?#]/)[0].replace(/\/$/, "");
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        news.push({
          title: title.slice(0, 200),
          source: cleanSourceLabel(host),
          url,
          // The day filter certified this result as past-day content, so a
          // result that arrives undated still gets a stamp the "today" view
          // can see rather than sinking to the bottom as unknown.
          published: publishedDate(hit?.date),
          summary:
            String(item?.summary ?? "").trim().slice(0, 400) || undefined,
        });
      }
      return { news: await hydrateDaily(filterCompanyNews([...direct.news,...news],source.name,domain,maxAge,false)), cost:cost+discoveryCost, failed:discoveryFailed };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  console.error(
    `[market-intel] fresh news failed for "${source.name}": ${lastError instanceof Error ? lastError.message : lastError}`
  );
  notePerplexityError(String(lastError instanceof Error ? lastError.message : lastError));
  // One failed provider must not discard articles collected by another.
  return { news: await hydrateDaily(direct.news), cost: discoveryCost, failed: true };
}
