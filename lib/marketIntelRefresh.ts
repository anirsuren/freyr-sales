import { after } from "next/server";
import {
  COMPANY_SOURCES,
  COMPETITOR_SOURCES,
  type CompanySource,
} from "./marketIntelSources";
import {
  bustMarketIntelFeedCache,
  cleanSourceLabel,
  fallbackSignal,
  readMarketIntelFeed,
  saveFeedCompany,
  saveFeedMeta,
  saveFeedPerson,
  withinRetention,
} from "./marketIntelFeed";
import { mirrorPhoto } from "./miPhotos";
import type { FeedCompany, FeedNews, FeedPost, MarketIntelFeed } from "./marketIntelFeed";
import {
  CLASSIFY_BATCH,
  classifyItems,
  classifyMna,
  classifyUsage,
  digestCompany,
  type ClassifyInput,
} from "./marketIntelSummarize";
import { CLASSIFY_VERSION, isLabeled } from "./marketIntelSignals";
import { THOUGHT_FIRMS, mergeThoughtBoard, scrapeFirmThoughtLeadership } from "./marketIntelThought";
import { scrapeFreshNews } from "./perplexityNews";
import { resolveOfficialDomain, scrapeSiteUpdates } from "./siteUpdates";
import {
  bustMarketIntelTrackingCache,
  findTrackedByLinkedInSlug,
  miSlug,
  type TrackedCompany,
  type TrackedPerson,
} from "./marketIntelTracking";
import type { Division } from "./offeringMaterials";

/**
 * THE FEED REFRESHES ITSELF (Anir, Aug 11: "It has to do it by itself...
 * imagine all 100 people clicking it at the same time"). Nobody clicks
 * anything:
 *
 * - Any live-mode visit to Market Intel checks the feed's age; past 11 hours,
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

// Twice a day at whatever hour traffic lands (Aug 11 call: "twice a day
// works... since we have folks across the globe") — one shared refresh, never
// per-user. These two clocks now govern only the same-day news pass
// (Perplexity, its own bill); the Apify passes have their own, below.
const STALE_AFTER_MS = 11 * 60 * 60 * 1000;
const COMPANY_FRESH_MS = 10 * 60 * 60 * 1000;
/** THE APIFY CLOCK: ONCE A DAY (Anir, Sep 7, after seeing the app was 72% of
 *  the Apify bill at ~$6 a day: "let's do it once per day"). LinkedIn company
 *  posts, the wider Google News search, the M&A board and followed people
 *  are each visited in every OTHER twice-daily run: the runs are ~11.5 hours
 *  apart, so a 20-hour stamp skips the next run and lands on the one after,
 *  about 23 hours later. Same-day news still arrives twice a day through the
 *  Perplexity pass, which costs a tenth as much. */
const APIFY_FRESH_MS = 20 * 60 * 60 * 1000;
/** The website pass's own clock: a company posts to its newsroom a handful
 *  of times a month, so checking it twice a day would buy the same answer
 *  twice. Once a day keeps the column fresh at a third of the spend. */
const SITE_FRESH_MS = 22 * 60 * 60 * 1000;
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
const POST_LIMIT = 5;
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

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
async function runActor(actor: string, input: unknown): Promise<any> {
  // One retry: the actors flake intermittently (timeouts, transient 5xx), and
  // before Aug 12 a single hiccup silently cost a company its whole refresh
  // window while the UI still said "Refreshed".
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${activeApifyToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(180_000),
        }
      );
      if (!res.ok) {
        throw new Error(`${actor} HTTP ${res.status}`);
      }
      return res.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError;
}

function toPost(i: any): FeedPost | null {
  if (!i?.text || !i?.post_url && !i?.url) return null;
  return {
    url: i.post_url || i.url,
    text: String(i.text).slice(0, 2000),
    date: i.posted_at?.timestamp
      ? new Date(i.posted_at.timestamp).toISOString()
      : null,
    reactions: i.stats?.total_reactions ?? null,
    comments: i.stats?.comments ?? null,
    reposts: i.stats?.reposts ?? null,
  };
}

/** Returns billed cost alongside results so every caller keeps the ledger. */
async function scrapeCompanyPosts(
  source: CompanySource
): Promise<{ posts: FeedPost[]; author: FeedCompany["author"]; slug: string | null; cost: number; failed: boolean }> {
  let cost = 0;
  let failures = 0;
  let attempts = 0;
  for (const slug of source.li ?? []) {
    attempts += 1;
    let items: any;
    try {
      items = await runActor("apimaestro~linkedin-company-posts", {
        company_name: `linkedin.com/company/${slug}`,
        limit: POST_LIMIT,
      });
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
    cost += items.length * 0.005;
    const author = items.find((i: any) => i?.author?.name)?.author ?? null;
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

async function scrapeNews(
  source: Pick<CompanySource, "name" | "newsQ">
): Promise<{ news: FeedNews[]; cost: number; failed: boolean }> {
  let items: any;
  try {
    items = await runActor("s-r~google-news", {
      q: source.newsQ || source.name,
      maxItems: NEWS_LIMIT,
    });
  } catch (error) {
    console.error(
      `[market-intel] news scrape failed for "${source.name}": ${error instanceof Error ? error.message : error}`
    );
    return { news: [], cost: 0, failed: true };
  }
  if (!Array.isArray(items)) return { news: [], cost: 0, failed: true };
  const cost = 0.01 + items.length * 0.004;
  const seen = new Set<string>();
  const news: FeedNews[] = [];
  for (const i of items) {
    if (!i?.title || !i?.url) continue;
    const title = String(i.title).replace(/\s+-\s+[^-]+$/, "").trim();
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    news.push({
      title,
      source: cleanSourceLabel(
        typeof i.source === "string" ? i.source : i.source?.title || "News"
      ),
      url: i.url,
      published: i.published ? new Date(i.published).toISOString() : null,
    });
  }
  return { news, cost, failed: false };
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

type LabelBudget = { calls: number };

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
  type Slot = { item: FeedPost | FeedNews; input: ClassifyInput };
  const slots: Slot[] = [];
  for (const p of entry.posts) {
    if (isLabeled(p) || !inLabelWindow(p.date)) continue;
    slots.push({
      item: p,
      input: { kind: "post", title: p.text.split("\n")[0].slice(0, 200), text: p.text },
    });
  }
  for (const n of entry.news) {
    if (isLabeled(n) || !inLabelWindow(n.published)) continue;
    slots.push({
      item: n,
      input: { kind: "news", title: n.title, text: n.summary ?? "", source: n.source },
    });
  }
  for (const n of entry.site ?? []) {
    if (isLabeled(n) || !inLabelWindow(n.published)) continue;
    slots.push({
      item: n,
      input: { kind: "site", title: n.title, text: n.summary ?? "", source: n.source },
    });
  }
  let labeled = 0;
  const group = entry.group === "competitor" ? "competitor" : "customer";
  const batches: Slot[][] = [];
  for (let at = 0; at < slots.length && budget.calls > 0; at += CLASSIFY_BATCH) {
    batches.push(slots.slice(at, at + CLASSIFY_BATCH));
    budget.calls -= 1;
  }
  await mapLimit(batches, LABEL_CONCURRENCY, async (batch) => {
    const labels = await classifyItems(entry.name, group, batch.map((b) => b.input));
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
    const missing = batch.filter((slot) => !isLabeled(slot.item));
    if (missing.length > 0 && missing.length < batch.length) {
      const again = await classifyItems(entry.name, group, missing.map((b) => b.input));
      again.forEach((label, index) => {
        const slot = missing[index];
        if (slot) {
          slot.item.label = label;
          labeled += 1;
        }
      });
    }
    for (const slot of missing) {
      if (isLabeled(slot.item)) continue;
      const text = slot.input.kind === "post" ? slot.input.text : `${slot.input.title}. ${slot.input.text}`;
      slot.item.label = {
        signal: fallbackSignal(text),
        relevant: true,
        industries: [],
        tags: [],
        v: CLASSIFY_VERSION,
      };
      labeled += 1;
    }
  });
  return labeled;
}

/** A followed person's posts read the same way, under the company they
 *  belong to. */
async function labelPersonPosts(
  companyName: string,
  posts: FeedPost[],
  budget: LabelBudget
): Promise<number> {
  const pending = posts.filter((p) => !isLabeled(p) && inLabelWindow(p.date));
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
): Promise<{ posts: FeedPost[]; cost: number; headline: string | null; failed: boolean }> {
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
    headline,
    failed: false,
  };
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
  const tracking = await readRow(TRACKING_ROW);
  if (!tracking || !Array.isArray(tracking.people)) return;
  const person = tracking.people.find((p: TrackedPerson) => p.id === personId);
  if (!person) return;
  Object.assign(person, clean);
  await writeRow(TRACKING_ROW, tracking);
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
    const prior = byUrl.get(p.url);
    if (!prior) byUrl.set(p.url, p);
    else byUrl.set(p.url, { ...p, ...prior, reactions: p.reactions ?? prior.reactions, comments: p.comments ?? prior.comments, reposts: p.reposts ?? prior.reposts });
  }
  return [...byUrl.values()].sort(
    (a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0)
  );
}

function mergeNews(existing: FeedNews[], incoming: FeedNews[]): FeedNews[] {
  const seen = new Set<string>();
  const out: FeedNews[] = [];
  for (const n of [...existing, ...incoming]) {
    if (!withinRetention(n.published)) continue;
    const key = n.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort(
    (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
  );
}

function trackedToSource(company: TrackedCompany): CompanySource {
  const slug = company.linkedinUrl.match(/\/company\/([^/]+)/)?.[1];
  const expectToken =
    company.name.toLowerCase().split(/\s+/).find((w) => w.length > 3) ?? "";
  return {
    id: company.id,
    name: company.name,
    li: slug ? [slug] : null,
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

// ------------------------------------------------------------------ the lock
async function claimLock(): Promise<string | null> {
  const token = Math.random().toString(36).slice(2);
  const now = Date.now();
  const existing = await readRow(LOCK_ROW);
  if (existing?.until && existing.until > now) return null;
  await writeRow(LOCK_ROW, { token, until: now + LOCK_MS });
  // Settle the race: whoever's token survived the last write owns the run.
  const confirmed = await readRow(LOCK_ROW);
  return confirmed?.token === token ? token : null;
}

async function releaseLock(token: string): Promise<void> {
  const current = await readRow(LOCK_ROW);
  if (current?.token === token) await writeRow(LOCK_ROW, { token, until: 0 });
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
  const config = await readRow(CONFIG_ROW).catch(() => null);
  activeApifyToken = config?.apifyToken || process.env.APIFY_API_TOKEN;
  activePerplexityKey =
    config?.perplexityKey || process.env.PERPLEXITY_API_KEY;
  if (!activeApifyToken) {
    return { ran: false, reason: "no APIFY token in config row or env" };
  }
  const feed: any = await loadFeedForWrite();

  if (
    !options?.force &&
    !options?.onlyCompanyIds &&
    feed.updatedAt &&
    Date.now() - Date.parse(feed.updatedAt) < STALE_AFTER_MS
  ) {
    return { ran: false, reason: "fresh" };
  }

  const token = await claimLock();
  if (!token) return { ran: false, reason: "another refresh is running" };

  // Two ledgers on purpose: `spent` is Apify dollars and is what RUN_CAP_USD
  // meters (the $200/month plan); `spentFresh` is Perplexity's separate bill
  // and must never eat the Apify rotation's budget.
  let spent = 0;
  let spentFresh = 0;
  let refreshed = 0;
  let skippedFresh = 0;
  let peopleRefreshed = 0;
  const budget: LabelBudget = { calls: LABEL_CALLS_PER_RUN };
  try {
    const tracking = (await readRow(TRACKING_ROW)) ?? { companies: [], people: [] };
    const trackedCompanies: TrackedCompany[] = Array.isArray(tracking.companies)
      ? tracking.companies
      : [];
    const trackedPeople: TrackedPerson[] = Array.isArray(tracking.people)
      ? tracking.people
      : [];

    // Least-recently-synced first: when the dollar cap cuts a run short, the
    // tail that missed out goes to the FRONT of tomorrow's run instead of
    // being the same starved tail forever.
    const lastSync = (id: string, map: Record<string, { fetchedAt?: string }>) =>
      Date.parse(map[id]?.fetchedAt ?? "") || 0;
    const competitorIds = new Set(COMPETITOR_SOURCES.map((s) => s.id));
    for (const c of trackedCompanies) {
      if (c.group === "competitor") competitorIds.add(c.id);
    }
    const sources: CompanySource[] = [
      ...COMPANY_SOURCES,
      ...COMPETITOR_SOURCES,
      ...trackedCompanies
        .filter(
          (c) =>
            !COMPANY_SOURCES.some((s) => s.id === c.id) &&
            !COMPETITOR_SOURCES.some((s) => s.id === c.id)
        )
        .map(trackedToSource),
    ]
      .filter(
        (s) => !options?.onlyCompanyIds || options.onlyCompanyIds.includes(s.id)
      )
      .sort((a, b) => lastSync(a.id, feed.companies) - lastSync(b.id, feed.companies));

    // ---- Pass 1: same-day news for EVERYONE, before any Apify money moves.
    // The dollar-capped rotation below cannot visit ~75 companies twice a
    // day; this pass can, at ~$0.006 a company (Perplexity, its own billing),
    // so "nothing from the past day" stops being a budget artifact. Failures
    // cost nothing but that company's freshness until the next tick.
    if (activePerplexityKey) {
      for (const source of sources) {
        const existing: FeedCompany | undefined = feed.companies[source.id];
        const newsAt = existing?.newsAt ?? existing?.fetchedAt;
        if (
          !options?.force &&
          newsAt &&
          Date.now() - Date.parse(newsAt) < COMPANY_FRESH_MS
        ) {
          continue;
        }
        const fresh = await scrapeFreshNews(source, activePerplexityKey);
        spentFresh += fresh.cost;
        if (fresh.failed) continue;
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
        entry.newsAt = new Date().toISOString();
        feed.companies[source.id] = entry;
        feed.updatedAt = new Date().toISOString();
        feed.spendUsd =
          Math.round(((feed.spendUsd ?? 0) + fresh.cost) * 1000) / 1000;
        // One row per company: a crash keeps everything already learned.
        await saveFeedCompany(feed, source.id);
      }
    }

    // ---- Pass 1b: THE COMPANY'S OWN WEBSITE. A newsroom moves in weeks,
    // not hours, so this runs on its own daily clock rather than the news
    // pass's twice-daily one — same ~$0.006 a company, a third of the
    // frequency. A company with no domain on file costs nothing and simply
    // has no website column.
    if (activePerplexityKey) {
      for (const source of sources) {
        if (!source.site) continue;
        const existing: FeedCompany | undefined = feed.companies[source.id];
        const siteAt = existing?.siteAt;
        if (
          !options?.force &&
          siteAt &&
          Date.now() - Date.parse(siteAt) < SITE_FRESH_MS
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
          entry.site = mergeNews(entry.site ?? [], result.updates);
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

    // THE M&A BOARD GOES FIRST WHEN STALE (Anir, Aug 17: "is this thing even
    // working?" — it was 101 hours behind while companies were 3 hours
    // fresh). The company queue drained the run's budget every time, so the
    // ~$0.15 M&A pull never got a turn. Same twice-daily rhythm, same cap —
    // just no longer last in line.
    // Both caps, checked before every Apify call from here down. `force`
    // skips the freshness stamps, never the money.
    const overBudget = () =>
      spent > RUN_CAP_USD || apifySpentToday(feed) >= DAY_CAP_USD;
    if (
      (options?.force ||
        !feed.mna?.fetchedAt ||
        Date.now() - Date.parse(feed.mna.fetchedAt) > APIFY_FRESH_MS) &&
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
        Date.now() - Date.parse(feed.thought.fetchedAt) > APIFY_FRESH_MS)
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
        Date.now() - Date.parse(existing.fetchedAt) < APIFY_FRESH_MS
      ) {
        skippedFresh += 1;
        continue;
      }
      const postsResult = await scrapeCompanyPosts(source);
      spent += postsResult.cost;
      const newsResult = await scrapeNews(source);
      spent += newsResult.cost;
      chargeApify(feed, postsResult.cost + newsResult.cost);
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
        fetchedAt: new Date().toISOString(),
        newsAt: existing?.newsAt,
        /* THE WEBSITE COLUMN SURVIVES THIS PASS. This rotation rebuilds the
           entry from scratch rather than mutating it, so anything it does
           not name is dropped — which silently erased the site updates
           collected minutes earlier by Pass 1b (caught by hand: gsk.com
           returned four press releases to a direct probe while the stored
           entry had none). Carried forward exactly like newsAt. */
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
        Date.now() - Date.parse(existing.fetchedAt) < APIFY_FRESH_MS
      ) {
        continue;
      }
      const result = await scrapePersonPosts(person);
      spent += result.cost;
      chargeApify(feed, result.cost);
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
  const feed: any = await loadFeedForWrite();
  const source = trackedToSource(company);
  const postsResult = await scrapeCompanyPosts(source);
  const newsResult = await scrapeNews(source);
  // The first briefing should include today's stories, same as the standing
  // watch gets on every run.
  const freshResult = await scrapeFreshNews(source, activePerplexityKey);
  // Their own website, on the first briefing rather than a day later.
  const siteResult = await scrapeSiteUpdates(source, activePerplexityKey);
  if (postsResult.cost + newsResult.cost > TARGETED_CAP_USD) {
    // Cannot exceed by design (10 posts + 10 articles is at most ~$0.10),
    // but the guard stays in case limits change.
  }
  const entry: FeedCompany = {
    id: source.id,
    name: source.name,
    slug: postsResult.slug,
    author: postsResult.author,
    posts: postsResult.posts,
    news: mergeNews(newsResult.news, freshResult.news),
    site: siteResult.updates,
    tldr: null,
    fetchedAt: new Date().toISOString(),
    newsAt: new Date().toISOString(),
    siteAt: new Date().toISOString(),
    group: company.group === "competitor" ? "competitor" : "customer",
  };
  await applyLabels(entry, { calls: 8 });
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

/** New person just followed: pull their recent posts right now. */
export async function refreshTrackedPersonNow(person: TrackedPerson): Promise<void> {
  if (!hasEnv() || !person.linkedinUrl) return;
  const feed: any = await loadFeedForWrite();
  const result = await scrapePersonPosts(person);
  if (result.headline && result.headline !== person.headline) {
    await updateTrackedPersonProfile(person.id, {
      headline: result.headline,
    }).catch(() => undefined);
  }
  feed.people[person.id] = {
    posts: result.posts,
    fetchedAt: new Date().toISOString(),
  };
  chargeApify(feed, result.cost);
  await saveFeedPerson(feed, person.id);
}

// ---------------------------------------------------------- add by link
// "It just asks me for the link, and you pull everything else" (Anir,
// Aug 11). The link is the input; name, logo, title, photo and the first
// data pull all come from the page itself.

export type AddCompanyMeta = {
  addedBy?: TrackedCompany["addedBy"];
  divisions?: Division[];
  /** False when this person has used up their allowance of NEW companies.
   *  Following one already on the watch is always allowed. */
  canCreate?: boolean;
};

export type AddCompanyResult = {
  id: string;
  name: string;
  group: "customer" | "competitor";
  /** True when the company was already on the watch: nothing was scraped,
   *  the person simply follows it now. */
  existing: boolean;
  company?: TrackedCompany;
};

export const TRACK_LIMIT_MESSAGE =
  "You've added the most companies one person can. You can still follow any company already on the list.";

export async function addCompanyByLink(
  linkedinUrl: string,
  group: "customer" | "competitor" = "customer",
  meta: AddCompanyMeta = {}
): Promise<AddCompanyResult> {
  if (!hasEnv()) throw new Error("Tracking needs the configured services.");
  const slug = linkedinUrl.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1];
  if (!slug) {
    throw new Error(
      "That doesn't look like a LinkedIn company page. It should look like linkedin.com/company/their-name"
    );
  }
  const tracking = (await readRow(TRACKING_ROW)) ?? { companies: [], people: [] };
  tracking.companies = Array.isArray(tracking.companies) ? tracking.companies : [];
  tracking.people = Array.isArray(tracking.people) ? tracking.people : [];
  const feed: any = await loadFeedForWrite();

  /* KNOWN BEFORE PAID (Anir, Sep 10: "if someone chooses that same company
     it won't scrape twice. It'll just show the one thing to two people").
     The slug is matched against the built-in list and the tracked list
     before any scrape: a company already on the watch is simply followed,
     and nothing is read from LinkedIn again. */
  const wanted = slug.toLowerCase();
  const builtIn = [...COMPANY_SOURCES, ...COMPETITOR_SOURCES].find((s) =>
    (s.li ?? []).some((l) => l.toLowerCase() === wanted)
  );
  const tracked = findTrackedByLinkedInSlug(tracking, slug);
  const known = builtIn
    ? { id: builtIn.id, name: builtIn.name }
    : tracked
      ? { id: tracked.id, name: tracked.name }
      : null;
  if (known) {
    const stored: FeedCompany | undefined = feed.companies[known.id];
    return {
      id: known.id,
      name: known.name,
      group:
        stored?.group === "competitor" || tracked?.group === "competitor"
          ? "competitor"
          : COMPETITOR_SOURCES.some((c) => c.id === known.id)
            ? "competitor"
            : "customer",
      existing: true,
      company: tracked,
    };
  }

  /* THE ALLOWANCE IS CHECKED BEFORE ANY MONEY MOVES: an unknown page from a
     person who has used up their new-company allowance is refused here,
     not after a paid probe. */
  if (meta.canCreate === false) throw new Error(TRACK_LIMIT_MESSAGE);
  const probe = await scrapeCompanyPosts({
    id: slug,
    name: slug,
    li: [slug],
    expect: "",
  });
  const name = probe.author?.name?.trim();
  if (!name) {
    throw new Error(
      "Couldn't read that LinkedIn page. Check the link, or try again in a minute."
    );
  }
  const id = miSlug(name);
  chargeApify(feed, probe.cost);
  const already =
    feed.companies[id] || tracking.companies.find((c: TrackedCompany) => c.id === id);
  if (already) {
    /* A different slug for a page already on the watch: the probe was the
       only cost, and the answer is the same as a known slug. */
    await saveFeedMeta(feed);
    const storedGroup = feed.companies[id]?.group ?? already?.group;
    return {
      id,
      name: feed.companies[id]?.name ?? already.name ?? name,
      group: storedGroup === "competitor" ? "competitor" : "customer",
      existing: true,
      company: tracking.companies.find((c: TrackedCompany) => c.id === id),
    };
  }
  const divisions = (meta.divisions ?? []).filter((d) => ["MPR", "MDV", "CON"].includes(d));
  if (divisions.length === 0) {
    await saveFeedMeta(feed);
    throw new Error("Pick at least one division (MPR, MDV or CON) for a company that isn't on the list yet.");
  }
  const company: TrackedCompany = {
    id,
    name,
    group,
    industry: "",
    hq: "",
    website: "",
    linkedinUrl: `https://www.linkedin.com/company/${slug}`,
    competitors: [],
    keywords: [],
    note: "",
    addedAt: new Date().toISOString(),
    divisions,
    ...(meta.addedBy ? { addedBy: meta.addedBy } : {}),
  };
  tracking.companies.push(company);
  tracking.divisions = { ...(tracking.divisions ?? {}), [id]: divisions };
  await writeRow(TRACKING_ROW, tracking);

  const newsResult = await scrapeNews({ name });
  const freshResult = await scrapeFreshNews({ name }, activePerplexityKey);
  /* THE FORM ASKS FOR ONE LINK, so the domain has to be found rather than
     typed (Anir, Aug 28: "if someone enters a new company it has to work
     too"). Resolved once here and written onto the tracked company, so
     every later refresh reads it straight off the record. */
  const resolved = await resolveOfficialDomain(name, activePerplexityKey);
  if (resolved.domain) {
    company.website = `https://${resolved.domain}`;
    const stored = tracking.companies.find((c: TrackedCompany) => c.id === id);
    if (stored) stored.website = company.website;
    await writeRow(TRACKING_ROW, tracking);
  }
  const siteResult = await scrapeSiteUpdates(
    { name, site: resolved.domain ?? undefined },
    activePerplexityKey
  );
  const entry: FeedCompany = {
    id,
    name,
    slug: probe.slug,
    author: probe.author,
    posts: probe.posts,
    news: mergeNews(newsResult.news, freshResult.news),
    site: siteResult.updates,
    tldr: null,
    group,
    fetchedAt: new Date().toISOString(),
    newsAt: new Date().toISOString(),
    siteAt: new Date().toISOString(),
  };
  await applyLabels(entry, { calls: 8 });
  await applyDigest(entry);
  feed.companies[id] = entry;
  feed.updatedAt = feed.updatedAt ?? new Date().toISOString();
  chargeApify(feed, newsResult.cost);
  feed.spendUsd =
    Math.round(
      ((feed.spendUsd ?? 0) + freshResult.cost + resolved.cost + siteResult.cost) *
        1000
    ) / 1000;
  await saveFeedCompany(feed, id);
  return { id, name, group, existing: false, company };
}

export async function addPersonByLink(
  companyId: string,
  linkedinUrl: string
): Promise<TrackedPerson> {
  if (!hasEnv()) throw new Error("Tracking needs the configured services.");
  const username = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
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
export function maybeScheduleMarketIntelRefresh(
  feed: { updatedAt: string | null } | null
): void {
  const stale =
    !feed?.updatedAt || Date.now() - Date.parse(feed.updatedAt) > STALE_AFTER_MS;
  if (!stale) return;
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

/** A newsroom moves in weeks, so twice in one day buys the same answer twice.
 *  Twelve hours is what lets a twice-daily schedule actually land on a company
 *  scanned in the previous window rather than skip it as fresh. */
const SITE_RUN_FRESH_MS = 12 * 60 * 60 * 1000;
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
  if (!key) return nothing("no PERPLEXITY key in config row or env");

  const feed: any = await readMarketIntelFeed({ fresh: true }).catch(() => null);
  if (!feed || !feed.companies) return nothing("no feed row yet");

  const tracking = (await readRow(TRACKING_ROW).catch(() => null)) ?? {};
  const tracked: TrackedCompany[] = Array.isArray(tracking.companies)
    ? tracking.companies
    : [];

  /* Every company on the watch that has a domain to read. One with no domain
     costs nothing and simply has no website column — that is a data gap, not a
     failure, and it is visible as such. */
  const sources: CompanySource[] = [
    ...COMPANY_SOURCES,
    ...COMPETITOR_SOURCES,
    ...tracked
      .filter(
        (c) =>
          !COMPANY_SOURCES.some((s) => s.id === c.id) &&
          !COMPETITOR_SOURCES.some((s) => s.id === c.id)
      )
      .map(trackedToSource),
  ]
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
      Date.now() - Date.parse(existing.siteAt) < SITE_RUN_FRESH_MS
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
      group: COMPETITOR_SOURCES.some((c) => c.id === source.id)
        ? "competitor"
        : "customer",
      fetchedAt: new Date(0).toISOString(),
    };
    if (result.failed) failed += 1;
    if (result.updates.length > 0) {
      entry.site = mergeNews(entry.site ?? [], result.updates);
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
  const tracking = (await readRow(TRACKING_ROW).catch(() => null)) ?? {};
  const trackedCompanies: TrackedCompany[] = Array.isArray(tracking.companies)
    ? tracking.companies
    : [];
  const trackedPeople: TrackedPerson[] = Array.isArray(tracking.people) ? tracking.people : [];
  const competitorIds = new Set(COMPETITOR_SOURCES.map((s) => s.id));
  for (const c of trackedCompanies) if (c.group === "competitor") competitorIds.add(c.id);

  const budget: LabelBudget = { calls: Math.max(1, Math.min(400, options?.maxCalls ?? 60)) };
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

  let remaining = 0;
  for (const entry of companiesList) {
    for (const p of entry.posts) if (!isLabeled(p) && inLabelWindow(p.date)) remaining += 1;
    for (const n of entry.news) if (!isLabeled(n) && inLabelWindow(n.published)) remaining += 1;
    for (const n of entry.site ?? []) if (!isLabeled(n) && inLabelWindow(n.published)) remaining += 1;
  }
  for (const person of trackedPeople) {
    if (competitorIds.has(person.companyId)) continue;
    for (const p of feed.people?.[person.id]?.posts ?? [])
      if (!isLabeled(p) && inLabelWindow(p.date)) remaining += 1;
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
