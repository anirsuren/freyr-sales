import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * MY COMPANIES (Saras and Anir, Sep 10). One shared watch list, and on top of
 * it each person's own: the companies they added and the ones they chose to
 * follow. A company is scraped once for everybody; following it costs
 * nothing, and two people following the same company see the same briefing.
 *
 * Same one-row-per-person shape as roadmap subscriptions, under its own row
 * id, so the two never read each other's list.
 */
export type MarketIntelBookmarks = {
  companyIds: string[];
  /**
   * MY PAGE IS MY LIST (Anir, Sep 10: "it shouldn't even show me the other
   * companies unless I go into Manage Companies and check that box"). Off by
   * default: the page shows what I added and what I starred. On: every
   * company the team tracks.
   */
  showAll: boolean;
  updatedAt: string;
};

const EMPTY: MarketIntelBookmarks = { companyIds: [], showAll: false, updatedAt: "" };

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
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
  if (!db) return EMPTY;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const catalog = data?.catalog as { companyIds?: unknown; showAll?: unknown; updatedAt?: unknown } | null;
  return {
    companyIds: ids(catalog?.companyIds),
    showAll: catalog?.showAll === true,
    updatedAt: typeof catalog?.updatedAt === "string" ? catalog.updatedAt : "",
  };
}

/** Everyone's list in the workspace, keyed by userId: what "2 other people
 *  follow this" reads. The workspace is re-checked from inside the row. */
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

export async function setMarketIntelBookmark(
  scope: WorkspaceMemberScope,
  companyId: string,
  on: boolean
): Promise<MarketIntelBookmarks> {
  const db = client();
  if (!db) throw new Error("Bookmarks storage is not configured.");
  const current = await readMarketIntelBookmarks(scope);
  const set = new Set(current.companyIds);
  const id = companyId.trim().slice(0, 80);
  if (!id) throw new Error("Which company?");
  if (on) set.add(id);
  else set.delete(id);
  const next: MarketIntelBookmarks = {
    companyIds: Array.from(set),
    showAll: current.showAll,
    updatedAt: new Date().toISOString(),
  };
  await writeBookmarks(scope, next);
  return next;
}

/** The "show all companies on my page" box in Manage companies. */
export async function setMarketIntelShowAll(
  scope: WorkspaceMemberScope,
  showAll: boolean
): Promise<MarketIntelBookmarks> {
  const current = await readMarketIntelBookmarks(scope);
  const next: MarketIntelBookmarks = { ...current, showAll, updatedAt: new Date().toISOString() };
  await writeBookmarks(scope, next);
  return next;
}

async function writeBookmarks(scope: WorkspaceMemberScope, next: MarketIntelBookmarks): Promise<void> {
  const db = client();
  if (!db) throw new Error("Bookmarks storage is not configured.");
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        companyIds: next.companyIds,
        showAll: next.showAll,
        updatedAt: next.updatedAt,
      },
      updated_at: next.updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * FOLLOWERS BY COMPANY, across everybody's lists: what decides whether a
 * company is still refreshed once it is off the standing watch. One read of
 * every list row; the app has one workspace, and each row still names its
 * own.
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

/** Take a company off every person's list (an admin deleted it for good). */
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
    const catalog = row.catalog as { companyIds?: unknown } | null;
    const before = ids(catalog?.companyIds);
    if (!before.includes(companyId)) continue;
    const next = before.filter((id) => id !== companyId);
    const { error: writeError } = await db
      .from("offering_catalog_state")
      .upsert(
        {
          id: row.id,
          catalog: { ...(catalog ?? {}), companyIds: next, updatedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (writeError) throw new Error(writeError.message);
    touched += 1;
  }
  return touched;
}
