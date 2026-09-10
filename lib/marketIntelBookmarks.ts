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
  updatedAt: string;
};

const EMPTY: MarketIntelBookmarks = { companyIds: [], updatedAt: "" };

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
  const catalog = data?.catalog as { companyIds?: unknown; updatedAt?: unknown } | null;
  return {
    companyIds: ids(catalog?.companyIds),
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
    updatedAt: new Date().toISOString(),
  };
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        companyIds: next.companyIds,
        updatedAt: next.updatedAt,
      },
      updated_at: next.updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  return next;
}
