import { marketIntelDatabaseConfig } from "./marketIntelDatabase";
import { usableRundown } from "./marketIntelRundown";
import { clipText, titleFromUrl } from "./marketIntelText";
import { MI_COMPANIES, MI_WATCHLIST, SIGNAL_META } from "./marketIntelMock";
import {
  fallbackSignals,
  isLabeled,
  labelSignals,
  signalWhy,
  type ItemLabel,
  type SignalGroup,
  type SignalId,
} from "./marketIntelSignals";

/**
 * THE REAL FEED (Anir, Aug 11: "Everything should be real... at least on real
 * mode which is what matters"). scripts/market-intel-ingest.mjs scrapes real
 * LinkedIn company posts and real Google News into the shared
 * `offering_catalog_state` row "market-intel-feed"; this module reads that row
 * and derives everything the pages show — weekly activity, momentum, signals,
 * competitor mentions — from the scraped items only. Signals are keyword
 * classifications of real posts/articles, each one citing its source; the
 * per-kind "why it matters" line is fixed editorial text, never a claim about
 * the company. Mock mode keeps the sample briefings; this file is live mode.
 */

export type FeedPost = {
  mediaType?: string;
  url: string;
  text: string;
  date: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  /** What the classifier read off this post: its signal, whether it is about
   *  Freyr's industries, and any content tag. Absent until a run labels it. */
  label?: ItemLabel;
};

export type FeedNews = {
  /** Extracted source evidence for identity validation, not an AI summary. */
  excerpt?: string;
  /** Publisher body read by the collector, retained separately from search snippets. */
  articleText?: string;
  /** Visible excerpt only, or a reader length limit was reached. */
  articleTextPartial?: boolean;
  articleReadAt?: string;
  publisherUrl?: string;
  /** Other URLs for the same publisher article, including language editions. */
  alternateUrls?: string[];
  title: string;
  source: string;
  url: string;
  published: string | null;
  /** AI summary of the fetched article text; absent when the article could
   *  not be read (headline stands alone rather than faking a summary). */
  summary?: string;
  /** See FeedPost.label. */
  label?: ItemLabel;
};

/**
 * NOTHING IS CAPPED BY COUNT (Anir, Sep 10: "if there are 1,000 items, there
 * should be 1,000 items"). Items are kept for as long as the pages can show
 * them, the "past 3 months" window plus slack, and then let go by AGE. A
 * company that posts fifty times a day keeps fifty posts a day. What made a
 * count cap necessary before was one document holding every company; since
 * Sep 10 each company is its own row (see the store below), so a busy
 * company costs only its own row.
 */
export const RETAIN_DAYS = 120;

export function withinRetention(date: string | null | undefined): boolean {
  if (!date) return true;
  const t = Date.parse(date);
  return !Number.isFinite(t) || Date.now() - t < RETAIN_DAYS * 86_400_000;
}

export { cleanSourceLabel } from "./marketIntelText";

export type FeedCompany = {
  /** Source failures are independent; successful source data stays usable. */
  collectionWarnings?: string[];
  /** Admin-hidden source URLs. Refreshes may rediscover them, but they stay
   * out of the feed until an admin explicitly restores them. */
  removedItemUrls?: string[];
  logoUrl?: string | null;
  logoCheckedAt?: string;
  id: string;
  name: string;
  slug: string | null;
  author: {
    name: string;
    followerCount: number | null;
    /** The company's LinkedIn page logo — the preferred logo everywhere. */
    logoUrl?: string | null;
  } | null;
  posts: FeedPost[];
  news: FeedNews[];
  /** Search candidates awaiting an explicit company-news decision; never shown as verified news. */
  pendingNews?: FeedNews[];
  /** The AI rundown shown at the top of the briefing; refreshed with the feed. */
  tldr?: string | null;
  /** "customer" (default) or "competitor" — which intelligence tab owns it. */
  group?: "customer" | "competitor";
  fetchedAt: string;
  /** When this cycle's LinkedIn posts pull failed while news still came back.
   *  The rotation tries such a company once per daily cycle, not every tick. */
  postsFailedAt?: string;
  /** Last time the cheap same-day news pass visited (Perplexity). Kept apart
   *  from `fetchedAt`, which still means "full Apify sync" and drives that
   *  rotation's ordering. */
  newsAt?: string;
  /**
   * What the company published on ITS OWN website (Anir, Aug 28: "can you
   * add updates from their respective official websites as well?"). Same
   * shape as news because a press release is a story with a title, a link
   * and a date — but kept in its own field so the card can say plainly that
   * this came from the company itself rather than from a reporter.
   */
  site?: FeedNews[];
  /** Last time the website pass visited. Its own clock: a newsroom moves in
   *  weeks, so it is checked far less often than the news wire. */
  siteAt?: string;
};

/** One merger or acquisition on the tracker (Aug 11 call): who bought whom,
 *  where it stands, and which Freyr division it touches. */
export type MnaItem = {
  acquirer: string;
  target: string;
  status: "announced" | "completed";
  division: "Medicinal Products" | "Medical Devices" | "Consumer";
  valueLabel: string | null;
  date: string | null;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type MnaBoard = {
  items: MnaItem[];
  /** Every deal found, before the list was capped, so the screen can say what
   *  it is not showing rather than presenting the cap as a count. */
  total?: number;
  fetchedAt: string;
};

export type PersonFeed = { posts: FeedPost[]; fetchedAt: string; removedItemUrls?: string[] };

/** What the list page needs about a followed person: how many posts are
 *  collected, without loading them. Written beside the person's row. */
export type PersonSummary = {
  posts: number;
  fetchedAt: string;
  /** Each kept post's date in epoch minutes (null when undated), so a card
   *  counts the same 3 months the company page lists. Older rows lack it. */
  postMinutes?: (number | null)[];
};

/**
 * THE THOUGHT-LEADERSHIP TRACKER (Anant via Saras, Sep 10): reports, studies
 * and outlooks the big consulting and analyst firms publish about pharma,
 * devices, consumer health and regulation. Not competitors, industry
 * readers; the point is to know what is being said about the industry.
 */
export type ThoughtItem = {
  firm: string;
  title: string;
  url: string;
  date: string | null;
  summary: string;
  topic: "Medicinal Products" | "Medical Devices" | "Consumer" | "Regulatory" | "Life sciences";
  type: "report" | "study" | "survey" | "outlook" | "article" | "webinar" | "podcast";
};

export type ThoughtBoard = {
  items: ThoughtItem[];
  total?: number;
  fetchedAt: string;
};

export type MarketIntelFeed = {
  version: number;
  companies: Record<string, FeedCompany>;
  /** Posts of team-followed people, keyed by tracked-person id. */
  people: Record<string, PersonFeed>;
  /** The M&A tracker board, refreshed with the feed. */
  mna?: MnaBoard;
  /** The thought-leadership tracker board, refreshed with the feed. */
  thought?: ThoughtBoard;
  health?: FeedHealth;
  updatedAt: string | null;
  spendUsd?: number;
  /** Apify dollars charged in the 24 hours from `since`, what the refresh's
   *  daily cap meters. */
  apifyDay?: { since: string; usd: number };
};

/** A briefing post; `by` is set when a followed person wrote it rather than
 *  the company page. */
export type BriefingPost = FeedPost & {
  by?: { id: string; name: string; role: string; photoUrl?: string };
};

export type LiveSignal = {
  /** Every signal the item carries, Saras's titles, most telling first; never empty. */
  kinds: SignalId[];
  title: string;
  sourceLabel: string;
  url: string;
  date: string | null;
  why: string;
};

/** The whole briefing, precomputed server-side into plain serializable data. */
export type LiveBriefing = {
  id: string;
  name: string;
  /** Which intelligence bucket this company lives in. */
  group: "customer" | "competitor";
  followerCount: number | null;
  logoUrl: string | null;
  tldr: string | null;
  fetchedAt: string;
  updatedLabel: string;
  /** null when the prior month is too thin for an honest percentage. */
  momentumPct: number | null;
  itemsThisMonth: number;
  trend: number[];
  trendLabels: string[];
  posts: BriefingPost[];
  news: FeedNews[];
  /** What the company published on its own website — the third source
   *  beside news outlets and LinkedIn (Anir, Aug 28). */
  site: FeedNews[];
  signals: LiveSignal[];
  competitorMentions: { name: string; count: number }[];
};

const WINDOW_DAYS = 95; // "the past 3 months", with a little slack

/**
 * THE STORE: ONE ROW PER COMPANY (Sep 10).
 *
 * Until now the whole feed was one jsonb document, "market-intel-feed", and
 * every page view parsed all of it while every refresh rewrote all of it
 * after each company. That is what forced the 60-post, 40-article cap. Now:
 *
 *   market-intel-feed            the META row: version, updatedAt, spend,
 *                                the M&A board and the thought-leadership
 *                                board. Small.
 *   market-intel-company:<id>    { company, summary } one row per company:
 *                                every item it has, plus a SUMMARY the list
 *                                page reads on its own (counts, item dates,
 *                                signal counts, top stories), so the
 *                                dashboard never downloads the items.
 *   market-intel-person:<id>     { feed } a followed person's posts.
 *
 * A legacy single document is split into rows the first time it is read
 * (migrateLegacyFeedRow), so a deploy needs no step.
 */
export const FEED_META_ROW = "market-intel-feed";
export const FEED_COMPANY_PREFIX = "market-intel-company:";
export const FEED_PERSON_PREFIX = "market-intel-person:";

/**
 * WHETHER THE OUTSIDE SERVICES ANSWER (Anir, Sep 10: "do the API keys work?
 * Is the storage good?"). Written by every refresh run from what actually
 * happened, and by the admin's Check connections button.
 */
export type ConnectionHealth = {
  ok: boolean;
  at: string;
  note?: string;
};
export type FeedHealth = {
  apify?: ConnectionHealth;
  perplexity?: ConnectionHealth;
  anthropic?: ConnectionHealth;
  storage?: ConnectionHealth & { companies?: number; people?: number; largestKb?: number };
};

export type FeedMeta = {
  version: number;
  updatedAt: string | null;
  spendUsd?: number;
  apifyDay?: { since: string; usd: number };
  mna?: MnaBoard;
  thought?: ThoughtBoard;
  health?: FeedHealth;
};

/** What the list page needs about a company, without its items. */
export type FeedCompanySummary = {
  id: string;
  name: string;
  slug: string | null;
  group: "customer" | "competitor";
  logoUrl: string | null;
  followerCount: number | null;
  tldr: string | null;
  fetchedAt: string;
  newsAt?: string;
  siteAt?: string;
  counts: { posts: number; news: number; site: number };
  /** Epoch ms of every stored post, article and website item, so month
   *  counts and the 12-week line are computed against the real "now". */
  itemDates: number[];
  signalCounts: Partial<Record<SignalId, number>>;
  signalTotal: number;
  stories: { title: string; source: string; url: string; published: string | null }[];
  /** When each item the company page lists was published, in epoch minutes
   *  (null when undated), so a card counts the page's own 3-month window when
   *  it is drawn. `signals` holds the items that hit a named signal. Older
   *  summaries lack it and fall back to `counts` and `signalTotal`. */
  shown?: { posts: (number | null)[]; news: (number | null)[]; site: (number | null)[]; signals: (number | null)[] };
};

/** Competitor intelligence defaults to items that the classifier marked as
 * relevant to Freyr's industries. Unlabelled items stay visible until the
 * classifier has made a decision, so collection never hides data on a guess. */
export function isRelevantCompanyItem(
  group: FeedCompany["group"],
  item: { label?: ItemLabel }
): boolean {
  return group !== "competitor" || !item.label || item.label.relevant;
}

function hasFeedDatabase(): boolean {
  return !!(
    marketIntelDatabaseConfig().url &&
    marketIntelDatabaseConfig().key
  );
}

function feedClient() {
  return require("@supabase/supabase-js").createClient(
    marketIntelDatabaseConfig().url!,
    marketIntelDatabaseConfig().key!,
    { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } }
  );
}

// Re-read on navigation so changes from the other environment are visible.
const FEED_CACHE_MS = 0; // Read the shared store on navigation across environments.

type Caches = {
  feed?: { at: number; feed: MarketIntelFeed | null };
  summaries?: { at: number; value: { meta: FeedMeta; companies: Record<string, FeedCompanySummary> } | null };
  companies?: Record<string, { at: number; company: FeedCompany | null }>;
};
function caches(): Caches {
  const g = globalThis as any;
  if (!g.__MI_FEED_CACHES__) g.__MI_FEED_CACHES__ = {};
  return g.__MI_FEED_CACHES__ as Caches;
}

export function bustMarketIntelFeedCache(): void {
  (globalThis as any).__MI_FEED_CACHES__ = {};
}

function metaFrom(raw: any): FeedMeta {
  return {
    version: Number(raw?.version) || 1,
    updatedAt: raw?.updatedAt ?? null,
    spendUsd: raw?.spendUsd,
    apifyDay: raw?.apifyDay,
    mna: raw?.mna as MnaBoard | undefined,
    thought: raw?.thought as ThoughtBoard | undefined,
    health: raw?.health as FeedHealth | undefined,
  };
}

async function readRowCatalog(id: string): Promise<any | null> {
  const { data, error } = await feedClient()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load ${id}: ${error.message}`);
  return data?.catalog ?? null;
}

async function upsertRow(id: string, catalog: unknown): Promise<void> {
  const { error } = await feedClient()
    .from("offering_catalog_state")
    .upsert({ id, catalog, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save ${id}: ${error.message}`);
}

/**
 * The one-time split of the legacy document. Idempotent: a meta row that
 * carries no `companies` has nothing to migrate. Returns true when it moved
 * anything.
 */
function hasLegacyCompanies(raw: any): boolean {
  return !!raw?.companies && typeof raw.companies === "object" && Object.keys(raw.companies).length > 0;
}

/** Items from a legacy copy folded into the row's items: nothing already
 *  stored is lost, labels stay, and a link or headline seen twice is kept
 *  once. */
function foldItems<T extends { url: string }>(stored: T[], legacy: T[], key: (t: T) => string): T[] {
  const seen = new Set(stored.map(key));
  const out = [...stored];
  for (const item of legacy) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * The one-time split of the legacy document. Idempotent: a meta row that
 * carries no companies has nothing to migrate. Returns true when it moved
 * anything.
 *
 * MERGES, NEVER OVERWRITES (Sep 10, learned the hard way on dev). A process
 * still running the OLD code, a dev server's boot-time timer or the outgoing
 * task during a rolling deploy, reads the split meta row as an empty feed,
 * re-scrapes ten items per company and writes the whole legacy document
 * back. Splitting that copy OVER the rows threw away every company's
 * history and labels. So a legacy company is folded into its row: the row's
 * items stay, the legacy items it does not have are added, and the newer
 * clock wins.
 */
export async function migrateLegacyFeedRow(): Promise<boolean> {
  if (!hasFeedDatabase()) return false;
  const raw = await readRowCatalog(FEED_META_ROW);
  if (!hasLegacyCompanies(raw)) return false;
  const companies = raw.companies as Record<string, FeedCompany>;
  const people = (raw.people ?? {}) as Record<string, PersonFeed>;
  for (const legacy of Object.values(companies)) {
    const existing = (await readRowCatalog(`${FEED_COMPANY_PREFIX}${legacy.id}`))?.company as
      | FeedCompany
      | undefined;
    const company: FeedCompany = existing
      ? {
          ...legacy,
          ...existing,
          posts: foldItems(existing.posts, legacy.posts ?? [], (p) => p.url),
          news: foldItems(existing.news, legacy.news ?? [], (n) => n.title.toLowerCase()),
          site: foldItems(existing.site ?? [], legacy.site ?? [], (n) => n.title.toLowerCase()),
          author: existing.author ?? legacy.author,
          tldr: existing.tldr ?? legacy.tldr ?? null,
          fetchedAt: [existing.fetchedAt, legacy.fetchedAt].filter(Boolean).sort().pop() ?? existing.fetchedAt,
          ...(existing.newsAt || legacy.newsAt
            ? { newsAt: [existing.newsAt, legacy.newsAt].filter(Boolean).sort().pop() }
            : {}),
          ...(existing.siteAt || legacy.siteAt
            ? { siteAt: [existing.siteAt, legacy.siteAt].filter(Boolean).sort().pop() }
            : {}),
        }
      : legacy;
    await upsertRow(`${FEED_COMPANY_PREFIX}${company.id}`, {
      company,
      summary: summarizeCompany(company),
    });
  }
  for (const [id, legacy] of Object.entries(people)) {
    const existing = (await readRowCatalog(`${FEED_PERSON_PREFIX}${id}`))?.feed as PersonFeed | undefined;
    const feed: PersonFeed = existing
      ? {
          posts: foldItems(existing.posts, legacy.posts ?? [], (p) => p.url),
          fetchedAt: [existing.fetchedAt, legacy.fetchedAt].filter(Boolean).sort().pop() ?? existing.fetchedAt,
        }
      : legacy;
    await upsertRow(`${FEED_PERSON_PREFIX}${id}`, { feed, summary: summarizePerson(feed) });
  }
  const meta = metaFrom(raw);
  await upsertRow(FEED_META_ROW, metaRow({ ...meta, version: 2, spendUsd: Math.max(meta.spendUsd ?? 0, 0) }));
  bustMarketIntelFeedCache();
  console.log(
    `[market-intel] folded a legacy feed document (${Object.keys(companies).length} companies, ${Object.keys(people).length} people) into the per-company rows`
  );
  return true;
}

/**
 * THE META ROW KEEPS EMPTY `companies` AND `people` MAPS ON PURPOSE. Code
 * from before the split treats a row without `companies` as no feed at all,
 * and a process still running it (a boot-time timer, the outgoing task in a
 * rolling deploy) then re-scrapes everything as new and writes the old
 * document back. With the empty maps and a recent `updatedAt` it sees a
 * fresh, empty feed and does nothing.
 */
function metaRow(meta: FeedMeta): Record<string, unknown> {
  return { ...meta, companies: {}, people: {} };
}

/**
 * THE FIRST REQUEST AFTER THE DEPLOY THAT SHIPPED THE SPLIT must not wait for
 * seventy-odd row writes: the legacy document is served as it is for that
 * request and the split runs once in the background. Every later read finds
 * the rows. `legacy` carries the document's companies and people so the
 * readers below can answer from it in the meantime.
 */
let migrating: Promise<boolean> | null = null;
function splitInBackground(): void {
  if (migrating) return;
  migrating = migrateLegacyFeedRow()
    .catch((error) => {
      console.error("[market-intel] legacy feed split failed:", error);
      return false;
    })
    .finally(() => {
      migrating = null;
    });
}

async function readMetaAndLegacy(): Promise<{
  meta: FeedMeta;
  legacy: { companies: Record<string, FeedCompany>; people: Record<string, PersonFeed> } | null;
} | null> {
  if (!hasFeedDatabase()) return null;
  const raw = await readRowCatalog(FEED_META_ROW);
  if (!raw) return null;
  if (hasLegacyCompanies(raw)) {
    splitInBackground();
    return {
      meta: metaFrom(raw),
      legacy: {
        companies: raw.companies as Record<string, FeedCompany>,
        people: (raw.people ?? {}) as Record<string, PersonFeed>,
      },
    };
  }
  return { meta: metaFrom(raw), legacy: null };
}

export async function readFeedMeta(): Promise<FeedMeta | null> {
  return (await readMetaAndLegacy())?.meta ?? null;
}

/**
 * THE WHOLE FEED, every company with every item. This is what a refresh run
 * works on; pages read summaries or one company instead. `fresh` skips the
 * minute-long cache, which a run must, since it writes on top of what it read.
 */
export async function readMarketIntelFeed(options?: {
  fresh?: boolean;
}): Promise<MarketIntelFeed | null> {
  if (!hasFeedDatabase()) return null;
  const c = caches();
  if (!options?.fresh && c.feed && Date.now() - c.feed.at < FEED_CACHE_MS) return c.feed.feed;
  const read = await readMetaAndLegacy();
  if (!read) {
    c.feed = { at: Date.now(), feed: null };
    return null;
  }
  const { meta, legacy } = read;
  /* A writer must not start on a half-folded store: it waits for the fold. */
  if (legacy && options?.fresh && migrating) await migrating;
  const db = feedClient();
  const [companyRows, personRows] = await Promise.all([
    db.from("offering_catalog_state").select("id, catalog").like("id", `${FEED_COMPANY_PREFIX}%`),
    db.from("offering_catalog_state").select("id, catalog").like("id", `${FEED_PERSON_PREFIX}%`),
  ]);
  if (companyRows.error) throw new Error(`Could not load the market feed: ${companyRows.error.message}`);
  if (personRows.error) throw new Error(`Could not load the market feed: ${personRows.error.message}`);
  const companies: Record<string, FeedCompany> = {};
  for (const row of companyRows.data ?? []) {
    const company = (row.catalog as any)?.company as FeedCompany | undefined;
    if (company?.id) companies[company.id] = company;
  }
  const people: Record<string, PersonFeed> = {};
  for (const row of personRows.data ?? []) {
    const id = String(row.id).slice(FEED_PERSON_PREFIX.length);
    const feed = (row.catalog as any)?.feed as PersonFeed | undefined;
    if (id && feed) people[id] = feed;
  }
  /* ROWS FIRST, THE LEGACY DOCUMENT ONLY FOR WHAT HAS NO ROW YET: a row
     carries the history, a legacy copy is at best a day's scrape. */
  if (legacy) {
    for (const [id, company] of Object.entries(legacy.companies)) if (!companies[id]) companies[id] = company;
    for (const [id, feed] of Object.entries(legacy.people)) if (!people[id]) people[id] = feed;
  }
  const feed: MarketIntelFeed | null =
    Object.keys(companies).length === 0
      ? null
      : {
          version: meta.version,
          companies,
          people,
          mna: meta.mna,
          thought: meta.thought,
          health: meta.health,
          updatedAt: meta.updatedAt,
          spendUsd: meta.spendUsd,
          apifyDay: meta.apifyDay,
        };
  c.feed = { at: Date.now(), feed };
  return feed;
}

/** The list page's read: every company's summary, none of its items. */
export async function readMarketIntelSummaries(options?: {
  /** Skip the minute-old copy: deciding whether a company is stale must not
   *  mistake one added a moment ago for one that was never collected. */
  fresh?: boolean;
}): Promise<{
  meta: FeedMeta;
  companies: Record<string, FeedCompanySummary>;
} | null> {
  if (!hasFeedDatabase()) return null;
  const c = caches();
  if (!options?.fresh && c.summaries && Date.now() - c.summaries.at < FEED_CACHE_MS) return c.summaries.value;
  const read = await readMetaAndLegacy();
  if (!read) {
    c.summaries = { at: Date.now(), value: null };
    return null;
  }
  const { meta, legacy } = read;
  const { data, error } = await feedClient()
    .from("offering_catalog_state")
    .select("id, summary:catalog->summary")
    .like("id", `${FEED_COMPANY_PREFIX}%`);
  if (error) throw new Error(`Could not load the market summaries: ${error.message}`);
  const companies: Record<string, FeedCompanySummary> = {};
  for (const row of data ?? []) {
    const summary = (row as any).summary as FeedCompanySummary | null;
    if (summary?.id) companies[summary.id] = summary;
  }
  if (legacy) {
    for (const company of Object.values(legacy.companies)) {
      if (!companies[company.id]) companies[company.id] = summarizeCompany(company);
    }
  }
  const value = Object.keys(companies).length === 0 ? null : { meta, companies };
  c.summaries = { at: Date.now(), value };
  return value;
}

/** One company with all its items: what the briefing page reads. */
export async function readFeedCompany(id: string): Promise<FeedCompany | null> {
  if (!hasFeedDatabase() || !id) return null;
  const c = caches();
  c.companies ??= {};
  const hit = c.companies[id];
  if (hit && Date.now() - hit.at < FEED_CACHE_MS) return hit.company;
  const read = await readMetaAndLegacy();
  const raw = await readRowCatalog(`${FEED_COMPANY_PREFIX}${id}`);
  const company =
    (raw?.company as FeedCompany | undefined) ?? read?.legacy?.companies[id] ?? null;
  c.companies[id] = { at: Date.now(), company };
  return company;
}

/** Posts of the given followed people, keyed by person id. */
export async function readFeedPeople(ids: string[]): Promise<Record<string, PersonFeed>> {
  const out: Record<string, PersonFeed> = {};
  if (!hasFeedDatabase() || ids.length === 0) return out;
  const read = await readMetaAndLegacy();
  const { data, error } = await feedClient()
    .from("offering_catalog_state")
    .select("id, catalog")
    .in("id", ids.map((id) => `${FEED_PERSON_PREFIX}${id}`));
  if (error) throw new Error(`Could not load followed people: ${error.message}`);
  for (const row of data ?? []) {
    const id = String(row.id).slice(FEED_PERSON_PREFIX.length);
    const feed = (row.catalog as any)?.feed as PersonFeed | undefined;
    if (feed) out[id] = feed;
  }
  if (read?.legacy) {
    for (const id of ids) if (!out[id] && read.legacy.people[id]) out[id] = read.legacy.people[id];
  }
  return out;
}

// ------------------------------------------------------------------ writers
/** The meta row: spend, clocks and the two boards. Tiny, written often. */
export async function saveFeedMeta(feed: MarketIntelFeed | FeedMeta): Promise<void> {
  const meta: FeedMeta = {
    version: 2,
    updatedAt: feed.updatedAt ?? null,
    ...(feed.spendUsd !== undefined ? { spendUsd: feed.spendUsd } : {}),
    ...(feed.apifyDay ? { apifyDay: feed.apifyDay } : {}),
    ...(feed.mna ? { mna: feed.mna } : {}),
    ...(feed.thought ? { thought: feed.thought } : {}),
    ...(feed.health ? { health: feed.health } : {}),
  };
  await upsertRow(FEED_META_ROW, metaRow(meta));
  bustMarketIntelFeedCache();
}

/* A REMOVED STORY STAYS REMOVED UNDER ANY OF ITS ADDRESSES (Sep 13 loop). The
   list of removed stories held only the address a story was shown under, and
   compared it letter for letter. The same article is also stored as a Google
   News link or with tracking tags on the end, so a later collection could
   bring a removed story back. publisherUrl is left out on purpose: it is often
   just the outlet's home page, and matching on it would hide every story from
   that outlet. */
export function storyKey(url: string): string {
  const raw = url.trim();
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    if (!parsed.searchParams.toString()) parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

type StoryAddressed = { url: string; alternateUrls?: string[] };

function storyAddresses(item: StoryAddressed): string[] {
  return [item.url, ...(item.alternateUrls ?? [])].filter(
    (address): address is string => typeof address === "string" && address.length > 0
  );
}

function notRemoved<T extends StoryAddressed>(items: T[], removed: Set<string>): T[] {
  return items.filter((item) => !storyAddresses(item).some((address) => removed.has(storyKey(address))));
}

/** The company with every removed story taken out, whichever address it came under. */
export function withoutRemovedStories(company: FeedCompany, removedItemUrls: string[]): FeedCompany {
  const removed = new Set(removedItemUrls.map(storyKey));
  return {
    ...company,
    removedItemUrls,
    posts: notRemoved(company.posts, removed),
    news: notRemoved(company.news, removed),
    site: notRemoved(company.site ?? [], removed),
  };
}

/** One company's row, with a fresh summary, plus the meta row. */
export async function saveFeedCompany(feed: MarketIntelFeed, id: string): Promise<void> {
  let company = feed.companies[id];
  if (!company) return;
  const prior = (await readRowCatalog(`${FEED_COMPANY_PREFIX}${id}`))?.company as FeedCompany | undefined;
  const removedItemUrls = [...new Set([...(prior?.removedItemUrls ?? []), ...(company.removedItemUrls ?? [])])];
  if (removedItemUrls.length) {
    company = withoutRemovedStories(company, removedItemUrls);
    feed.companies[id] = company;
  }
  await upsertRow(`${FEED_COMPANY_PREFIX}${id}`, {
    company,
    summary: summarizeCompany(company),
  });
  await saveFeedMeta(feed);
}

export async function saveFeedPerson(feed: MarketIntelFeed, personId: string): Promise<void> {
  let person = feed.people[personId];
  if (!person) return;
  const prior = (await readRowCatalog(`${FEED_PERSON_PREFIX}${personId}`))?.feed as PersonFeed | undefined;
  const removedItemUrls = [...new Set([...(prior?.removedItemUrls ?? []), ...(person.removedItemUrls ?? [])])];
  if (removedItemUrls.length) {
    const removed = new Set(removedItemUrls.map(storyKey));
    person = {
      ...person,
      removedItemUrls,
      posts: notRemoved(person.posts, removed),
    };
    feed.people[personId] = person;
  }
  await upsertRow(`${FEED_PERSON_PREFIX}${personId}`, {
    feed: person,
    summary: summarizePerson(person),
  });
  await saveFeedMeta(feed);
}

/** Permanently suppress one displayed story group. Every source URL in the
 * group is tombstoned so a later collection cannot add the bad story back. */
export async function removeFeedStoryItems(
  companyId: string,
  items: { url: string; personId?: string }[]
): Promise<number> {
  const valid = items
    .map((item) => ({ url: item.url.trim(), personId: item.personId?.trim() || undefined }))
    .filter((item) => /^https?:\/\//i.test(item.url))
    .slice(0, 25);
  if (!companyId || valid.length === 0) return 0;
  let removedCount = 0;
  const companyUrls = valid.filter((item) => !item.personId).map((item) => item.url);
  if (companyUrls.length) {
    const row = await readRowCatalog(`${FEED_COMPANY_PREFIX}${companyId}`);
    const company = row?.company as FeedCompany | undefined;
    if (company) {
      /* Every address the removed story is stored under goes on the list, not
         only the one it was shown with. */
      const asked = new Set(companyUrls.map(storyKey));
      const matched = [...company.posts, ...company.news, ...(company.site ?? [])]
        .filter((item) => storyAddresses(item).some((address) => asked.has(storyKey(address))));
      const removedItemUrls = [...new Set([
        ...(company.removedItemUrls ?? []),
        ...companyUrls,
        ...matched.flatMap(storyAddresses),
      ])];
      const next: FeedCompany = { ...withoutRemovedStories(company, removedItemUrls), tldr: null };
      removedCount += company.posts.length - next.posts.length;
      removedCount += company.news.length - next.news.length;
      removedCount += (company.site ?? []).length - (next.site ?? []).length;
      await upsertRow(`${FEED_COMPANY_PREFIX}${companyId}`, { company: next, summary: summarizeCompany(next) });
    }
  }
  const byPerson = new Map<string, string[]>();
  for (const item of valid) {
    if (!item.personId) continue;
    byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item.url]);
  }
  for (const [personId, urls] of byPerson) {
    const row = await readRowCatalog(`${FEED_PERSON_PREFIX}${personId}`);
    const person = row?.feed as PersonFeed | undefined;
    if (!person) continue;
    const removedItemUrls = [...new Set([...(person.removedItemUrls ?? []), ...urls])];
    const removed = new Set(urls.map(storyKey));
    const next: PersonFeed = {
      ...person,
      removedItemUrls,
      posts: notRemoved(person.posts, removed),
    };
    removedCount += person.posts.length - next.posts.length;
    await upsertRow(`${FEED_PERSON_PREFIX}${personId}`, { feed: next, summary: summarizePerson(next) });
  }
  bustMarketIntelFeedCache();
  return removedCount;
}

export function summarizePerson(feed: PersonFeed): PersonSummary {
  const postMinutes = feed.posts
    .map((post) => (post.date ? Date.parse(post.date) : null))
    .filter((t): t is number | null => t === null || Number.isFinite(t))
    .map((t) => (t === null ? null : Math.floor(t / 60_000)));
  return { posts: feed.posts.length, fetchedAt: feed.fetchedAt, postMinutes };
}

/** A person's posts inside the company page's 3-month window. */
export function personPostsInPageWindow(summary: PersonSummary | undefined): number {
  if (!summary) return 0;
  if (!summary.postMinutes) return summary.posts;
  const cutoff = Date.now() - PAGE_WINDOW_DAYS * 86_400_000;
  return summary.postMinutes.filter((at) => at === null || at * 60_000 > cutoff).length;
}

/** Post counts for every followed person, keyed by person id: one small
 *  read for the facepiles on the list page. */
export async function readFeedPeopleSummaries(): Promise<Record<string, PersonSummary>> {
  const out: Record<string, PersonSummary> = {};
  if (!hasFeedDatabase()) return out;
  const read = await readMetaAndLegacy();
  const { data, error } = await feedClient()
    .from("offering_catalog_state")
    .select("id, summary:catalog->summary")
    .like("id", `${FEED_PERSON_PREFIX}%`);
  if (error) throw new Error(`Could not load followed people: ${error.message}`);
  for (const row of data ?? []) {
    const id = String(row.id).slice(FEED_PERSON_PREFIX.length);
    const summary = (row as any).summary as PersonSummary | null;
    if (id && summary && typeof summary.posts === "number") out[id] = summary;
  }
  if (read?.legacy) {
    for (const [id, feed] of Object.entries(read.legacy.people)) if (!out[id]) out[id] = summarizePerson(feed);
  }
  return out;
}

/** An admin deleted the company for good: its row and its people's rows go. */
export async function deleteFeedCompany(id: string, personIds: string[] = []): Promise<void> {
  if (!hasFeedDatabase() || !id) return;
  const db = feedClient();
  const rows = [`${FEED_COMPANY_PREFIX}${id}`, ...personIds.map((p) => `${FEED_PERSON_PREFIX}${p}`)];
  const { error } = await db.from("offering_catalog_state").delete().in("id", rows);
  if (error) throw new Error(`Could not delete ${id}: ${error.message}`);
  bustMarketIntelFeedCache();
}

// ------------------------------------------------------------------ summary
/** Everything the list page shows about a company, computed when the
 *  company is written so the page never has to read its items. */
export function summarizeCompany(company: FeedCompany): FeedCompanySummary {
  const visibleCompany: FeedCompany = {
    ...company,
    posts: company.posts.filter((item) => isRelevantCompanyItem(company.group, item)),
    news: company.news.filter((item) => isRelevantCompanyItem(company.group, item)),
    site: (company.site ?? []).filter((item) => isRelevantCompanyItem(company.group, item)),
  };
  const dates = itemDates(visibleCompany);
  const { signals } = deriveSignals(visibleCompany, []);
  const signalCounts: Partial<Record<SignalId, number>> = {};
  for (const s of signals) for (const kind of s.kinds) signalCounts[kind] = (signalCounts[kind] ?? 0) + 1;
  /* ONE HEADLINE ONCE (Sep 13 loop): Lindus's card rotated the same board
     appointment four times, once per outlet that ran it. */
  const seenHeadlines = new Set<string>();
  const stories = [...visibleCompany.news]
    .sort((a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0))
    .filter((n) => {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
      if (seenHeadlines.has(key)) return false;
      seenHeadlines.add(key);
      return true;
    })
    .slice(0, 5)
    .map((n) => ({ title: n.title || titleFromUrl(n.url), source: n.source, url: n.url, published: n.published }));
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    group: company.group === "competitor" ? "competitor" : "customer",
    logoUrl: company.author?.logoUrl || company.logoUrl || null,
    followerCount: company.author?.followerCount ?? null,
    tldr: usableRundown(company.tldr),
    fetchedAt: company.fetchedAt,
    ...(company.newsAt ? { newsAt: company.newsAt } : {}),
    ...(company.siteAt ? { siteAt: company.siteAt } : {}),
    counts: {
      posts: visibleCompany.posts.length,
      news: visibleCompany.news.length,
      site: (visibleCompany.site ?? []).length,
    },
    itemDates: dates,
    signalCounts,
    /* Items that hit a named signal; "Others" is not one worth counting on a card. */
    signalTotal: signals.filter((signal) => signal.kinds[0] !== "others").length,
    stories,
    shown: shownItemMinutes(company, signals),
  };
}

/* THE CARD COUNTS WHAT THE PAGE SHOWS (Sep 13 loop). A card counted every item
   ever stored while its page lists the past 3 months with each address once:
   Moderna's card said 27 website items and its page 4, Novartis 40 posts and
   26. The summary keeps the date of each item the page would list, and the
   card counts the window when it is drawn, so the two agree on any day. */
function shownItemMinutes(company: FeedCompany, signals: LiveSignal[]): NonNullable<FeedCompanySummary["shown"]> {
  /* undated: the page always lists it; unreadable: the page never does */
  const minutes = (iso: string | null | undefined): number | null | undefined => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? Math.floor(t / 60_000) : undefined;
  };
  const listed = (values: (number | null | undefined)[]) =>
    values.filter((value): value is number | null => value !== undefined);
  /* The page keeps one item per address (the website copy first, then posts),
     and only then drops what is outside Freyr's industries. */
  const seen = new Set<string>();
  const once = <T extends { url: string; label?: ItemLabel }>(items: T[]) =>
    items
      .filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)))
      .filter((item) => isRelevantCompanyItem(company.group, item));
  const site = once(company.site ?? []).map((n) => ({ url: n.url, at: minutes(n.published) }));
  const posts = once(company.posts).map((p) => ({ url: p.url, at: minutes(p.date) }));
  const news = once(company.news).map((n) => ({ url: n.url, at: minutes(n.published) }));
  const named = new Set(signals.filter((s) => s.kinds[0] !== "others").map((s) => s.url));
  return {
    posts: listed(posts.map((i) => i.at)),
    news: listed(news.map((i) => i.at)),
    site: listed(site.map((i) => i.at)),
    signals: listed([...site, ...posts, ...news].filter((i) => named.has(i.url)).map((i) => i.at)),
  };
}

/** The company page opens on "Past 3 months". */
const PAGE_WINDOW_DAYS = 90;

/**
 * A COMPANY CARD, from its summary and today's date. Counts are over the
 * display window, the 12-week line and "this month" are computed now, so
 * they are as true as the last refresh.
 */
export type CompanyCard = {
  windowDays?: number;
  countsKnown?: boolean;
  id: string;
  name: string;
  group: "customer" | "competitor";
  logoUrl: string | null;
  followerCount: number | null;
  fetchedAt: string;
  updatedLabel: string;
  momentumPct: number | null;
  itemsThisMonth: number;
  itemsInWindow: number;
  trend: number[];
  trendLabels: string[];
  counts: { posts: number; news: number; site: number };
  signalTotal: number;
  signalCounts: Partial<Record<SignalId, number>>;
  stories: FeedCompanySummary["stories"];
};

export function cardFromSummary(summary: FeedCompanySummary, windowDays = PAGE_WINDOW_DAYS): CompanyCard {
  const now = Date.now();
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  const dates = summary.itemDates.filter((t) => Number.isFinite(t) && t > cutoff);
  const { points, labels } = trendFromDates(dates, windowDays);
  const mo = momentumFromDates(dates);
  const freshest =
    [summary.fetchedAt, summary.newsAt, summary.siteAt].filter(Boolean).sort().pop() ??
    summary.fetchedAt;
  const pageCutoff = now - windowDays * 86_400_000;
  const inPageWindow = (values: (number | null)[]) =>
    values.filter((at) => at === null || at * 60_000 > pageCutoff).length;
  const shownCounts = summary.shown
    ? {
        posts: inPageWindow(summary.shown.posts),
        news: inPageWindow(summary.shown.news),
        site: inPageWindow(summary.shown.site),
        signals: inPageWindow(summary.shown.signals),
      }
    : null;
  return {
    windowDays,
    countsKnown: Boolean(summary.shown) || windowDays === PAGE_WINDOW_DAYS,
    id: summary.id,
    name: summary.name,
    group: summary.group,
    logoUrl: summary.logoUrl,
    followerCount: summary.followerCount,
    fetchedAt: freshest,
    updatedLabel: updatedLabel(freshest),
    momentumPct: mo.pct,
    itemsThisMonth: mo.thisMonth,
    itemsInWindow: shownCounts ? shownCounts.posts + shownCounts.news + shownCounts.site : dates.filter(at => at > pageCutoff).length,
    trend: points,
    trendLabels: labels,
    counts: shownCounts ?? summary.counts,
    signalTotal: shownCounts ? shownCounts.signals : summary.signalTotal,
    signalCounts: summary.signalCounts,
    stories: summary.stories.filter(story => !story.published || Date.parse(story.published) > pageCutoff),
  };
}

/** Every dated item: posts, articles and the company's own website items.
 *  The website is a source like the other two, so it counts like them. */
function itemDates(company: FeedCompany): number[] {
  const out: number[] = [];
  for (const p of company.posts) if (p.date) out.push(Date.parse(p.date));
  for (const n of company.news) if (n.published) out.push(Date.parse(n.published));
  for (const n of company.site ?? []) if (n.published) out.push(Date.parse(n.published));
  return out.filter((t) => Number.isFinite(t));
}

/** The default detail view uses thirty days. Dashboard cards can request the
 *  active page range; longer ranges are grouped into readable buckets instead
 *  of drawing dozens of one-day teeth in a tiny sparkline. */
export const TREND_DAYS = 30;

export function trendFromDates(dates: number[], days = TREND_DAYS): { points: number[]; labels: string[] } {
  const now = Date.now();
  const day = 86_400_000;
  const bucketCount = days <= 14 ? days : days <= 30 ? 15 : 12;
  const bucketMs = (days * day) / bucketCount;
  const windowStart = now - days * day;
  const points = new Array(bucketCount).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    labels.push(
      new Date(windowStart + i * bucketMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    );
  }
  for (const t of dates) {
    if (t < windowStart || t > now) continue;
    const bucket = Math.min(bucketCount - 1, Math.floor((t - windowStart) / bucketMs));
    points[bucket] += 1;
  }
  return { points, labels };
}

/** Items per day, oldest first, for the 30-day activity line. */
export function weeklyTrend(company: FeedCompany): {
  points: number[];
  labels: string[];
} {
  return trendFromDates(itemDates(company));
}

export function momentumFromDates(dates: number[]): { pct: number | null; thisMonth: number } {
  const now = Date.now();
  const month = 30 * 86_400_000;
  let current = 0;
  let previous = 0;
  let oldest = Infinity;
  for (const t of dates) {
    if (t > now - month) current += 1;
    else if (t > now - 2 * month) previous += 1;
    if (t < oldest) oldest = t;
  }
  /* A PERCENTAGE ONLY WHEN THE PREVIOUS MONTH IS FULLY THERE. Until Sep 10
     the feed kept the latest hundred items, so "last month" was whatever was
     left after this month had taken its share, and "+1617%" was that hole,
     not a surge (Saras, Sep 10). If the oldest stored item is younger than
     sixty days, the previous month is only partly covered, and the honest
     figure is the count. */
  const previousMonthCovered = Number.isFinite(oldest) && oldest <= now - 2 * month;
  if (previous < 5 || !previousMonthCovered) return { pct: null, thisMonth: current };
  return {
    pct: Math.round(((current - previous) / previous) * 100),
    thisMonth: current,
  };
}

/**
 * Last 30 days of market noise vs the 30 before. When the earlier month has
 * fewer than 5 items the percentage would be honest arithmetic on a dishonest
 * sample (news feeds lean recent), producing "+1800%" nonsense, so `pct` is
 * null there and the UI shows the plain count instead. The count itself is
 * exact: nothing is capped any more.
 */
export function momentum(company: FeedCompany): {
  pct: number | null;
  thisMonth: number;
} {
  return momentumFromDates(itemDates(company));
}

export function updatedLabel(iso: string | null): string {
  if (!iso) return "not yet refreshed";
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// ------------------------------------------------------------------ signals
/** A stored line cut mid-word by an earlier version ends on a whole word. A
 *  line that was cut with an ellipsis ("...differentiate from this...") ends
 *  on its last complete clause instead, when there is one worth keeping, so
 *  "Why it matters" never stops mid-thought (Sep 13 loop). */
function tidyLine(text: string, max: number): string {
  const lastClause = (line: string): string | null => {
    const body = line.replace(/\u2026$/, "").replace(/\.\.\.$/, "").trimEnd();
    const cut = Math.max(body.lastIndexOf(". "), body.lastIndexOf("; "), body.lastIndexOf(": "));
    return cut >= body.length * 0.35 ? `${body.slice(0, cut).replace(/[,;:\s]+$/, "")}.` : null;
  };
  if (/(\u2026|\.\.\.)$/.test(text)) return lastClause(text) ?? text;
  if (text.length < max - 1 || /[.!?]$/.test(text)) return text;
  const at = text.lastIndexOf(" ");
  const cut = `${(at > max * 0.6 ? text.slice(0, at) : text).replace(/[,;:\s]+$/, "")}\u2026`;
  return lastClause(cut) ?? cut;
}

/**
 * A NAME IS FOUND AS A WHOLE WORD (Sep 13 loop). "Thema", an MDV consultancy
 * from Saras's list, was counted as a competitor mentioned on GSK's page
 * because a plain substring search found it inside other words. Every name now
 * has to stand on its own; a one-word name must also keep its own capitals
 * (or be in a shouted headline), so "Element" is not every "element".
 */
function mentionMatcher(name: string): (text: string) => boolean {
  const clean = name.trim();
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const edge = (body: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);
  if (/\s/.test(clean)) {
    const pattern = edge(escape(clean), "iu");
    return (text) => pattern.test(text);
  }
  const exact = edge(escape(clean), "u");
  const shouted = edge(escape(clean.toUpperCase()), "u");
  return (text) => exact.test(text) || shouted.test(text);
}


export function deriveSignals(
  company: FeedCompany,
  allNames: { id: string; name: string }[]
): { signals: LiveSignal[]; competitorMentions: { name: string; count: number }[] } {
  const signals: LiveSignal[] = [];
  const group: SignalGroup = company.group === "competitor" ? "competitor" : "customer";
  const mentionCounts = new Map<string, number>();
  const others = allNames
    .filter((n) => n.id !== company.id && n.name.length > 3)
    .map((n) => ({ name: n.name, found: mentionMatcher(n.name) }));

  const consider = (
    item: { label?: ItemLabel },
    text: string,
    title: string,
    sourceLabel: string,
    url: string,
    date: string | null
  ) => {
    /* THE LABEL IS THE ANSWER when the classifier has read the item; the
       keyword rules only speak for items it has not reached yet. Every item
       carries at least one of Saras's signals (Sep 11), "Others" included,
       so every item counts under the Signals bar. */
    let kinds: SignalId[];
    let why = "";
    if (item.label && isLabeled(item)) {
      kinds = labelSignals(item.label, group);
      const own = item.label.why?.trim() || "";
      if (kinds[0] !== "others") why = own ? tidyLine(own, 240) : signalWhy(group, kinds[0]);
    } else {
      kinds = fallbackSignals(text, group);
      if (kinds[0] !== "others") why = signalWhy(group, kinds[0]);
    }
    let hasCompetitorMention = false;
    for (const other of others) {
      if (other.found(text)) {
        hasCompetitorMention = true;
        mentionCounts.set(other.name, (mentionCounts.get(other.name) ?? 0) + 1);
      }
    }
    if (hasCompetitorMention && group === "customer" && !kinds.includes("competitor_mentions")) {
      kinds = [...kinds.filter((kind) => kind !== "others"), "competitor_mentions"];
      if (!why) why = signalWhy(group, "competitor_mentions");
    }
    signals.push({ kinds, title, sourceLabel, url, date, why });
  };

  for (const n of company.news) {
    consider(n, `${n.title}. ${n.summary ?? ""}`, n.title, n.source, n.url, n.published);
  }
  for (const n of company.site ?? []) {
    consider(n, `${n.title}. ${n.summary ?? ""}`, n.title, n.source, n.url, n.published);
  }
  for (const p of company.posts) {
    const firstLine = clipText(p.text.split("\n")[0], 110);
    consider(p, p.text, firstLine, "LinkedIn post", p.url, p.date);
  }

  /* NEWEST FIRST, ONE PER ITEM, NO CAP. The old shortlist of eight was a
     second feed nobody could see past; now a signal is a property of the
     item it was found in, so the count is the count. */
  const seen = new Set<string>();
  const unique = signals
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

  const competitorMentions = [...mentionCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { signals: unique, competitorMentions };
}

/** Everything the live briefing page needs, from one feed company. Posts by
 *  followed people ride in the same feed, attributed via `by`. */
export function buildBriefing(
  company: FeedCompany,
  allNames: { id: string; name: string }[],
  peoplePosts: {
    id: string;
    name: string;
    role: string;
    photoUrl?: string;
    posts: FeedPost[];
  }[] = []
): LiveBriefing {
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  /* NO PEOPLE ON COMPETITORS (Saras, Sep 10: "we don't really need to
     follow specific people... you can remove the people tracked within
     competitors"). Whatever the tracking row still holds, a competitor's
     briefing is the company's own voice and the press. */
  const followed = company.group === "competitor" ? [] : peoplePosts;
  const posts: BriefingPost[] = [
    ...company.posts,
    ...followed.flatMap((person) =>
      person.posts.map((p) => ({
        ...p,
        by: { id: person.id, name: person.name, role: person.role, photoUrl: person.photoUrl },
      }))
    ),
  ]
    .filter((p) => !p.date || Date.parse(p.date) > cutoff)
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
  const news = company.news
    .filter((n) => !n.published || Date.parse(n.published) > cutoff)
    .sort(
      (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
    );
  /* The site column keeps the SAME window as news, so a briefing never
     shows a press release older than the stories beside it. */
  const site = (company.site ?? [])
    .filter((n) => !n.published || Date.parse(n.published) > cutoff)
    .sort(
      (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
    );
  const windowed: FeedCompany = { ...company, posts, news, site };
  const { points, labels } = weeklyTrend(windowed);
  const { signals, competitorMentions } = deriveSignals(windowed, allNames);
  const mo = momentum(windowed);
  // "Updated" means the last time ANY data landed. The cheap same-day news
  // pass stamps `newsAt` without touching `fetchedAt` (which orders the
  // Apify rotation), so showing fetchedAt alone read "updated 25h ago" over
  // news collected two hours earlier.
  const freshest =
    [company.fetchedAt, company.newsAt, company.siteAt].filter(Boolean).sort().pop() ??
    company.fetchedAt;
  return {
    id: company.id,
    group: company.group === "competitor" ? ("competitor" as const) : ("customer" as const),
    name: company.name,
    followerCount: company.author?.followerCount ?? null,
    logoUrl: company.author?.logoUrl || company.logoUrl || null,
    tldr: usableRundown(company.tldr),
    fetchedAt: freshest,
    updatedLabel: updatedLabel(freshest),
    momentumPct: mo.pct,
    itemsThisMonth: mo.thisMonth,
    trend: points,
    trendLabels: labels,
    posts,
    // Retained publisher evidence is for server-side verification/digests.
    // The browser needs summaries and links, not entire source documents.
    news: news.map(({ articleText, articleReadAt, ...item }) => {
      void articleText;
      void articleReadAt;
      return item;
    }),
    site: site.map(({ articleText, articleReadAt, ...item }) => {
      void articleText;
      void articleReadAt;
      return item;
    }),
    signals,
    competitorMentions,
  };
}

/** Names for competitor detection: everything on the watch, real and sample. */
export function allTrackedNames(
  feed: { companies: Record<string, { id: string; name: string }> } | null,
  extra: { id: string; name: string }[] = []
): { id: string; name: string }[] {
  const out = new Map<string, { id: string; name: string }>();
  for (const c of MI_COMPANIES) out.set(c.id, { id: c.id, name: c.name });
  for (const name of MI_WATCHLIST) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!out.has(id)) out.set(id, { id, name });
  }
  if (feed) {
    for (const c of Object.values(feed.companies)) out.set(c.id, { id: c.id, name: c.name });
  }
  for (const e of extra) out.set(e.id, e);
  return [...out.values()];
}

export { SIGNAL_META };
