import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";
import { PROPOSAL_TTL_MS, type ActionProposal } from "@/lib/agentActionsShared";

/**
 * WHAT THE AGENT HAS PROPOSED AND NOT YET BEEN TOLD TO DO, per member.
 *
 * One JSON row per person (agent-actions:<workspace>:<user>). A proposal is
 * written the moment the agent makes it, so the yes that comes back a minute
 * later, from the web card or from a WhatsApp text, finds exactly what was
 * proposed, not what the model remembers.
 */

const KEEP = 60;

function rowId(scope: WorkspaceMemberScope): string {
  return `agent-actions:${scope.workspaceId}:${scope.userId}`;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_AGENT_ACTIONS_MEM__: Map<string, ActionProposal[]> | undefined;
}

/** Without a database (tests, a bare laptop) proposals live in memory. */
function memory(): Map<string, ActionProposal[]> {
  return (globalThis.__FREYR_AGENT_ACTIONS_MEM__ ??= new Map());
}

function expire(list: ActionProposal[], now = Date.now()): ActionProposal[] {
  return list.map((p) => (p.status === "proposed" && p.expiresAt <= now ? { ...p, status: "expired" as const } : p));
}

export async function readProposals(scope: WorkspaceMemberScope): Promise<ActionProposal[]> {
  const db = client();
  if (!db) return expire(memory().get(rowId(scope)) ?? []);
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const stored = (data?.catalog as { proposals?: unknown } | null)?.proposals;
  return expire(Array.isArray(stored) ? (stored as ActionProposal[]) : []);
}

async function writeProposals(scope: WorkspaceMemberScope, proposals: ActionProposal[]): Promise<void> {
  const trimmed = proposals.slice(-KEEP);
  const db = client();
  if (!db) {
    memory().set(rowId(scope), trimmed);
    return;
  }
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        proposals: trimmed,
        updatedAt: new Date().toISOString(),
      },
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
}

export async function addProposal(
  scope: WorkspaceMemberScope,
  proposal: Omit<ActionProposal, "status" | "createdAt" | "expiresAt">
): Promise<ActionProposal> {
  const now = Date.now();
  const full: ActionProposal = { ...proposal, status: "proposed", createdAt: now, expiresAt: now + PROPOSAL_TTL_MS };
  /* ONE OPEN QUESTION PER CONVERSATION. "Yes but make it 5" re-proposes; the
     first proposal is superseded, so the next bare yes means the newest one
     and never "which of these two?". Proposals from other conversations (the
     WhatsApp thread beside a web chat) stay open. */
  const current = (await readProposals(scope)).map((p) =>
    p.status === "proposed" && p.conversationId && p.conversationId === full.conversationId
      ? { ...p, status: "cancelled" as const, decidedAt: now, error: "Superseded by a newer proposal." }
      : p
  );
  await writeProposals(scope, [...current, full]);
  return full;
}

export async function updateProposal(
  scope: WorkspaceMemberScope,
  id: string,
  patch: Partial<ActionProposal>
): Promise<ActionProposal | null> {
  const current = await readProposals(scope);
  const index = current.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const next = { ...current[index], ...patch };
  current[index] = next;
  await writeProposals(scope, current);
  return next;
}

export async function getProposal(scope: WorkspaceMemberScope, id: string): Promise<ActionProposal | null> {
  return (await readProposals(scope)).find((p) => p.id === id) ?? null;
}

/** Still waiting for a yes, newest first. */
export async function pendingProposals(scope: WorkspaceMemberScope): Promise<ActionProposal[]> {
  return (await readProposals(scope))
    .filter((p) => p.status === "proposed")
    .sort((a, b) => b.createdAt - a.createdAt);
}
