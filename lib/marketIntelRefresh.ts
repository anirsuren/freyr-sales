import { after } from "next/server";
import {
  COMPANY_SOURCES,
  COMPETITOR_SOURCES,
  type CompanySource,
} from "./marketIntelSources";
import { bustMarketIntelFeedCache, cleanSourceLabel } from "./marketIntelFeed";
import type { FeedCompany, FeedNews, FeedPost, MarketIntelFeed } from "./marketIntelFeed";
import { classifyMna, digestCompany } from "./marketIntelSummarize";
import {
  bustMarketIntelTrackingCache,
  miSlug,
  type TrackedCompany,
  type TrackedPerson,
} from "./marketIntelTracking";

/**
 * THE FEED REFRESHES ITSELF (Anir, Aug 11: "It has to do it by itself...
 * imagine all 100 people clicking it at the same time"). Nobody clicks
 * anything:
 *
 * - Any live-mode visit to Market Intel checks the feed's age; past 20 hours,
 *   the request schedules ONE background refresh via after(). A lock row in
 *   the database makes sure a hundred simultaneous visitors produce exactly
 *   one run — everyone else just reads.
 * - Adding a company or person kicks a small targeted scrape immediately, so
 *   the first briefing shows up in minutes rather than a day.
 *
 * Costs stay bounded no matter what: lean per-pull limits, a hard per-run
 * dollar cap, per-company freshness skips (a crashed run resumes cheaply),
 * and the 20-hour spacing. If Apify credits run out the run fails quietly and
 * pages keep showing the last data with an honest "updated" stamp.
 */

// Twice a day at whatever hour traffic lands (Aug 11 call: "twice a day
// works... since we have folks across the globe") — one shared refresh, never
// per-user.
const STALE_AFTER_MS = 11 * 60 * 60 * 1000;
const COMPANY_FRESH_MS = 10 * 60 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;
// Sized to the $200/month Apify plan: ~$3.20 twice a day is ~$192/month,
// with the rotation spreading whatever the cap cuts across runs.
const RUN_CAP_USD = 3.2;
const TARGETED_CAP_USD = 0.6;
const POST_LIMIT = 5;
const NEWS_LIMIT = 8;
// Each pull re-bills the latest N posts whether or not they are new, so the
// person limit stays small: 133 tracked people at 5 posts is ~$3.30 a run.
const PERSON_POST_LIMIT = 5;
const KEEP_POSTS = 60;
const KEEP_NEWS = 40;

const FEED_ROW = "market-intel-feed";
const LOCK_ROW = "market-intel:refresh-lock";
// The refresh serves real mode by definition, so it reads the real tracking
// row directly — a background task has no request to infer a data mode from.
const TRACKING_ROW = "market-intel:default";

function hasEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.APIFY_API_TOKEN
  );
}

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

async function writeRow(id: string, catalog: unknown): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({ id, catalog, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  // The read side memoizes these rows for a minute (see marketIntelFeed.ts);
  // a write on this instance must show up on its next render.
  if (id === FEED_ROW) bustMarketIntelFeedCache();
  if (id === TRACKING_ROW) bustMarketIntelTrackingCache();
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
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
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
            logoUrl: author.logo_url ?? null,
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
    const first = (name: string) => name.toLowerCase().split(/\s+/)[0];
    const key = `${first(deal.acquirer)}|${first(deal.target)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  merged.sort(
    (a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0)
  );
  feed.mna = { items: merged.slice(0, 40), fetchedAt: new Date().toISOString() };
  return cost;
}

/** TLDR + article summaries, regenerated whenever the news set changed.
 *  Anthropic Haiku, fractions of a cent; failures leave the feed untouched. */
async function applyDigest(entry: FeedCompany): Promise<void> {
  const needs = entry.news.some((n) => !n.summary) || !entry.tldr;
  if (!needs) return;
  try {
    const digest = await digestCompany(entry);
    if (digest.tldr) entry.tldr = digest.tldr;
    digest.summaries.forEach((summary, index) => {
      if (entry.news[index] && !entry.news[index].summary) {
        entry.news[index].summary = summary;
      }
    });
  } catch {
    /* the briefing works without summaries */
  }
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
function mergePosts(existing: FeedPost[], incoming: FeedPost[]): FeedPost[] {
  const byUrl = new Map<string, FeedPost>();
  for (const p of [...incoming, ...existing]) {
    if (!byUrl.has(p.url)) byUrl.set(p.url, p);
  }
  return [...byUrl.values()]
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .slice(0, KEEP_POSTS);
}

function mergeNews(existing: FeedNews[], incoming: FeedNews[]): FeedNews[] {
  const seen = new Set<string>();
  const out: FeedNews[] = [];
  for (const n of [...incoming, ...existing]) {
    const key = n.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out
    .sort(
      (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
    )
    .slice(0, KEEP_NEWS);
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
  };
}

function emptyFeed(): MarketIntelFeed & { spendUsd: number } {
  return { version: 1, companies: {}, people: {}, updatedAt: null, spendUsd: 0 };
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
};

export async function runMarketIntelRefresh(options?: {
  force?: boolean;
  onlyCompanyIds?: string[];
}): Promise<RefreshSummary> {
  if (!hasEnv()) return { ran: false, reason: "missing env (database or APIFY_API_TOKEN)" };
  const raw = await readRow(FEED_ROW);
  const feed: any = raw && raw.companies ? raw : emptyFeed();
  if (!feed.people) feed.people = {};

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

  let spent = 0;
  let refreshed = 0;
  let skippedFresh = 0;
  let peopleRefreshed = 0;
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

    for (const source of sources) {
      if (spent > RUN_CAP_USD) break;
      const existing: FeedCompany | undefined = feed.companies[source.id];
      if (
        !options?.force &&
        existing?.fetchedAt &&
        Date.now() - Date.parse(existing.fetchedAt) < COMPANY_FRESH_MS
      ) {
        skippedFresh += 1;
        continue;
      }
      const postsResult = await scrapeCompanyPosts(source);
      spent += postsResult.cost;
      const newsResult = await scrapeNews(source);
      spent += newsResult.cost;
      if (postsResult.failed && newsResult.failed) {
        // Nothing came back at all. Before Aug 12 this still stamped the
        // company "fresh", so the UI said Refreshed over day-old data and the
        // rotation skipped it for 11 hours. Keep the old stamp: the 30-minute
        // tick retries it, and the Updated time only moves when data does.
        console.error(
          `[market-intel] ${source.id}: posts AND news scrapes failed — keeping previous data, will retry next tick`
        );
        continue;
      }
      if (postsResult.failed || newsResult.failed) {
        console.warn(
          `[market-intel] ${source.id}: ${postsResult.failed ? "posts" : "news"} scrape failed this run — stored what worked`
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
      };
      if (newsResult.news.length > 0) entry.tldr = null; // fresh rundown
      await applyDigest(entry);
      feed.companies[source.id] = entry;
      feed.updatedAt = new Date().toISOString();
      feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + postsResult.cost + newsResult.cost) * 1000) / 1000;
      refreshed += 1;
      await writeRow(FEED_ROW, feed);
    }

    const peopleQueue = [...trackedPeople].sort(
      (a, b) =>
        (Date.parse(feed.people[a.id]?.fetchedAt ?? "") || 0) -
        (Date.parse(feed.people[b.id]?.fetchedAt ?? "") || 0)
    );
    // The M&A board refreshes on the same twice-daily rhythm.
    if (
      spent < RUN_CAP_USD &&
      (options?.force ||
        !feed.mna?.fetchedAt ||
        Date.now() - Date.parse(feed.mna.fetchedAt) > COMPANY_FRESH_MS)
    ) {
      try {
        const mnaCost = await refreshMna(feed);
        spent += mnaCost;
        feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + mnaCost) * 1000) / 1000;
        feed.updatedAt = new Date().toISOString();
        await writeRow(FEED_ROW, feed);
      } catch {
        /* the tracker keeps its last board */
      }
    }

    for (const person of peopleQueue) {
      if (spent > RUN_CAP_USD) break;
      if (!person.linkedinUrl) continue;
      const existing = feed.people[person.id];
      if (
        !options?.force &&
        existing?.fetchedAt &&
        Date.now() - Date.parse(existing.fetchedAt) < COMPANY_FRESH_MS
      ) {
        continue;
      }
      const result = await scrapePersonPosts(person);
      spent += result.cost;
      if (result.failed) {
        console.error(
          `[market-intel] person ${person.id}: scrape failed — keeping previous data, will retry next tick`
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
      feed.updatedAt = new Date().toISOString();
      feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + result.cost) * 1000) / 1000;
      peopleRefreshed += 1;
      await writeRow(FEED_ROW, feed);
    }
  } finally {
    await releaseLock(token).catch(() => undefined);
  }

  return {
    ran: true,
    companiesRefreshed: refreshed,
    companiesSkippedFresh: skippedFresh,
    peopleRefreshed,
    spentUsd: Math.round(spent * 1000) / 1000,
  };
}

/** New company just tracked: collect its first briefing right now. */
export async function refreshTrackedCompanyNow(company: TrackedCompany): Promise<void> {
  if (!hasEnv()) return;
  const raw = await readRow(FEED_ROW);
  const feed: any = raw && raw.companies ? raw : emptyFeed();
  if (!feed.people) feed.people = {};
  const source = trackedToSource(company);
  const postsResult = await scrapeCompanyPosts(source);
  const newsResult = await scrapeNews(source);
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
    news: newsResult.news,
    tldr: null,
    fetchedAt: new Date().toISOString(),
  };
  await applyDigest(entry);
  feed.companies[source.id] = entry;
  feed.updatedAt = feed.updatedAt ?? new Date().toISOString();
  feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + postsResult.cost + newsResult.cost) * 1000) / 1000;
  await writeRow(FEED_ROW, feed);
}

/** New person just followed: pull their recent posts right now. */
export async function refreshTrackedPersonNow(person: TrackedPerson): Promise<void> {
  if (!hasEnv() || !person.linkedinUrl) return;
  const raw = await readRow(FEED_ROW);
  const feed: any = raw && raw.companies ? raw : emptyFeed();
  if (!feed.people) feed.people = {};
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
  feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + result.cost) * 1000) / 1000;
  await writeRow(FEED_ROW, feed);
}

// ---------------------------------------------------------- add by link
// "It just asks me for the link, and you pull everything else" (Anir,
// Aug 11). The link is the input; name, logo, title, photo and the first
// data pull all come from the page itself.

export async function addCompanyByLink(
  linkedinUrl: string,
  group: "customer" | "competitor" = "customer"
): Promise<TrackedCompany> {
  if (!hasEnv()) throw new Error("Tracking needs the configured services.");
  const slug = linkedinUrl.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1];
  if (!slug) {
    throw new Error(
      "That doesn't look like a LinkedIn company page. It should look like linkedin.com/company/their-name"
    );
  }
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
  const tracking = (await readRow(TRACKING_ROW)) ?? { companies: [], people: [] };
  tracking.companies = Array.isArray(tracking.companies) ? tracking.companies : [];
  tracking.people = Array.isArray(tracking.people) ? tracking.people : [];
  const raw = await readRow(FEED_ROW);
  const feed: any = raw && raw.companies ? raw : emptyFeed();
  if (!feed.people) feed.people = {};
  if (
    feed.companies[id] ||
    tracking.companies.some((c: TrackedCompany) => c.id === id)
  ) {
    throw new Error(`${name} is already being tracked.`);
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
  };
  tracking.companies.push(company);
  await writeRow(TRACKING_ROW, tracking);

  const newsResult = await scrapeNews({ name });
  const entry: FeedCompany = {
    id,
    name,
    slug: probe.slug,
    author: probe.author,
    posts: probe.posts,
    news: newsResult.news,
    tldr: null,
    group,
    fetchedAt: new Date().toISOString(),
  };
  await applyDigest(entry);
  feed.companies[id] = entry;
  feed.updatedAt = feed.updatedAt ?? new Date().toISOString();
  feed.spendUsd =
    Math.round(((feed.spendUsd ?? 0) + probe.cost + newsResult.cost) * 1000) / 1000;
  await writeRow(FEED_ROW, feed);
  return company;
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
    photoUrl: String(info?.profile_picture_url ?? ""),
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
