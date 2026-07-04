// Thin ElevenLabs Conversational-AI client — only what the platform needs.
// Agents themselves are created by the setup script (see lib/voiceAgents.json);
// at runtime we place outbound calls and read back real conversation data
// (transcripts, durations, outcomes) once a phone number is connected.

const API_BASE = "https://api.elevenlabs.io/v1";

function key(): string | null {
  return process.env.ELEVENLABS_API_KEY || null;
}

// Personalization context passed into the call ("wire it up so that it
// remembers me" — Anir, Jul 4): the agent greets the prospect by name, opens
// with a line written for THIS call, and pitches the right offering.
export interface CallContext {
  contact_name?: string;
  company?: string;
  offering?: string;
  opening_line?: string;
  call_direction?: "inbound" | "outbound";
}

export async function outboundCall(
  agentId: string,
  agentPhoneNumberId: string,
  toNumber: string,
  context?: CallContext
): Promise<boolean> {
  const k = key();
  if (!k) return false;
  try {
    const vars: Record<string, string> = {
      contact_name: context?.contact_name || "there",
      company: context?.company || "your company",
      offering: context?.offering || "our regulatory services",
      call_direction: context?.call_direction || "outbound",
    };
    if (context?.opening_line) vars.opening_line = context.opening_line;
    const res = await fetch(`${API_BASE}/convai/twilio/outbound-call`, {
      method: "POST",
      headers: { "xi-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber,
        conversation_initiation_client_data: { dynamic_variables: vars },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// A finished (or in-flight) conversation as ElevenLabs reports it.
export interface ElConversation {
  conversation_id: string;
  agent_id: string;
  agent_name?: string;
  status: string; // "done" | "in-progress" | "processing" | "failed" | ...
  call_duration_secs?: number;
  message_count?: number;
  start_time_unix_secs?: number;
  call_successful?: string; // "success" | "failure" | "unknown"
  direction?: string; // "inbound" | "outbound"
}

export async function listConversations(limit = 30): Promise<ElConversation[]> {
  const k = key();
  if (!k) return [];
  try {
    const res = await fetch(
      `${API_BASE}/convai/conversations?page_size=${limit}`,
      { headers: { "xi-api-key": k }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.conversations || []) as ElConversation[];
  } catch {
    return [];
  }
}

export interface ElTranscriptTurn {
  role: string; // "agent" | "user"
  message: string | null;
  time_in_call_secs?: number;
}

export interface ElConversationDetail {
  conversation_id: string;
  agent_id: string;
  status: string;
  transcript: ElTranscriptTurn[];
  metadata?: {
    call_duration_secs?: number;
    start_time_unix_secs?: number;
    // Who was on the other end — how calls tie back to contacts.
    phone_call?: {
      external_number?: string;
      agent_number?: string;
      direction?: string;
    };
  };
  analysis?: {
    call_successful?: string;
    transcript_summary?: string;
  };
}

export async function getConversation(
  id: string
): Promise<ElConversationDetail | null> {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch(`${API_BASE}/convai/conversations/${id}`, {
      headers: { "xi-api-key": k },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ElConversationDetail;
  } catch {
    return null;
  }
}
