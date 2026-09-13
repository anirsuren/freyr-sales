import { collectionPhase } from "./marketIntelCollectionStore";
import { runDurableMarketIntelActor } from "./marketIntelActor";
import { armCompanyOnboarding, editQueuedCompany } from "./marketIntelOnboarding";
import { isDeepStrictEqual } from "node:util";
import { collectLinkedInPostPages, toPost, linkedInActivityId } from "./linkedinPostCollection";
import { compatibleCompanyNames } from "./companyIdentity";
import type { TrackProgress } from "./marketIntelTrackProgress";
import { requestMarketIntelSearch } from "./marketIntelSearch";
import { linkedInIdentifier, companyFeedAuthor } from "./marketIntelLinks";
import { DuplicateCompanyError, findCompanyDuplicate, companyDomain } from "./marketIntelDuplicates";
import { dedupeCompanyNews, isNewsIndex, companyNewsQuery, filterCompanyNews, publishedDate, readCompanyNewsSearch, readGoogleNews, websiteConfirmsLinkedIn } from "./companyWebsiteNews";
import { after } from "next/server";
import type { CompanySource } from "./marketIntelSources";
import {
  cleanSourceLabel,
  readFeedMeta,
  readFeedCompany,
  readMarketIntelFeed,
  saveFeedCompany as persistFeedCompany,
  saveFeedMeta,
  saveFeedPerson,
  withinRetention,
  readMarketIntelSummaries,
} from "./marketIntelFeed";
import { MARKET_INTEL_REFRESH_MS, collectedInCurrentCycle } from "./marketIntelCadence";
import { findSiteLogo, storeCompanyLogo } from "./companyLogos";
import { mirrorPhoto } from "./miPhotos";
import type { FeedCompany, FeedNews, FeedPost, MarketIntelFeed } from "./marketIntelFeed";
import {
  CLASSIFY_BATCH,
  classifyFailures,
  classifyItems,
  classifyMna,
  classifyUsage,
  digestCompany,
  type ClassifyInput,
} from "./marketIntelSummarize";
import { CLASSIFY_VERSION, fallbackSignals, hasCurrentLabel, isLabeled } from "./marketIntelSignals";
import { THOUGHT_FIRMS, mergeThoughtBoard, scrapeFirmThoughtLeadership } from "./marketIntelThought";
import { scrapeFreshNews } from "./perplexityNews";
import { normalizeSiteDomain, readCompanyNameFromSite, scrapeSiteUpdates } from "./siteUpdates";
import {
  bustMarketIntelTrackingCache,
  findTrackedByLinkedInSlug,
  isActiveCompany,
  miSlug,
  seedCompanies,
  type Followers,
  type TrackedCompany,
  type TrackedPerson,
} from "./marketIntelTracking";
import { readMarketIntelFollowers } from "./marketIntelBookmarks";
import type { Division } from "./offeringMaterials";

/**
 * THE FEED REFRESHES ITSELF (Anir, Aug 11: "It has to do it by itself...
 * imagine all 100 people clicking it at the same time"). Nobody clicks
 * anything:
 *
 * - Any live-mode visit to Market Intel checks the feed's age; past 24 hours,
 *   the request schedules ONE background refresh via after(). A lock row in
 *   the database makes sure a hundred simultaneous visitors produce exactly
 *   one run — everyone else just reads.
 * - Adding a company or person kicks a small targeted scrape immediately, so
 *   the first briefing shows up in minutes rather than a day.
 *
 * Costs stay bounded no matter what: lean per-pull limits, a hard per-run
 * dollar cap AND a rolling 24-hour one (DAY_CAP_USD, kept in the feed row as
 * `apifyDay`), per-company freshness skips (a crashed run resumes cheaply),
 * and Apify visits once a day. If Apify credits run out the run fails quietly
 * and pages keep showing the last data with an honest "updated" stamp.
 */

// ONCE A DAY, EVERYTHING (Anir, Sep 7: "let's do it once per day"; Sep 11:
// "it's supposed to be once a day, and you're still saying that it's twice a
// day"). One shared daily clock, never per-user. Each source is due after 24 hours.
/** THE APIFY CLOCK: ONCE A DAY (Anir, Sep 7, after seeing the app was 72% of
 *  the Apify bill at ~$6 a day: "let's do it once per day"). LinkedIn company
 *  posts, the wider Google News search, the M&A board and followed people
 *  are visited in each daily run, with a 24-hour freshness stamp. */
/** The website pass's own clock: a company posts to its newsroom a handful
 *  of times a month, so checking it twice a day would buy the same answer
 *  twice. Once a day keeps the column fresh without repeated checks during the day. */
const LOCK_MS = 30 * 60 * 1000;
// Two Apify caps. RUN_CAP_USD bounds one run so it finishes inside the lock;
// the rotation spreads whatever it cuts across later runs. DAY_CAP_USD is the
// money knob, over a rolling 24 hours: at once a day the 76 companies need
// about $5.70 of it (5 posts + ~10 articles ≈ $0.075 each; the news actor
// returns a couple more than asked) and the M&A board $0.13, so followed
// people share what is left, least-recently-refreshed first. Raise it and
// people refresh faster; lower it and companies start being skipped. Before
// Sep 7 there was only the per-run cap, which two runs a day filled to
// ~$6.40 whatever the cadence said, so the cadence alone changed nothing.
// These are the code's own estimates, which run ~10% above Apify's bill.
const RUN_CAP_USD = 3.2;
const DAY_CAP_USD = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const TARGETED_CAP_USD = 0.6;

/**
 * BACK TO A SHALLOW PAGE, ON PURPOSE. The actor returns Google News ranked by
 * RELEVANCE, not date, and ignores its own `sort: newest` (verified live:
 * passing it dropped the freshest article). Aug 13 briefly raised this to 25
 * to fish for same-day items in a deeper relevance slice, at ~$0.11 a company
 * — which the run cap turned into fewer companies per run. Same-day coverage
 * now comes from the Perplexity pass below at a twentieth of the price, so
 * this pull is back to being what relevance ranking is good at: the handful
 * of stories that MATTER about the company, merged in as depth.
 */
const NEWS_LIMIT = 8;
// Each pull re-bills the latest N posts whether or not they are new, so the
// person limit stays small: 133 tracked people at 5 posts is ~$3.30 a run.
const PERSON_POST_LIMIT = 5;
/**
 * READING ITEMS COSTS TOKENS, SO A RUN READS A BOUNDED NUMBER. Sixty calls of
 * twenty items covers a normal day's new items several times over; the first
 * run after this shipped works through the backlog across a few runs (or
 * the ops hatch does it in one go). Only items inside the three-month
 * display window are read: older ones are never shown.
 */
const LABEL_CALLS_PER_RUN = 60;
const LABEL_WINDOW_MS = 95 * 24 * 60 * 60 * 1000;
/** How many M&A rows the tracker keeps. The screen reports the total too. */
const MNA_ROWS_KEPT = 40;

const LOCK_ROW = "market-intel:refresh-lock";
// The refresh serves real mode by definition, so it reads the real tracking
// row directly — a background task has no request to infer a data mode from.
const TRACKING_ROW = "market-intel:default";

function hasEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** The token the current run scrapes with. Production's task definition
 *  carries a revoked APIFY key it inherits deploy after deploy (Aug 12: a
 *  whole "refresh" made zero scrape calls), so the database config row wins
 *  when present — updating one row fixes every running instance without an
 *  AWS change. */
const CONFIG_ROW = "market-intel:config";
let activeApifyToken: string | undefined = process.env.APIFY_API_TOKEN;
/** Same escape hatch as the Apify token: the config row wins over the env,
 *  so prod picks up a key (or a rotation) without an AWS change. */
let activePerplexityKey: string | undefined = process.env.PERPLEXITY_API_KEY;

export async function loadProviderConfig(): Promise<void> {
  const config = await readRow(CONFIG_ROW).catch(() => null);
  activeApifyToken = config?.apifyToken || process.env.APIFY_API_TOKEN;
  activePerplexityKey = config?.perplexityKey || process.env.PERPLEXITY_API_KEY;
}

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } }
  );
}

async function readRow(id: string): Promise<any | null> {
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

/** Every Apify dollar lands in two ledgers: the all-time total the feed has
 *  always carried, and the current 24-hour window, which is what DAY_CAP_USD
 *  meters. The window opens at its first charge and closes 24 hours later,
 *  rather than at midnight: with runs ~11.5 hours apart a third run can land
 *  late in a calendar day, and a midnight window would have stalled it until
 *  the next morning instead of the next tick. Perplexity spend goes only into
 *  the total: it is a different bill and must never eat the Apify budget. */
function windowOpen(feed: any): boolean {
  const since = Date.parse(feed.apifyDay?.since ?? "");
  return Number.isFinite(since) && Date.now() - since < DAY_MS;
}

function chargeApify(feed: any, usd: number): void {
  feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + usd) * 1000) / 1000;
  const open = windowOpen(feed);
  const sofar = open ? Number(feed.apifyDay.usd) || 0 : 0;
  feed.apifyDay = {
    since: open ? feed.apifyDay.since : new Date().toISOString(),
    usd: Math.round((sofar + usd) * 1000) / 1000,
  };
}

function apifySpentToday(feed: any): number {
  return windowOpen(feed) ? Number(feed.apifyDay.usd) || 0 : 0;
}

async function writeRow(id: string, catalog: unknown): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({ id, catalog, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  // The read side memoizes these rows for a minute; a write on this instance
  // must show up on its next render.
  if (id === TRACKING_ROW) bustMarketIntelTrackingCache();
}

/** The feed as a run must see it: the store, uncached, or an empty one. */
async function loadFeedForWrite(): Promise<any> {
  const feed = await readMarketIntelFeed({ fresh: true });
  const out: any = feed ?? emptyFeed();
  if (!out.people) out.people = {};
  return out;
}

// ------------------------------------------------------------------ scraping
let lastApifyError = "";
let lastPerplexityError = "";
export function noteApifyError(message: string): void {
  lastApifyError = message.slice(0, 160);
}
export function notePerplexityError(message: string): void {
  lastPerplexityError = message.slice(0, 160);
}

async function runActor(actor: string, input: unknown): Promise<any> {
  if (!activeApifyToken) throw new Error("LinkedIn collection is not configured.");
  try { return await runDurableMarketIntelActor(actor, input, activeApifyToken); }
  catch (error) {
    lastApifyError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

/** Returns billed cost alongside results so every caller keeps the ledger. */
async function scrapeCompanyPosts(
  source: CompanySource, knownUrls: string[] = []
): Promise<{ posts: FeedPost[]; author: FeedCompany["author"]; slug: string | null; cost: number; failed: boolean; truncated?: boolean }> {
  let cost = 0;
  let failures = 0;
  let attempts = 0;
  for (const slug of source.li ?? []) {
    attempts += 1;
    let items: any;
    let truncated = false;
    try {
      const result = await collectLinkedInPostPages(input=>runActor("apimaestro~linkedin-company-posts",input),slug,{knownUrls,pageSize:knownUrls.length?5:100});
      items = result.items;
      cost += result.cost;
      truncated = result.truncated;
      if (result.error) { lastApifyError = result.error; if (!items.length) failures += 1; }
    } catch (error) {
      failures += 1;
      console.error(
        `[market-intel] posts scrape failed for ${source.id}/${slug}: ${error instanceof Error ? error.message : error}`
      );
      continue;
    }
    if (!Array.isArray(items) || items.length === 0) continue;
    if (items.length === 1 && items[0]?.message) {
      cost += 0.005; // error items still bill
      failures += 1;
      continue;
    }
    const author = companyFeedAuthor(items, slug);
    if (
      source.expect &&
      author?.name &&
      !author.name.toLowerCase().includes(source.expect)
    ) {
      continue; // wrong company: paid for it, will not store it
    }
    return {
      posts: items.map(toPost).filter(Boolean) as FeedPost[],
      author: author
        ? {
            name: author.name,
            followerCount: author.follower_count ?? null,
            logoUrl: (await mirrorPhoto(author.logo_url ?? "")) || null,
          }
        : null,
      slug,
      cost,
      truncated,
      failed: false,
    };
  }
  return {
    posts: [],
    author: null,
    slug: null,
    cost,
    failed: attempts > 0 && failures === attempts,
  };
}

export async function scrapeNews(
  source: Pick<CompanySource, "name" | "newsQ" | "site">
): Promise<{ news: FeedNews[]; cost: number; failed: boolean }> {
  const domain = source.site ? companyDomain(source.site) : null;
  const query = (source.newsQ || (domain ? companyNewsQuery(source.name) : source.name)) + (domain ? ` -site:${domain}` : "");
  const direct = domain ? await readCompanyNewsSearch(source.name,domain,source.newsQ) : await readGoogleNews(query);
  if (domain) direct.news = filterCompanyNews(direct.news,source.name,domain);
  if (!direct.failed && direct.news.length) return { ...direct, cost: 0 };
  let items: any;
  try {
    items = await runActor("s-r~google-news", {
      q: query,
      maxItems: NEWS_LIMIT,
    });
  } catch (error) {
    console.error(
      `[market-intel] news scrape failed for "${source.name}": ${error instanceof Error ? error.message : error}`
    );
    return { news: [], cost: 0, failed: direct.failed };
  }
  if (!Array.isArray(items)) return { news: [], cost: 0, failed: true };
  const cost = 0.01 + items.length * 0.004;
  const seen = new Set<string>();
  const news: FeedNews[] = [];
  for (const i of items) {
    if (!i?.title || !i?.url) continue;
    const publisher = typeof i.source === "string" ? i.source : i.source?.title || "News";
    const rawTitle = String(i.title).trim();
    const title = rawTitle.endsWith(` - ${publisher}`) ? rawTitle.slice(0, -publisher.length - 3) : rawTitle;
    const key = `${i.url}|${publisher.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    news.push({
      title,
      source: cleanSourceLabel(
        typeof i.source === "string" ? i.source : i.source?.title || "News"
      ),
      url: i.url,
      published: publishedDate(i.published),
    });
  }
  return { news: domain ? filterCompanyNews(news,source.name,domain) : news, cost, failed: false };
}

/** The M&A tracker: three division-flavored news pulls, AI-classified into
 *  structured deals, merged and deduped. ~$0.15 of news per refresh. */
const MNA_QUERIES: { q: string; division: string }[] = [
  { q: "pharmaceutical acquisition merger", division: "Medicinal Products" },
  { q: "medical device company acquisition", division: "Medical Devices" },
  { q: "consumer health cosmetics acquisition", division: "Consumer" },
];

async function refreshMna(feed: any): Promise<number> {
  let cost = 0;
  const raw: (FeedNews & { division: string })[] = [];
  for (const query of MNA_QUERIES) {
    const result = await scrapeNews({ name: query.q });
    cost += result.cost;
    for (const item of result.news) raw.push({ ...item, division: query.division });
  }
  const classified = await classifyMna(raw);
  const seen = new Set<string>();
  const existing: any[] = Array.isArray(feed.mna?.items) ? feed.mna.items : [];
  const merged = [...classified, ...existing].filter((deal) => {
    // "Integer" vs "Integer Holdings" is the same deal: key on the first
    // word of each side so name variants collapse.
    /* MATCH ON THE WHOLE NAME, NOT ITS FIRST WORD (Anir, Sep 4: the tracker
       listed one deal twice). Keying on the first word collapsed "Integer" and
       "Integer Holdings" as intended, but it also treated "Eli Lilly" and
       "Lilly" as different companies, and a local paper's "Auburn's Currier
       Plastics" as different from "Currier Plastics". Headlines vary at the
       front as often as the back.

       So: strip the corporate furniture and the possessive lead-in, then let
       either name contain the other. "Lilly" is inside "eli lilly"; "Integer"
       is inside "integer holdings"; "Pfizer" is not inside "Moderna". */
    const bare = (name: string) =>
      name
        .toLowerCase()
        .replace(/[’']s\b/g, "")
        .replace(
          /\b(inc|corp|corporation|ltd|limited|plc|llc|co|group|holdings?|company|pharmaceuticals?|pharma|biosciences?|therapeutics|sciences|laboratories|labs|international)\b/g,
          ""
        )
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const overlaps = (a: string, b: string) =>
      !!a && !!b && (a === b || a.includes(b) || b.includes(a));
    const key = `${bare(deal.acquirer)}|${bare(deal.target)}`;
    const [a, t] = key.split("|");
    for (const prev of seen) {
      const [pa, pt] = prev.split("|");
      if (overlaps(a, pa) && overlaps(t, pt)) return false;
    }
    seen.add(key);
    return true;
  });
  merged.sort(
    (a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0)
  );
  /* THE LIST IS CAPPED, SO THE SCREEN HAS TO SAY SO (Anir, Sep 4: "40 deals"
     was the ceiling being read as a count). Notifications already does this
     correctly — it caps its roadmap list and then adds a row saying how many
     it held back. Carrying the total lets the tracker do the same. */
  feed.mna = {
    items: merged.slice(0, MNA_ROWS_KEPT),
    total: merged.length,
    fetchedAt: new Date().toISOString(),
  };
  return cost;
}

/** TLDR + article summaries, regenerated whenever the news set changed.
 *  Anthropic Haiku, fractions of a cent; failures leave the feed untouched.
 *
 *  A COMPETITOR'S RUNDOWN IS WRITTEN FROM WHAT CONCERNS US (Saras, Sep 10:
 *  "even that TCS won a government bid, it's not relevant to us"). Items the
 *  classifier marked as outside Freyr's industries are left out of the
 *  rundown; an item it has not read yet still counts, so nothing is hidden
 *  on a guess. */
async function applyDigest(entry: FeedCompany): Promise<void> {
  const needs = entry.news.some((n) => !n.summary) || !entry.tldr;
  if (!needs) return;
  const concerns = (item: { label?: { relevant: boolean } }) =>
    entry.group !== "competitor" || !item.label || item.label.relevant;
  const picked = entry.news.map((n, i) => ({ n, i })).filter(({ n }) => concerns(n));
  try {
    const digest = await digestCompany({
      name: entry.name,
      news: picked.map(({ n }) => n),
      posts: entry.posts.filter(concerns),
    });
    if (digest.tldr) entry.tldr = digest.tldr;
    digest.summaries.forEach((summary, index) => {
      const target = picked[index] ? entry.news[picked[index].i] : undefined;
      if (target && !target.summary) target.summary = summary;
    });
  } catch {
    /* the briefing works without summaries */
  }
}

type LabelBudget = {
  calls: number;
  /** Read again what the Sep 10 list labelled (the relabel hatch, on request only). */
  relabel?: boolean;
};

/** A few classifier calls in flight at once: the backlog on a new watch is
 *  hundreds of calls, and one at a time would take an hour. */
const LABEL_CONCURRENCY = 4;
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function inLabelWindow(date: string | null | undefined): boolean {
  if (!date) return true;
  const t = Date.parse(date);
  return !Number.isFinite(t) || Date.now() - t < LABEL_WINDOW_MS;
}

/**
 * READ EVERY UNREAD ITEM ON A COMPANY (Saras, Sep 10): the nine signals,
 * whether it concerns Freyr's industries, thought leadership and awards.
 * Twenty items a call, within the run's call budget; whatever is left is
 * read on the next run. Labels are stored beside the item, so nothing is
 * read twice.
 */
async function applyLabels(entry: FeedCompany, budget: LabelBudget): Promise<number> {
  const officialDomain = entry.site?.[0]?.url ? companyDomain(entry.site[0].url) : null;
  entry.news = mergeNews(entry.news, filterCompanyNews(entry.pendingNews ?? [], entry.name, officialDomain));
  entry.pendingNews = [];
  type Slot = { item: FeedPost | FeedNews; input: ClassifyInput };
  const slots: Slot[] = [];
  const done = (item: Parameters<typeof isLabeled>[0]) => (budget.relabel ? hasCurrentLabel(item) : isLabeled(item));
  for (const p of entry.posts) {
    if (done(p) || !inLabelWindow(p.date)) continue;
    if (!p.text.trim()) { p.label={signals:["others"],relevant:true,industries:[],isCompanyNews:true,v:CLASSIFY_VERSION}; continue; }
    slots.push({
      item: p,
      input: { kind: "post", title: p.text.split("\n")[0].slice(0, 200), text: p.text },
    });
  }
  for (const n of entry.news) {
    if ((done(n) && typeof n.label?.isCompanyNews === "boolean") || !inLabelWindow(n.published)) continue;
    slots.push({
      item: n,
      // RSS publisherUrl may name the publisher's homepage. Verify the item,
      // whose URL hydration already resolves to the actual article.
      input: { kind: "news", title: n.title, text: n.articleText || n.excerpt || n.summary || "", source: n.source, url: n.url, published:n.published },
    });
  }
  for (const n of entry.site ?? []) {
    if (done(n) || !inLabelWindow(n.published)) continue;
    slots.push({
      item: n,
      input: { kind: "site", title: n.title, text: n.excerpt || n.summary || "", source: n.source, url: n.url },
    });
  }
  let labeled = 0;
  const group = entry.group === "competitor" ? "competitor" : "customer";
  slots.sort((a,b)=>Number(b.input.kind === "news")-Number(a.input.kind === "news"));
  const batches: Slot[][] = [];
  for (let at = 0; at < slots.length && budget.calls > 0; at += CLASSIFY_BATCH) {
    batches.push(slots.slice(at, at + CLASSIFY_BATCH));
    budget.calls -= 1;
  }
  await mapLimit(batches, LABEL_CONCURRENCY, async (batch) => {
    const labels = await classifyItems(entry.name, group, batch.map((b) => b.input), entry.site?.[0]?.url);
    labels.forEach((label, index) => {
      const slot = batch[index];
      if (slot) {
        slot.item.label = label;
        labeled += 1;
      }
    });
    /* THE MODEL SKIPS WHAT IT TAKES FOR A REPEAT (seven identical Veeva
       posts came back unanswered on every run, Sep 10). Anything a call did
       not answer is asked once more on its own; what is still unanswered
       gets the keyword rules' answer, so nothing is re-sent forever. */
    const missing = batch.filter((slot) => !hasCurrentLabel(slot.item));
    if (missing.length > 0 && missing.length < batch.length) {
      const again = await classifyItems(entry.name, group, missing.map((b) => b.input), entry.site?.[0]?.url);
      again.forEach((label, index) => {
        const slot = missing[index];
        if (slot) {
          slot.item.label = label;
          labeled += 1;
        }
      });
    }
    for (const slot of missing) {
      /* A relabel keeps the model's earlier answer rather than trade it for a keyword guess. */
      if (hasCurrentLabel(slot.item) || (budget.relabel && isLabeled(slot.item))) continue;
      if (slot.input.kind === "news") continue; // Retry later; a keyword match cannot verify company identity.
      const text = slot.input.kind === "post" ? slot.input.text : `${slot.input.title}. ${slot.input.text}`;
      slot.item.label = {
        signals: fallbackSignals(text, group),
        relevant: true,
        industries: [],
        v: CLASSIFY_VERSION,
      };
      labeled += 1;
    }
  });
  entry.pendingNews = entry.news.filter(item => typeof item.label?.isCompanyNews !== "boolean");
  const acceptedNews = entry.news.filter(item => item.label?.isCompanyNews === true);
  if (acceptedNews.length !== entry.news.length) {
    entry.news = acceptedNews;
    entry.tldr = null; // Rebuild the briefing without rejected search matches.
  }
  return labeled;
}

/** A followed person's posts read the same way, under the company they
 *  belong to. */
async function labelPersonPosts(
  companyName: string,
  posts: FeedPost[],
  budget: LabelBudget
): Promise<number> {
  const pending = posts.filter((p) => !(budget.relabel ? hasCurrentLabel(p) : isLabeled(p)) && inLabelWindow(p.date));
  let labeled = 0;
  const batches: FeedPost[][] = [];
  for (let at = 0; at < pending.length && budget.calls > 0; at += CLASSIFY_BATCH) {
    batches.push(pending.slice(at, at + CLASSIFY_BATCH));
    budget.calls -= 1;
  }
  await mapLimit(batches, LABEL_CONCURRENCY, async (batch) => {
    const labels = await classifyItems(
      companyName,
      "customer",
      batch.map((p) => ({
        kind: "post" as const,
        title: p.text.split("\n")[0].slice(0, 200),
        text: p.text,
      }))
    );
    labels.forEach((label, index) => {
      if (batch[index]) {
        batch[index].label = label;
        labeled += 1;
      }
    });
  });
  return labeled;
}

/**
 * THE THOUGHT-LEADERSHIP BOARD: one Perplexity search per firm, pinned to
 * the firm's own site, merged into the stored board. Its own daily clock,
 * about six cents a run, never touching the Apify budget.
 */
async function refreshThought(feed: any, key: string | undefined): Promise<number> {
  if (!key) return 0;
  let cost = 0;
  const incoming = [];
  for (const firm of THOUGHT_FIRMS) {
    const result = await scrapeFirmThoughtLeadership(firm, key);
    cost += result.cost;
    incoming.push(...result.items);
  }
  feed.thought = mergeThoughtBoard(feed.thought, incoming);
  return cost;
}

async function scrapePersonPosts(
  person: TrackedPerson
): Promise<{ posts: FeedPost[]; cost: number; headline: string | null; photoUrl?: string; failed: boolean }> {
  const username = person.linkedinUrl.match(/\/in\/([^/]+)/)?.[1];
  if (!username) return { posts: [], cost: 0, headline: null, failed: false };
  let items: any;
  try {
    items = await runActor("apimaestro~linkedin-profile-posts", {
      username,
      limit: PERSON_POST_LIMIT,
    });
  } catch (error) {
    console.error(
      `[market-intel] person scrape failed for ${person.name ?? username}: ${error instanceof Error ? error.message : error}`
    );
    return { posts: [], cost: 0, headline: null, failed: true };
  }
  if (!Array.isArray(items) || items.length === 0)
    return { posts: [], cost: 0, headline: null, failed: false };
  // The author block rides along free on every post: it carries the person's
  // FULL headline, which discovery search truncates (Anir, Aug 11: "his bio
  // is not there"). Keep it every sync so the profile stays current.
  const headline =
    String(items.find((i: any) => i?.author?.headline)?.author?.headline ?? "").trim() ||
    null;
  if (items.length === 1 && items[0]?.message) {
    return { posts: [], cost: 0.005, headline, failed: true };
  }
  return {
    posts: items.map(toPost).filter(Boolean) as FeedPost[],
    cost: items.length * 0.005,
    photoUrl: await mirrorPhoto(String(items.find((i: any) => i?.author?.profile_picture_url)?.author?.profile_picture_url ?? "")),
    headline,
    failed: false,
  };
}

/** Missing or expiring faces get a profile lookup, including people with no posts. */
async function refreshPersonPicture(person: TrackedPerson, freshPhoto?: string, force = false): Promise<number> {
  const patch: Partial<TrackedPerson> = {};
  const mirrored = await mirrorPhoto(freshPhoto || person.photoUrl);
  if (mirrored) patch.photoUrl = mirrored;
  const stored = mirrored && !/licdn\.com/i.test(mirrored);
  let cost = 0;
  if (!stored && (force || Date.now() - Date.parse(person.photoCheckedAt || "1970-01-01") >= MARKET_INTEL_REFRESH_MS)) {
    patch.photoCheckedAt = new Date().toISOString();
    const username = person.linkedinUrl.match(/\/in\/([^/?#]+)/)?.[1];
    if (username) {
      try {
        const items = await runActor("apimaestro~linkedin-profile-detail", { username });
        cost = 0.01;
        const info = Array.isArray(items) ? items[0]?.basic_info : null;
        const photo = await mirrorPhoto(String(info?.profile_picture_url ?? ""));
        if (photo) patch.photoUrl = photo;
      } catch { /* Keep the previous face and retry on the next daily run. */ }
    }
  }
  await updateTrackedPersonProfile(person.id, patch);
  return cost;
}

/** Persist profile facts a sync brought back onto the tracked person. */
async function updateTrackedPersonProfile(
  personId: string,
  patch: Partial<TrackedPerson>
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v != null && v !== "")
  );
  if (Object.keys(clean).length === 0) return;
  const db = client();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from("offering_catalog_state").select("catalog,updated_at").eq("id", TRACKING_ROW).maybeSingle();
    if (error) throw new Error(error.message);
    const tracking = data?.catalog;
    const person = tracking?.people?.find((p: TrackedPerson) => p.id === personId);
    if (!person) return;
    Object.assign(person, clean);
    const { data: saved, error: saveError } = await db.from("offering_catalog_state")
      .update({ catalog: tracking, updated_at: new Date().toISOString() })
      .eq("id", TRACKING_ROW).eq("updated_at", data.updated_at).select("id");
    if (saveError) throw new Error(saveError.message);
    if (saved?.length) { bustMarketIntelTrackingCache(); return; }
  }
  throw new Error("The tracking list changed during the photo update; try again.");
}

// ------------------------------------------------------------------ merging
/* KEPT BY AGE, NEVER BY COUNT (Anir, Sep 10: "if there are 1,000 items,
   there should be 1,000 items"). An item stays as long as the pages can show
   it; the stored copy wins over a re-scrape of the same link so a label
   already written is never lost. */
function mergePosts(existing: FeedPost[], incoming: FeedPost[]): FeedPost[] {
  const byUrl = new Map<string, FeedPost>();
  for (const p of [...existing, ...incoming]) {
    if (!withinRetention(p.date)) continue;
    const key = linkedInActivityId({ post_url: p.url }) || p.url;
    const prior = byUrl.get(key);
    if (!prior) byUrl.set(key, p);
    else byUrl.set(key, { ...prior, ...p, label: p.label ?? prior.label, reactions: p.reactions ?? prior.reactions, comments: p.comments ?? prior.comments, reposts: p.reposts ?? prior.reposts });
  }
  return [...byUrl.values()].sort(
    (a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0)
  );
}

function mergeNews(existing: FeedNews[], incoming: FeedNews[]): FeedNews[] {
  return dedupeCompanyNews([...existing, ...incoming].filter(n=>withinRetention(n.published))).sort(
    (a,b)=>(Date.parse(b.published ?? "")||0)-(Date.parse(a.published ?? "")||0)
  );
}

function trackedToSource(company: TrackedCompany): CompanySource {
  if (company.scrape) {
    return {
      id: company.id,
      name: company.name,
      li: company.scrape.li,
      expect: company.scrape.expect,
      ...(company.scrape.newsQ ? { newsQ: company.scrape.newsQ } : {}),
      ...(company.scrape.site ? { site: company.scrape.site } : {}),
    };
  }
  const slug = company.linkedinUrl.match(/\/company\/([^/]+)/)?.[1];
  const expectToken =
    company.name.toLowerCase().split(/\s+/).find((w) => w.length > 3) ?? "";
  return {
    id: company.id,
    name: company.name,
    li: slug ? [slug] : null,
    ...(company.newsQuery ? { newsQ: company.newsQuery } : {}),
    expect: expectToken,
    /* The Website field on the tracking form IS the third source (Anir,
       Aug 28: "if someone enters a new company it has to work too"). A
       company added today gets website updates on its very first briefing,
       exactly like the built-in watchlist. */
    ...(company.website ? { site: company.website } : {}),
  };
}

function emptyFeed(): MarketIntelFeed & { spendUsd: number } {
  return { version: 2, companies: {}, people: {}, updatedAt: null, spendUsd: 0 };
}

/**
 * THE CATALOGUE AS A RUN SEES IT: the tracking row with the seed list folded
 * in once, plus who has what. Only ACTIVE companies are visited, meaning the
 * ones on at least one person's list (Anir, Sep 10: "if I remove something
 * and no one has it, it just stops doing it").
 */
async function loadRegistry(): Promise<{
  tracking: any;
  companies: TrackedCompany[];
  active: TrackedCompany[];
  people: TrackedPerson[];
  followers: Followers;
  competitorIds: Set<string>;
}> {
  const tracking = (await readRow(TRACKING_ROW)) ?? { companies: [], people: [] };
  tracking.companies = Array.isArray(tracking.companies) ? tracking.companies : [];
  tracking.people = Array.isArray(tracking.people) ? tracking.people : [];
  if (seedCompanies(tracking) > 0) await writeRow(TRACKING_ROW, tracking);
  const companies: TrackedCompany[] = tracking.companies;
  const followers = await readMarketIntelFollowers().catch(() => ({}) as Followers);
  const active = companies.filter((c) => !c.onboarding && isActiveCompany(c, followers));
  const competitorIds = new Set(companies.filter((c) => c.group === "competitor").map((c) => c.id));
  return { tracking, companies, active, people: tracking.people, followers, competitorIds };
}

// ------------------------------------------------------------------ the lock
async function claimLock(): Promise<string | null> {
  const token = Math.random().toString(36).slice(2);
  const now = Date.now();
  const db = client();
  const {data,error} = await db.from("offering_catalog_state").select("catalog,updated_at").eq("id",LOCK_ROW).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.catalog?.until > now) return null;
  const row = {catalog:{token,until:now+LOCK_MS},updated_at:new Date().toISOString()};
  const saved = data
    ? await db.from("offering_catalog_state").update(row).eq("id",LOCK_ROW).eq("updated_at",data.updated_at).select("id")
    : await db.from("offering_catalog_state").insert({id:LOCK_ROW,...row}).select("id");
  if (saved.error?.code === "23505") return null;
  if (saved.error) throw new Error(saved.error.message);
  return saved.data?.length ? token : null;
}

async function releaseLock(token: string): Promise<void> {
  await client().from("offering_catalog_state").update({catalog:{token,until:0},updated_at:new Date().toISOString()}).eq("id",LOCK_ROW).eq("catalog->>token",token);
}

// ------------------------------------------------------------------ the runs
export type RefreshSummary = {
  ran: boolean;
  reason?: string;
  companiesRefreshed?: number;
  companiesSkippedFresh?: number;
  peopleRefreshed?: number;
  spentUsd?: number;
  /** Apify dollars charged in the current 24-hour window, against DAY_CAP_USD. */
  apifyTodayUsd?: number;
};

export async function runMarketIntelRefresh(options?: {
  force?: boolean;
  onlyCompanyIds?: string[];
}): Promise<RefreshSummary> {
  if (!hasEnv()) return { ran: false, reason: "missing env (database)" };
  await loadProviderConfig();
  // Reject duplicate refresh checks before loading the entire feed into memory.
  const token = await claimLock();
  if (!token) return { ran: false, reason: "another refresh is running" };
  let feed: any;
  try { feed = await loadFeedForWrite(); }
  catch (error) { await releaseLock(token); throw error; }

  // Two ledgers on purpose: `spent` is Apify dollars and is what RUN_CAP_USD
  // meters (the $200/month plan); `spentFresh` is Perplexity's separate bill
  // and must never eat the Apify rotation's budget.
  const startedAt = Date.now();
  const runExpired = () => Date.now() - startedAt > 18 * 60_000;
  let spent = 0;
  let spentFresh = 0;
  let refreshed = 0;
  let skippedFresh = 0;
  let peopleRefreshed = 0;
  const budget: LabelBudget = { calls: LABEL_CALLS_PER_RUN };
  /* WHAT ANSWERED AND WHAT DID NOT, written to the meta row at the end so
     the page can say "News (Perplexity): failing since 2pm" instead of
     quietly showing nothing new. */
  const tally = {
    perplexity: { tries: 0, fails: 0, note: "" },
    apify: { tries: 0, fails: 0, note: "" },
    anthropic: { calls: classifyUsage.calls, failsBefore: classifyFailures.count },
  };
  try {
    const registry = await loadRegistry();
    const trackedCompanies: TrackedCompany[] = registry.companies;
    const trackedPeople: TrackedPerson[] = registry.people;
    const competitorIds = registry.competitorIds;
    const activeIds = new Set(registry.active.map((c) => c.id));

    // Least-recently-synced first: when the dollar cap cuts a run short, the
    // tail that missed out goes to the FRONT of tomorrow's run instead of
    // being the same starved tail forever.
    const lastSync = (id: string, map: Record<string, { fetchedAt?: string }>) =>
      Date.parse(map[id]?.fetchedAt ?? "") || 0;
    const sources: CompanySource[] = registry.active
      .map(trackedToSource)
      .filter(
        (s) => !options?.onlyCompanyIds || options.onlyCompanyIds.includes(s.id)
      )
      .sort((a, b) => lastSync(a.id, feed.companies) - lastSync(b.id, feed.companies));

    // ---- Pass 1: same-day news for EVERYONE, before any Apify money moves.
    // It reads every company once a day at ~$0.006 a company (Perplexity, its
    // own billing), ahead of the dollar-capped rotation below, so "nothing from
    // the past day" is never a budget artifact. Failures cost nothing but that
    // company's freshness until the next tick.
    {
      const newsDeadline = Date.now() + 4 * 60_000;
      for (const source of [...sources].sort((a,b) => (Date.parse(feed.companies[a.id]?.newsAt || "") || 0) - (Date.parse(feed.companies[b.id]?.newsAt || "") || 0))) {
        if (Date.now() >= newsDeadline) break;
        const existing: FeedCompany | undefined = feed.companies[source.id];
        const newsAt = existing?.newsAt;
        if (
          !options?.force &&
          newsAt &&
          collectedInCurrentCycle(newsAt)
        ) {
          continue;
        }
        const fresh = await scrapeFreshNews(source, activePerplexityKey, {webSearchToken:activeApifyToken});
        spentFresh += fresh.cost;
        tally.perplexity.tries += 1;
        if (fresh.failed) {
          tally.perplexity.fails += 1;
          tally.perplexity.note = lastPerplexityError;
          if (!fresh.news.length) continue;
        }
        const entry: FeedCompany = existing ?? {
          id: source.id,
          name: source.name,
          slug: null,
          author: null,
          posts: [],
          news: [],
          tldr: null,
          group: competitorIds.has(source.id) ? "competitor" : "customer",
          // Epoch on purpose: Apify has never visited this company, so it
          // belongs at the FRONT of the rotation below.
          fetchedAt: new Date(0).toISOString(),
        };
        if (fresh.news.length > 0) {
          entry.news = mergeNews(entry.news ?? [], fresh.news);
          entry.tldr = null; // the rundown must mention today's stories
          await applyLabels(entry, budget);
          await applyDigest(entry);
        }
        if (!fresh.failed) entry.newsAt = new Date().toISOString();
        feed.companies[source.id] = entry;
        feed.updatedAt = new Date().toISOString();
        feed.spendUsd =
          Math.round(((feed.spendUsd ?? 0) + fresh.cost) * 1000) / 1000;
        // One row per company: a crash keeps everything already learned.
        await saveFeedCompany(feed, source.id);
      }
    }

    // ---- Pass 1b: THE COMPANY'S OWN WEBSITE. A newsroom moves in weeks,
    // not hours, so once a day is plenty, at ~$0.006 a company. A company
    // with no domain on file costs nothing and simply has no website column.
    {
      const siteDeadline = Date.now() + 2 * 60_000;
      for (const source of [...sources].sort((a,b) => (Date.parse(feed.companies[a.id]?.siteAt || "") || 0) - (Date.parse(feed.companies[b.id]?.siteAt || "") || 0))) {
        if (Date.now() >= siteDeadline) break;
        if (!source.site) continue;
        const existing: FeedCompany | undefined = feed.companies[source.id];
        const siteAt = existing?.siteAt;
        if (
          !options?.force &&
          siteAt &&
          collectedInCurrentCycle(siteAt)
        ) {
          continue;
        }
        const result = await scrapeSiteUpdates(source, activePerplexityKey);
        spentFresh += result.cost;
        if (result.failed) continue;
        const entry: FeedCompany = existing ?? {
          id: source.id,
          name: source.name,
          slug: null,
          author: null,
          posts: [],
          news: [],
          tldr: null,
          group: competitorIds.has(source.id) ? "competitor" : "customer",
          fetchedAt: new Date(0).toISOString(),
        };
        if (result.updates.length > 0) {
          entry.site = mergeNews((entry.site ?? []).filter(item => !isNewsIndex(item.url)), result.updates);
          await applyLabels(entry, budget);
        }
        entry.siteAt = new Date().toISOString();
        feed.companies[source.id] = entry;
        feed.updatedAt = new Date().toISOString();
        feed.spendUsd =
          Math.round(((feed.spendUsd ?? 0) + result.cost) * 1000) / 1000;
        await saveFeedCompany(feed, source.id);
      }
    }

    // ---- Pass 1c: A RUNDOWN FOR EVERY ACTIVE COMPANY THAT HAS NONE. The
    // rundown is only rewritten when new items arrive, so a company whose
    // items came in some other way (a hand re-pull, an old copy) kept an
    // empty rundown until fresh news landed, and forever once nobody had it
    // ticked. GSK, Bayer and Novartis sat like that on Sep 10. One Haiku call
    // each, only while it is missing; nothing is scraped.
    const digestDeadline = Date.now() + 60_000;
    for (const source of sources) {
      if (Date.now() >= digestDeadline) break;
      const existing: FeedCompany | undefined = feed.companies[source.id];
      if (!existing || existing.tldr) continue;
      if ((existing.news?.length ?? 0) + (existing.posts?.length ?? 0) === 0) continue;
      await applyDigest(existing);
      if (existing.tldr) {
        feed.companies[source.id] = existing;
        feed.updatedAt = new Date().toISOString();
        await saveFeedCompany(feed, source.id);
      }
    }

    // THE M&A BOARD GOES FIRST WHEN STALE (Anir, Aug 17: "is this thing even
    // working?" — it was 101 hours behind while companies were 3 hours
    // fresh). The company queue drained the run's budget every time, so the
    // ~$0.15 M&A pull never got a turn. Same daily rhythm, same cap, just no
    // longer last in line.
    // Both caps, checked before every Apify call from here down. `force`
    // skips the freshness stamps, never the money.
    const overBudget = () =>
      !activeApifyToken || runExpired() || spent >= RUN_CAP_USD || apifySpentToday(feed) >= DAY_CAP_USD;
    if (
      (options?.force ||
        !feed.mna?.fetchedAt ||
        !collectedInCurrentCycle(feed.mna.fetchedAt)) &&
      !overBudget()
    ) {
      try {
        const mnaCost = await refreshMna(feed);
        spent += mnaCost;
        chargeApify(feed, mnaCost);
        feed.updatedAt = new Date().toISOString();
        await saveFeedMeta(feed);
      } catch (error) {
        // Logged, never fatal: the tracker keeps its last board, but a
        // repeating failure must be visible instead of reading as "stale".
        console.error("[market-intel] M&A refresh failed:", error);
      }
    }

    // The thought-leadership board rides the same daily clock, on the
    // Perplexity bill, never the Apify budget.
    if (
      activePerplexityKey &&
      (options?.force ||
        !feed.thought?.fetchedAt ||
        !collectedInCurrentCycle(feed.thought.fetchedAt))
    ) {
      try {
        const cost = await refreshThought(feed, activePerplexityKey);
        spentFresh += cost;
        feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + cost) * 1000) / 1000;
        feed.updatedAt = new Date().toISOString();
        await saveFeedMeta(feed);
      } catch (error) {
        console.error("[market-intel] thought-leadership refresh failed:", error);
      }
    }

    for (const source of sources) {
      if (overBudget()) break;
      const existing: FeedCompany | undefined = feed.companies[source.id];
      if (
        !options?.force &&
        existing?.fetchedAt &&
        collectedInCurrentCycle(existing.fetchedAt)
      ) {
        skippedFresh += 1;
        continue;
      }
      const postsResult = await scrapeCompanyPosts(source,existing?.posts.map(p=>p.url) || []);
      spent += postsResult.cost;
      const newsResult = await scrapeNews(source);
      spent += newsResult.cost;
      chargeApify(feed, postsResult.cost + newsResult.cost);
      tally.apify.tries += 1;
      if (postsResult.failed && newsResult.failed) {
        tally.apify.fails += 1;
        tally.apify.note = lastApifyError;
      }
      if (postsResult.failed && newsResult.failed) {
        // Nothing came back at all. Before Aug 12 this still stamped the
        // company "fresh", so the UI said Refreshed over day-old data and the
        // rotation skipped it for 11 hours. Keep the old stamp: the 30-minute
        // tick retries it, and the Updated time only moves when data does.
        console.error(
          `[market-intel] ${source.id}: posts AND news scrapes failed. Keeping previous data, will retry next tick`
        );
        continue;
      }
      if (postsResult.failed || newsResult.failed) {
        console.warn(
          `[market-intel] ${source.id}: ${postsResult.failed ? "posts" : "news"} scrape failed this run. Stored what worked`
        );
      }
      const entry: FeedCompany = {
        id: source.id,
        name: source.name,
        slug: postsResult.slug ?? existing?.slug ?? null,
        author: postsResult.author ?? existing?.author ?? null,
        posts: mergePosts(existing?.posts ?? [], postsResult.posts),
        news: mergeNews(existing?.news ?? [], newsResult.news),
        tldr: existing?.tldr ?? null,
        group: competitorIds.has(source.id) ? "competitor" : "customer",
        fetchedAt: postsResult.failed ? (existing?.fetchedAt || new Date(0).toISOString()) : new Date().toISOString(),
        newsAt: existing?.newsAt,
        /* THE WEBSITE COLUMN SURVIVES THIS PASS. This rotation rebuilds the
           entry from scratch rather than mutating it, so anything it does
           not name is dropped — which silently erased the site updates
           collected minutes earlier by Pass 1b (caught by hand: gsk.com
           returned four press releases to a direct probe while the stored
           entry had none). Carried forward exactly like newsAt. */
        ...(existing?.logoUrl ? { logoUrl: existing.logoUrl } : {}),
        ...(existing?.logoCheckedAt ? { logoCheckedAt: existing.logoCheckedAt } : {}),
        ...(existing?.site ? { site: existing.site } : {}),
        ...(existing?.siteAt ? { siteAt: existing.siteAt } : {}),
      };
      if (newsResult.news.length > 0) entry.tldr = null; // fresh rundown
      await applyLabels(entry, budget);
      await applyDigest(entry);
      feed.companies[source.id] = entry;
      feed.updatedAt = new Date().toISOString();
      refreshed += 1;
      await saveFeedCompany(feed, source.id);
    }

    // `only` scopes this pass too. It used to run for every followed person
    // whenever an admin refreshed one company, up to the whole run cap.
    /* NOBODY IS FOLLOWED AT A COMPETITOR (Saras, Sep 10): their people are
       not scraped, so the money goes to the companies' own pages. */
    const peopleQueue = trackedPeople
      .filter(
        (p) => !options?.onlyCompanyIds || options.onlyCompanyIds.includes(p.companyId)
      )
      .filter((p) => !competitorIds.has(p.companyId))
      // A paused company's people pause with it.
      .filter((p) => activeIds.has(p.companyId))
      .sort(
      (a, b) =>
        (Date.parse(feed.people[a.id]?.fetchedAt ?? "") || 0) -
        (Date.parse(feed.people[b.id]?.fetchedAt ?? "") || 0)
    );
    for (const person of peopleQueue) {
      if (overBudget()) break;
      if (!person.linkedinUrl) continue;
      const existing = feed.people[person.id];
      if (
        !options?.force &&
        existing?.fetchedAt &&
        collectedInCurrentCycle(existing.fetchedAt)
      ) {
        continue;
      }
      const result = await scrapePersonPosts(person);
      const photoCost = await refreshPersonPicture(person, result.photoUrl);
      spent += result.cost + photoCost;
      chargeApify(feed, result.cost + photoCost);
      if (result.failed) {
        console.error(
          `[market-intel] person ${person.id}: scrape failed. Keeping previous data, will retry next tick`
        );
        continue;
      }
      if (result.headline && result.headline !== person.headline) {
        await updateTrackedPersonProfile(person.id, {
          headline: result.headline,
        }).catch(() => undefined);
      }
      feed.people[person.id] = {
        posts: mergePosts(existing?.posts ?? [], result.posts),
        fetchedAt: new Date().toISOString(),
      };
      const home = trackedCompanies.find((c) => c.id === person.companyId);
      await labelPersonPosts(
        home?.name ?? feed.companies[person.companyId]?.name ?? person.companyId,
        feed.people[person.id].posts,
        budget
      );
      feed.updatedAt = new Date().toISOString();
      peopleRefreshed += 1;
      await saveFeedPerson(feed, person.id);
    }
  } finally {
    try {
      const at = new Date().toISOString();
      const health = { ...(feed.health ?? {}) };
      if (tally.perplexity.tries > 0) {
        const ok = tally.perplexity.fails < tally.perplexity.tries;
        health.perplexity = { ok, at, ...(ok ? {} : { note: tally.perplexity.note || "every call failed" }) };
      }
      if (tally.apify.tries > 0) {
        const ok = tally.apify.fails < tally.apify.tries;
        health.apify = { ok, at, ...(ok ? {} : { note: tally.apify.note || "every scrape failed" }) };
      }
      const anthropicCalls = classifyUsage.calls - tally.anthropic.calls;
      const anthropicFails = classifyFailures.count - tally.anthropic.failsBefore;
      if (anthropicCalls > 0 || anthropicFails > 0) {
        const ok = anthropicFails < anthropicCalls + anthropicFails;
        health.anthropic = { ok, at, ...(ok ? {} : { note: classifyFailures.note }) };
      }
      feed.health = health;
      await saveFeedMeta(feed);
    } catch {
      /* health is a courtesy; never the reason a run fails */
    }
    await releaseLock(token).catch(() => undefined);
  }

  return {
    ran: true,
    companiesRefreshed: refreshed,
    companiesSkippedFresh: skippedFresh,
    peopleRefreshed,
    spentUsd: Math.round((spent + spentFresh) * 1000) / 1000,
    apifyTodayUsd: apifySpentToday(feed),
  };
}

/** New company just tracked: collect its first briefing right now. */
export async function refreshTrackedCompanyNow(company: TrackedCompany): Promise<void> {
  if (!hasEnv()) return;
  await loadProviderConfig();
  const feed: any = await loadFeedForWrite();
  const source = trackedToSource(company);
  const existing: FeedCompany | undefined = feed.companies[source.id];
  // Independent sources run together. Discovery can start searching while the
  // website reader collects official headlines for its follow-up searches.
  const siteCollection = scrapeSiteUpdates(source, activePerplexityKey, {fastInitial:true});
  const [postsResult, newsResult, siteResult, freshResult] = await Promise.all([
    scrapeCompanyPosts(source),
    scrapeNews(source),
    siteCollection,
    scrapeFreshNews(source, activePerplexityKey, {
      initial: !existing?.newsAt,
      officialUpdates: [],
      webSearchToken: activeApifyToken,
    }),
  ]);
  if (postsResult.cost + newsResult.cost > TARGETED_CAP_USD) {
    // Cannot exceed by design (10 posts + 10 articles is at most ~$0.10),
    // but the guard stays in case limits change.
  }
  const entry: FeedCompany = {
    id: source.id,
    name: source.name,
    slug: postsResult.slug || existing?.slug || null,
    author: postsResult.author || existing?.author || null,
    logoUrl: existing?.logoUrl,
    logoCheckedAt: existing?.logoCheckedAt,
    posts: mergePosts(existing?.posts ?? [], postsResult.posts),
    news: mergeNews(existing?.news ?? [], mergeNews(newsResult.news, freshResult.news)),
    pendingNews: existing?.pendingNews,
    site: mergeNews((existing?.site ?? []).filter(item => !isNewsIndex(item.url)), siteResult.updates),
    tldr: null,
    fetchedAt: postsResult.failed ? existing?.fetchedAt ?? new Date(0).toISOString() : new Date().toISOString(),
    newsAt: freshResult.failed ? existing?.newsAt : new Date().toISOString(),
    siteAt: siteResult.failed ? existing?.siteAt : new Date().toISOString(),
    collectionWarnings: [
      ...(postsResult.failed ? ["LinkedIn could not be refreshed; saved posts are shown."] : []),
      ...(newsResult.failed && freshResult.failed ? ["News collection is temporarily unavailable."] : []),
      ...(freshResult.failed ? ["Some news searches or source pages could not be read; available updates are shown."] : []),
      ...(siteResult.failed ? ["Website updates could not be collected yet."] : []),
      ...(siteResult.warning ? [siteResult.warning] : []),
    ],
    group: company.group === "competitor" ? "competitor" : "customer",
  };
  // Initial collections can contain hundreds of discovered articles. Size the
  // first pass to the collected batch instead of silently deferring after 160.
  await applyLabels(entry, { calls: Math.max(8, Math.ceil((entry.posts.length + entry.news.length + (entry.site?.length ?? 0)) / CLASSIFY_BATCH)) });
  await applyDigest(entry);
  feed.companies[source.id] = entry;
  feed.updatedAt = feed.updatedAt ?? new Date().toISOString();
  chargeApify(feed, postsResult.cost + newsResult.cost);
  feed.spendUsd =
    Math.round(
      ((feed.spendUsd ?? 0) + freshResult.cost + siteResult.cost) * 1000
    ) / 1000;
  await saveFeedCompany(feed, source.id);
}

/** Persist the logo with the feed, including website-only companies. */
async function saveFeedCompany(feed: MarketIntelFeed, id: string): Promise<void> {
  const company = feed.companies[id];
  if (!company) return;
  if (!company.author?.logoUrl && !company.logoUrl &&
      Date.now() - Date.parse(company.logoCheckedAt || "1970-01-01") >= MARKET_INTEL_REFRESH_MS) {
    company.logoCheckedAt = new Date().toISOString();
    try {
      const tracking = await readRow(TRACKING_ROW);
      const source = tracking?.companies?.find((c: TrackedCompany) => c.id === id);
      if (source?.logoUrl) company.logoUrl = source.logoUrl;
      else {
        const domain = normalizeSiteDomain(source?.scrape?.site || source?.website);
        const image = domain ? await findSiteLogo(domain) : null;
        if (image) company.logoUrl = await storeCompanyLogo(id, image);
      }
    } catch { console.error("[market-intel] company logo could not be stored", id); }
  }
  await persistFeedCompany(feed, id);
}

/** New person just followed: pull their recent posts right now. */
export async function refreshTrackedPersonNow(person: TrackedPerson): Promise<void> {
  if (!hasEnv() || !person.linkedinUrl) return;
  await loadProviderConfig();
  const feed: any = await loadFeedForWrite();
  const result = await scrapePersonPosts(person);
  const photoCost = await refreshPersonPicture(person, result.photoUrl, true);
  if (result.failed) return;
  if (result.headline && result.headline !== person.headline) {
    await updateTrackedPersonProfile(person.id, {
      headline: result.headline,
    }).catch(() => undefined);
  }
  feed.people[person.id] = {
    posts: mergePosts(feed.people[person.id]?.posts ?? [], result.posts),
    fetchedAt: new Date().toISOString(),
  };
  chargeApify(feed, result.cost + photoCost);
  await saveFeedPerson(feed, person.id);
}

// ---------------------------------------------------------- add by link
// "It just asks me for the link, and you pull everything else" (Anir,
// Aug 11). The link is the input; name, logo, title, photo and the first
// data pull all come from the page itself.

export type AddCompanyMeta = {
  queuedCompanyId?: string;
  queueLease?: string;
  onProgress?: (progress: TrackProgress) => void | Promise<void>;
  addedBy?: TrackedCompany["addedBy"];
  divisions?: Division[];
};

export type AddCompanyResult = {
  warnings?: string[];
  id: string;
  name: string;
  group: "customer" | "competitor";
  /** True when the company was already in the catalogue: nothing was
   *  scraped, it is simply ticked onto this person's list now. */
  existing: boolean;
  /** True when nobody had it, so this tick starts it collecting again. */
  resumed: boolean;
  company?: TrackedCompany;
};


export type AddCompanyInput = {
  name?: string;
  /** A LinkedIn company page, or empty. */
  linkedinUrl?: string;
  /** Their official website, or empty. */
  website?: string;
};

export async function addCompanyByLink(
  input: AddCompanyInput,
  group: "customer" | "competitor" = "customer",
  meta: AddCompanyMeta = {}
): Promise<AddCompanyResult> {
  if (!hasEnv()) throw new Error("Tracking needs the configured services.");
  await loadProviderConfig();
  await meta.onProgress?.({stage:"identity"});
  const suppliedName = String(input.name ?? "").trim().slice(0,120);
  const liRaw = String(input.linkedinUrl ?? "").trim();
  const siteRaw = String(input.website ?? "").trim();
  /* AT LEAST ONE, AND EACH ONE RIGHT (Anir, Sep 10: "the user enters the
     official site and the official LinkedIn. At least one is mandatory").
     Nothing is guessed any more: no website is looked up for a LinkedIn
     page, and no LinkedIn page for a website. */
  if (!liRaw && !siteRaw) {
    throw new Error("Enter their website or their LinkedIn page. At least one is needed.");
  }
  let slug = liRaw ? linkedInIdentifier(liRaw, "company") : null;
  if (liRaw && !slug) {
    throw new Error("That LinkedIn link should be a company page, like linkedin.com/company/gsk.");
  }
  const domain = siteRaw ? companyDomain(siteRaw) : null;
  if (siteRaw && (!domain || /(^|\.)linkedin\.com$/.test(domain))) {
    throw new Error("That website doesn't look right. It should look like gsk.com.");
  }
  const registry = await loadRegistry();
  const tracking = registry.tracking;
  if(meta.queuedCompanyId) registry.companies = registry.companies.filter(c=>c.id!==meta.queuedCompanyId);

  /* KNOWN BEFORE PAID, BY EITHER LINK (Anir, Sep 10: "if someone chooses that
     same company it won't scrape twice"). The LinkedIn slug and the website
     are both matched against the list before any call is made; a company
     already there is simply ticked, and two links naming two different
     companies are refused rather than guessed between. */
  const bySlug = slug
    ? (registry.companies.find((c) => (c.scrape?.li ?? []).some((l) => l.toLowerCase() === slug?.toLowerCase())) ??
      findTrackedByLinkedInSlug({...tracking,companies:registry.companies}, slug))
    : undefined;
  const bySite = domain
    ? registry.companies.find((c) => {
        const known = normalizeSiteDomain(c.scrape?.site || c.website);
        return !!known && (known === domain || domain.endsWith(`.${known}`) || known.endsWith(`.${domain}`));
      })
    : undefined;
  if (bySlug && bySite && bySlug.id !== bySite.id) {
    throw new Error(`That LinkedIn page is ${bySlug.name}, but the website is ${bySite.name}. Check both links.`);
  }
  const known = bySlug ?? bySite ?? findCompanyDuplicate(registry.companies, siteRaw, liRaw);
  if (known) throw new DuplicateCompanyError(known);

  /* THE DIVISIONS ARE CHECKED BEFORE ANY MONEY MOVES: a company nobody has
     needs one, and asking after a paid probe wasted it. There is no limit on
     how many a person adds (Anir, Sep 10). */
  const divisions = (meta.divisions ?? []).filter((d) => ["MPR", "MDV", "CON"].includes(d));
  if (divisions.length === 0) {
    throw new Error("Pick at least one division (MPR, MDV or CON) for a company that isn't on the list yet.");
  }

  // Onboarding one company must not load every article for every company.
  const feed: MarketIntelFeed = { ...emptyFeed(), ...(await readFeedMeta()), companies: {}, people: {} };
  const assertOwner = async () => {
    if (meta.queuedCompanyId) await editQueuedCompany(meta.queuedCompanyId, c => {
      if (c.onboarding?.lease !== meta.queueLease || c.onboarding?.status !== "collecting") throw new Error("Collection was superseded.");
      return c;
    });
  };
  const phase = <T,>(key: string, work: () => Promise<T>) => collectionPhase(meta.queuedCompanyId, input, key, work, assertOwner);
  if (!meta.queuedCompanyId) {
    const prior = await readFeedCompany(miSlug(suppliedName || slug || domain || ""));
    if (prior) feed.companies[prior.id] = prior;
  }
  let name = "";
  let nameCost = 0;
  let newsQuery: string | undefined;
  let probe: Awaited<ReturnType<typeof scrapeCompanyPosts>> | null = null;
  const [siteIdentity, initialProbe] = await Promise.all([
    domain ? phase("identity", () => readCompanyNameFromSite(domain, activePerplexityKey)) : Promise.resolve(null),
    slug ? phase("linkedin", () => scrapeCompanyPosts({ id: slug!, name: slug!, li: [slug!], expect: "" })) : Promise.resolve(null),
  ]);
  nameCost = siteIdentity?.cost ?? 0;
  newsQuery = siteIdentity?.newsQuery;
  if (!slug && siteIdentity?.linkedinUrl) {
    slug=linkedInIdentifier(siteIdentity.linkedinUrl,"company");
    const duplicate=findCompanyDuplicate(registry.companies,"",siteIdentity.linkedinUrl);
    if(duplicate)throw new DuplicateCompanyError(duplicate);
  }
  if (slug) {
    probe = initialProbe ?? await phase("linkedin", () => scrapeCompanyPosts({ id: slug!, name: slug!, li: [slug!], expect: "" }));
    if (probe.failed) throw new Error(lastApifyError || "LinkedIn collection was interrupted. Retry will reuse the saved scraper run.");
    chargeApify(feed, probe.cost);
    // The provider has already billed this call, even if identity checks fail.
    await saveFeedMeta(feed);
    name = probe.author?.name?.trim() ?? "";
    if (!name && domain && siteIdentity?.name && await websiteConfirmsLinkedIn(domain,slug)) name = siteIdentity.name;
    if (!name) {
      await saveFeedMeta(feed);
      throw new Error("Couldn't read that LinkedIn page. Check the link, or try again in a minute.");
    }
  } else if (domain) {
    const read = siteIdentity!;
    nameCost = read.cost;
    name = read.name ?? "";
    newsQuery = read.newsQuery;
    if (!name) {
      feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + nameCost) * 1000) / 1000;
      await saveFeedMeta(feed);
      throw new Error("Couldn't read the company's name from that website. Add their LinkedIn page too.");
    }
  }
  if (siteIdentity?.name && probe?.author?.name && !compatibleCompanyNames(siteIdentity.name, probe.author.name)) {
    throw new Error(`The website identifies ${siteIdentity.name}, but LinkedIn identifies ${probe.author.name}. Check that both links belong to the same company.`);
  }
  if (suppliedName && !compatibleCompanyNames(suppliedName,name)) {
    throw new Error(`The sources identify ${name}. Check the company name and links before adding it.`);
  }
  await meta.onProgress?.({stage:"sources",name,detail:"Reading company posts, news coverage and website updates."});
  if(meta.queuedCompanyId){
    const duplicate=registry.companies.find(c=>miSlug(c.name)===miSlug(name));
    if(duplicate)throw new DuplicateCompanyError(duplicate);
  }
  const id = meta.queuedCompanyId || miSlug(name);
  const already: TrackedCompany | undefined = tracking.companies.find((c: TrackedCompany) => c.id === id);
  if (!meta.queuedCompanyId && (already || feed.companies[id])) {
    /* A different link to a company already in the list: reading the name
       was the only cost, and the answer is the same as a known link. */
    feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + nameCost) * 1000) / 1000;
    await saveFeedMeta(feed);
    if (already) throw new DuplicateCompanyError(already);
    const storedGroup = feed.companies[id]?.group;
    throw new DuplicateCompanyError({ name: feed.companies[id]?.name ?? name, group: storedGroup === "competitor" ? "competitor" : "customer" });
  }
  const now = new Date().toISOString();
  const company: TrackedCompany = {
    id,
    name,
    group,
    industry: "",
    hq: "",
    website: domain ? `https://${domain}` : "",
    linkedinUrl: slug ? `https://www.linkedin.com/company/${slug}` : "",
    competitors: [],
    keywords: [],
    note: "",
    addedAt: now,
    divisions,
    ...(newsQuery ? { newsQuery } : {}),
    ...(meta.addedBy ? { addedBy: meta.addedBy } : {}),
  };
  // Persist usable sources before slower discovery and digest generation finish.
  const previousPreview = meta.queuedCompanyId ? await readFeedCompany(id) : null;
  const preview: FeedCompany = {id, name, group, slug: probe?.slug ?? null,
    author: probe?.author ?? null, posts: probe?.posts ?? previousPreview?.posts ?? [], news: previousPreview?.news ?? [], site: previousPreview?.site ?? [],
    tldr: previousPreview?.tldr ?? null, fetchedAt: now};
  const publishPreview = async () => {
    if (!meta.queuedCompanyId) return;
    await assertOwner();
    await saveFeedCompany({...feed, companies: {[id]: preview}}, id);
  };
  if (meta.queuedCompanyId) {
    await editQueuedCompany(id, c => {
      if(c.onboarding?.lease!==meta.queueLease || c.onboarding?.status!=="collecting") throw new Error("Collection was superseded.");
      return {...c, name, logoUrl: probe?.author?.logoUrl || c.logoUrl};
    });
    await publishPreview();
  }
  const siteCollection = (domain ? phase("website", () => scrapeSiteUpdates({ name, site: domain }, activePerplexityKey, {fastInitial:true})) : Promise.resolve({ updates: [], cost: 0, failed: false })).then(async result => {
    preview.site = result.updates;
    await publishPreview();
    return result;
  });
  const [newsResult, freshResult, siteResult] = await Promise.all([
    phase("news-index", () => scrapeNews({ name, site: domain || undefined, newsQ: newsQuery })),
    // External coverage must not wait for the official-site crawl. Both are
    // independent first-pass sources; the standing refresh can later use
    // official headlines to broaden syndication coverage.
    phase("news-discovery", () => scrapeFreshNews({ name, newsQ: newsQuery, site: domain || undefined }, activePerplexityKey, {initial:true,officialUpdates:[],webSearchToken:activeApifyToken})),
    siteCollection,
  ]);
  if (newsResult.failed && freshResult.failed && (!domain || siteResult.failed) && !probe?.posts.length) {
    throw new Error("The news sources could not be reached. Nothing was added. Please try again later.");
  }
  const warnings = [
    ...(slug && !probe?.posts.length ? ["The LinkedIn page is linked from the official website, but no public posts were collected yet."] : []),
    ...(probe?.truncated ? ["LinkedIn returned a limited history. Older posts may not be included yet."] : []),
    ...(newsResult.failed && freshResult.failed ? ["News collection is temporarily unavailable."] : []),
    ...(domain && siteResult.failed ? ["Website updates could not be collected yet."] : []),
    ...("warning" in siteResult && siteResult.warning ? [String(siteResult.warning)] : []),
    ...(freshResult.failed ? ["Some news searches or source pages could not be read; available updates are shown."] : []),
  ];
  let entry: FeedCompany = {
    id,
    name,
    slug: probe?.slug ?? null,
    author: probe?.author ?? null,
    posts: probe?.posts ?? [],
    news: mergeNews(newsResult.news, freshResult.news).filter(n => !siteResult.updates.some(site => site.url.replace(/\/$/, "") === n.url.replace(/\/$/, ""))),
    site: siteResult.updates,
    tldr: null,
    group,
    fetchedAt: now,
    collectionWarnings: warnings,
    ...(!freshResult.failed ? { newsAt: now } : {}),
    ...(domain && !siteResult.failed ? { siteAt: now } : {}),
  };
  await meta.onProgress?.({stage:"briefing",name,detail:`${entry.posts.length} posts · ${entry.news.length} news articles · ${entry.site?.length ?? 0} website updates`});
  entry = await phase("briefing", async () => {
    await applyLabels(entry, { calls: Math.max(8, Math.ceil((entry.posts.length + entry.news.length + (entry.site?.length ?? 0)) / CLASSIFY_BATCH)) });
    if (meta.queuedCompanyId) {
      await assertOwner();
      await saveFeedCompany({...feed, companies: {[id]: entry}}, id);
    }
    await applyDigest(entry);
    return entry;
  });
  if (entry.pendingNews?.length) warnings.push("Some news sources are still being verified and will be retried during refresh.");
  feed.companies[id] = entry;
  feed.updatedAt = feed.updatedAt ?? now;
  chargeApify(feed, newsResult.cost);
  feed.spendUsd =
    Math.round(((feed.spendUsd ?? 0) + freshResult.cost + nameCost + siteResult.cost) * 1000) / 1000;
  await meta.onProgress?.({stage:"saving",name});
  if(meta.queuedCompanyId){
    await editQueuedCompany(id,c=>{if(c.onboarding?.lease!==meta.queueLease || c.onboarding?.status!=="collecting")throw new Error("Collection was superseded.");return c;});
  } else await insertNewTrackedCompany(company);
  try { await phase("saved", async () => { await saveFeedCompany(feed, id); return true; }); }
  catch (saveError) {
    if(meta.queuedCompanyId)throw saveError;
    // The feed write and its metadata write are separate. Check what actually
    // persisted before offering a retry, or an already-saved company becomes
    // a duplicate on the user's next attempt.
    const saved = await client().from("offering_catalog_state").select("catalog").eq("id",`market-intel-company:${id}`).maybeSingle();
    if (!saved.error && saved.data?.catalog?.company?.id === id) {
      warnings.push("The company briefing was saved, but refresh status could not be updated yet.");
    } else if (!saved.error && !saved.data) {
      const rolledBack = await rollbackNewTrackedCompany(company);
      if (rolledBack) throw new Error("The briefing could not be saved. Nothing was added; please try again.");
      throw new Error(`${name} was added, but its briefing could not be saved. Open it from Manage ${group === "competitor" ? "competitors" : "customers"} to retry collection.`);
    } else {
      throw new Error(`Could not confirm whether ${name}'s briefing was saved. Check Manage ${group === "competitor" ? "competitors" : "customers"} before retrying.`);
    }
  }
  if(meta.queuedCompanyId) await editQueuedCompany(id,c=>{if(c.onboarding?.lease!==meta.queueLease || c.onboarding?.status!=="collecting")throw new Error("Collection was superseded.");const {onboarding: _job,...saved}=c;void _job;return {...saved,name,linkedinUrl:company.linkedinUrl,newsQuery:company.newsQuery};});
  return { id, name, group, existing: false, resumed: false, company, warnings };
}

async function rollbackNewTrackedCompany(company: TrackedCompany): Promise<boolean> {
  const db = client();
  for (let attempt=0;attempt<5;attempt++) {
    const {data,error}=await db.from("offering_catalog_state").select("catalog,updated_at").eq("id",TRACKING_ROW).single();
    if(error)return false;
    const current=data.catalog.companies.find((c:TrackedCompany)=>c.id===company.id);
    if(!current)return true;
    // Never remove a company that another request has changed in the meantime.
    if(!isDeepStrictEqual(current,company))return false;
    data.catalog.companies=data.catalog.companies.filter((c:TrackedCompany)=>c.id!==company.id);
    if(data.catalog.divisions)delete data.catalog.divisions[company.id];
    const saved=await db.from("offering_catalog_state").update({catalog:data.catalog,updated_at:new Date().toISOString()}).eq("id",TRACKING_ROW).eq("updated_at",data.updated_at).select("id");
    if(saved.error)return false;
    if(saved.data?.length){bustMarketIntelTrackingCache();return true;}
  }
  return false;
}

async function insertNewTrackedCompany(company: TrackedCompany): Promise<void> {
  const db = client();
  for (let attempt = 0; attempt < 5; attempt++) {
    const {data,error} = await db.from("offering_catalog_state").select("catalog,updated_at").eq("id",TRACKING_ROW).single();
    if (error) throw new Error(error.message);
    const tracking = data.catalog;
    const duplicate = findCompanyDuplicate(tracking.companies, company.website, company.linkedinUrl) || tracking.companies.find((c: TrackedCompany) => c.id === company.id);
    if (duplicate) throw new DuplicateCompanyError(duplicate);
    tracking.companies.push(company);
    tracking.divisions = {...tracking.divisions,[company.id]:company.divisions};
    const saved = await db.from("offering_catalog_state").update({catalog:tracking,updated_at:new Date().toISOString()}).eq("id",TRACKING_ROW).eq("updated_at",data.updated_at).select("id");
    if (saved.error) throw new Error(saved.error.message);
    if (saved.data?.length) {bustMarketIntelTrackingCache();return;}
  }
  throw new Error("The company list changed while saving. Please try again.");
}

export async function addPersonByLink(
  companyId: string,
  linkedinUrl: string
): Promise<TrackedPerson> {
  if (!hasEnv()) throw new Error("Tracking needs the configured services.");
  await loadProviderConfig();
  const username = linkedInIdentifier(linkedinUrl, "in");
  if (!username) {
    throw new Error(
      "That doesn't look like a LinkedIn profile. It should look like linkedin.com/in/their-name"
    );
  }
  let items: any;
  try {
    items = await runActor("apimaestro~linkedin-profile-detail", { username });
  } catch {
    throw new Error("Couldn't read that profile. Check the link and try again.");
  }
  const info = Array.isArray(items) ? items[0]?.basic_info : null;
  const name = String(info?.fullname ?? "").trim();
  if (!name) {
    throw new Error("Couldn't read that profile. Check the link and try again.");
  }
  const tracking = (await readRow(TRACKING_ROW)) ?? { companies: [], people: [] };
  tracking.people = Array.isArray(tracking.people) ? tracking.people : [];
  if (
    tracking.people.some(
      (p: TrackedPerson) =>
        p.companyId === companyId && p.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error(`${name} is already on the tracked list.`);
  }
  const person: TrackedPerson = {
    id: `${companyId}-${miSlug(name)}-${Date.now().toString(36)}`,
    companyId,
    name,
    role: String(info?.headline ?? "").slice(0, 80),
    headline: String(info?.headline ?? "").trim() || undefined,
    location: String(info?.location?.full ?? "").trim() || undefined,
    about: String(info?.about ?? "").trim().slice(0, 800) || undefined,
    followerCount:
      typeof info?.follower_count === "number" ? info.follower_count : undefined,
    linkedinUrl:
      String(info?.profile_url ?? "") || `https://www.linkedin.com/in/${username}`,
    /* MIRRORED, NOT LINKED (see lib/miPhotos). LinkedIn's URL carries an
       expiry; storing it means the face goes blank in a few weeks. */
    photoUrl: await mirrorPhoto(String(info?.profile_picture_url ?? "")),
    addedAt: new Date().toISOString(),
  };
  tracking.people.push(person);
  await writeRow(TRACKING_ROW, tracking);
  await refreshTrackedPersonNow(person).catch(() => undefined);
  return person;
}

/**
 * Called from live-mode page renders: if the feed has gone stale, one
 * background refresh is scheduled after the response goes out. The lock makes
 * simultaneous visitors harmless.
 */
let lastScheduledCheck = 0;
export function maybeScheduleMarketIntelRefresh(
  _feed: { updatedAt: string | null } | null
): void {
  armCompanyOnboarding();
  void _feed;
  // The database lock protects all instances; throttle page-triggered checks
  // locally while the runner checks each company's own daily timestamps.
  if (Date.now() - lastScheduledCheck < 30 * 60_000) return;
  lastScheduledCheck = Date.now();
  after(() =>
    runMarketIntelRefresh().catch((error) =>
      console.error("[market-intel] scheduled refresh failed:", error)
    )
  );
}

/**
 * THE WEBSITE PASS, ON ITS OWN LEGS.
 *
 * Anir, Aug 30, setting it as a goal: "Why is the website always zero? You
 * clearly did something wrong... it's impossible that they all have zero things
 * on their website. Until you have a good way of scanning those things two
 * times a day, that's not considered done."
 *
 * MEASURED, NOT GUESSED: 76 companies in the feed, zero with a website item,
 * and `siteAt` unset on every single one — Pass 1b above had never run for
 * anybody. Called straight at GSK the scraper returned six real press releases
 * in seven seconds for $0.006, and a forced run did write four of them. So the
 * scraper was never the problem.
 *
 * WHAT WAS: Pass 1b sits behind a same-day news pass that makes one Perplexity
 * call for each of ~76 companies, and behind the Apify rotation's dollar
 * bookkeeping. That is minutes of serial work before the first newsroom is
 * visited, and the run does not survive long enough to reach it — news
 * accumulates because it writes in batches of ten, and the website column never
 * starts. A pass at the back of a queue that never finishes does not exist.
 *
 * So it is its own job, with its own entry point and its own schedule, and
 * nothing upstream of it that can starve it.
 *
 * SHAPE: least-recently-scanned first, a wall-clock budget per invocation, and
 * a write after every company. An invocation that runs out of time just stops;
 * the next one starts with the companies it never reached, so the whole watch
 * list is covered across runs without any single run needing to be long-lived.
 */

/** A newsroom moves in weeks, so once a day is plenty (Anir, Sep 11: "it's
 *  supposed to be once a day"). The shared daily clock lets the scan land on
 *  a company scanned the day before rather than skip it as fresh. */
/** How long one invocation may spend, under any request ceiling. */
const SITE_RUN_BUDGET_MS = 4 * 60 * 1000;

export type SiteRunSummary = {
  ran: boolean;
  reason?: string;
  scanned: number;
  withUpdates: number;
  items: number;
  failed: number;
  skippedFresh: number;
  remaining: number;
  spendUsd: number;
  seconds: number;
};

export async function runSiteUpdatesRefresh(options?: {
  /** Ignore the freshness window. The ops hatch uses it; the cron never does. */
  force?: boolean;
  budgetMs?: number;
  onlyCompanyIds?: string[];
}): Promise<SiteRunSummary> {
  if (!hasEnv()) return {ran:false,reason:"missing database",scanned:0,withUpdates:0,items:0,failed:0,skippedFresh:0,remaining:0,spendUsd:0,seconds:0};
  const token = await claimLock();
  if (!token) return {ran:false,reason:"another news or website refresh is running",scanned:0,withUpdates:0,items:0,failed:0,skippedFresh:0,remaining:0,spendUsd:0,seconds:0};
  try { return await runSiteUpdatesRefreshLocked(options); }
  finally { await releaseLock(token); }
}

async function runSiteUpdatesRefreshLocked(options?: {force?:boolean;budgetMs?:number;onlyCompanyIds?:string[]}): Promise<SiteRunSummary> {
  const started = Date.now();
  const budgetMs = options?.budgetMs ?? SITE_RUN_BUDGET_MS;
  const nothing = (reason: string): SiteRunSummary => ({
    ran: false,
    reason,
    scanned: 0,
    withUpdates: 0,
    items: 0,
    failed: 0,
    skippedFresh: 0,
    remaining: 0,
    spendUsd: 0,
    seconds: Math.round((Date.now() - started) / 1000),
  });

  if (!hasEnv()) return nothing("missing env (database)");
  const config = await readRow(CONFIG_ROW).catch(() => null);
  const key = config?.perplexityKey || process.env.PERPLEXITY_API_KEY;

  const feed: any = await readMarketIntelFeed({ fresh: true }).catch(() => null);
  if (!feed || !feed.companies) return nothing("no feed row yet");

  const registry = await loadRegistry();

  /* Every ACTIVE company on the watch that has a domain to read. One with no
     domain costs nothing and simply has no website column; a paused one is
     not visited at all. */
  const sources: CompanySource[] = registry.active
    .map(trackedToSource)
    .filter((s) => !!s.site)
    .filter(
      (s) => !options?.onlyCompanyIds || options.onlyCompanyIds.includes(s.id)
    );

  const lastAt = (id: string): number => {
    const at = (feed.companies?.[id] as FeedCompany | undefined)?.siteAt;
    return at ? Date.parse(at) || 0 : 0;
  };
  const queue = [...sources].sort((a, b) => lastAt(a.id) - lastAt(b.id));

  let scanned = 0;
  let withUpdates = 0;
  let items = 0;
  let failed = 0;
  let skippedFresh = 0;
  let spend = 0;
  let reached = 0;

  for (const source of queue) {
    reached += 1;
    if (Date.now() - started > budgetMs) {
      reached -= 1;
      break;
    }

    const existing: FeedCompany | undefined = feed.companies[source.id];
    if (
      !options?.force &&
      existing?.siteAt &&
      collectedInCurrentCycle(existing.siteAt)
    ) {
      skippedFresh += 1;
      continue;
    }

    let result: Awaited<ReturnType<typeof scrapeSiteUpdates>>;
    try {
      result = await scrapeSiteUpdates(source, key);
    } catch {
      failed += 1;
      continue;
    }
    spend += result.cost || 0;

    const entry: FeedCompany = existing ?? {
      id: source.id,
      name: source.name,
      slug: null,
      author: null,
      posts: [],
      news: [],
      tldr: null,
      group: registry.competitorIds.has(source.id) ? "competitor" : "customer",
      fetchedAt: new Date(0).toISOString(),
    };
    if (result.failed) failed += 1;
    if (result.updates.length > 0) {
      entry.site = mergeNews((entry.site ?? []).filter(item => !isNewsIndex(item.url)), result.updates);
      withUpdates += 1;
      items += result.updates.length;
      // New website items are read like everything else, here and now.
      await applyLabels(entry, { calls: 4 });
    }
    /* Stamped even on a failure, so one site that refuses to be read cannot
       hold the front of the queue and starve everybody behind it. */
    entry.siteAt = new Date().toISOString();
    feed.companies[source.id] = entry;
    feed.spendUsd =
      Math.round(((feed.spendUsd ?? 0) + (result.cost || 0)) * 1000) / 1000;
    scanned += 1;

    /* Written after every company: this job is designed to be interrupted, and
       an interrupted run must keep everything it actually learned. */
    await saveFeedCompany(feed, source.id);
  }

  return {
    ran: scanned > 0,
    scanned,
    withUpdates,
    items,
    failed,
    skippedFresh,
    remaining: Math.max(0, queue.length - reached),
    spendUsd: Math.round(spend * 1000) / 1000,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}


export type LabelRunSummary = {
  ran: boolean;
  reason?: string;
  companies: number;
  people: number;
  itemsLabeled: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Items inside the window still unread when the call budget ran out. */
  remaining: number;
  seconds: number;
};

/**
 * THE OPS HATCH FOR THE CLASSIFIER: read everything unread, up to a call
 * budget, and say what it cost. The daily runs do the same work a little at
 * a time; this is for the day it ships and for a prompt change.
 */
export async function runMarketIntelLabeling(options?: {
  maxCalls?: number;
  /** Company ids to read first and only; the rest wait for the daily runs. */
  only?: string[];
  /** Read again items labelled under the Sep 10 signals. Spends; on request only. */
  relabel?: boolean;
}): Promise<LabelRunSummary> {
  const started = Date.now();
  const nothing = (reason: string): LabelRunSummary => ({
    ran: false,
    reason,
    companies: 0,
    people: 0,
    itemsLabeled: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    remaining: 0,
    seconds: 0,
  });
  if (!hasEnv()) return nothing("missing env (database)");
  const feed: any = await readMarketIntelFeed({ fresh: true }).catch(() => null);
  if (!feed || !feed.companies) return nothing("no feed row yet");
  const registry = await loadRegistry();
  const trackedCompanies: TrackedCompany[] = registry.companies;
  const trackedPeople: TrackedPerson[] = registry.people;
  const competitorIds = registry.competitorIds;

  const budget: LabelBudget = {
    calls: Math.max(1, Math.min(400, options?.maxCalls ?? 60)),
    relabel: options?.relabel === true,
  };
  const before = { ...classifyUsage };
  let companies = 0;
  let people = 0;
  let itemsLabeled = 0;
  const onlyIds = options?.only && options.only.length > 0 ? new Set(options.only) : null;
  const companiesList: FeedCompany[] = (Object.values(feed.companies) as FeedCompany[]).filter(
    (c) => !onlyIds || onlyIds.has(c.id)
  );
  // Customers first: theirs is the page people open most.
  companiesList.sort((a, b) => Number(competitorIds.has(a.id)) - Number(competitorIds.has(b.id)));
  for (const entry of companiesList) {
    if (budget.calls <= 0) break;
    if (!entry.group) entry.group = competitorIds.has(entry.id) ? "competitor" : "customer";
    const got = await applyLabels(entry, budget);
    if (got > 0) {
      itemsLabeled += got;
      companies += 1;
      await saveFeedCompany(feed, entry.id);
    }
  }
  for (const person of trackedPeople) {
    if (budget.calls <= 0) break;
    if (competitorIds.has(person.companyId)) continue;
    if (onlyIds && !onlyIds.has(person.companyId)) continue;
    const posts: FeedPost[] = feed.people?.[person.id]?.posts ?? [];
    if (posts.length === 0) continue;
    const home = trackedCompanies.find((c) => c.id === person.companyId);
    const got = await labelPersonPosts(
      home?.name ?? feed.companies[person.companyId]?.name ?? person.companyId,
      posts,
      budget
    );
    if (got > 0) {
      itemsLabeled += got;
      people += 1;
      await saveFeedPerson(feed, person.id);
    }
  }

  const unread = (item: Parameters<typeof isLabeled>[0]) => (budget.relabel ? !hasCurrentLabel(item) : !isLabeled(item));
  let remaining = 0;
  for (const entry of companiesList) {
    for (const p of entry.posts) if (unread(p) && inLabelWindow(p.date)) remaining += 1;
    for (const n of [...entry.news, ...(entry.pendingNews ?? [])]) if ((unread(n) || typeof n.label?.isCompanyNews !== "boolean") && inLabelWindow(n.published)) remaining += 1;
    for (const n of entry.site ?? []) if (unread(n) && inLabelWindow(n.published)) remaining += 1;
  }
  for (const person of trackedPeople) {
    if (competitorIds.has(person.companyId)) continue;
    for (const p of feed.people?.[person.id]?.posts ?? [])
      if (unread(p) && inLabelWindow(p.date)) remaining += 1;
  }
  return {
    ran: itemsLabeled > 0,
    companies,
    people,
    itemsLabeled,
    calls: classifyUsage.calls - before.calls,
    inputTokens: classifyUsage.inputTokens - before.inputTokens,
    outputTokens: classifyUsage.outputTokens - before.outputTokens,
    remaining,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/** The ops hatch for the thought-leadership board: pull it now. */
export type RundownRunSummary = {
  ran: boolean;
  reason?: string;
  checked: number;
  written: number;
  ids: string[];
  seconds: number;
};

/**
 * WRITE THE MISSING RUNDOWNS, AND NOTHING ELSE (Sep 10). GSK, Bayer and
 * Novartis had their items re-pulled by hand and never got a rundown, and a
 * company nobody has ticked is never refreshed, so nothing else would write
 * one. This reads what is already stored and asks Haiku for the rundown of
 * each company that has none: no scraping, capped at a handful of calls so a
 * missing `only` can never turn into a bill.
 */
export async function runMissingRundowns(options?: {
  only?: string[];
  maxCalls?: number;
}): Promise<RundownRunSummary> {
  const started = Date.now();
  const none = (reason: string): RundownRunSummary => ({ ran: false, reason, checked: 0, written: 0, ids: [], seconds: 0 });
  if (!hasEnv()) return none("missing env (database)");
  const feed: any = await readMarketIntelFeed({ fresh: true }).catch(() => null);
  if (!feed || !feed.companies) return none("no feed row yet");
  const registry = await loadRegistry();
  const onlyIds = options?.only && options.only.length > 0 ? new Set(options.only) : null;
  const cap = Math.max(1, Math.min(40, options?.maxCalls ?? 10));
  const ids: string[] = [];
  let checked = 0;
  for (const entry of Object.values(feed.companies) as FeedCompany[]) {
    if (checked >= cap) break;
    if (onlyIds && !onlyIds.has(entry.id)) continue;
    if (entry.tldr) continue;
    if ((entry.news?.length ?? 0) + (entry.posts?.length ?? 0) === 0) continue;
    checked += 1;
    if (!entry.group) entry.group = registry.competitorIds.has(entry.id) ? "competitor" : "customer";
    await applyDigest(entry);
    if (entry.tldr) {
      ids.push(entry.id);
      await saveFeedCompany(feed, entry.id);
    }
  }
  return { ran: true, checked, written: ids.length, ids, seconds: Math.round((Date.now() - started) / 1000) };
}

export async function refreshThoughtLeadershipNow(): Promise<{ items: number; total: number; cost: number }> {
  if (!hasEnv()) throw new Error("missing env (database)");
  const config = await readRow(CONFIG_ROW).catch(() => null);
  const key = config?.perplexityKey || process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("no PERPLEXITY key in config row or env");
  const feed: any = await readMarketIntelFeed({ fresh: true }).catch(() => null);
  if (!feed || !feed.companies) throw new Error("no feed row yet");
  const cost = await refreshThought(feed, key);
  feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + cost) * 1000) / 1000;
  await saveFeedMeta(feed);
  return { items: feed.thought?.items?.length ?? 0, total: feed.thought?.total ?? 0, cost };
}


/**
 * SOMEBODY WANTS A PAUSED COMPANY AGAIN. It rejoins the rotation on its own,
 * but if what is stored is more than a day old the person is looking at a
 * stale page, so one targeted pull runs right away (the normal caps apply).
 */
/**
 * WAKE WHAT WAS JUST TICKED, IN ONE GO (Sep 10). Ticking a company nobody had
 * pulls it now if its data is a day old. Select-all in Manage companies, or
 * putting every company on one person's list, ticks dozens at once, and one
 * task per company meant dozens of full reads of the feed and dozens of runs
 * fighting over the lock. Now it is one read of the small summaries and at
 * most one targeted run for everything stale, inside the usual money caps.
 */
export async function resumeCompaniesIfStale(companyIds: string[]): Promise<{ stale: string[] }> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (!hasEnv() || ids.length === 0) return { stale: [] };
  const summaries = await readMarketIntelSummaries({ fresh: true }).catch(() => null);
  const stale = ids.filter((id) => {
    const at = summaries?.companies?.[id]?.fetchedAt;
    return !at || Date.now() - Date.parse(at) >= DAY_MS;
  });
  if (stale.length === 0) return { stale };
  console.log(`[market-intel] ${stale.length} ticked companies had day-old data; pulling them now`);
  await runMarketIntelRefresh({ force: true, onlyCompanyIds: stale }).catch((error) =>
    console.error(`[market-intel] resume of ${stale.length} companies failed:`, error)
  );
  return { stale };
}

export async function resumeCompanyIfStale(companyId: string): Promise<void> {
  await resumeCompaniesIfStale([companyId]);
}


/**
 * CHECK CONNECTIONS, ON DEMAND (Anir, Sep 10: "Do the API keys work? Is the
 * storage good?"). One cheap call to each service with the keys the runs
 * use, plus a look at the store, written to the meta row so the page shows
 * it. Costs a fraction of a cent.
 */
export async function checkMarketIntelConnections(): Promise<NonNullable<MarketIntelFeed["health"]>> {
  const at = new Date().toISOString();
  const health: NonNullable<MarketIntelFeed["health"]> = {};
  const config = hasEnv() ? await readRow(CONFIG_ROW).catch(() => null) : null;
  const apifyToken = config?.apifyToken || process.env.APIFY_API_TOKEN;
  const perplexityKey = config?.perplexityKey || process.env.PERPLEXITY_API_KEY;

  if (!apifyToken) health.apify = { ok: false, at, note: "no Apify token in the config row or env" };
  else {
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me?token=${apifyToken}`, {
        signal: AbortSignal.timeout(20_000),
      });
      health.apify = res.ok
        ? { ok: true, at }
        : { ok: false, at, note: `Apify HTTP ${res.status}${res.status === 401 ? " (bad token)" : ""}` };
    } catch (error) {
      health.apify = { ok: false, at, note: String(error instanceof Error ? error.message : error).slice(0, 120) };
    }
  }

  if (!perplexityKey) health.perplexity = { ok: false, at, note: "no Perplexity key in the config row or env" };
  else {
    try {
      await requestMarketIntelSearch({ model: "sonar", messages: [{ role: "user", content: "Say ok" }], max_tokens: 20, web_search_options: {search_context_size:"low"} }, perplexityKey, "service-check", "Perplexity");
      health.perplexity = {ok:true,at};
    } catch (error) {
      health.perplexity = { ok: false, at, note: String(error instanceof Error ? error.message : error).slice(0, 120) };
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) health.anthropic = { ok: false, at, note: "no Anthropic key" };
  else {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3,
        messages: [{ role: "user", content: "ok" }],
      });
      health.anthropic = { ok: true, at };
    } catch (error) {
      health.anthropic = { ok: false, at, note: String(error instanceof Error ? error.message : error).slice(0, 120) };
    }
  }

  try {
    const db = client();
    const [companies, people] = await Promise.all([
      db.from("offering_catalog_state").select("id, catalog").like("id", "market-intel-company:%"),
      db.from("offering_catalog_state").select("id").like("id", "market-intel-person:%"),
    ]);
    if (companies.error) throw new Error(companies.error.message);
    const largest = Math.max(0, ...(companies.data ?? []).map((r: any) => JSON.stringify(r.catalog).length));
    health.storage = {
      ok: true,
      at,
      companies: (companies.data ?? []).length,
      people: (people.data ?? []).length,
      largestKb: Math.round(largest / 1024),
    };
  } catch (error) {
    health.storage = { ok: false, at, note: String(error instanceof Error ? error.message : error).slice(0, 120) };
  }

  const feed: any = (await readMarketIntelFeed({ fresh: true }).catch(() => null)) ?? emptyFeed();
  feed.health = { ...(feed.health ?? {}), ...health };
  await saveFeedMeta(feed).catch(() => undefined);
  return health;
}
