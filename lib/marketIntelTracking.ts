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
  /** "auto-baseline" for people the discovery script added; absent for
   *  people a teammate added by hand. */
  source?: string;
};

export type TrackedCompany = {
  id: string;
  name: string;
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

export async function readMarketIntelTracking(): Promise<MarketIntelTracking> {
  if (!hasTrackingDatabase()) return structuredClone(EMPTY);
  const { data, error } = await trackingClient()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId())
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load the tracking list: ${error.message}`);
  }
  return normalize(data?.catalog);
}

async function saveMarketIntelTracking(
  next: MarketIntelTracking
): Promise<void> {
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
