import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";

/**
 * CUSTOMER GROUPS — the same accounts, cut into lists people actually manage.
 *
 * Suren, Aug 28, arriving at the name after trying two others: "let's do one
 * thing: this is overall customers, and then you can call it CUSTOMER GROUPS
 * instead of targets. Somebody can take a customer and create multiple groups.
 * They can call something strategic accounts, focused accounts, AMR account,
 * EU account, some accounts, and then take these and add some customers to
 * that group. In this group, for every group, you can actually put these
 * statistics if you want."
 *
 * So this is not a new kind of record and not a new screen for an account. It
 * is a NAMED SET over the customers that already exist:
 *
 *   - anyone can make as many as they like, and name them whatever the
 *     business calls them ("Strategic accounts", "AMR", "EU")
 *   - a customer belongs to as many groups as makes sense, not one — the
 *     whole reason it is not a field on the customer record
 *   - each group carries its own statistics, because the reason to draw a
 *     circle round eleven accounts is to see what those eleven add up to
 *
 * TARGETS IS A DIFFERENT THING AND IS LEFT ALONE. That tab holds the 122
 * accounts imported from his sheets — accounts we do not have yet. He was
 * explicit that it stays out of this: "I don't know what target customers are.
 * We will come to that later."
 *
 * The statistics are NOT stored here. A group holds names and member ids and
 * nothing else; every number is computed at read time from opportunities,
 * meetings and the rest. A stored total is a total that goes stale the first
 * time somebody edits a deal.
 *
 * Storage mirrors meetings and solutioning exactly: one row in
 * offering_catalog_state, separate rows for Mock and Real.
 */

const ROW_ID = "customer-groups";

export type CustomerGroup = {
  id: string;
  name: string;
  /** Why this group exists, in the words of whoever drew the circle. */
  description?: string;
  /** Identity colour, so a group reads the same everywhere it appears. */
  color: string;
  /** Customer ids. The customer record itself is never touched. */
  customerIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};

export type CustomerGroupsState = { groups: CustomerGroup[] };

export const EMPTY_CUSTOMER_GROUPS: CustomerGroupsState = { groups: [] };

/**
 * A GROUP IS A CATEGORY, SO IT WEARS A COLOUR (standing chip rule since
 * Aug 17). These are FILTER_PALETTE slots, kept off the reserved status tones:
 * a group called "At risk" must not be able to paint itself the red that means
 * something else in this app.
 */
export const GROUP_COLORS = [
  "#2563EB",
  "#DB2777",
  "#0D9488",
  "var(--ink-violet-soft)",
  "var(--ink-orange)",
  "#0369A1",
  "#9333EA",
  "#4D7C0F",
] as const;

/* --------------------------------------------------------------- storage */

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_GROUPS_WRITE_QUEUE__: Promise<void> | undefined;
}

function hasDatabase(): boolean {
  return hasSupabase();
}

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function activeRowId(): string {
  return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, max: number, cap = 500): string[] {
  return Array.isArray(v)
    ? [...new Set(v.map((x) => str(String(x ?? ""), max)).filter(Boolean))].slice(0, cap)
    : [];
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** Serial writes, so two people adding accounts cannot interleave. */
async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_GROUPS_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_GROUPS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function normalizeGroup(v: unknown): CustomerGroup | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  const id = str(g.id, 60);
  const name = str(g.name, 80);
  if (!id || !name) return null;
  const color = str(g.color, 20);
  return {
    id,
    name,
    description: str(g.description, 240) || undefined,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : GROUP_COLORS[0],
    customerIds: strList(g.customerIds, 80),
    createdBy: str(g.createdBy, 80) || "Unknown",
    createdAt: str(g.createdAt, 40) || new Date(0).toISOString(),
    updatedAt: str(g.updatedAt, 40) || undefined,
  };
}

function normalize(v: unknown): CustomerGroupsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_CUSTOMER_GROUPS);
  const rows = (v as { groups?: unknown[] }).groups;
  const groups = Array.isArray(rows)
    ? rows.map(normalizeGroup).filter((g): g is CustomerGroup => !!g)
    : [];
  return { groups };
}

async function readRowRaw(): Promise<unknown | null> {
  if (!hasDatabase()) return null;
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

async function writeRow(state: CustomerGroupsState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

/** Mock seeds itself once, then behaves like any other store. */
export async function readCustomerGroups(): Promise<CustomerGroupsState> {
  if (getDataMode() !== "mock")
    return readRowRaw()
      .then(normalize)
      .catch(() => structuredClone(EMPTY_CUSTOMER_GROUPS));
  const existing = await readRowRaw().catch(() => null);
  if (existing) return normalize(existing);
  const seeded = sampleGroups();
  await writeRow(seeded).catch(() => undefined);
  return seeded;
}

/* ----------------------------------------------------------------- writes */

export async function createGroup(input: {
  name: string;
  description?: string;
  color?: string;
  customerIds?: string[];
  by: string;
}): Promise<CustomerGroup> {
  return withWrite(async () => {
    const name = str(input.name, 80);
    if (!name) throw new Error("Give the group a name.");
    const state = normalize(await readRowRaw());
    if (state.groups.some((g) => g.name.toLowerCase() === name.toLowerCase()))
      throw new Error(`There is already a group called "${name}".`);
    const group: CustomerGroup = {
      id: uid("cg"),
      name,
      description: str(input.description, 240) || undefined,
      /* Next unused colour, so two groups made back to back never look
         alike. */
      color:
        str(input.color, 20) ||
        GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
      customerIds: strList(input.customerIds, 80),
      createdBy: str(input.by, 80) || "Unknown",
      createdAt: new Date().toISOString(),
    };
    state.groups.unshift(group);
    await writeRow(state);
    return group;
  });
}

export async function updateGroup(input: {
  id: string;
  patch: { name?: string; description?: string; color?: string; customerIds?: string[] };
}): Promise<void> {
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    const g = state.groups.find((x) => x.id === input.id);
    if (!g) throw new Error("That group is gone. Refresh and retry.");
    const p = input.patch;
    if (p.name !== undefined) {
      const name = str(p.name, 80);
      if (!name) throw new Error("A group needs a name.");
      if (
        state.groups.some(
          (x) => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase()
        )
      )
        throw new Error(`There is already a group called "${name}".`);
      g.name = name;
    }
    if (p.description !== undefined)
      g.description = str(p.description, 240) || undefined;
    if (p.color !== undefined && /^#[0-9a-f]{6}$/i.test(str(p.color, 20)))
      g.color = str(p.color, 20);
    if (p.customerIds !== undefined) g.customerIds = strList(p.customerIds, 80);
    g.updatedAt = new Date().toISOString();
    await writeRow(state);
  });
}

export async function deleteGroup(id: string): Promise<void> {
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    state.groups = state.groups.filter((g) => g.id !== id);
    await writeRow(state);
  });
}

/** Add or remove one account without sending the whole membership list. */
export async function toggleMember(input: {
  id: string;
  customerId: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    const g = state.groups.find((x) => x.id === input.id);
    if (!g) throw new Error("That group is gone. Refresh and retry.");
    const cid = str(input.customerId, 80);
    if (!cid) return;
    g.customerIds = g.customerIds.includes(cid)
      ? g.customerIds.filter((x) => x !== cid)
      : [...g.customerIds, cid];
    g.updatedAt = new Date().toISOString();
    await writeRow(state);
  });
}

/* ------------------------------------------------------------------ reads */

/** Which groups an account sits in — for the customer page's own header. */
export function groupsForCustomer(
  groups: CustomerGroup[],
  customerId: string
): CustomerGroup[] {
  return groups.filter((g) => g.customerIds.includes(customerId));
}

/* ---------------------------------------------------------------- samples */

/**
 * Mock looks stocked here too (standing rule, and Anir on Aug 28: "need mock
 * data for every single part"). Named the way a regulatory-services floor
 * actually cuts its book, over the accounts lib/mock-db carries.
 */
function sampleGroups(): CustomerGroupsState {
  const at = (offset: number) => {
    const t = new Date("2026-08-28T12:00:00.000Z");
    t.setDate(t.getDate() + offset);
    return t.toISOString();
  };
  return {
    groups: [
      {
        id: "cg-sample-1",
        name: "Strategic accounts",
        description: "The handful we plan around every quarter.",
        color: GROUP_COLORS[0],
        customerIds: ["cust-001", "cust-003", "cust-009"],
        createdBy: "Elena Rossi",
        createdAt: at(-40),
      },
      {
        id: "cg-sample-2",
        name: "EU filings",
        description: "Anything with an EMA or notified-body deadline this year.",
        color: GROUP_COLORS[1],
        customerIds: ["cust-003", "cust-007", "cust-012"],
        createdBy: "Omar Haddad",
        createdAt: at(-26),
      },
      {
        id: "cg-sample-3",
        name: "Medical devices",
        description: "MDR and IVDR work, kept together because the team is.",
        color: GROUP_COLORS[2],
        customerIds: ["cust-007"],
        createdBy: "Daniel Foster",
        createdAt: at(-12),
      },
      {
        id: "cg-sample-4",
        name: "Renewals due H1",
        description: "Contracts coming up for renewal in the first half.",
        color: GROUP_COLORS[3],
        customerIds: ["cust-004", "cust-006", "cust-010", "cust-011"],
        createdBy: "Grace Liu",
        createdAt: at(-5),
      },
    ],
  };
}
