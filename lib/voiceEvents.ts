import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { v5 as uuidv5 } from "uuid";
import { getDb } from "./db";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";
import type { ElConversationDetail, ElTranscriptTurn } from "./elevenlabs";
import type { VoiceCall, VoiceOutcome } from "./voice";
import agentIds from "./voiceAgents.json";

export type VoiceLifecycleStatus =
  | "initiated"
  | "in_progress"
  | "analyzing"
  | "completed"
  | "failed";

export interface StoredVoiceConversation {
  id: string;
  workspace_id: string | null;
  conversation_id: string | null;
  call_sid: string | null;
  agent_id: string;
  agent_name: string | null;
  direction: "inbound" | "outbound";
  status: VoiceLifecycleStatus;
  contact_id: string | null;
  contact_name: string | null;
  customer_id: string | null;
  company: string | null;
  external_number: string | null;
  offering_id: string | null;
  offering_name: string | null;
  category: string | null;
  outcome: VoiceOutcome | null;
  summary: string | null;
  transcript: ElTranscriptTurn[];
  analysis: Record<string, unknown>;
  metadata: Record<string, unknown>;
  dynamic_variables: Record<string, string>;
  duration_secs: number | null;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  interaction_id: string | null;
  created_at: string;
  updated_at: string;
}

type VoicePatch = Partial<StoredVoiceConversation> &
  Pick<StoredVoiceConversation, "agent_id" | "status">;

interface VoiceEventStore {
  records: Map<string, StoredVoiceConversation>;
}

const INTERACTION_NAMESPACE = "72b13cde-d6dc-5bc5-8d57-8c1fef30bb27";
const normPhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredVoiceWorkspaceId(): string {
  const workspace = process.env.FREYR_WORKSPACE_ID?.trim();
  if (!workspace) {
    throw new Error(
      "FREYR_WORKSPACE_ID is required for live voice conversation access."
    );
  }
  return workspace;
}

function memoryVoiceWorkspaceId(): string | null {
  if (getDataMode() === "mock") return null;
  const configured = process.env.FREYR_WORKSPACE_ID?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FREYR_WORKSPACE_ID is required for live voice conversation access."
    );
  }
  return "local-live-workspace";
}

function inMemoryVoiceScope(record: StoredVoiceConversation): boolean {
  const workspace = memoryVoiceWorkspaceId();
  return workspace === null || record.workspace_id === workspace;
}

function memoryStore(): VoiceEventStore {
  const g = globalThis as typeof globalThis & {
    __freyrMockVoiceEvents?: VoiceEventStore;
    __freyrLiveVoiceEvents?: VoiceEventStore;
  };
  const key = getDataMode() === "mock" ? "__freyrMockVoiceEvents" : "__freyrLiveVoiceEvents";
  if (!g[key]) g[key] = { records: new Map() };
  return g[key]!;
}

function supabaseClient() {
  // Lazy loading keeps the browser bundle and mock mode free of server credentials.
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function defaultRecord(patch: VoicePatch): StoredVoiceConversation {
  const now = new Date().toISOString();
  return {
    id: patch.id || randomUUID(),
    workspace_id:
      getDataMode() === "mock"
        ? patch.workspace_id || null
        : memoryVoiceWorkspaceId(),
    conversation_id: patch.conversation_id || null,
    call_sid: patch.call_sid || null,
    agent_id: patch.agent_id,
    agent_name: patch.agent_name || null,
    direction: patch.direction || "outbound",
    status: patch.status,
    contact_id: patch.contact_id || null,
    contact_name: patch.contact_name || null,
    customer_id: patch.customer_id || null,
    company: patch.company || null,
    external_number: patch.external_number || null,
    offering_id: patch.offering_id || null,
    offering_name: patch.offering_name || null,
    category: patch.category || null,
    outcome: patch.outcome || null,
    summary: patch.summary || null,
    transcript: patch.transcript || [],
    analysis: patch.analysis || {},
    metadata: patch.metadata || {},
    dynamic_variables: patch.dynamic_variables || {},
    duration_secs: patch.duration_secs ?? null,
    failure_reason: patch.failure_reason || null,
    started_at: patch.started_at || null,
    completed_at: patch.completed_at || null,
    interaction_id: patch.interaction_id || null,
    created_at: patch.created_at || now,
    updated_at: patch.updated_at || now,
  };
}

async function findExisting(
  conversationId?: string | null,
  callSid?: string | null
): Promise<StoredVoiceConversation | null> {
  if (hasSupabase()) {
    const supabase = supabaseClient();
    const workspace = configuredVoiceWorkspaceId();
    if (conversationId) {
      const { data, error } = await supabase
        .from("voice_conversations")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("workspace_id", workspace)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data as StoredVoiceConversation;
    }
    if (callSid) {
      const { data, error } = await supabase
        .from("voice_conversations")
        .select("*")
        .eq("call_sid", callSid)
        .eq("workspace_id", workspace)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data as StoredVoiceConversation;
    }
    return null;
  }
  return (
    Array.from(memoryStore().records.values()).find(
      (record) =>
        inMemoryVoiceScope(record) &&
        ((!!conversationId && record.conversation_id === conversationId) ||
          (!!callSid && record.call_sid === callSid))
    ) || null
  );
}

export async function upsertVoiceConversation(
  patch: VoicePatch
): Promise<StoredVoiceConversation> {
  const existing = await findExisting(patch.conversation_id, patch.call_sid);
  let merged = defaultRecord({
    ...(existing || {}),
    ...patch,
    id: existing?.id || patch.id,
    transcript: patch.transcript ?? existing?.transcript ?? [],
    analysis: patch.analysis ?? existing?.analysis ?? {},
    metadata: patch.metadata ?? existing?.metadata ?? {},
    dynamic_variables:
      patch.dynamic_variables ?? existing?.dynamic_variables ?? {},
    created_at: existing?.created_at || patch.created_at,
    updated_at: new Date().toISOString(),
  });

  if (getDataMode() === "live") {
    const db = getDb();
    const contact = merged.contact_id
      ? await db.contacts.get(merged.contact_id)
      : null;
    if (merged.contact_id && !contact) {
      throw new Error(
        "Voice conversation contact is outside the configured workspace."
      );
    }
    const customerId = merged.customer_id || contact?.customer_id || null;
    const customer = customerId ? await db.customers.get(customerId) : null;
    if (customerId && !customer) {
      throw new Error(
        "Voice conversation customer is outside the configured workspace."
      );
    }
    if (contact && customerId && contact.customer_id !== customerId) {
      throw new Error(
        "Voice conversation contact does not belong to the workspace customer."
      );
    }
    merged = { ...merged, customer_id: customerId };
  }

  if (hasSupabase()) {
    const supabase = supabaseClient();
    const workspace = configuredVoiceWorkspaceId();
    const scoped = { ...merged, workspace_id: workspace };
    const query = existing
      ? supabase
          .from("voice_conversations")
          .update(scoped)
          .eq("id", existing.id)
          .eq("workspace_id", workspace)
      : supabase.from("voice_conversations").insert(scoped);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error(
        "Voice conversation is not available in the configured workspace."
      );
    }
    return data as StoredVoiceConversation;
  }

  memoryStore().records.set(merged.id, merged);
  return merged;
}

export async function listStoredVoiceConversations(
  limit = 100
): Promise<StoredVoiceConversation[]> {
  if (hasSupabase()) {
    const workspace = configuredVoiceWorkspaceId();
    const { data, error } = await supabaseClient()
      .from("voice_conversations")
      .select("*")
      .eq("workspace_id", workspace)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as StoredVoiceConversation[];
  }
  return Array.from(memoryStore().records.values())
    .filter((record) => inMemoryVoiceScope(record))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getStoredVoiceConversation(
  conversationId: string
): Promise<StoredVoiceConversation | null> {
  const found = await findExisting(conversationId, null);
  if (found) return found;
  if (hasSupabase() && UUID_PATTERN.test(conversationId)) {
    const workspace = configuredVoiceWorkspaceId();
    const { data, error } = await supabaseClient()
      .from("voice_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("workspace_id", workspace)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as StoredVoiceConversation) || null;
  }
  const record = memoryStore().records.get(conversationId) || null;
  return record && inMemoryVoiceScope(record) ? record : null;
}

export function mapElevenLabsStatus(status?: string): VoiceLifecycleStatus {
  if (status === "done") return "completed";
  if (status === "failed") return "failed";
  if (status === "processing") return "analyzing";
  if (status === "in-progress") return "in_progress";
  return "initiated";
}

function dynamicVariables(detail: ElConversationDetail): Record<string, string> {
  const raw = detail.conversation_initiation_client_data?.dynamic_variables;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) =>
      value == null ? [] : [[key, String(value)]]
    )
  );
}

function inferOutcome(detail: ElConversationDetail): VoiceOutcome | null {
  const analysis = detail.analysis || {};
  const collected = analysis.data_collection_results || {};
  const candidate = Object.values(collected)
    .map((entry) =>
      typeof entry === "object" && entry
        ? String((entry as { value?: unknown }).value || "")
        : String(entry || "")
    )
    .join(" ")
    .toLowerCase();
  const summary = `${candidate} ${analysis.transcript_summary || ""}`.toLowerCase();
  if (/meeting|booked|interested|qualified/.test(summary)) return "interested";
  if (/follow.?up|call back|callback/.test(summary)) return "follow_up";
  if (/no answer|voicemail|did not connect/.test(summary)) return "no_answer";
  if (/declined|not interested|not a fit/.test(summary)) return "declined";
  return null;
}

async function resolveCrmContext(detail: ElConversationDetail) {
  const vars = dynamicVariables(detail);
  const db = getDb();
  let contact = vars.contact_id
    ? await db.contacts.get(vars.contact_id).catch(() => null)
    : null;
  const external =
    detail.metadata?.phone_call?.external_number || vars.external_number || null;
  if (!contact && external) {
    const contacts = await db.contacts.list();
    contact =
      contacts.find(
        (candidate) =>
          !!candidate.phone && normPhone(candidate.phone) === normPhone(external)
      ) || null;
  }
  const customer = contact?.customer_id
    ? await db.customers.get(contact.customer_id).catch(() => null)
    : vars.customer_id
      ? await db.customers.get(vars.customer_id).catch(() => null)
      : null;
  return { vars, contact, customer, external };
}

async function logCompletedInteraction(
  record: StoredVoiceConversation
): Promise<string | null> {
  if (!record.conversation_id || !record.contact_id || !record.customer_id) return null;
  const interactionId = uuidv5(record.conversation_id, INTERACTION_NAMESPACE);
  try {
    await getDb().interactions.create({
      id: interactionId,
      pitch_session_id: null,
      customer_id: record.customer_id,
      contact_id: record.contact_id,
      outcome: record.status === "failed" ? "ai_call_failed" : "ai_call_completed",
      notes: `AI voice call with ${record.contact_name || "contact"}${
        record.summary ? ` - ${record.summary.slice(0, 360)}` : ""
      } (transcript: /voice/c/${record.conversation_id})`,
      follow_up_date: null,
      logged_by: record.agent_name || "Freyr Voice Agent",
      created_at: record.completed_at || record.updated_at,
    });
  } catch (error) {
    // Deterministic UUID makes webhook retries idempotent; a duplicate insert is fine.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate") && !message.includes("unique")) throw error;
  }
  return interactionId;
}

export async function ingestElevenLabsConversation(
  detail: ElConversationDetail
): Promise<StoredVoiceConversation> {
  const { vars, contact, customer, external } = await resolveCrmContext(detail);
  const category =
    vars.category ||
    Object.entries(agentIds as Record<string, string>).find(
      ([, agentId]) => agentId === detail.agent_id
    )?.[0] ||
    null;
  const status = mapElevenLabsStatus(detail.status);
  const startedAt = detail.metadata?.start_time_unix_secs
    ? new Date(detail.metadata.start_time_unix_secs * 1000).toISOString()
    : undefined;
  let record = await upsertVoiceConversation({
    conversation_id: detail.conversation_id,
    call_sid:
      detail.metadata?.phone_call?.call_sid || vars.call_sid || undefined,
    agent_id: detail.agent_id,
    agent_name: detail.agent_name || undefined,
    direction:
      detail.metadata?.phone_call?.direction === "inbound" ||
      vars.call_direction === "inbound"
        ? "inbound"
        : "outbound",
    status,
    contact_id: contact?.id || undefined,
    contact_name: contact?.full_name || vars.contact_name || undefined,
    customer_id: customer?.id || undefined,
    company: customer?.company_name || vars.company || undefined,
    external_number: external || undefined,
    offering_id: vars.offering_id || undefined,
    offering_name: vars.offering || undefined,
    category,
    outcome: inferOutcome(detail) || undefined,
    summary: detail.analysis?.transcript_summary || undefined,
    transcript: detail.transcript || [],
    analysis: detail.analysis || {},
    metadata: detail.metadata || {},
    dynamic_variables: vars,
    duration_secs: detail.metadata?.call_duration_secs,
    started_at: startedAt,
    completed_at:
      status === "completed" || status === "failed"
        ? new Date().toISOString()
        : undefined,
  });
  if ((status === "completed" || status === "failed") && !record.interaction_id) {
    const interactionId = await logCompletedInteraction(record);
    if (interactionId) {
      record = await upsertVoiceConversation({
        ...record,
        agent_id: record.agent_id,
        status: record.status,
        interaction_id: interactionId,
      });
    }
  }
  return record;
}

export function verifyElevenLabsSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    })
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const actual = parts.v0 || "";
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function testWebhookSecret(): string | null {
  return (
    process.env.ELEVENLABS_WEBHOOK_SECRET ||
    (process.env.NODE_ENV !== "production" &&
    process.env.AGENT_FORCE_MOCK === "1"
      ? "freyr-test-elevenlabs-secret"
      : null)
  );
}

export function storedVoiceCall(record: StoredVoiceConversation): VoiceCall {
  return {
    id: record.id,
    conversation_id: record.conversation_id,
    call_sid: record.call_sid,
    contact_id: record.contact_id || "",
    contact_name: record.contact_name || record.external_number || "Unknown caller",
    company: record.company || "",
    phone: record.external_number,
    offering_id: record.offering_id,
    offering_name: record.offering_name || record.category || "Voice call",
    category: record.category || "Voice agent",
    agent_id: record.agent_id,
    status: record.status,
    reason: record.failure_reason || undefined,
    outcome: record.outcome,
    duration_secs: record.duration_secs,
    created_at: record.started_at || record.created_at,
  };
}
