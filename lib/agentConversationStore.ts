import "server-only";
import { mergeConversationChanges } from "@/lib/conversationChanges";
import { DEFAULT_LOCAL_USER_IDENTITY } from "@/lib/userIdentity";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * THE AGENT'S CONVERSATION HISTORY, ONE ROW PER PERSON.
 *
 * Lifted out of the conversations route on Sep 26 so a second door, the
 * WhatsApp webhook, can add to the same history the Agent page reads. The
 * shapes, limits and the compare-and-write loop are unchanged; the route
 * imports them from here.
 */

export const MAX_CONVERSATIONS = 500;
export const MAX_MESSAGES_PER_CONVERSATION = 500;
export const MAX_TEXT_LENGTH = 50_000;

export type StoredMessage = {
  role: "user" | "agent";
  text: string;
  ts: number;
  /** Door a user message came through; absent means the app itself. */
  via?: "whatsapp";
  /** Files sent with a user message (lib/agentFiles). */
  attachments?: { fileId: string; name: string; kind?: string; bytes?: number }[];
  suggestions?: string[];
  entityContext?: string[];
  /** A change the agent proposed under this message, and what became of it. */
  pendingAction?: {
    id: string;
    action: string;
    summary: string;
    status: "proposed" | "done" | "cancelled" | "failed" | "expired";
    result?: string;
    link?: string;
  };
};

type ActionStatus = NonNullable<StoredMessage["pendingAction"]>["status"];
const ACTION_STATUSES = new Set<string>(["proposed", "done", "cancelled", "failed", "expired"]);

function cleanPendingAction(value: unknown): StoredMessage["pendingAction"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 80) : "";
  const action = typeof raw.action === "string" ? raw.action.slice(0, 80) : "";
  const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 1000) : "";
  const status = typeof raw.status === "string" && ACTION_STATUSES.has(raw.status) ? (raw.status as ActionStatus) : null;
  if (!id || !action || !summary || !status) return undefined;
  return {
    id,
    action,
    summary,
    status,
    ...(typeof raw.result === "string" && raw.result ? { result: raw.result.slice(0, 2000) } : {}),
    ...(typeof raw.link === "string" && raw.link.startsWith("/") ? { link: raw.link.slice(0, 500) } : {}),
  };
}

export type ConversationChannel = "web" | "whatsapp";

export type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  updated: number;
  excludedSources?: string[];
  offeringContext?: { id: string; name: string };
  /** Where the chat came from; absent means the web app. */
  channel?: ConversationChannel;
};

function cleanString(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function sanitizeConversation(value: unknown): StoredConversation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = cleanString(raw.id, 200);
  if (!id || !Array.isArray(raw.messages)) return null;
  if (raw.messages.length > MAX_MESSAGES_PER_CONVERSATION) return null;

  const messages: StoredMessage[] = [];
  for (const item of raw.messages) {
    if (!item || typeof item !== "object") return null;
    const message = item as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "agent") return null;
    const text = cleanString(message.text, MAX_TEXT_LENGTH);
    if (!text) return null;
    const pendingAction = message.role === "agent" ? cleanPendingAction(message.pendingAction) : undefined;
    messages.push({
      ...(pendingAction ? { pendingAction } : {}),
      ...(message.role === "agent" && Array.isArray(message.suggestions)
        ? { suggestions: message.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3).map((s) => s.slice(0, 200)) }
        : {}),
      ...(Array.isArray(message.entityContext)
        ? { entityContext: message.entityContext.filter((v): v is string => typeof v === "string" && v.startsWith("/")).slice(0, 12).map((v) => v.slice(0, 200)) }
        : {}),
      ...(message.role === "user" && message.via === "whatsapp" ? { via: "whatsapp" as const } : {}),
      // Files sent with the message, so the chip is still there after a reload (Sep 30).
      ...(message.role === "user" && Array.isArray(message.attachments)
        ? {
            attachments: (message.attachments as unknown[])
              .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { fileId?: unknown }).fileId === "string")
              .slice(0, 10)
              .map((a) => ({
                fileId: String(a.fileId).slice(0, 60),
                name: String(a.name ?? "file").slice(0, 200),
                ...(typeof a.kind === "string" ? { kind: a.kind.slice(0, 20) } : {}),
                ...(typeof a.bytes === "number" ? { bytes: a.bytes } : {}),
              })),
          }
        : {}),
      role: message.role,
      text,
      ts: typeof message.ts === "number" ? message.ts : Date.now(),
    });
  }

  const excludedSources = Array.isArray(raw.excludedSources)
    ? raw.excludedSources
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, 200))
    : undefined;
  const rawOffering =
    raw.offeringContext && typeof raw.offeringContext === "object"
      ? (raw.offeringContext as Record<string, unknown>)
      : null;
  const offeringId = cleanString(rawOffering?.id, 200);
  const offeringName = cleanString(rawOffering?.name, 500);

  return {
    id,
    title: cleanString(raw.title, 500),
    messages,
    updated: typeof raw.updated === "number" ? raw.updated : Date.now(),
    ...(excludedSources?.length ? { excludedSources } : {}),
    ...(offeringId && offeringName
      ? { offeringContext: { id: offeringId, name: offeringName } }
      : {}),
    ...(raw.channel === "whatsapp" ? { channel: "whatsapp" as const } : {}),
  };
}

export function sanitizeConversations(value: unknown): StoredConversation[] | null {
  if (!Array.isArray(value) || value.length > MAX_CONVERSATIONS) return null;
  const clean: StoredConversation[] = [];
  for (const item of value) {
    const conversation = sanitizeConversation(item);
    if (!conversation) return null;
    clean.push(conversation);
  }
  return clean;
}

export async function serviceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function durableScope(
  scope: WorkspaceMemberScope,
  db: NonNullable<Awaited<ReturnType<typeof serviceClient>>>
): Promise<WorkspaceMemberScope> {
  if (scope.userId !== DEFAULT_LOCAL_USER_IDENTITY.id) return scope;
  const email = DEFAULT_LOCAL_USER_IDENTITY.email?.trim().toLowerCase();
  if (!email) return scope;
  const { data } = await db
    .from("app_users")
    .select("id, workspace_id")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  return data?.id && data?.workspace_id
    ? { userId: data.id as string, workspaceId: data.workspace_id as string }
    : scope;
}

export function conversationRowId(scope: WorkspaceMemberScope): string {
  return `agent-conversations:${scope.workspaceId}:${scope.userId}`;
}

export async function readDurableConversations(
  scope: WorkspaceMemberScope
): Promise<StoredConversation[] | null> {
  const db = await serviceClient();
  if (!db) return null;
  const durable = await durableScope(scope, db);
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", conversationRowId(durable))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.catalog) return null;
  const stored = (data?.catalog as { conversations?: unknown } | null)
    ?.conversations;
  if (stored === undefined) return null;
  const conversations = sanitizeConversations(stored);
  if (!conversations)
    throw new Error("Stored conversation history is invalid.");
  return conversations;
}

export class HistoryConflict extends Error {}

export async function writeDurableConversations(
  scope: WorkspaceMemberScope,
  conversations: StoredConversation[],
  base: StoredConversation[]
): Promise<boolean> {
  const db = await serviceClient();
  if (!db) return false;
  const durable = await durableScope(scope, db);
  const id = conversationRowId(durable);
  // Compare the exact stored JSON atomically; process-local locks cannot protect
  // saves from another server instance. Retry disjoint concurrent changes.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await db.from("offering_catalog_state")
      .select("catalog").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const previous = data?.catalog;
    const current = previous ? sanitizeConversations(previous.conversations) : [];
    if (!current) throw new Error("Stored conversation history is invalid.");
    const merged = mergeConversationChanges(base, conversations, current);
    if (!merged) throw new HistoryConflict("Another tab changed the same conversation.");
    if (merged.length > MAX_CONVERSATIONS) throw new HistoryConflict("History limit reached.");
    const catalog = { workspaceId: durable.workspaceId, userId: durable.userId,
      conversations: merged, updatedAt: new Date().toISOString() };
    if (data) {
      const written = await db.rpc("save_agent_history_if_unchanged", {
        p_id: id, p_expected: previous, p_catalog: catalog,
      });
      if (written.error) throw new Error(written.error.message);
      if (written.data === true) return true;
    } else {
      const written = await db.from("offering_catalog_state").insert({ id, catalog });
      if (!written.error) return true;
      if (written.error.code !== "23505") throw new Error(written.error.message);
    }
  }
  throw new HistoryConflict("Conversation history changed during saving. Try again.");
}

/**
 * ONE EXCHANGE, ADDED TO A CONVERSATION (the WhatsApp door). Finds the
 * conversation by id or starts it, appends the person's message and the
 * agent's reply, and writes through the same merge the web app uses, so a
 * chat open in the browser at the same time is not overwritten.
 */
export async function appendAgentExchange(
  scope: WorkspaceMemberScope,
  input: {
    conversationId: string;
    channel: ConversationChannel;
    userText: string;
    agentText: string;
    suggestions?: string[];
    entityContext?: string[];
    pendingAction?: StoredMessage["pendingAction"];
    /** Files the person sent with this message (a photo, document or recording on WhatsApp). */
    attachments?: StoredMessage["attachments"];
    at?: number;
  }
): Promise<StoredConversation> {
  const at = input.at ?? Date.now();
  const current = (await readDurableConversations(scope)) ?? [];
  const before = current.find((c) => c.id === input.conversationId) ?? null;
  const next: StoredConversation = before
    ? { ...before, messages: [...before.messages], updated: at }
    : {
        id: input.conversationId,
        title: input.userText.replace(/\s+/g, " ").trim().slice(0, 80),
        messages: [],
        updated: at,
        channel: input.channel,
      };
  next.messages.push({
    role: "user",
    text: input.userText.slice(0, MAX_TEXT_LENGTH),
    ts: at,
    ...(input.channel === "whatsapp" ? { via: "whatsapp" as const } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments.slice(0, 10) } : {}),
  });
  next.messages.push({
    role: "agent",
    text: input.agentText.slice(0, MAX_TEXT_LENGTH),
    ts: at + 1,
    ...(input.suggestions?.length ? { suggestions: input.suggestions.slice(0, 3) } : {}),
    ...(input.entityContext?.length ? { entityContext: input.entityContext.slice(0, 12) } : {}),
    ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
  });
  if (next.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    next.messages = next.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  await writeDurableConversations(scope, [next], before ? [before] : []);
  return next;
}

/**
 * Something the agent said first: a reminder sent at its minute, a heads-up
 * before a meeting. It goes into the person's latest thread on that channel
 * (one that moved in the last week, the same rule WhatsApp uses to carry a
 * thread on), so their reply ("done", "remind me again in an hour") is read
 * with it. No thread that recent: it starts one.
 */
export async function appendAgentNotice(
  scope: WorkspaceMemberScope,
  input: { channel: ConversationChannel; text: string; at?: number },
): Promise<StoredConversation> {
  const at = input.at ?? Date.now();
  const current = (await readDurableConversations(scope)) ?? [];
  const latest = current
    .filter((c) => c.channel === input.channel)
    .sort((a, b) => b.updated - a.updated)[0];
  const before = latest && at - latest.updated < 7 * 86_400_000 ? latest : null;
  const next: StoredConversation = before
    ? { ...before, messages: [...before.messages], updated: at }
    : {
        id: `${input.channel === "whatsapp" ? "wa" : "c"}-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: input.text.replace(/\s+/g, " ").trim().slice(0, 80),
        messages: [],
        updated: at,
        channel: input.channel,
      };
  next.messages.push({ role: "agent", text: input.text.slice(0, MAX_TEXT_LENGTH), ts: at });
  if (next.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    next.messages = next.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  await writeDurableConversations(scope, [next], before ? [before] : []);
  return next;
}

/** The most recent conversation that came through a channel, for continuing it. */
export async function latestChannelConversation(
  scope: WorkspaceMemberScope,
  channel: ConversationChannel
): Promise<StoredConversation | null> {
  const current = (await readDurableConversations(scope)) ?? [];
  return current
    .filter((c) => c.channel === channel)
    .sort((a, b) => b.updated - a.updated)[0] ?? null;
}
