import { hasSupabase } from "./env";
import { mockDb } from "./mock-db";
import { liveDb } from "./live-db";
import { getDataMode } from "./dataMode";
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
  WorkspaceMemberScope,
} from "./types";

// The shape every API route programs against. Both the mock layer and the
// Supabase adapter implement this identically, so routes never branch on mode.
export type Db = typeof mockDb;

export function getDb(): Db {
  if (getDataMode() === "mock") return mockDb;
  if (hasSupabase()) {
    return buildSupabaseAdapter();
  }
  return liveDb as Db;
}

export function buildSupabaseAdapter(supabaseOverride?: any): Db {
  // Required lazily so the dependency is only touched when keys exist.
  const supabase =
    supabaseOverride ||
    require("@supabase/supabase-js").createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  const configuredWorkspaceId = process.env.FREYR_WORKSPACE_ID?.trim();
  if (!configuredWorkspaceId) {
    throw new Error(
      "FREYR_WORKSPACE_ID is required for live Supabase data access."
    );
  }

  const unwrap = <T>(res: { data: T; error: any }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  const maybe = <T>(res: { data: T | null; error: any }): T | null => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  const stripRelation = <T>(
    value: (T & Record<string, unknown>) | null,
    relation: string
  ): T | null => {
    if (!value) return null;
    const copy = { ...value };
    delete copy[relation];
    return copy as T;
  };

  let verifiedWorkspace: Promise<string> | null = null;
  const workspaceId = async (): Promise<string> => {
    if (!verifiedWorkspace) {
      verifiedWorkspace = (async () => {
        const result = await supabase
          .from("workspaces")
          .select("id")
          .eq("id", configuredWorkspaceId)
          .maybeSingle();
        const workspace = maybe<{ id: string }>(result);
        if (!workspace?.id) {
          throw new Error("The configured Freyr workspace does not exist.");
        }
        return workspace.id;
      })();
    }
    return verifiedWorkspace;
  };

  const scopedCustomer = async (id: string): Promise<Customer | null> => {
    const workspace = await workspaceId();
    return maybe<Customer>(
      await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .eq("workspace_id", workspace)
        .maybeSingle()
    );
  };

  const scopedContact = async (id: string): Promise<Contact | null> => {
    const workspace = await workspaceId();
    const row = maybe<Contact & Record<string, unknown>>(
      await supabase
        .from("contacts")
        .select("*, customers!inner(workspace_id)")
        .eq("id", id)
        .eq("customers.workspace_id", workspace)
        .maybeSingle()
    );
    return stripRelation<Contact>(row, "customers");
  };

  const scopedPitchSession = async (
    id: string
  ): Promise<PitchSession | null> => {
    const workspace = await workspaceId();
    const row = maybe<PitchSession & Record<string, unknown>>(
      await supabase
        .from("pitch_sessions")
        .select("*, customers!inner(workspace_id)")
        .eq("id", id)
        .eq("workspace_id", workspace)
        .eq("customers.workspace_id", workspace)
        .maybeSingle()
    );
    return stripRelation<PitchSession>(row, "customers");
  };

  const scopedInteraction = async (
    id: string
  ): Promise<Pick<Interaction, "id" | "customer_id"> | null> => {
    const workspace = await workspaceId();
    const row = maybe<
      Pick<Interaction, "id" | "customer_id"> & Record<string, unknown>
    >(
      await supabase
        .from("interactions")
        .select("id, customer_id, customers!inner(workspace_id)")
        .eq("id", id)
        .eq("customers.workspace_id", workspace)
        .maybeSingle()
    );
    return stripRelation<Pick<Interaction, "id" | "customer_id">>(
      row,
      "customers"
    );
  };

  const scopedAgentRun = async (id: string): Promise<AgentRun | null> => {
    const workspace = await workspaceId();
    const row = maybe<AgentRun & Record<string, unknown>>(
      await supabase
        .from("agent_runs")
        .select("*, customers(workspace_id)")
        .eq("id", id)
        .eq("workspace_id", workspace)
        .maybeSingle()
    );
    if (!row) return null;
    const parent = row.customers as { workspace_id?: string } | null;
    if (row.customer_id && parent?.workspace_id !== workspace) return null;
    return stripRelation<AgentRun>(row, "customers");
  };

  const scopedSequenceEnrollment = async (
    id: string
  ): Promise<SequenceEnrollment | null> => {
    const workspace = await workspaceId();
    const row = maybe<SequenceEnrollment & Record<string, unknown>>(
      await supabase
        .from("sequence_enrollments")
        .select("*, customers!inner(workspace_id)")
        .eq("id", id)
        .eq("workspace_id", workspace)
        .eq("customers.workspace_id", workspace)
        .maybeSingle()
    );
    return stripRelation<SequenceEnrollment>(row, "customers");
  };

  const requireCustomer = async (id: string | null | undefined) => {
    if (!id || !(await scopedCustomer(id))) {
      throw new Error("Customer is not available in the configured workspace.");
    }
  };

  const requireContact = async (
    id: string | null | undefined,
    customerId: string
  ) => {
    const contact = id ? await scopedContact(id) : null;
    if (!contact || contact.customer_id !== customerId) {
      throw new Error("Contact is not available for this workspace customer.");
    }
  };

  const requirePitchSession = async (
    id: string | null | undefined,
    customerId: string,
    contactId?: string | null
  ) => {
    const session = id ? await scopedPitchSession(id) : null;
    if (
      !session ||
      session.customer_id !== customerId ||
      (contactId && session.contact_id !== contactId)
    ) {
      throw new Error(
        "Pitch session is not available for this workspace customer."
      );
    }
  };

  const requireInteractionIds = async (
    ids: string[] | null | undefined
  ): Promise<void> => {
    if (!ids?.length) return;
    const rows = await Promise.all(ids.map((id) => scopedInteraction(id)));
    if (rows.some((row) => !row)) {
      throw new Error(
        "Agent run references an interaction outside the configured workspace."
      );
    }
  };

  const requireMemberScope = async (
    scope: WorkspaceMemberScope
  ): Promise<string> => {
    const workspace = await workspaceId();
    if (scope.workspaceId !== workspace) {
      throw new Error("Workspace member scope does not match this deployment.");
    }
    const member = maybe<{ id: string }>(
      await supabase
        .from("app_users")
        .select("id")
        .eq("id", scope.userId)
        .eq("workspace_id", workspace)
        .eq("active", true)
        .maybeSingle()
    );
    if (!member?.id) {
      throw new Error("Active workspace member was not found.");
    }
    return workspace;
  };

  return {
    customers: {
      list: async () => {
        const workspace = await workspaceId();
        return unwrap<Customer[]>(
          await supabase
            .from("customers")
            .select("*")
            .eq("workspace_id", workspace)
            .order("created_at", { ascending: false })
        );
      },
      get: async (id: string) => scopedCustomer(id),
      findByName: async (name: string, requestedWorkspaceId?: string) => {
        const workspace = await workspaceId();
        if (requestedWorkspaceId && requestedWorkspaceId !== workspace)
          return null;
        const result = await supabase
          .from("customers")
          .select("*")
          .ilike("company_name", name)
          .eq("workspace_id", workspace)
          .maybeSingle();
        return maybe<Customer>(result);
      },
      create: async (data: Partial<Customer>) => {
        const workspace = await workspaceId();
        return unwrap<Customer>(
          await supabase
            .from("customers")
            .insert({ ...data, workspace_id: workspace })
            .select()
            .single()
        );
      },
      update: async (id: string, data: Partial<Customer>) => {
        const workspace = await workspaceId();
        const result = await supabase
          .from("customers")
          .update({
            ...data,
            workspace_id: workspace,
            last_enriched_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .select()
          .maybeSingle();
        return maybe<Customer>(result);
      },
    },
    contacts: {
      list: async (customerId?: string) => {
        const workspace = await workspaceId();
        if (customerId) {
          if (!(await scopedCustomer(customerId))) return [];
          return unwrap<Contact[]>(
            await supabase
              .from("contacts")
              .select("*")
              .eq("customer_id", customerId)
          );
        }
        const rows = unwrap<Array<Contact & Record<string, unknown>>>(
          await supabase
            .from("contacts")
            .select("*, customers!inner(workspace_id)")
            .eq("customers.workspace_id", workspace)
        );
        return rows.map(
          (row) => stripRelation<Contact>(row, "customers") as Contact
        );
      },
      get: async (id: string) => scopedContact(id),
      create: async (data: Partial<Contact>) => {
        await requireCustomer(data.customer_id);
        return unwrap<Contact>(
          await supabase.from("contacts").insert(data).select().single()
        );
      },
      update: async (id: string, data: Partial<Contact>) => {
        const existing = await scopedContact(id);
        if (!existing) return null;
        const customerId = data.customer_id || existing.customer_id;
        await requireCustomer(customerId);
        const result = await supabase
          .from("contacts")
          .update({ ...data, customer_id: customerId })
          .eq("id", id)
          .eq("customer_id", existing.customer_id)
          .select()
          .maybeSingle();
        return maybe<Contact>(result);
      },
    },
    pitchSessions: {
      list: async (customerId?: string, contactId?: string) => {
        const workspace = await workspaceId();
        let q = supabase
          .from("pitch_sessions")
          .select("*, customers!inner(workspace_id)")
          .eq("workspace_id", workspace)
          .eq("customers.workspace_id", workspace)
          .order("created_at", { ascending: false });
        if (customerId) q = q.eq("customer_id", customerId);
        if (contactId) q = q.eq("contact_id", contactId);
        const rows = unwrap<Array<PitchSession & Record<string, unknown>>>(
          await q
        );
        return rows.map(
          (row) =>
            stripRelation<PitchSession>(row, "customers") as PitchSession
        );
      },
      get: async (id: string) => scopedPitchSession(id),
      create: async (data: Partial<PitchSession>) => {
        const workspace = await workspaceId();
        if (!data.customer_id || !data.contact_id) {
          throw new Error(
            "Pitch sessions require a workspace customer and contact."
          );
        }
        await requireCustomer(data.customer_id);
        await requireContact(data.contact_id, data.customer_id);
        return unwrap<PitchSession>(
          await supabase
            .from("pitch_sessions")
            .insert({ ...data, workspace_id: workspace })
            .select()
            .single()
        );
      },
      update: async (id: string, data: Partial<PitchSession>) => {
        const workspace = await workspaceId();
        const existing = await scopedPitchSession(id);
        if (!existing) return null;
        const customerId = data.customer_id || existing.customer_id;
        const contactId = data.contact_id || existing.contact_id;
        await requireCustomer(customerId);
        await requireContact(contactId, customerId);
        const result = await supabase
          .from("pitch_sessions")
          .update({
            ...data,
            customer_id: customerId,
            contact_id: contactId,
            workspace_id: workspace,
          })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .select()
          .maybeSingle();
        return maybe<PitchSession>(result);
      },
    },
    interactions: {
      list: async (customerId?: string, contactId?: string) => {
        const workspace = await workspaceId();
        if (customerId && !(await scopedCustomer(customerId))) return [];
        if (contactId) {
          const contact = await scopedContact(contactId);
          if (!contact || (customerId && contact.customer_id !== customerId)) {
            return [];
          }
          const q = supabase
            .from("interactions")
            .select("*")
            .eq("customer_id", contact.customer_id)
            .eq("contact_id", contactId)
            .order("created_at", { ascending: false });
          return unwrap<Interaction[]>(await q);
        }
        if (customerId) {
          return unwrap<Interaction[]>(
            await supabase
              .from("interactions")
              .select("*")
              .eq("customer_id", customerId)
              .order("created_at", { ascending: false })
          );
        }
        const rows = unwrap<Array<Interaction & Record<string, unknown>>>(
          await supabase
            .from("interactions")
            .select("*, customers!inner(workspace_id)")
            .eq("customers.workspace_id", workspace)
            .order("created_at", { ascending: false })
        );
        return rows.map(
          (row) => stripRelation<Interaction>(row, "customers") as Interaction
        );
      },
      create: async (data: Partial<Interaction>) => {
        if (!data.customer_id || !data.contact_id) {
          throw new Error(
            "Interactions require a workspace customer and contact."
          );
        }
        await requireCustomer(data.customer_id);
        await requireContact(data.contact_id, data.customer_id);
        if (data.pitch_session_id) {
          await requirePitchSession(
            data.pitch_session_id,
            data.customer_id,
            data.contact_id
          );
        }
        return unwrap<Interaction>(
          await supabase.from("interactions").insert(data).select().single()
        );
      },
      remove: async (id: string) => {
        const existing = await scopedInteraction(id);
        if (!existing) return false;
        const result = await supabase
          .from("interactions")
          .delete()
          .eq("id", id)
          .eq("customer_id", existing.customer_id)
          .select("id")
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return !!result.data;
      },
    },
    agentRuns: {
      list: async () => {
        const workspace = await workspaceId();
        const rows = unwrap<Array<AgentRun & Record<string, unknown>>>(
          await supabase
            .from("agent_runs")
            .select("*, customers(workspace_id)")
            .eq("workspace_id", workspace)
            .order("created_at", { ascending: false })
        );
        return rows
          .filter((row) => {
            const parent = row.customers as {
              workspace_id?: string;
            } | null;
            return !row.customer_id || parent?.workspace_id === workspace;
          })
          .map(
            (row) => stripRelation<AgentRun>(row, "customers") as AgentRun
          );
      },
      get: async (id: string) => scopedAgentRun(id),
      create: async (data: Partial<AgentRun>) => {
        const workspace = await workspaceId();
        if (data.customer_id) await requireCustomer(data.customer_id);
        await requireInteractionIds(data.interaction_ids);
        return unwrap<AgentRun>(
          await supabase
            .from("agent_runs")
            .insert({ ...data, workspace_id: workspace })
            .select()
            .single()
        );
      },
      update: async (id: string, data: Partial<AgentRun>) => {
        const workspace = await workspaceId();
        if (!(await scopedAgentRun(id))) return null;
        if (data.customer_id) await requireCustomer(data.customer_id);
        await requireInteractionIds(data.interaction_ids);
        const result = await supabase
          .from("agent_runs")
          .update({ ...data, workspace_id: workspace })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .select()
          .maybeSingle();
        return maybe<AgentRun>(result);
      },
    },
    sequenceEnrollments: {
      list: async () => {
        const workspace = await workspaceId();
        const rows = unwrap<
          Array<SequenceEnrollment & Record<string, unknown>>
        >(
          await supabase
            .from("sequence_enrollments")
            .select("*, customers!inner(workspace_id)")
            .eq("workspace_id", workspace)
            .eq("customers.workspace_id", workspace)
            .order("created_at", { ascending: false })
        );
        return rows.map(
          (row) =>
            stripRelation<SequenceEnrollment>(
              row,
              "customers"
            ) as SequenceEnrollment
        );
      },
      get: async (id: string) => scopedSequenceEnrollment(id),
      create: async (data: Partial<SequenceEnrollment>) => {
        const workspace = await workspaceId();
        await requireCustomer(data.customer_id);
        return unwrap<SequenceEnrollment>(
          await supabase
            .from("sequence_enrollments")
            .insert({ ...data, workspace_id: workspace })
            .select()
            .single()
        );
      },
      update: async (id: string, data: Partial<SequenceEnrollment>) => {
        const workspace = await workspaceId();
        const existing = await scopedSequenceEnrollment(id);
        if (!existing) return null;
        const customerId = data.customer_id || existing.customer_id;
        await requireCustomer(customerId);
        const result = await supabase
          .from("sequence_enrollments")
          .update({
            ...data,
            customer_id: customerId,
            workspace_id: workspace,
          })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .select()
          .maybeSingle();
        return maybe<SequenceEnrollment>(result);
      },
      remove: async (id: string) => {
        const workspace = await workspaceId();
        const existing = await scopedSequenceEnrollment(id);
        if (!existing) return false;
        const result = await supabase
          .from("sequence_enrollments")
          .delete()
          .eq("id", id)
          .eq("workspace_id", workspace)
          .eq("customer_id", existing.customer_id)
          .select("id")
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return !!result.data;
      },
    },
    agentPrefs: {
      get: async (scope: WorkspaceMemberScope) => {
        const workspace = await requireMemberScope(scope);
        return maybe<AgentPrefs>(
          await supabase
            .from("agent_prefs")
            .select("*")
            .eq("workspace_id", workspace)
            .eq("user_id", scope.userId)
            .maybeSingle()
        );
      },
      update: async (
        scope: WorkspaceMemberScope,
        data: Partial<AgentPrefs>
      ) => {
        const workspace = await requireMemberScope(scope);
        const patch = { ...data, updated_at: new Date().toISOString() };
        return unwrap<AgentPrefs>(
          await supabase
            .from("agent_prefs")
            .upsert(
              {
                ...patch,
                workspace_id: workspace,
                user_id: scope.userId,
              },
              { onConflict: "workspace_id,user_id" }
            )
            .select()
            .single()
        );
      },
    },
    draftSnippets: {
      list: async (scope: WorkspaceMemberScope) => {
        const workspace = await requireMemberScope(scope);
        return unwrap<DraftSnippet[]>(
          await supabase
            .from("draft_snippets")
            .select("*")
            .eq("workspace_id", workspace)
            .eq("user_id", scope.userId)
            .order("created_at", { ascending: false })
        );
      },
      create: async (
        scope: WorkspaceMemberScope,
        data: Partial<DraftSnippet>
      ) => {
        const workspace = await requireMemberScope(scope);
        return unwrap<DraftSnippet>(
          await supabase
            .from("draft_snippets")
            .insert({
              ...data,
              workspace_id: workspace,
              user_id: scope.userId,
            })
            .select()
            .single()
        );
      },
      update: async (
        scope: WorkspaceMemberScope,
        id: string,
        data: Partial<DraftSnippet>
      ) => {
        const workspace = await requireMemberScope(scope);
        const result = await supabase
          .from("draft_snippets")
          .update({
            ...data,
            workspace_id: workspace,
            user_id: scope.userId,
          })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .eq("user_id", scope.userId)
          .select()
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return (result.data as DraftSnippet) || null;
      },
      bumpUse: async (scope: WorkspaceMemberScope, id: string) => {
        const workspace = await requireMemberScope(scope);
        const { data: cur } = await supabase
          .from("draft_snippets")
          .select("uses")
          .eq("id", id)
          .eq("workspace_id", workspace)
          .eq("user_id", scope.userId)
          .maybeSingle();
        if (!cur) return null;
        const result = await supabase
          .from("draft_snippets")
          .update({ uses: ((cur as { uses?: number }).uses || 0) + 1 })
          .eq("id", id)
          .eq("workspace_id", workspace)
          .eq("user_id", scope.userId)
          .select()
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return (result.data as DraftSnippet) || null;
      },
      remove: async (scope: WorkspaceMemberScope, id: string) => {
        const workspace = await requireMemberScope(scope);
        const result = await supabase
          .from("draft_snippets")
          .delete()
          .eq("id", id)
          .eq("workspace_id", workspace)
          .eq("user_id", scope.userId)
          .select("id")
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return !!result.data;
      },
    },
    agentChats: {
      list: async (scope: WorkspaceMemberScope, customerId: string) => {
        const workspace = await requireMemberScope(scope);
        if (!(await scopedCustomer(customerId))) return [];
        return unwrap<AgentChatMessage[]>(
          await supabase
            .from("agent_chats")
            .select("*")
            .eq("customer_id", customerId)
            .eq("workspace_id", workspace)
            .eq("user_id", scope.userId)
            .order("created_at", { ascending: true })
        );
      },
      create: async (
        scope: WorkspaceMemberScope,
        data: Partial<AgentChatMessage>
      ) => {
        const workspace = await requireMemberScope(scope);
        await requireCustomer(data.customer_id);
        return unwrap<AgentChatMessage>(
          await supabase
            .from("agent_chats")
            .insert({
              ...data,
              workspace_id: workspace,
              user_id: scope.userId,
            })
            .select()
            .single()
        );
      },
      clear: async (scope: WorkspaceMemberScope, customerId: string) => {
        const workspace = await requireMemberScope(scope);
        if (!(await scopedCustomer(customerId))) return 0;
        const result = await supabase
          .from("agent_chats")
          .delete()
          .eq("customer_id", customerId)
          .eq("workspace_id", workspace)
          .eq("user_id", scope.userId)
          .select("id");
        if (result.error) throw new Error(result.error.message);
        return result.data?.length || 0;
      },
    },
    freyrKb: {
      get: async () => {
        await workspaceId();
        const { data } = await supabase
          .from("freyr_knowledge_base")
          .select("*")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data as FreyrKb) || null;
      },
      update: async (data: Partial<FreyrKb>) => {
        await workspaceId();
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
