import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * WHO ASKED TO HEAR ABOUT ROADMAP CHANGES.
 *
 * The product owner's rule, relayed by Anir on Aug 21: "all the guys should
 * be notified — not all the guys, the stakeholders, the sales guys, sales
 * solution, the other guys who actually are the consumers of this data". And
 * immediately after it, the thing that kills every notification feature: "a
 * guy who wants everything, he should not be spammed with updates — so one
 * email should go, and there should be an option to subscribe".
 *
 * So nothing is broadcast. A person either follows a specific component or
 * offering — a switch on its own page — or turns on `everything` and hears
 * about all of them. Whatever they follow, the digest sends ONE mail per run
 * carrying every change since the last one, never a mail per change.
 *
 * The notification centre is deliberately NOT gated by this. The bell is a
 * surface people look at when they choose to, so a subscription would only
 * hide things from someone who came looking. Subscriptions govern what is
 * pushed into an inbox; the bell keeps showing whatever a reader may see.
 */
export type RoadmapSubscription = {
  /** Mail me when any roadmap moves, without naming them one by one. */
  everything: boolean;
  /** FDL component ids this person follows. */
  componentIds: string[];
  /** Offering ids this person follows. */
  offeringIds: string[];
  updatedAt: string;
};

export const EMPTY_SUBSCRIPTION: RoadmapSubscription = {
  everything: false,
  componentIds: [],
  offeringIds: [],
  updatedAt: "",
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowId(scope: WorkspaceMemberScope) {
  return `roadmap-subs:${scope.workspaceId}:${scope.userId}`;
}

function workspacePrefix(workspaceId: string) {
  return `roadmap-subs:${workspaceId}:%`;
}

/** Ids only, de-duplicated, capped: a body cannot turn this into a dump. */
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

function shape(raw: unknown): RoadmapSubscription {
  const sub = raw as Record<string, unknown> | null;
  return {
    everything: sub?.everything === true,
    componentIds: ids(sub?.componentIds),
    offeringIds: ids(sub?.offeringIds),
    updatedAt: typeof sub?.updatedAt === "string" ? sub.updatedAt : "",
  };
}

export async function readRoadmapSubscription(
  scope: WorkspaceMemberScope
): Promise<RoadmapSubscription> {
  const db = client();
  if (!db) return EMPTY_SUBSCRIPTION;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const catalog = data?.catalog as { subscription?: unknown } | null;
  return shape(catalog?.subscription);
}

/**
 * Every subscription in the workspace, keyed by userId — what the digest runs
 * over. The workspace is re-checked from inside the row rather than trusted
 * from the id prefix, the same way the member-profile reader does it.
 */
export async function readWorkspaceRoadmapSubscriptions(
  workspaceId: string
): Promise<Map<string, RoadmapSubscription>> {
  const db = client();
  const out = new Map<string, RoadmapSubscription>();
  if (!db) return out;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", workspacePrefix(workspaceId));
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const catalog = row.catalog as {
      workspaceId?: unknown;
      userId?: unknown;
      subscription?: unknown;
    } | null;
    if (catalog?.workspaceId !== workspaceId || typeof catalog.userId !== "string") {
      continue;
    }
    out.set(catalog.userId, shape(catalog.subscription));
  }
  return out;
}

export async function writeRoadmapSubscription(
  scope: WorkspaceMemberScope,
  input: Partial<Omit<RoadmapSubscription, "updatedAt">>
): Promise<RoadmapSubscription> {
  const db = client();
  if (!db) throw new Error("Notification settings storage is not configured.");
  const current = await readRoadmapSubscription(scope);
  const subscription: RoadmapSubscription = {
    everything:
      input.everything === undefined ? current.everything : input.everything === true,
    componentIds:
      input.componentIds === undefined ? current.componentIds : ids(input.componentIds),
    offeringIds:
      input.offeringIds === undefined ? current.offeringIds : ids(input.offeringIds),
    updatedAt: new Date().toISOString(),
  };
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        subscription,
        updatedAt: subscription.updatedAt,
      },
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  return subscription;
}

/** Follow / unfollow one thing without sending the whole object back. */
export async function toggleRoadmapFollow(
  scope: WorkspaceMemberScope,
  kind: "component" | "offering",
  id: string,
  follow: boolean
): Promise<RoadmapSubscription> {
  const current = await readRoadmapSubscription(scope);
  const key = kind === "component" ? "componentIds" : "offeringIds";
  const set = new Set(current[key]);
  if (follow) set.add(id);
  else set.delete(id);
  return writeRoadmapSubscription(scope, { [key]: Array.from(set) });
}
