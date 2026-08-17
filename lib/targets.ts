import { getDataMode } from "./dataMode";
import {
  TARGET_DOMAINS,
  type TargetAccount,
  type TargetDomain,
  type TargetsState,
} from "./targetsShared";

/**
 * TARGET ACCOUNTS — storage. Same one-row pattern as opportunities and the
 * activity master: a row in offering_catalog_state, mock and real split.
 * Real holds the imported sheet (see scripts/import-targets.mjs); mock is a
 * seeded sample so the tab looks full in demo mode and never accepts writes.
 */

const ROW_ID = "targets";

function activeRowId(): string {
  try {
    return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
  } catch {
    return ROW_ID;
  }
}

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeOne(raw: unknown, index: number): TargetAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 160);
  if (!name) return null;
  const domain = (TARGET_DOMAINS as readonly string[]).includes(
    String(r.domain ?? "").toUpperCase()
  )
    ? (String(r.domain).toUpperCase() as TargetDomain)
    : "MPR";
  const potential = Number(r.potential);
  return {
    id: str(r.id, 60) || `tgt-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    name,
    domain,
    companyRevenue: str(r.companyRevenue, 40) || undefined,
    hq: str(r.hq, 80) || undefined,
    tier: str(r.tier, 40) || undefined,
    owner: str(r.owner, 120) || undefined,
    potential: Number.isFinite(potential) && potential > 0 ? Math.round(potential) : undefined,
    degreeOfConnection: str(r.degreeOfConnection, 20) || undefined,
    quarter: str(r.quarter, 40) || undefined,
    notes: str(r.notes, 400) || undefined,
  };
}

function normalize(raw: unknown): TargetsState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.targets) ? r.targets : [];
  return {
    targets: list
      .slice(0, 1000)
      .map((item, i) => normalizeOne(item, i))
      .filter((t): t is TargetAccount => t !== null),
  };
}

/** A dozen plausible sample rows so the demo tab reads as the finished thing.
 *  Entirely fictional pursuit data — none of the real sheet leaks into mock. */
function mockSeed(): TargetsState {
  const rows: Array<Partial<TargetAccount> & { name: string; domain: TargetDomain }> = [
    { name: "Bayer", domain: "MPR", companyRevenue: "~€48B", hq: "Germany", tier: "Tier 1", owner: "Priya Nair", potential: 400000, quarter: "Q2" },
    { name: "Moderna", domain: "MPR", companyRevenue: "~$7B", hq: "USA", tier: "Tier 1", owner: "Daniel Craig", potential: 250000, quarter: "Q3" },
    { name: "Sandoz", domain: "MPR", companyRevenue: "~$10B", hq: "Switzerland", tier: "Tier 2", owner: "Priya Nair", potential: 150000, quarter: "Q2" },
    { name: "Ipsen", domain: "MPR", companyRevenue: "~€3B", hq: "France", tier: "Tier 2", potential: 90000, quarter: "Q4" },
    { name: "Stryker", domain: "MDV", companyRevenue: "~$20B", tier: "Tier 1", owner: "Daniel Craig", potential: 120000, quarter: "Q3" },
    { name: "Zimmer Biomet", domain: "MDV", companyRevenue: "~$7B", tier: "Tier 2", potential: 60000, quarter: "Q3", notes: "NBD" },
    { name: "Smith+Nephew", domain: "MDV", companyRevenue: "~$5.5B", tier: "Tier 2", owner: "Maya Iyer", potential: 45000, quarter: "Q2" },
    { name: "Coloplast", domain: "MDV", companyRevenue: "~$3.8B", tier: "Tier 3", potential: 20000, quarter: "Q4", notes: "NBD" },
    { name: "Shiseido", domain: "CON", hq: "Japan", tier: "Tier 1", owner: "Maya Iyer", degreeOfConnection: "2", quarter: "Q3 (Oct)" },
    { name: "Beiersdorf", domain: "CON", hq: "Germany", tier: "Tier 1", degreeOfConnection: "1", quarter: "Q3 (Oct)" },
    { name: "Church & Dwight", domain: "CON", hq: "USA", tier: "Tier 2", owner: "Priya Nair", degreeOfConnection: "3", quarter: "Q4" },
    { name: "Natura & Co", domain: "CON", hq: "Brazil", tier: "Tier 2", degreeOfConnection: "2", quarter: "Q4" },
  ];
  return normalize({ targets: rows });
}

export async function readTargets(): Promise<TargetsState> {
  try {
    if (getDataMode() === "mock") return mockSeed();
  } catch {
    /* fall through to the real row */
  }
  if (!hasDatabase()) return { targets: [] };
  try {
    const { data, error } = await client()
      .from("offering_catalog_state")
      .select("catalog")
      .eq("id", activeRowId())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalize(data?.catalog);
  } catch {
    return { targets: [] };
  }
}

async function writeRow(state: TargetsState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

/** Patch one target's pursuit fields (owner, tier, quarter, notes…). */
export async function updateTarget(
  id: string,
  patch: Record<string, unknown>
): Promise<TargetsState> {
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const state = normalize(data?.catalog);
  const idx = state.targets.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("That target is not on the list.");
  const merged = normalizeOne(
    {
      ...state.targets[idx],
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      ),
      id,
    },
    idx
  );
  if (!merged) throw new Error("That change could not be saved.");
  state.targets[idx] = merged;
  await writeRow(state);
  return state;
}

export async function removeTarget(id: string): Promise<TargetsState> {
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const state = normalize(data?.catalog);
  const next = state.targets.filter((t) => t.id !== id);
  if (next.length === state.targets.length)
    throw new Error("That target is not on the list.");
  state.targets = next;
  await writeRow(state);
  return state;
}
