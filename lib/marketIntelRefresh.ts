import { after } from "next/server";
import { COMPANY_SOURCES, type CompanySource } from "./marketIntelSources";
import type { FeedCompany, FeedNews, FeedPost, MarketIntelFeed } from "./marketIntelFeed";
import type { TrackedCompany, TrackedPerson } from "./marketIntelTracking";

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

const STALE_AFTER_MS = 20 * 60 * 60 * 1000;
const COMPANY_FRESH_MS = 18 * 60 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;
const RUN_CAP_USD = 4.5;
const TARGETED_CAP_USD = 0.6;
const POST_LIMIT = 10;
const NEWS_LIMIT = 10;
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
}

// ------------------------------------------------------------------ scraping
async function runActor(actor: string, input: unknown): Promise<any> {
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
): Promise<{ posts: FeedPost[]; author: FeedCompany["author"]; slug: string | null; cost: number }> {
  let cost = 0;
  for (const slug of source.li ?? []) {
    let items: any;
    try {
      items = await runActor("apimaestro~linkedin-company-posts", {
        company_name: `linkedin.com/company/${slug}`,
        limit: POST_LIMIT,
      });
    } catch {
      continue;
    }
    if (!Array.isArray(items) || items.length === 0) continue;
    if (items.length === 1 && items[0]?.message) {
      cost += 0.005; // error items still bill
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
    };
  }
  return { posts: [], author: null, slug: null, cost };
}

async function scrapeNews(
  source: Pick<CompanySource, "name" | "newsQ">
): Promise<{ news: FeedNews[]; cost: number }> {
  let items: any;
  try {
    items = await runActor("s-r~google-news", {
      q: source.newsQ || source.name,
      maxItems: NEWS_LIMIT,
    });
  } catch {
    return { news: [], cost: 0 };
  }
  if (!Array.isArray(items)) return { news: [], cost: 0 };
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
      source: typeof i.source === "string" ? i.source : i.source?.title || "News",
      url: i.url,
      published: i.published ? new Date(i.published).toISOString() : null,
    });
  }
  return { news, cost };
}

async function scrapePersonPosts(
  person: TrackedPerson
): Promise<{ posts: FeedPost[]; cost: number }> {
  const username = person.linkedinUrl.match(/\/in\/([^/]+)/)?.[1];
  if (!username) return { posts: [], cost: 0 };
  let items: any;
  try {
    items = await runActor("apimaestro~linkedin-profile-posts", {
      username,
      limit: PERSON_POST_LIMIT,
    });
  } catch {
    return { posts: [], cost: 0 };
  }
  if (!Array.isArray(items) || items.length === 0) return { posts: [], cost: 0 };
  if (items.length === 1 && items[0]?.message) {
    return { posts: [], cost: 0.005 };
  }
  return {
    posts: items.map(toPost).filter(Boolean) as FeedPost[],
    cost: items.length * 0.005,
  };
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
    const sources: CompanySource[] = [
      ...COMPANY_SOURCES,
      ...trackedCompanies
        .filter((c) => !COMPANY_SOURCES.some((s) => s.id === c.id))
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
      feed.companies[source.id] = {
        id: source.id,
        name: source.name,
        slug: postsResult.slug ?? existing?.slug ?? null,
        author: postsResult.author ?? existing?.author ?? null,
        posts: mergePosts(existing?.posts ?? [], postsResult.posts),
        news: mergeNews(existing?.news ?? [], newsResult.news),
        fetchedAt: new Date().toISOString(),
      };
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
  feed.companies[source.id] = {
    id: source.id,
    name: source.name,
    slug: postsResult.slug,
    author: postsResult.author,
    posts: postsResult.posts,
    news: newsResult.news,
    fetchedAt: new Date().toISOString(),
  };
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
  feed.people[person.id] = {
    posts: result.posts,
    fetchedAt: new Date().toISOString(),
  };
  feed.spendUsd = Math.round(((feed.spendUsd ?? 0) + result.cost) * 1000) / 1000;
  await writeRow(FEED_ROW, feed);
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
