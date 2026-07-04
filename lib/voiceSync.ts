// Tie real ElevenLabs conversations back to CRM contacts and STORE them
// (Anir, Jul 4: "when someone calls, you have to immediately pull that
// information, and then it should store that, obviously, somewhere").
// A finished call whose phone number matches a contact gets logged to that
// account's timeline exactly once, with the call summary + transcript link.

import { getDb } from "./db";
import {
  getConversation,
  type ElConversation,
  type ElConversationDetail,
} from "./elevenlabs";

export interface ConvoMatch {
  contactId: string;
  contactName: string;
  customerId: string;
  company?: string;
  externalNumber?: string;
}

interface SyncState {
  logged: Set<string>; // conversation_ids already written to a timeline
  details: Map<string, ElConversationDetail | null>; // detail fetch cache
  matches: Map<string, ConvoMatch | null>;
}

function state(): SyncState {
  const g = globalThis as typeof globalThis & { __freyrVoiceSync?: SyncState };
  if (!g.__freyrVoiceSync)
    g.__freyrVoiceSync = {
      logged: new Set(),
      details: new Map(),
      matches: new Map(),
    };
  return g.__freyrVoiceSync;
}

// Compare the last 10 digits — "+1 (929) 799-8902" matches "9297998902".
const norm = (p: string) => p.replace(/\D/g, "").slice(-10);

export async function detailFor(
  conversationId: string
): Promise<ElConversationDetail | null> {
  const st = state();
  if (!st.details.has(conversationId)) {
    st.details.set(conversationId, await getConversation(conversationId));
  }
  return st.details.get(conversationId) || null;
}

// Match finished conversations to contacts by phone and log them to the
// account timeline (once per conversation). Returns conversation_id → match.
export async function syncConversations(
  convos: ElConversation[]
): Promise<Record<string, ConvoMatch>> {
  const st = state();
  const out: Record<string, ConvoMatch> = {};
  try {
    const db = getDb();
    const [contacts, customers] = await Promise.all([
      db.contacts.list(),
      db.customers.list(),
    ]);
    const withPhone = contacts.filter((c) => c.phone);
    if (withPhone.length === 0) return out;
    const byPhone = new Map(withPhone.map((c) => [norm(c.phone!), c]));
    const companyById = new Map(customers.map((c) => [c.id, c.company_name]));

    // Newest first, cap the per-load detail fetches.
    for (const convo of convos.slice(0, 12)) {
      const id = convo.conversation_id;
      if (st.matches.has(id)) {
        const cached = st.matches.get(id);
        if (cached) out[id] = cached;
        continue;
      }
      const detail = await detailFor(id);
      const external = detail?.metadata?.phone_call?.external_number;
      const contact = external ? byPhone.get(norm(external)) : undefined;
      if (!contact) {
        st.matches.set(id, null);
        continue;
      }
      const match: ConvoMatch = {
        contactId: contact.id,
        contactName: contact.full_name,
        customerId: contact.customer_id,
        company: companyById.get(contact.customer_id),
        externalNumber: external,
      };
      st.matches.set(id, match);
      out[id] = match;

      // Store it on the account — once, and only for finished calls.
      if (convo.status === "done" && !st.logged.has(id)) {
        st.logged.add(id);
        const summary = detail?.analysis?.transcript_summary;
        await db.interactions.create({
          pitch_session_id: null,
          customer_id: contact.customer_id,
          contact_id: contact.id,
          outcome:
            detail?.analysis?.call_successful === "failure"
              ? "ai_call_failed"
              : "ai_call_completed",
          notes: `📞 AI voice call with ${contact.full_name}${
            summary ? ` — ${summary.slice(0, 240)}` : ""
          } (transcript: /voice/c/${id})`,
          follow_up_date: null,
          logged_by: "Freyr Voice Agent",
        });
      }
    }
  } catch {
    // Live sync must never take the page down.
  }
  return out;
}
