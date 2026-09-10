import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";
import {
  CUSTOMER_NO_RE,
  formatCustomerNo,
  normalizeAddress,
  type CustomerProfile,
  type CustomerProfilesState,
} from "./customerProfilesShared";

/**
 * WHERE A CUSTOMER'S ID, ADDRESSES AND PARENT LIVE (Manoj, Sep 10).
 *
 * The customers table holds who the account is; this row holds the facts
 * Manoj added on top of it, keyed by customer id, so no database migration
 * has to land on dev and production before the code can run. Same storage as
 * customer groups: one row in offering_catalog_state, separate rows for Mock
 * and Real, and one writer at a time.
 *
 * CUSTOMER IDS ARE CUS-0001 STYLE, like OPP-0001 on opportunities: handed out
 * oldest customer first, never reused, and the highest number ever issued is
 * kept so a deleted customer's number is retired rather than recycled.
 */
const ROW_ID = "customer-profiles";

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_CUSTOMER_PROFILES_QUEUE__: Promise<void> | undefined;
}

function activeRowId(): string {
  return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
}

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function normalize(raw: unknown): CustomerProfilesState {
  const r = (raw ?? {}) as { profiles?: unknown; lastCustomerNo?: unknown };
  const profiles: Record<string, CustomerProfile> = {};
  let max =
    typeof r.lastCustomerNo === "number" && Number.isFinite(r.lastCustomerNo)
      ? Math.max(0, Math.floor(r.lastCustomerNo))
      : 0;
  if (r.profiles && typeof r.profiles === "object") {
    for (const [id, value] of Object.entries(r.profiles as Record<string, unknown>)) {
      if (!id || !value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const no = typeof v.customerNo === "string" ? v.customerNo.trim() : "";
      const m = CUSTOMER_NO_RE.exec(no);
      if (!m) continue;
      max = Math.max(max, Number(m[1]));
      const p: CustomerProfile = { customerNo: no };
      const hq = normalizeAddress(v.hq);
      if (hq) p.hq = hq;
      const other = normalizeAddress(v.other);
      if (other) p.other = other;
      if (typeof v.parentId === "string" && v.parentId.trim() && v.parentId.trim() !== id) {
        p.parentId = v.parentId.trim().slice(0, 80);
      }
      if (typeof v.updatedAt === "string") p.updatedAt = v.updatedAt;
      profiles[id] = p;
    }
  }
  return { profiles, lastCustomerNo: max };
}

async function readRowRaw(): Promise<unknown> {
  if (!hasSupabase()) return null;
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

async function writeRow(state: CustomerProfilesState): Promise<void> {
  if (!hasSupabase()) throw new Error("Customer IDs need the configured database.");
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert(
      { id: activeRowId(), catalog: state, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw new Error(error.message);
}

/** Serial writes, so two people adding customers cannot both take CUS-0018. */
async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_CUSTOMER_PROFILES_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_CUSTOMER_PROFILES_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function readCustomerProfiles(): Promise<CustomerProfilesState> {
  return normalize(await readRowRaw().catch(() => null));
}

/**
 * EVERY CUSTOMER HAS AN ID (Manoj, Sep 10: "Customer ID for every Customer to
 * be system generated"). Customers made before this existed, or added by a
 * CSV import, get theirs the first time a list of them is read, oldest first,
 * so the numbers follow the order the accounts arrived in. Writes only when
 * somebody is actually missing one.
 */
export async function ensureCustomerNumbers(
  customers: { id: string; created_at?: string | null }[]
): Promise<CustomerProfilesState> {
  const current = await readCustomerProfiles();
  if (!hasSupabase() || customers.every((c) => current.profiles[c.id])) return current;
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    const missing = customers
      .filter((c) => c.id && !state.profiles[c.id])
      .sort(
        (a, b) =>
          String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
          a.id.localeCompare(b.id)
      );
    if (missing.length === 0) return state;
    const now = new Date().toISOString();
    for (const c of missing) {
      state.lastCustomerNo += 1;
      state.profiles[c.id] = { customerNo: formatCustomerNo(state.lastCustomerNo), updatedAt: now };
    }
    await writeRow(state);
    return state;
  });
}

/** Set a customer's addresses and parent. Gives it an ID first if it has none. */
export async function setCustomerProfile(
  customerId: string,
  patch: { hq?: unknown; other?: unknown; parentId?: string | null }
): Promise<CustomerProfile> {
  const id = String(customerId ?? "").trim();
  if (!id) throw new Error("Which customer?");
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    let profile = state.profiles[id];
    if (!profile) {
      state.lastCustomerNo += 1;
      profile = { customerNo: formatCustomerNo(state.lastCustomerNo) };
    }
    if (patch.hq !== undefined) {
      const hq = normalizeAddress(patch.hq);
      if (hq) profile.hq = hq;
      else delete profile.hq;
    }
    if (patch.other !== undefined) {
      const other = normalizeAddress(patch.other);
      if (other) profile.other = other;
      else delete profile.other;
    }
    if (patch.parentId !== undefined) {
      const parentId = String(patch.parentId ?? "").trim();
      if (parentId && parentId !== id) profile.parentId = parentId.slice(0, 80);
      else delete profile.parentId;
    }
    profile.updatedAt = new Date().toISOString();
    state.profiles[id] = profile;
    await writeRow(state);
    return profile;
  });
}

/** A deleted customer takes its profile with it; its number stays retired,
 *  and any customer that named it as parent goes back to NA. */
export async function removeCustomerProfile(customerId: string): Promise<void> {
  const id = String(customerId ?? "").trim();
  if (!id || !hasSupabase()) return;
  await withWrite(async () => {
    const state = normalize(await readRowRaw());
    let changed = false;
    if (state.profiles[id]) {
      delete state.profiles[id];
      changed = true;
    }
    for (const p of Object.values(state.profiles)) {
      if (p.parentId === id) {
        delete p.parentId;
        changed = true;
      }
    }
    if (changed) await writeRow(state);
  });
}
