import { getDataMode } from "./dataMode";
import { MI_COMPANIES } from "./marketIntelMock";

/**
 * WHO THE TEAM TRACKS, DURABLY. The sample briefings in marketIntelMock.ts
 * show what Market Intelligence looks like when the feeds run; this module is
 * the real half that already works: which companies and people the team has
 * asked to follow. It persists in the same `offering_catalog_state` document
 * table the offerings catalogue uses (id text pk + jsonb), under its own row
 * ids, so no new migration is needed and mock/real stay separate rows.
 *
 * Nothing here fabricates data about the real companies and people that get
 * added: a tracked company shows an honest "first briefing after the next
 * refresh" state until Anir's feed wiring fills it in.
 */

export type TrackedPerson = {
  id: string;
  companyId: string;
  name: string;
  role: string;
  linkedinUrl: string;
  addedAt: string;
  /** LinkedIn profile photo, when discovery or the team provided one. */
  photoUrl?: string;
  /** Their full LinkedIn headline, exactly as it reads on the profile. */
  headline?: string;
  /** "City, Region, Country" as LinkedIn shows it. */
  location?: string;
  /** The About paragraph, when a profile scrape included it. */
  about?: string;
  followerCount?: number;
  /** "auto-baseline" for people the discovery script added; absent for
   *  people a teammate added by hand. */
  source?: string;
};

export type TrackedCompany = {
  id: string;
  name: string;
  /** Which intelligence tab owns it; absent means customer. */
  group?: "customer" | "competitor";
  industry: string;
  hq: string;
  website: string;
  linkedinUrl: string;
  competitors: string[];
  keywords: string[];
  note: string;
  addedAt: string;
};

export type MarketIntelTracking = {
  companies: TrackedCompany[];
  people: TrackedPerson[];
};

const EMPTY: MarketIntelTracking = { companies: [], people: [] };

export function miSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "company"
  );
}

/** linkedin.com only — anything else is not a LinkedIn page and never gets
 *  stored as one. Accepts both /company/x pages and /in/x profiles. */
export function cleanLinkedInUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  return `https://${host}${url.pathname.replace(/\/$/, "")}`;
}

export function cleanWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    return url.origin + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return null;
  }
}

/** "a, b, c" (or newline-separated) → clean deduped list. */
export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const item = part.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 12);
}

function hasTrackingDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function trackingClient() {
  // Required lazily, same as the offerings catalogue adapter, so the Supabase
  // SDK never rides into a client bundle through this module's types.
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function rowId(): string {
  return getDataMode() === "live" ? "market-intel:default" : "market-intel:mock";
}

function normalize(value: unknown): MarketIntelTracking {
  if (!value || typeof value !== "object") return structuredClone(EMPTY);
  const raw = value as Partial<MarketIntelTracking>;
  return {
    companies: Array.isArray(raw.companies) ? raw.companies : [],
    people: Array.isArray(raw.people) ? raw.people : [],
  };
}

// Same one-minute process cache as the feed (see marketIntelFeed.ts): tab
// clicks stop re-reading rows that change a few times a day. Keyed per data
// mode so mock and real never serve each other's list.
const TRACKING_CACHE_MS = 60_000;

export function bustMarketIntelTrackingCache(): void {
  (globalThis as any).__MI_TRACKING_CACHE__ = undefined;
}

/**
 * THE SHOWROOM'S TRACKED LIST, AS A FLOOR.
 *
 * Mock has to look like a workspace somebody has been using (Anir's standing
 * rule), and this row was only ever written by hand, by
 * scripts/mock/fill-market-intel.ts. Any database that script had not been run
 * against showed a wall of sample briefings next to a tracked section with
 * nothing in it at all.
 *
 * Deliberately a SUBSET of that script's list, sharing its ids and its
 * `mockgen-` prefix, so running the script later replaces these rows cleanly
 * rather than stacking a second copy of the same companies beside them. The
 * script stays the rich fill; this is the floor under it.
 *
 * Invented companies and invented people only, exactly as the script has it.
 */
const SHOWROOM_TRACKED: [
  string,
  string,
  "customer" | "competitor",
  string,
  string,
  string[],
  string,
  [string, string][]
][] = [
  [
    "westmere-labs",
    "Westmere Labs",
    "customer",
    "Contract manufacturing",
    "Zurich, Switzerland",
    ["CDMO", "site transfers", "variations"],
    "Added after the DIA conversation. Two site transfers coming, which is a variation programme.",
    [
      ["Nadine Aebischer", "Head of Regulatory Affairs"],
      ["Rowan Ashworth", "Site Transfer Programme Lead"],
    ],
  ],
  [
    "penhale-therapeutics",
    "Penhale Therapeutics",
    "customer",
    "Clinical-stage biopharma",
    "Bristol, UK",
    ["first filing", "MHRA", "EMA"],
    "Pre-revenue, first filing inside two years. Watch for a Head of Regulatory hire.",
    [
      ["Imogen Trelawney", "VP, Development Operations"],
      ["Kofi Mensah-Boateng", "Regulatory Consultant"],
    ],
  ],
  [
    "aldergrove-devices",
    "Aldergrove Devices",
    "customer",
    "Medical devices",
    "Vancouver, Canada",
    ["MDR", "technical documentation", "notified body"],
    "Still remediating MDR. Their notified body slot is the constraint, not their team.",
    [
      ["Marisol Guerrero", "Director, Quality and Regulatory"],
      ["Henrik Solberg", "Technical File Owner"],
    ],
  ],
  [
    "starling-consumer",
    "Starling Consumer Brands",
    "customer",
    "Consumer health",
    "Melbourne, Australia",
    ["artwork", "claims", "APAC registration"],
    "Artwork-led. Came in through the Freya.Artwork webinar list.",
    [
      ["Tui Ngataki", "Regulatory and Artwork Manager"],
      ["Deepa Raghunathan", "APAC Registration Lead"],
    ],
  ],
  [
    "hollowfield-bio",
    "Hollowfield Bio",
    "customer",
    "Gene therapy",
    "Cambridge, USA",
    ["ATMP", "PRIME", "first-in-human"],
    "First ATMP filing in eighteen months. They have never done one and they know it.",
    [
      ["Marguerite Okonjo", "Head of Regulatory Affairs"],
      ["Teodor Vasiliev", "ATMP Programme Lead"],
    ],
  ],
  [
    "seabright-generics",
    "Seabright Generics",
    "customer",
    "Generics",
    "Hyderabad, India",
    ["ANDA", "renewals", "variations"],
    "Four hundred registrations and a two-person renewals team. Volume is the pitch.",
    [
      ["Lakshmi Venkataraman", "Head of Renewals"],
      ["Arun Pillai", "Variations Manager"],
    ],
  ],
  [
    "cobalt-regulatory",
    "Cobalt Regulatory Group",
    "competitor",
    "Regulatory consultancy",
    "Philadelphia, USA",
    ["services", "publishing", "outsourcing"],
    "Competing with us on services deals in North America. Watch their hiring.",
    [
      ["Vance Pemberton", "Managing Director"],
      ["Simone Auclair", "Head of Publishing Services"],
    ],
  ],
  [
    "quorum-rim",
    "Quorum RIM",
    "competitor",
    "Regulatory software",
    "Boston, USA",
    ["RIM", "registrations", "platform"],
    "New entrant, aggressive on price. Turned up in two of our shortlists this quarter.",
    [
      ["Dallas Weatherby", "VP, Product"],
      ["Ingeborg Haugland", "Director, Solution Consulting"],
    ],
  ],
];

/* Fixed anchor rather than Date.now(), so the dates on these rows are the same
   on every machine and a screenshot taken today still matches one taken last
   week. Same anchor the fill script uses. */
const SHOWROOM_TRACKED_ANCHOR = Date.parse("2026-08-20T09:00:00.000Z");

function showroomTracking(): MarketIntelTracking {
  const day = (n: number) =>
    new Date(SHOWROOM_TRACKED_ANCHOR + n * 86_400_000).toISOString();
  const companies: TrackedCompany[] = [];
  const people: TrackedPerson[] = [];
  SHOWROOM_TRACKED.forEach(
    ([id, name, group, industry, hq, keywords, note, roster], index) => {
      companies.push({
        id: `mockgen-${id}`,
        name,
        group,
        industry,
        hq,
        website: `https://${id.replace(/-/g, "")}.example`,
        /* Blank on purpose: an invented slug can land on a real person's or
           company's page, and the card hides the chip when it is empty. */
        linkedinUrl: "",
        competitors: [],
        keywords,
        note,
        addedAt: day(-90 + index * 11),
      });
      roster.forEach(([person, role], seat) => {
        people.push({
          id: `mockgen-person-${index * 10 + seat + 1}`,
          companyId: `mockgen-${id}`,
          name: person,
          role,
          linkedinUrl: "",
          headline: role,
          addedAt: day(-80 + index * 4 + seat),
        });
      });
    }
  );
  return { companies, people };
}

export async function readMarketIntelTracking(): Promise<MarketIntelTracking> {
  if (!hasTrackingDatabase()) return structuredClone(EMPTY);
  const row = rowId();
  const cached = (globalThis as any).__MI_TRACKING_CACHE__ as
    | { at: number; row: string; tracking: MarketIntelTracking }
    | undefined;
  if (cached && cached.row === row && Date.now() - cached.at < TRACKING_CACHE_MS) {
    return cached.tracking;
  }
  const { data, error } = await trackingClient()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", row)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load the tracking list: ${error.message}`);
  }
  let tracking = normalize(data?.catalog);
  /* SEED THE SHOWROOM ONCE, AND ONLY WHEN THE ROW HAS NEVER EXISTED. Same
     contract lib/contracts.ts uses: the samples become an ordinary row that
     can then be added to, edited and emptied, and a demo somebody has
     deliberately cleared out stays cleared. Real mode is never seeded. */
  if (getDataMode() === "mock" && !data) {
    tracking = showroomTracking();
    await trackingClient()
      .from("offering_catalog_state")
      .upsert({ id: row, catalog: tracking, updated_at: new Date().toISOString() })
      .then(
        () => undefined,
        () => undefined
      );
  }
  (globalThis as any).__MI_TRACKING_CACHE__ = { at: Date.now(), row, tracking };
  return tracking;
}

async function saveMarketIntelTracking(
  next: MarketIntelTracking
): Promise<void> {
  bustMarketIntelTrackingCache();
  if (!hasTrackingDatabase()) {
    throw new Error("Tracking needs the configured database.");
  }
  const { error } = await trackingClient()
    .from("offering_catalog_state")
    .upsert({
      id: rowId(),
      catalog: next,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    throw new Error(`Could not save the tracking list: ${error.message}`);
  }
}

const SAMPLE_IDS = new Set(MI_COMPANIES.map((c) => c.id));

export type TrackCompanyInput = {
  name: string;
  industry?: string;
  hq?: string;
  website?: string;
  linkedinUrl?: string;
  competitors?: string;
  keywords?: string;
  note?: string;
  people?: { name?: string; role?: string; linkedinUrl?: string }[];
};

export async function trackCompany(
  input: TrackCompanyInput
): Promise<{ company: TrackedCompany; people: TrackedPerson[] }> {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new Error("The company needs a name.");
  const id = miSlug(name);
  const tracking = await readMarketIntelTracking();
  if (SAMPLE_IDS.has(id) || tracking.companies.some((c) => c.id === id)) {
    throw new Error(`${name} is already being tracked.`);
  }
  const linkedinUrl = cleanLinkedInUrl(String(input.linkedinUrl ?? ""));
  if (linkedinUrl === null) {
    throw new Error(
      "That LinkedIn address doesn't look right. It should look like https://www.linkedin.com/company/their-name"
    );
  }
  const website = cleanWebsiteUrl(String(input.website ?? ""));
  if (website === null) {
    throw new Error("That website address doesn't look right.");
  }
  const now = new Date().toISOString();
  const company: TrackedCompany = {
    id,
    name,
    industry: String(input.industry ?? "").trim().slice(0, 60),
    hq: String(input.hq ?? "").trim().slice(0, 60),
    website,
    linkedinUrl,
    competitors: splitList(String(input.competitors ?? "")),
    keywords: splitList(String(input.keywords ?? "")),
    note: String(input.note ?? "").trim().slice(0, 400),
    addedAt: now,
  };
  const people: TrackedPerson[] = [];
  for (const row of input.people ?? []) {
    const personName = String(row?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!personName) continue;
    const personLinkedIn = cleanLinkedInUrl(String(row?.linkedinUrl ?? ""));
    people.push({
      id: `${id}-${miSlug(personName)}-${people.length}`,
      companyId: id,
      name: personName,
      role: String(row?.role ?? "").trim().slice(0, 80),
      linkedinUrl: personLinkedIn === null ? "" : personLinkedIn,
      addedAt: now,
    });
  }
  tracking.companies.push(company);
  tracking.people.push(...people);
  await saveMarketIntelTracking(tracking);
  return { company, people };
}

export type TrackPersonInput = {
  companyId: string;
  name: string;
  role?: string;
  linkedinUrl?: string;
};

export async function trackPerson(
  input: TrackPersonInput
): Promise<TrackedPerson> {
  const companyId = String(input.companyId ?? "").trim();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new Error("The person needs a name.");
  const tracking = await readMarketIntelTracking();
  const knownCompany =
    SAMPLE_IDS.has(companyId) ||
    tracking.companies.some((c) => c.id === companyId);
  if (!knownCompany) throw new Error("That company isn't tracked any more.");
  const duplicate = tracking.people.some(
    (p) =>
      p.companyId === companyId &&
      p.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) throw new Error(`${name} is already on the tracked list.`);
  const linkedinUrl = cleanLinkedInUrl(String(input.linkedinUrl ?? ""));
  if (linkedinUrl === null) {
    throw new Error(
      "That LinkedIn address doesn't look right. It should look like https://www.linkedin.com/in/their-name"
    );
  }
  const person: TrackedPerson = {
    id: `${companyId}-${miSlug(name)}-${Date.now().toString(36)}`,
    companyId,
    name,
    role: String(input.role ?? "").trim().slice(0, 80),
    linkedinUrl,
    addedAt: new Date().toISOString(),
  };
  tracking.people.push(person);
  await saveMarketIntelTracking(tracking);
  return person;
}

export async function untrackCompany(id: string): Promise<void> {
  const tracking = await readMarketIntelTracking();
  const before = tracking.companies.length;
  tracking.companies = tracking.companies.filter((c) => c.id !== id);
  if (tracking.companies.length === before) return;
  tracking.people = tracking.people.filter((p) => p.companyId !== id);
  await saveMarketIntelTracking(tracking);
}

export async function untrackPerson(id: string): Promise<void> {
  const tracking = await readMarketIntelTracking();
  const before = tracking.people.length;
  tracking.people = tracking.people.filter((p) => p.id !== id);
  if (tracking.people.length === before) return;
  await saveMarketIntelTracking(tracking);
}
