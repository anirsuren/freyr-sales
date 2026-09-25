import { assertCompanyAdditionAllowed } from "./marketIntelCompanyLimit";
import { marketIntelDatabaseConfig } from "./marketIntelDatabase";
import { getDataMode } from "./dataMode";
import { MI_COMPANIES } from "./marketIntelMock";
import { COMPANY_SOURCES, COMPETITOR_SOURCES, type CompanySource } from "./marketIntelSources";
import { FROZEN_WORKSPACE_TRACKING } from "./marketIntelFrozenWorkspace";
import { marketIntelLogoUrl } from "./marketIntelLogo";
import type { Division } from "./offeringMaterials";

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
  photoCheckedAt?: string;
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
  onboarding?: {stage?: import('./marketIntelTrackProgress').TrackStage; stageStartedAt?: string; status:'queued'|'collecting'|'failed'; requestedName?:string; attempts:number; updatedAt:string; error?:string; lease?:string; leaseUntil?:number};
  newsQuery?: string;
  logoUrl?: string;
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
  /** Freyr divisions this company belongs to: MPR, MDV, CON (Saras, Sep 10). */
  divisions?: Division[];
  /** Who put it on the watch. Absent on rows from before Sep 10. */
  addedBy?: { id: string; name?: string; email?: string };
  /** Came from the code's seed list; keeps the scraper's own settings. */
  seed?: boolean;
  /** On the standing list (Anir, Sep 11: "all of these current ones are
   *  active by default"): collected every day even when nobody has it
   *  ticked. A company added later is collected while somebody has it. */
  activeByDefault?: boolean;
  scrape?: {
    li: string[] | null;
    expect: string;
    newsQ?: string;
    site?: string;
  };
};

export type MarketIntelTracking = {
  demoVersion?: number;
  mockHiddenStories?: Record<string,string[]>;
  companies: TrackedCompany[];
  people: TrackedPerson[];
  /**
   * DIVISIONS BY COMPANY ID, for every company on the watch including the
   * built-in list, which has no row of its own here. A tag set in the app
   * lands in this map and wins over the code's starting answer.
   */
  divisions?: Record<string, Division[]>;
  /** Seed companies an admin deleted for good, so the seed never returns. */
  removedSeeds?: string[];
};

const EMPTY: MarketIntelTracking = { companies: [], people: [], divisions: {}, removedSeeds: [] };

/**
 * WHO HAS A COMPANY: followers by company id, read from every person's own
 * list. The registry says what a company is; this says whether anybody
 * wants it.
 */
export type Followers = Record<string, string[]>;

/**
 * ACTIVE MEANS IT IS COLLECTED, and there are two ways to be.
 *
 * - On the standing list (Anir, Sep 11: "These are the set ones. If someone
 *   wants to add something else, they can, but all of these current ones are
 *   active by default"). Every company in the catalogue that day carries
 *   `activeByDefault` and stays collected with nobody ticking it.
 * - Somebody has it ticked (Anir, Sep 10). That is how a company added later
 *   stays collected, and the last person unticking it stops it.
 *
 * The old `standing: true` on the August rows is dead data and still ignored.
 */
export function isActiveCompany(company: TrackedCompany, followers: Followers): boolean {
  return company.activeByDefault === true || (followers[company.id]?.length ?? 0) > 0;
}

/** How many people have this company on their list. */
export function followerCount(companyId: string, followers: Followers): number {
  return followers[companyId]?.length ?? 0;
}

/**
 * THE SEED LIST BECOMES ORDINARY ENTRIES (Anir, Sep 10: "I should be able
 * to add and remove stuff"). Every built-in customer and competitor joins the
 * catalogue once, with the scraper settings it always had, and from then on
 * it is a row like any other: it waits in Manage companies until somebody
 * ticks it, an admin can delete it, and a deleted seed stays deleted.
 */
export function seedCompanies(tracking: MarketIntelTracking): number {
  const removed = new Set(tracking.removedSeeds ?? []);
  const have = new Set(tracking.companies.map((c) => c.id));
  let added = 0;
  const add = (source: CompanySource, group: "customer" | "competitor") => {
    if (have.has(source.id) || removed.has(source.id)) return;
    tracking.companies.push({
      id: source.id,
      name: source.name,
      group,
      industry: "",
      hq: "",
      website: source.site ? `https://${source.site}` : "",
      linkedinUrl: source.li?.[0] ? `https://www.linkedin.com/company/${source.li[0]}` : "",
      competitors: [],
      keywords: [],
      note: "",
      addedAt: "2026-08-11T00:00:00.000Z",
      addedBy: { id: "workspace", name: "Built in" },
      seed: true,
      activeByDefault: true,
      scrape: {
        li: source.li,
        expect: source.expect,
        ...(source.newsQ ? { newsQ: source.newsQ } : {}),
        ...(source.site ? { site: source.site } : {}),
      },
      ...(source.divisions && source.divisions.length > 0
        ? { divisions: cleanDivisions(source.divisions) }
        : {}),
    });
    have.add(source.id);
    added += 1;
  };
  for (const source of COMPANY_SOURCES) add(source, "customer");
  for (const source of COMPETITOR_SOURCES) add(source, "competitor");
  return added;
}


export const DIVISION_VALUES: Division[] = ["MPR", "MDV", "CON"];

/** Only the three real values, deduplicated, in the house order. */
export function cleanDivisions(value: unknown): Division[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const set = new Set(raw.map((v) => String(v).trim().toUpperCase()));
  return DIVISION_VALUES.filter((d) => set.has(d));
}

/** The divisions the app should show for a company: the tracking row's map
 *  first, then the company's own record, then whatever the caller knows. */
export function companyDivisions(
  tracking: Pick<MarketIntelTracking, "companies" | "divisions">,
  id: string,
  fallback: Division[] = []
): Division[] {
  const fromMap = tracking.divisions?.[id];
  if (fromMap && fromMap.length > 0) return cleanDivisions(fromMap);
  const own = tracking.companies.find((c) => c.id === id)?.divisions;
  if (own && own.length > 0) return cleanDivisions(own);
  return cleanDivisions(fallback);
}


/** The tracked company whose LinkedIn page carries this slug, if any. */
export function findTrackedByLinkedInSlug(
  tracking: Pick<MarketIntelTracking, "companies">,
  slug: string
): TrackedCompany | undefined {
  const want = slug.toLowerCase();
  return tracking.companies.find((c) => {
    const got = c.linkedinUrl.match(/\/company\/([^/?#]+)/i)?.[1]?.toLowerCase();
    return got === want;
  });
}

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
    marketIntelDatabaseConfig(getDataMode()).url &&
    marketIntelDatabaseConfig(getDataMode()).key
  );
}

function trackingClient() {
  // Required lazily, same as the offerings catalogue adapter, so the Supabase
  // SDK never rides into a client bundle through this module's types.
  return require("@supabase/supabase-js").createClient(
    marketIntelDatabaseConfig(getDataMode()).url!,
    marketIntelDatabaseConfig(getDataMode()).key!,
    { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } }
  );
}

function rowId(): string {
  return getDataMode() === "live" ? "market-intel:default" : "market-intel:mock";
}

function normalize(value: unknown): MarketIntelTracking {
  if (!value || typeof value !== "object") return structuredClone(EMPTY);
  const raw = value as Partial<MarketIntelTracking>;
  const divisions: Record<string, Division[]> = {};
  if (raw.divisions && typeof raw.divisions === "object") {
    for (const [id, list] of Object.entries(raw.divisions)) {
      const clean = cleanDivisions(list);
      if (clean.length > 0) divisions[id] = clean;
    }
  }
  return {
    companies: Array.isArray(raw.companies)
      ? raw.companies.map((company) => ({ ...company, logoUrl: marketIntelLogoUrl(company.name, company.logoUrl) ?? undefined }))
      : [],
    people: Array.isArray(raw.people) ? raw.people : [],
    divisions,
    mockHiddenStories: raw.mockHiddenStories,
    demoVersion: raw.demoVersion,
    removedSeeds: Array.isArray(raw.removedSeeds)
      ? raw.removedSeeds.filter((v): v is string => typeof v === "string")
      : [],
  };
}

// Re-read on navigation to see edits from the other environment. Entries
// remain keyed by data mode so mock and real never serve each other's list.
const TRACKING_CACHE_MS = 0; // Read the shared store on navigation across environments.

export function bustMarketIntelTrackingCache(): void {
  (globalThis as any).__MI_TRACKING_CACHE__ = undefined;
}

/** The review workspace is a committed snapshot of real public material. */
const MOCK_SNAPSHOT_VERSION = 2026092402;
const RETIRED_MOCK_COMPETITORS = new Set(["calyx", "lorenz", "sgk", "propharma-group"]);
function showroomTracking(): MarketIntelTracking {
  return structuredClone(FROZEN_WORKSPACE_TRACKING);
}

export async function readMarketIntelTracking(options?: {
  /** Skip the minute-long cache: every write starts from this, so a change
   *  made a moment ago by anyone is never written over. */
  fresh?: boolean;
}): Promise<MarketIntelTracking> {
  if (!hasTrackingDatabase()) return getDataMode() === "mock" ? showroomTracking() : structuredClone(EMPTY);
  const row = rowId();
  const cached = (globalThis as any).__MI_TRACKING_CACHE__ as
    | { at: number; row: string; tracking: MarketIntelTracking }
    | undefined;
  if (!options?.fresh && cached && cached.row === row && Date.now() - cached.at < TRACKING_CACHE_MS) {
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
  /* Replace the retired invented showroom rows once, preserve companies a
     reviewer added themselves, and keep deleted snapshot seeds deleted. */
  const missingSnapshotCompany = getDataMode() === "mock" && FROZEN_WORKSPACE_TRACKING.companies.some(
    company => !(tracking.removedSeeds ?? []).includes(company.id) && !tracking.companies.some(saved => saved.id === company.id),
  );
  if (getDataMode() === "mock" && (tracking.demoVersion !== MOCK_SNAPSHOT_VERSION || missingSnapshotCompany)) {
    const snapshot = showroomTracking();
    const snapshotIds = new Set(snapshot.companies.map((company) => company.id));
    const removed = new Set(tracking.removedSeeds ?? []);
    const keptCompanies = tracking.companies.filter(
      (company) => !company.id.startsWith("mockgen-") && !snapshotIds.has(company.id) && !RETIRED_MOCK_COMPETITORS.has(company.id),
    );
    const keptPeople = tracking.people.filter(
      (person) => !person.id.startsWith("mockgen-") && !snapshotIds.has(person.companyId),
    );
    const seededCompanies = snapshot.companies.filter((company) => !removed.has(company.id));
    const seededIds = new Set(seededCompanies.map((company) => company.id));
    tracking = {
      ...tracking,
      companies: [...keptCompanies, ...seededCompanies],
      people: [...keptPeople, ...snapshot.people.filter((person) => seededIds.has(person.companyId))],
      divisions: {
        ...(tracking.divisions ?? {}),
        ...(snapshot.divisions ?? {}),
      },
      demoVersion: MOCK_SNAPSHOT_VERSION,
    };
    const { error: seedError } = await trackingClient().from("offering_catalog_state").upsert({id:row,catalog:tracking,updated_at:new Date().toISOString()});
    if (seedError) throw new Error(`Could not populate Market Intelligence: ${seedError.message}`);
  }
  /* REAL MODE: the code's seed list joins the catalogue once, unticked, so
     nobody's page fills up by itself. Idempotent, and a seed an admin
     deleted never comes back. */
  if (getDataMode() === "live" && seedCompanies(tracking) > 0) {
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

export type TrackMeta = {
  additionLimit?: number;
  addedBy?: TrackedCompany["addedBy"];
  divisions?: Division[];
};

export async function trackCompany(
  input: TrackCompanyInput,
  meta: TrackMeta = {}
): Promise<{ company: TrackedCompany; people: TrackedPerson[] }> {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new Error("The company needs a name.");
  const id = miSlug(name);
  const tracking = await readMarketIntelTracking({ fresh: true });
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
    ...(meta.divisions && meta.divisions.length > 0
      ? { divisions: cleanDivisions(meta.divisions) }
      : {}),
    ...(meta.addedBy ? { addedBy: meta.addedBy } : {}),
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
  assertCompanyAdditionAllowed(tracking.companies, meta.addedBy?.id, meta.additionLimit);
  tracking.companies.push(company);
  tracking.people.push(...people);
  if (company.divisions) {
    tracking.divisions = { ...(tracking.divisions ?? {}), [id]: company.divisions };
  }
  await saveMarketIntelTracking(tracking);
  return { company, people };
}

/** Tag a company, on the watch or on the built-in list, with its divisions. */
export async function setCompanyDivisions(
  id: string,
  divisions: Division[]
): Promise<Division[]> {
  const clean = cleanDivisions(divisions);
  const key = String(id ?? "").trim();
  if (!key) throw new Error("Which company?");
  const tracking = await readMarketIntelTracking({ fresh: true });
  const next = { ...(tracking.divisions ?? {}) };
  if (clean.length > 0) next[key] = clean;
  else delete next[key];
  tracking.divisions = next;
  const own = tracking.companies.find((c) => c.id === key);
  if (own) {
    if (clean.length > 0) own.divisions = clean;
    else delete own.divisions;
  }
  await saveMarketIntelTracking(tracking);
  return clean;
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
  const tracking = await readMarketIntelTracking({ fresh: true });
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

/** Customer or competitor: which tab it lives on (admins). */
export async function setCompanyGroup(
  id: string,
  group: "customer" | "competitor"
): Promise<TrackedCompany> {
  const tracking = await readMarketIntelTracking({ fresh: true });
  const company = tracking.companies.find((c) => c.id === id);
  if (!company) throw new Error("That company isn't on the watch.");
  company.group = group;
  await saveMarketIntelTracking(tracking);
  return company;
}

/**
 * GONE FOR GOOD (admins): the registry entry, its people and its division
 * tag. A seed stays gone. The company's feed rows and everybody's follows are
 * removed by the caller, which has the store and the lists in hand.
 */
export async function deleteCompanyForGood(id: string): Promise<{ wasSeed: boolean; found: boolean }> {
  const tracking = await readMarketIntelTracking({ fresh: true });
  const company = tracking.companies.find((c) => c.id === id);
  if (!company) return { wasSeed: false, found: false };
  tracking.companies = tracking.companies.filter((c) => c.id !== id);
  tracking.people = tracking.people.filter((p) => p.companyId !== id);
  if (tracking.divisions?.[id]) {
    const next = { ...tracking.divisions };
    delete next[id];
    tracking.divisions = next;
  }
  if (company.seed) {
    tracking.removedSeeds = [...new Set([...(tracking.removedSeeds ?? []), id])];
  }
  await saveMarketIntelTracking(tracking);
  return { wasSeed: !!company.seed, found: true };
}

export async function untrackCompany(id: string): Promise<void> {
  const tracking = await readMarketIntelTracking({ fresh: true });
  const before = tracking.companies.length;
  tracking.companies = tracking.companies.filter((c) => c.id !== id);
  if (tracking.companies.length === before) return;
  tracking.people = tracking.people.filter((p) => p.companyId !== id);
  // Its division tag goes with it; a company added again starts clean.
  if (tracking.divisions?.[id]) {
    const next = { ...tracking.divisions };
    delete next[id];
    tracking.divisions = next;
  }
  await saveMarketIntelTracking(tracking);
}

export async function untrackPerson(id: string): Promise<void> {
  const tracking = await readMarketIntelTracking({ fresh: true });
  const before = tracking.people.length;
  tracking.people = tracking.people.filter((p) => p.id !== id);
  if (tracking.people.length === before) return;
  await saveMarketIntelTracking(tracking);
}

/** Story moderation in the sample workspace never writes real feed rows. */
export async function hideMockIntelStories(companyId:string, urls:string[]) {
  if (getDataMode() !== "mock") throw new Error("This action is unavailable in the current workspace.");
  const tracking = await readMarketIntelTracking({fresh:true});
  const prior = tracking.mockHiddenStories?.[companyId] ?? [];
  tracking.mockHiddenStories = {...tracking.mockHiddenStories,[companyId]:[...new Set([...prior,...urls])]};
  await saveMarketIntelTracking(tracking);
  return urls.length;
}
