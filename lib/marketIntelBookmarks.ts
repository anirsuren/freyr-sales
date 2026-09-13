import "server-only";
import { applyBookmarkChanges, type BookmarkChange } from "./marketIntelBookmarkChanges";

import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * MY LIST, AND MY STARS, WHICH ARE NOT THE SAME THING (Anir, Sep 10:
 * "checkboxes are what let me see it. If GSK is not checked off, I won't be
 * able to see it on the page... My list does not mean that it is starred.
 * Starred is completely different from my list").
 *
 * - `companyIds` is MY LIST: the companies I ticked in Manage companies.
 *   My Market Intel pages show exactly these, and nothing else. Empty for a
 *   new person, so the page starts empty and asks them to pick.
 * - `starredIds` is a FAVOURITE inside my list: a highlight, filterable,
 *   sorted first. Starring something also ticks it, because a favourite you
 *   cannot see would be pointless. Unticking drops the star with it.
 *
 * A company is collected while at least one person has it on their list, and
 * stops when the last person drops it. Nothing is tracked "for everyone" any
 * more (Anir, Sep 10: "I don't understand the point of the section that says
 * for everyone... you can remove it").
 *
 * Same one-row-per-person shape as roadmap subscriptions, under its own row
 * id, so the two never read each other's list.
 */
export type MarketIntelBookmarks = {
  /** My list: what my pages show. */
  companyIds: string[];
  /** Favourites, always a subset of the list above. */
  starredIds: string[];
  updatedAt: string;
};

const EMPTY: MarketIntelBookmarks = { companyIds: [], starredIds: [], updatedAt: "" };

export function emptyBookmarks(): MarketIntelBookmarks {
  return { ...EMPTY };
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

function rowId(scope: WorkspaceMemberScope) {
  return `mi-bookmarks:${scope.workspaceId}:${scope.userId}`;
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const id = v.trim().slice(0, 80);
    if (id) out.add(id);
  }
  return Array.from(out).slice(0, 500);
}

export async function readMarketIntelBookmarks(
  scope: WorkspaceMemberScope
): Promise<MarketIntelBookmarks> {
  const db = client();
  if (!db) return emptyBookmarks();
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const catalog = data?.catalog as
    | { companyIds?: unknown; starredIds?: unknown; updatedAt?: unknown }
    | null;
  const list = ids(catalog?.companyIds);
  const listSet = new Set(list);
  return {
    companyIds: list,
    /* A star only counts while the company is still on the list. */
    starredIds: ids(catalog?.starredIds).filter((id) => listSet.has(id)),
    updatedAt: typeof catalog?.updatedAt === "string" ? catalog.updatedAt : "",
  };
}

/** Everyone's list in the workspace, keyed by userId: what "3 people have
 *  this" reads. The workspace is re-checked from inside the row. */
export async function readWorkspaceMarketIntelBookmarks(
  workspaceId: string
): Promise<Map<string, string[]>> {
  const db = client();
  const out = new Map<string, string[]>();
  if (!db) return out;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", `mi-bookmarks:${workspaceId}:%`);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const catalog = row.catalog as {
      workspaceId?: unknown;
      userId?: unknown;
      companyIds?: unknown;
    } | null;
    if (catalog?.workspaceId !== workspaceId || typeof catalog.userId !== "string") continue;
    out.set(catalog.userId, ids(catalog.companyIds));
  }
  return out;
}

/** Tick or untick one company. Unticking drops the star with it. */
export async function setMarketIntelBookmark(
  scope: WorkspaceMemberScope,
  companyId: string,
  on: boolean
): Promise<MarketIntelBookmarks> {
  const id = companyId.trim().slice(0, 80);
  if (!id) throw new Error("Which company?");
  const current = await readMarketIntelBookmarks(scope);
  const list = new Set(current.companyIds);
  const stars = new Set(current.starredIds);
  if (on) list.add(id);
  else {
    list.delete(id);
    stars.delete(id);
  }
  return writeBookmarks(scope, Array.from(list), Array.from(stars));
}

/** Star or unstar. Starring puts it on the list too: a favourite you cannot
 *  see would be pointless. Unstarring leaves it on the list. */
export async function setMarketIntelStar(
  scope: WorkspaceMemberScope,
  companyId: string,
  on: boolean
): Promise<MarketIntelBookmarks> {
  const id = companyId.trim().slice(0, 80);
  if (!id) throw new Error("Which company?");
  const current = await readMarketIntelBookmarks(scope);
  const list = new Set(current.companyIds);
  const stars = new Set(current.starredIds);
  if (on) {
    stars.add(id);
    list.add(id);
  } else {
    stars.delete(id);
  }
  return writeBookmarks(scope, Array.from(list), Array.from(stars));
}

/** Tick or untick a whole batch at once: the "select all" box in the pop-up. */
export async function setMarketIntelBookmarks(
  scope: WorkspaceMemberScope,
  companyIds: string[],
  on: boolean
): Promise<MarketIntelBookmarks> {
  const batch = ids(companyIds);
  if (batch.length === 0) return readMarketIntelBookmarks(scope);
  const current = await readMarketIntelBookmarks(scope);
  const list = new Set(current.companyIds);
  const stars = new Set(current.starredIds);
  for (const id of batch) {
    if (on) list.add(id);
    else {
      list.delete(id);
      stars.delete(id);
    }
  }
  return writeBookmarks(scope, Array.from(list), Array.from(stars));
}

/** Persist the entire draft in one write, preserving untouched companies. */
export async function saveMarketIntelBookmarkChanges(
  scope: WorkspaceMemberScope,
  changes: BookmarkChange[]
): Promise<MarketIntelBookmarks> {
  const db = client();
  if (!db) throw new Error("Your list is not configured.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from("offering_catalog_state")
      .select("catalog,updated_at").eq("id", rowId(scope)).maybeSingle();
    if (error) throw new Error(error.message);
    const current = { companyIds: ids(data?.catalog?.companyIds), starredIds: ids(data?.catalog?.starredIds) };
    const merged = applyBookmarkChanges(current, changes);
    const updatedAt = new Date().toISOString();
    const next = { ...merged, updatedAt };
    const row = { id: rowId(scope), catalog: { workspaceId: scope.workspaceId, userId: scope.userId, ...next }, updated_at: updatedAt };
    if (!data) {
      const { error: insertError } = await db.from("offering_catalog_state").insert(row);
      if (!insertError) return next;
      if (insertError.code === "23505") continue;
      throw new Error(insertError.message);
    }
    const { data: saved, error: saveError } = await db.from("offering_catalog_state")
      .update(row).eq("id", rowId(scope)).eq("updated_at", data.updated_at).select("id");
    if (saveError) throw new Error(saveError.message);
    if (saved?.length) return next;
  }
  throw new Error("Your list changed in another window. Your draft is still here; save again.");
}

async function writeBookmarks(
  scope: WorkspaceMemberScope,
  companyIds: string[],
  starredIds: string[]
): Promise<MarketIntelBookmarks> {
  const db = client();
  if (!db) throw new Error("Your list is not configured.");
  const listSet = new Set(companyIds);
  const next: MarketIntelBookmarks = {
    companyIds,
    starredIds: starredIds.filter((id) => listSet.has(id)),
    updatedAt: new Date().toISOString(),
  };
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        companyIds: next.companyIds,
        starredIds: next.starredIds,
        updatedAt: next.updatedAt,
      },
      updated_at: next.updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  return next;
}

/**
 * WHO HAS WHAT, across everybody's lists: the only thing that decides whether
 * a company is still collected. One read of every list row; the app has one
 * workspace, and each row still names its own.
 */
export async function readMarketIntelFollowers(): Promise<Record<string, string[]>> {
  const db = client();
  const out: Record<string, string[]> = {};
  if (!db) return out;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", "mi-bookmarks:%");
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const catalog = row.catalog as { userId?: unknown; companyIds?: unknown } | null;
    if (typeof catalog?.userId !== "string") continue;
    for (const id of ids(catalog.companyIds)) (out[id] ??= []).push(catalog.userId);
  }
  return out;
}

/** Take a company off every person's list and stars (an admin deleted it). */
export async function forgetMarketIntelCompany(companyId: string): Promise<number> {
  const db = client();
  if (!db) return 0;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("id, catalog")
    .like("id", "mi-bookmarks:%");
  if (error) throw new Error(error.message);
  let touched = 0;
  for (const row of data || []) {
    const catalog = row.catalog as { companyIds?: unknown; starredIds?: unknown } | null;
    const before = ids(catalog?.companyIds);
    const stars = ids(catalog?.starredIds);
    if (!before.includes(companyId) && !stars.includes(companyId)) continue;
    const { error: writeError } = await db
      .from("offering_catalog_state")
      .upsert(
        {
          id: row.id,
          catalog: {
            ...(catalog ?? {}),
            companyIds: before.filter((id) => id !== companyId),
            starredIds: stars.filter((id) => id !== companyId),
            updatedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (writeError) throw new Error(writeError.message);
    touched += 1;
  }
  return touched;
}
