import { hasSupabase } from "./env";
import { mockDb } from "./mock-db";
import type {
  Customer,
  Contact,
  PitchSession,
  Interaction,
  FreyrKb,
  AgentRun,
  SequenceEnrollment,
  AgentPrefs,
  DraftSnippet,
  AgentChatMessage,
} from "./types";

// The shape every API route programs against. Both the mock layer and the
// Supabase adapter implement this identically, so routes never branch on mode.
export type Db = typeof mockDb;

export function getDb(): Db {
  if (hasSupabase()) {
    return buildSupabaseAdapter();
  }
  return mockDb;
}

function buildSupabaseAdapter(): Db {
  // Required lazily so the dependency is only touched when keys exist.
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const unwrap = <T>(res: { data: T; error: any }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  return {
    customers: {
      list: async () =>
        unwrap<Customer[]>(
          await supabase
            .from("customers")
            .select("*")
            .order("created_at", { ascending: false })
        ),
      get: async (id: string) => {
        const { data } = await supabase
          .from("customers")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return (data as Customer) || null;
      },
      findByName: async (name: string) => {
        const { data } = await supabase
          .from("customers")
          .select("*")
          .ilike("company_name", name)
          .maybeSingle();
        return (data as Customer) || null;
      },
      create: async (data: Partial<Customer>) =>
        unwrap<Customer>(
          await supabase.from("customers").insert(data).select().single()
        ),
      update: async (id: string, data: Partial<Customer>) =>
        unwrap<Customer>(
          await supabase
            .from("customers")
            .update({ ...data, last_enriched_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single()
        ),
    },
    contacts: {
      list: async (customerId?: string) => {
        let q = supabase.from("contacts").select("*");
        if (customerId) q = q.eq("customer_id", customerId);
        return unwrap<Contact[]>(await q);
      },
      get: async (id: string) => {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return (data as Contact) || null;
      },
      create: async (data: Partial<Contact>) =>
        unwrap<Contact>(
          await supabase.from("contacts").insert(data).select().single()
        ),
      update: async (id: string, data: Partial<Contact>) =>
        unwrap<Contact>(
          await supabase
            .from("contacts")
            .update(data)
            .eq("id", id)
            .select()
            .single()
        ),
    },
    pitchSessions: {
      list: async (customerId?: string, contactId?: string) => {
        let q = supabase
          .from("pitch_sessions")
          .select("*")
          .order("created_at", { ascending: false });
        if (customerId) q = q.eq("customer_id", customerId);
        if (contactId) q = q.eq("contact_id", contactId);
        return unwrap<PitchSession[]>(await q);
      },
      get: async (id: string) => {
        const { data } = await supabase
          .from("pitch_sessions")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return (data as PitchSession) || null;
      },
      create: async (data: Partial<PitchSession>) =>
        unwrap<PitchSession>(
          await supabase.from("pitch_sessions").insert(data).select().single()
        ),
      update: async (id: string, data: Partial<PitchSession>) =>
        unwrap<PitchSession>(
          await supabase
            .from("pitch_sessions")
            .update(data)
            .eq("id", id)
            .select()
            .single()
        ),
    },
    interactions: {
      list: async (customerId?: string, contactId?: string) => {
        let q = supabase
          .from("interactions")
          .select("*")
          .order("created_at", { ascending: false });
        if (customerId) q = q.eq("customer_id", customerId);
        if (contactId) q = q.eq("contact_id", contactId);
        return unwrap<Interaction[]>(await q);
      },
      create: async (data: Partial<Interaction>) =>
        unwrap<Interaction>(
          await supabase.from("interactions").insert(data).select().single()
        ),
      remove: async (id: string) => {
        const { error } = await supabase
          .from("interactions")
          .delete()
          .eq("id", id);
        return !error;
      },
    },
    agentRuns: {
      list: async () =>
        unwrap<AgentRun[]>(
          await supabase
            .from("agent_runs")
            .select("*")
            .order("created_at", { ascending: false })
        ),
      get: async (id: string) => {
        const { data } = await supabase
          .from("agent_runs")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return (data as AgentRun) || null;
      },
      create: async (data: Partial<AgentRun>) =>
        unwrap<AgentRun>(
          await supabase.from("agent_runs").insert(data).select().single()
        ),
      update: async (id: string, data: Partial<AgentRun>) =>
        unwrap<AgentRun>(
          await supabase
            .from("agent_runs")
            .update(data)
            .eq("id", id)
            .select()
            .single()
        ),
    },
    sequenceEnrollments: {
      list: async () =>
        unwrap<SequenceEnrollment[]>(
          await supabase
            .from("sequence_enrollments")
            .select("*")
            .order("created_at", { ascending: false })
        ),
      get: async (id: string) => {
        const { data } = await supabase
          .from("sequence_enrollments")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return (data as SequenceEnrollment) || null;
      },
      create: async (data: Partial<SequenceEnrollment>) =>
        unwrap<SequenceEnrollment>(
          await supabase
            .from("sequence_enrollments")
            .insert(data)
            .select()
            .single()
        ),
      update: async (id: string, data: Partial<SequenceEnrollment>) =>
        unwrap<SequenceEnrollment>(
          await supabase
            .from("sequence_enrollments")
            .update(data)
            .eq("id", id)
            .select()
            .single()
        ),
      remove: async (id: string) => {
        const { error } = await supabase
          .from("sequence_enrollments")
          .delete()
          .eq("id", id);
        return !error;
      },
    },
    agentPrefs: {
      get: async () => {
        const { data } = await supabase
          .from("agent_prefs")
          .select("*")
          .limit(1)
          .maybeSingle();
        return (data as AgentPrefs) || null;
      },
      update: async (data: Partial<AgentPrefs>) => {
        const { data: existing } = await supabase
          .from("agent_prefs")
          .select("id")
          .limit(1)
          .maybeSingle();
        const patch = { ...data, updated_at: new Date().toISOString() };
        if (existing?.id) {
          return unwrap<AgentPrefs>(
            await supabase
              .from("agent_prefs")
              .update(patch)
              .eq("id", existing.id)
              .select()
              .single()
          );
        }
        return unwrap<AgentPrefs>(
          await supabase.from("agent_prefs").insert(patch).select().single()
        );
      },
    },
    draftSnippets: {
      list: async () =>
        unwrap<DraftSnippet[]>(
          await supabase
            .from("draft_snippets")
            .select("*")
            .order("created_at", { ascending: false })
        ),
      create: async (data: Partial<DraftSnippet>) =>
        unwrap<DraftSnippet>(
          await supabase.from("draft_snippets").insert(data).select().single()
        ),
      update: async (id: string, data: Partial<DraftSnippet>) =>
        unwrap<DraftSnippet>(
          await supabase
            .from("draft_snippets")
            .update(data)
            .eq("id", id)
            .select()
            .single()
        ),
      bumpUse: async (id: string) => {
        const { data: cur } = await supabase
          .from("draft_snippets")
          .select("uses")
          .eq("id", id)
          .maybeSingle();
        return unwrap<DraftSnippet>(
          await supabase
            .from("draft_snippets")
            .update({ uses: ((cur as { uses?: number })?.uses || 0) + 1 })
            .eq("id", id)
            .select()
            .single()
        );
      },
      remove: async (id: string) => {
        const { error } = await supabase
          .from("draft_snippets")
          .delete()
          .eq("id", id);
        return !error;
      },
    },
    agentChats: {
      list: async (customerId: string) =>
        unwrap<AgentChatMessage[]>(
          await supabase
            .from("agent_chats")
            .select("*")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: true })
        ),
      create: async (data: Partial<AgentChatMessage>) =>
        unwrap<AgentChatMessage>(
          await supabase.from("agent_chats").insert(data).select().single()
        ),
      clear: async (customerId: string) => {
        const { error } = await supabase
          .from("agent_chats")
          .delete()
          .eq("customer_id", customerId);
        return error ? 0 : 1;
      },
    },
    freyrKb: {
      get: async () => {
        const { data } = await supabase
          .from("freyr_knowledge_base")
          .select("*")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data as FreyrKb) || null;
      },
      update: async (data: Partial<FreyrKb>) => {
        const { data: existing } = await supabase
          .from("freyr_knowledge_base")
          .select("id")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          return unwrap<FreyrKb>(
            await supabase
              .from("freyr_knowledge_base")
              .update(data)
              .eq("id", existing.id)
              .select()
              .single()
          );
        }
        return unwrap<FreyrKb>(
          await supabase
            .from("freyr_knowledge_base")
            .insert(data)
            .select()
            .single()
        );
      },
    },
  } as Db;
}
