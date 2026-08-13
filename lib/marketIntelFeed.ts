import { MI_COMPANIES, MI_WATCHLIST, SIGNAL_META, type MiSignalKind } from "./marketIntelMock";

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
  url: string;
  text: string;
  date: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
};

export type FeedNews = {
  title: string;
  source: string;
  url: string;
  published: string | null;
  /** AI summary of the fetched article text; absent when the article could
   *  not be read (headline stands alone rather than faking a summary). */
  summary?: string;
};

/** "MARKETSCREENER.COM" and "Fierce Pharma" were both wearing the source
 *  chip; every stored label is now a clean publication name. */
export function cleanSourceLabel(raw: string): string {
  let s = String(raw || "News").trim();
  if (/\.[a-z]{2,6}$/i.test(s) || /\.(com|net|org|io|co)\b/i.test(s)) {
    s = s.replace(/^www\./i, "").split("/")[0];
    s = s.replace(/\.[a-z]{2,6}$/i, "").replace(/\.[a-z]{2,6}$/i, "");
    s = s.replace(/[-_.]+/g, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    s = s
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return s.slice(0, 32) || "News";
}

export type FeedCompany = {
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
  /** The AI rundown shown at the top of the briefing; refreshed with the feed. */
  tldr?: string | null;
  /** "customer" (default) or "competitor" — which intelligence tab owns it. */
  group?: "customer" | "competitor";
  fetchedAt: string;
  /** Last time the cheap same-day news pass visited (Perplexity). Kept apart
   *  from `fetchedAt`, which still means "full Apify sync" and drives that
   *  rotation's ordering. */
  newsAt?: string;
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

export type MnaBoard = { items: MnaItem[]; fetchedAt: string };

export type PersonFeed = { posts: FeedPost[]; fetchedAt: string };

export type MarketIntelFeed = {
  version: number;
  companies: Record<string, FeedCompany>;
  /** Posts of team-followed people, keyed by tracked-person id. */
  people: Record<string, PersonFeed>;
  /** The M&A tracker board, refreshed with the feed. */
  mna?: MnaBoard;
  updatedAt: string | null;
  spendUsd?: number;
};

/** A briefing post; `by` is set when a followed person wrote it rather than
 *  the company page. */
export type BriefingPost = FeedPost & {
  by?: { name: string; role: string; photoUrl?: string };
};

export type LiveSignal = {
  kind: MiSignalKind;
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
  signals: LiveSignal[];
  competitorMentions: { name: string; count: number }[];
};

const WINDOW_DAYS = 95; // "the past 3 months", with a little slack

function hasFeedDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function feedClient() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// The feed row is multi-megabyte (76 companies of posts and news), and every
// tab click was re-downloading and re-parsing it — the whole reason switching
// tabs took seconds (Anir: "it takes 5 seconds for me to click between the
// tabs"). One process-local copy serves all requests for a minute; writers
// bust it so edits still show up immediately on the instance that wrote.
const FEED_CACHE_MS = 60_000;

export function bustMarketIntelFeedCache(): void {
  (globalThis as any).__MI_FEED_CACHE__ = undefined;
}

export async function readMarketIntelFeed(): Promise<MarketIntelFeed | null> {
  if (!hasFeedDatabase()) return null;
  const cached = (globalThis as any).__MI_FEED_CACHE__ as
    | { at: number; feed: MarketIntelFeed | null }
    | undefined;
  if (cached && Date.now() - cached.at < FEED_CACHE_MS) return cached.feed;
  const { data, error } = await feedClient()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", "market-intel-feed")
    .maybeSingle();
  if (error) throw new Error(`Could not load the market feed: ${error.message}`);
  const raw = data?.catalog;
  const feed: MarketIntelFeed | null =
    !raw || typeof raw !== "object" || !raw.companies
      ? null
      : {
          version: raw.version ?? 1,
          companies: raw.companies as Record<string, FeedCompany>,
          people: (raw.people ?? {}) as Record<string, PersonFeed>,
          mna: raw.mna as MnaBoard | undefined,
          updatedAt: raw.updatedAt ?? null,
          spendUsd: raw.spendUsd,
        };
  (globalThis as any).__MI_FEED_CACHE__ = { at: Date.now(), feed };
  return feed;
}

function itemDates(company: FeedCompany): number[] {
  const out: number[] = [];
  for (const p of company.posts) if (p.date) out.push(Date.parse(p.date));
  for (const n of company.news) if (n.published) out.push(Date.parse(n.published));
  return out.filter((t) => Number.isFinite(t));
}

/** Items per week, oldest week first, for the 12-week activity line. */
export function weeklyTrend(company: FeedCompany): {
  points: number[];
  labels: string[];
} {
  const now = Date.now();
  const week = 7 * 86_400_000;
  const points = new Array(12).fill(0);
  const labels: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    labels.push(
      new Date(now - i * week).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    );
  }
  for (const t of itemDates(company)) {
    const weeksAgo = Math.floor((now - t) / week);
    if (weeksAgo >= 0 && weeksAgo < 12) points[11 - weeksAgo] += 1;
  }
  return { points, labels };
}

/**
 * Last 30 days of market noise vs the 30 before. When the earlier month has
 * fewer than 5 items the percentage would be honest arithmetic on a dishonest
 * sample (news feeds lean recent), producing "+1800%" nonsense — so `pct` is
 * null there and the UI shows the plain count instead.
 */
export function momentum(company: FeedCompany): {
  pct: number | null;
  thisMonth: number;
} {
  const now = Date.now();
  const month = 30 * 86_400_000;
  let current = 0;
  let previous = 0;
  for (const t of itemDates(company)) {
    if (t > now - month) current += 1;
    else if (t > now - 2 * month) previous += 1;
  }
  if (previous < 5) return { pct: null, thisMonth: current };
  return {
    pct: Math.round(((current - previous) / previous) * 100),
    thisMonth: current,
  };
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
// Keyword rules over real items. Each signal cites the item it came from; the
// "why" line explains why that KIND of event matters to a seller, and is the
// same for every company — editorial framing, not a generated fact.
const SIGNAL_RULES: { kind: MiSignalKind; pattern: RegExp; why: string }[] = [
  {
    kind: "leadership",
    pattern:
      /appoint|named (as )?(chief|ceo|cfo|coo|president|head)|new (ceo|cfo|coo|chief)|steps down|succeed(s|ing)? .{0,24}as |resign/i,
    why: "New leaders revisit vendors and priorities in their first quarter. Reach out before the shortlist forms.",
  },
  {
    kind: "regulatory",
    pattern:
      /\bfda\b|\bema\b|\bchmp\b|approval|clearance|submission|\bfiling\b|\bnda\b|\bmaa\b|510\(k\)|regulatory|pharmacovigilance|label(ing)? change/i,
    why: "Regulatory movement is exactly where Freyr helps. Timely outreach lands while the work is being scoped.",
  },
  {
    kind: "deal",
    pattern:
      /acquir|merger|partnership|collaborat|agreement|licens(e|ing)|joint venture|to buy\b|takeover/i,
    why: "Deals reshuffle platforms and partners. Integration windows open doors that are normally shut.",
  },
  {
    kind: "expansion",
    pattern:
      /expand(s|ing|sion)?|new (facility|plant|site|campus|hub)|invest(s|ing|ment)|opens? (a|its|new)|capacity|enters? .{0,20}market/i,
    why: "New markets and sites bring new registrations and compliance work from day one.",
  },
  {
    kind: "hiring",
    pattern:
      /\bhiring\b|we're hiring|open roles?|join (our|the) team|now recruiting|careers at/i,
    why: "Team growth signals budget and new initiatives. A good moment to be in the room.",
  },
];

export function deriveSignals(
  company: FeedCompany,
  allNames: { id: string; name: string }[]
): { signals: LiveSignal[]; competitorMentions: { name: string; count: number }[] } {
  const signals: LiveSignal[] = [];
  const mentionCounts = new Map<string, number>();
  const others = allNames.filter(
    (n) => n.id !== company.id && n.name.length > 3
  );

  const scan = (
    text: string,
    title: string,
    sourceLabel: string,
    url: string,
    date: string | null
  ) => {
    for (const rule of SIGNAL_RULES) {
      if (rule.pattern.test(text)) {
        signals.push({ kind: rule.kind, title, sourceLabel, url, date, why: rule.why });
        break; // one kind per item: the strongest match wins by rule order
      }
    }
    for (const other of others) {
      if (text.toLowerCase().includes(other.name.toLowerCase())) {
        mentionCounts.set(other.name, (mentionCounts.get(other.name) ?? 0) + 1);
        if (
          !signals.some((s) => s.url === url && s.kind === "competitor")
        ) {
          signals.push({
            kind: "competitor",
            title,
            sourceLabel,
            url,
            date,
            why: "A rival is in their conversation. Know the context before the next call.",
          });
        }
      }
    }
  };

  for (const n of company.news) {
    scan(n.title, n.title, n.source, n.url, n.published);
  }
  for (const p of company.posts) {
    const firstLine = p.text.split("\n")[0].slice(0, 110);
    scan(p.text, firstLine, "LinkedIn post", p.url, p.date);
  }

  // Newest first, one signal per source item, capped so the lens stays a
  // shortlist rather than a second feed.
  const seen = new Set<string>();
  const unique = signals
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })
    .slice(0, 8);

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
    name: string;
    role: string;
    photoUrl?: string;
    posts: FeedPost[];
  }[] = []
): LiveBriefing {
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const posts: BriefingPost[] = [
    ...company.posts,
    ...peoplePosts.flatMap((person) =>
      person.posts.map((p) => ({
        ...p,
        by: { name: person.name, role: person.role, photoUrl: person.photoUrl },
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
  const windowed: FeedCompany = { ...company, posts, news };
  const { points, labels } = weeklyTrend(windowed);
  const { signals, competitorMentions } = deriveSignals(windowed, allNames);
  const mo = momentum(windowed);
  return {
    id: company.id,
    group: company.group === "competitor" ? ("competitor" as const) : ("customer" as const),
    name: company.name,
    followerCount: company.author?.followerCount ?? null,
    logoUrl: company.author?.logoUrl ?? null,
    tldr: company.tldr ?? null,
    fetchedAt: company.fetchedAt,
    updatedLabel: updatedLabel(company.fetchedAt),
    momentumPct: mo.pct,
    itemsThisMonth: mo.thisMonth,
    trend: points,
    trendLabels: labels,
    posts,
    news,
    signals,
    competitorMentions,
  };
}

/** Names for competitor detection: everything on the watch, real and sample. */
export function allTrackedNames(
  feed: MarketIntelFeed | null,
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
