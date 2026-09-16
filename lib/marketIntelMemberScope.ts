import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { marketIntelDatabaseConfig } from "./marketIntelDatabase";
import type { WorkspaceMemberScope } from "./types";

export function sharedMarketIntelWorkspace(localWorkspaceId: string): string {
  if (!usesRemoteMarketIntel()) return localWorkspaceId;
  const id = process.env.MARKET_INTEL_WORKSPACE_ID;
  if (!id) throw new Error("Shared Market Intel workspace is not configured.");
  return id;
}

function usesRemoteMarketIntel(): boolean {
  return getDataMode() === "live" && marketIntelDatabaseConfig().url !== process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Match verified local members by email, never assume separate auth databases share UUIDs. */
export async function marketIntelMemberScope(scope: WorkspaceMemberScope): Promise<WorkspaceMemberScope> {
  if (!usesRemoteMarketIntel()) return scope;
  const local = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const member = await local.from("app_users").select("email").eq("id", scope.userId).eq("workspace_id", scope.workspaceId).eq("active", true).single();
  if (member.error || !member.data?.email) throw new Error("Could not resolve your Market Intel membership.");
  const config = marketIntelDatabaseConfig();
  const remote = createClient(config.url!, config.key!, { auth: { persistSession: false } });
  const workspaceId = sharedMarketIntelWorkspace(scope.workspaceId);
  const match = await remote.from("app_users").select("id,email").eq("workspace_id", workspaceId).eq("active", true).ilike("email", member.data.email).single();
  if (match.error || match.data?.email?.toLowerCase() !== member.data.email.toLowerCase()) throw new Error("Your account needs an active membership in the shared Market Intel workspace.");
  return { workspaceId, userId: match.data.id };
}

/** Resolve shared followers back to this environment's directory for names and avatars. */
export async function localMarketIntelMemberIds(): Promise<Map<string, string>> {
  if (!usesRemoteMarketIntel()) return new Map();
  const config = marketIntelDatabaseConfig();
  const remote = createClient(config.url!, config.key!, { auth: { persistSession: false } });
  const local = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [shared, current] = await Promise.all([
    remote.from("app_users").select("id,email").eq("workspace_id", sharedMarketIntelWorkspace("")).eq("active", true),
    local.from("app_users").select("id,email").eq("workspace_id", process.env.FREYR_WORKSPACE_ID!).eq("active", true),
  ]);
  if (shared.error || current.error) throw new Error("Could not resolve the Market Intel member directory.");
  const byEmail = new Map((current.data || []).filter(m => m.email).map(m => [m.email.toLowerCase(), m.id]));
  return new Map((shared.data || []).flatMap(m => {
    const id = m.email && byEmail.get(m.email.toLowerCase());
    return id ? [[m.id, id] as [string, string]] : [];
  }));
}
