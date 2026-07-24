import { v4 as uuidv4 } from "uuid";
import type {
  AgentChatMessage,
  AgentPrefs,
  AgentRun,
  Contact,
  Customer,
  DraftSnippet,
  FreyrKb,
  Interaction,
  PitchSession,
  SequenceEnrollment,
  WorkspaceMemberScope,
} from "./types";

// Clean-workspace fallback. It lets a new team onboard and create records before
// a production database is connected. It is process-local by design; production
// health/status calls expose whether a durable database is configured.
type LiveStore = {
  customers: Customer[];
  contacts: Contact[];
  sessions: ScopedPitchSession[];
  interactions: Interaction[];
  runs: ScopedAgentRun[];
  enrollments: ScopedSequenceEnrollment[];
  snippets: ScopedDraftSnippet[];
  chats: ScopedAgentChatMessage[];
  prefs: ScopedAgentPrefs[];
  kb: FreyrKb;
};

type ScopeColumns = {
  workspace_id: string;
  user_id: string;
};
type ScopedAgentPrefs = AgentPrefs & ScopeColumns;
type ScopedDraftSnippet = DraftSnippet & ScopeColumns;
type ScopedAgentChatMessage = AgentChatMessage & ScopeColumns;
type WorkspaceColumns = Pick<ScopeColumns, "workspace_id">;
type ScopedPitchSession = PitchSession & WorkspaceColumns;
type ScopedAgentRun = AgentRun & WorkspaceColumns;
type ScopedSequenceEnrollment = SequenceEnrollment & WorkspaceColumns;

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_LIVE_STORE__: LiveStore | undefined;
}

const now = () => new Date().toISOString();
const store: LiveStore = globalThis.__FREYR_LIVE_STORE__ ?? {
  customers: [],
  contacts: [],
  sessions: [],
  interactions: [],
  runs: [],
  enrollments: [],
  snippets: [],
  chats: [],
  prefs: [],
  kb: { id: uuidv4(), structured_kb: { services: [], solutions: [], industries: [], geographies: [], differentiators: [], proof_points: [], regulatory_frameworks: [] }, raw_crawl_text: null,
    crawled_at: null, page_count: 0, version: 0 },
};
globalThis.__FREYR_LIVE_STORE__ = store;

function deploymentWorkspaceId(): string {
  const configured = process.env.FREYR_WORKSPACE_ID?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FREYR_WORKSPACE_ID is required for live workspace data access."
    );
  }
  return "local-live-workspace";
}

function workspaceCustomer(id: string): Customer | null {
  const workspace = deploymentWorkspaceId();
  return (
    store.customers.find(
      (item) => item.id === id && item.workspace_id === workspace
    ) || null
  );
}

function workspaceContact(id: string): Contact | null {
  const contact = store.contacts.find((item) => item.id === id) || null;
  return contact && workspaceCustomer(contact.customer_id) ? contact : null;
}

function workspaceSession(id: string): ScopedPitchSession | null {
  const workspace = deploymentWorkspaceId();
  const session =
    store.sessions.find(
      (item) => item.id === id && item.workspace_id === workspace
    ) || null;
  return session && workspaceCustomer(session.customer_id) ? session : null;
}

function workspaceInteraction(id: string): Interaction | null {
  const interaction =
    store.interactions.find((item) => item.id === id) || null;
  return interaction && workspaceCustomer(interaction.customer_id)
    ? interaction
    : null;
}

function requireWorkspaceCustomer(id: string | null | undefined): Customer {
  const customer = id ? workspaceCustomer(id) : null;
  if (!customer) {
    throw new Error("Customer is not available in the configured workspace.");
  }
  return customer;
}

function requireWorkspaceContact(
  id: string | null | undefined,
  customerId: string
): Contact {
  const contact = id ? workspaceContact(id) : null;
  if (!contact || contact.customer_id !== customerId) {
    throw new Error("Contact is not available for this workspace customer.");
  }
  return contact;
}

function requireMemberScope(scope: WorkspaceMemberScope): void {
  if (scope.workspaceId !== deploymentWorkspaceId()) {
    throw new Error("Workspace member scope does not match this deployment.");
  }
}

function inScope(
  record: ScopeColumns,
  scope: WorkspaceMemberScope
): boolean {
  return (
    record.workspace_id === scope.workspaceId &&
    record.user_id === scope.userId
  );
}

function ensurePrefs(scope: WorkspaceMemberScope): ScopedAgentPrefs {
  requireMemberScope(scope);
  const existing = store.prefs.find((prefs) => inScope(prefs, scope));
  if (existing) return existing;
  const prefs: ScopedAgentPrefs = {
    id: uuidv4(),
    workspace_id: scope.workspaceId,
    user_id: scope.userId,
    focus_industry: null,
    only_mine: false,
    autopilot_reengage: false,
    autopilot_stabilize: false,
    autopilot_max_value: null,
    draft_tone: "warm",
    autopilot_cadence: "off",
    autopilot_last_run: null,
    digest_cadence: "off",
    digest_last_sent: null,
    updated_at: now(),
  };
  store.prefs.push(prefs);
  return prefs;
}

function create<T extends { id: string; created_at: string }>(
  collection: T[], data: Partial<T>
): T {
  const record = { ...data, id: data.id || uuidv4(), created_at: now() } as T;
  collection.push(record);
  return record;
}
function update<T extends { id: string }>(collection: T[], id: string, data: Partial<T>) {
  const index = collection.findIndex((item) => item.id === id);
  if (index < 0) return null;
  collection[index] = { ...collection[index], ...data };
  return collection[index];
}

export const liveDb = {
  customers: {
    list: async () =>
      store.customers
        .filter(
          (item) => item.workspace_id === deploymentWorkspaceId()
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    get: async (id: string) => workspaceCustomer(id),
    findByName: async (name: string, requestedWorkspaceId?: string) => {
      const workspace = deploymentWorkspaceId();
      if (requestedWorkspaceId && requestedWorkspaceId !== workspace) {
        return null;
      }
      return (
      store.customers.find(
        (item) =>
          item.company_name.toLowerCase() === name.toLowerCase() &&
            item.workspace_id === workspace
      ) || null
      );
    },
    create: async (data: Partial<Customer>) =>
      create(store.customers, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
        last_enriched_at: now(),
      } as Partial<Customer>),
    update: async (id: string, data: Partial<Customer>) =>
      workspaceCustomer(id)
        ? update(store.customers, id, {
            ...data,
            workspace_id: deploymentWorkspaceId(),
            last_enriched_at: now(),
          })
        : null,
  },
  contacts: {
    list: async (customerId?: string) => {
      if (customerId && !workspaceCustomer(customerId)) return [];
      return store.contacts.filter(
        (item) =>
          (!customerId || item.customer_id === customerId) &&
          !!workspaceCustomer(item.customer_id)
      );
    },
    get: async (id: string) => workspaceContact(id),
    create: async (data: Partial<Contact>) => {
      requireWorkspaceCustomer(data.customer_id);
      return create(store.contacts, {
        ...data,
        last_enriched_at: now(),
      } as Partial<Contact>);
    },
    update: async (id: string, data: Partial<Contact>) => {
      const existing = workspaceContact(id);
      if (!existing) return null;
      const customerId = data.customer_id || existing.customer_id;
      requireWorkspaceCustomer(customerId);
      return update(store.contacts, id, {
        ...data,
        customer_id: customerId,
      });
    },
  },
  pitchSessions: {
    list: async (customerId?: string, contactId?: string) => {
      const workspace = deploymentWorkspaceId();
      return store.sessions.filter(
        (item) =>
          item.workspace_id === workspace &&
          !!workspaceCustomer(item.customer_id) &&
          (!customerId || item.customer_id === customerId) &&
          (!contactId || item.contact_id === contactId)
      );
    },
    get: async (id: string) => workspaceSession(id),
    create: async (data: Partial<PitchSession>) => {
      if (!data.customer_id || !data.contact_id) {
        throw new Error(
          "Pitch sessions require a workspace customer and contact."
        );
      }
      requireWorkspaceCustomer(data.customer_id);
      requireWorkspaceContact(data.contact_id, data.customer_id);
      return create(store.sessions, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
      } as Partial<ScopedPitchSession>);
    },
    update: async (id: string, data: Partial<PitchSession>) => {
      const existing = workspaceSession(id);
      if (!existing) return null;
      const customerId = data.customer_id || existing.customer_id;
      const contactId = data.contact_id || existing.contact_id;
      requireWorkspaceCustomer(customerId);
      requireWorkspaceContact(contactId, customerId);
      return update(store.sessions, id, {
        ...data,
        customer_id: customerId,
        contact_id: contactId,
        workspace_id: deploymentWorkspaceId(),
      });
    },
  },
  interactions: {
    list: async (customerId?: string, contactId?: string) => {
      if (customerId && !workspaceCustomer(customerId)) return [];
      const contact = contactId ? workspaceContact(contactId) : null;
      if (
        contactId &&
        (!contact || (customerId && contact.customer_id !== customerId))
      ) {
        return [];
      }
      return store.interactions.filter(
        (item) =>
          !!workspaceCustomer(item.customer_id) &&
          (!customerId || item.customer_id === customerId) &&
          (!contactId || item.contact_id === contactId)
      );
    },
    create: async (data: Partial<Interaction>) => {
      if (!data.customer_id || !data.contact_id) {
        throw new Error(
          "Interactions require a workspace customer and contact."
        );
      }
      requireWorkspaceCustomer(data.customer_id);
      requireWorkspaceContact(data.contact_id, data.customer_id);
      if (data.pitch_session_id) {
        const session = workspaceSession(data.pitch_session_id);
        if (
          !session ||
          session.customer_id !== data.customer_id ||
          session.contact_id !== data.contact_id
        ) {
          throw new Error(
            "Pitch session is not available for this workspace customer."
          );
        }
      }
      return create(store.interactions, data);
    },
    remove: async (id: string) => {
      if (!workspaceInteraction(id)) return false;
      const index = store.interactions.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.interactions.splice(index, 1); return true;
    },
  },
  agentRuns: {
    list: async () =>
      store.runs.filter(
        (item) =>
          item.workspace_id === deploymentWorkspaceId() &&
          (!item.customer_id || !!workspaceCustomer(item.customer_id))
      ),
    get: async (id: string) =>
      store.runs.find(
        (item) =>
          item.id === id &&
          item.workspace_id === deploymentWorkspaceId() &&
          (!item.customer_id || !!workspaceCustomer(item.customer_id))
      ) || null,
    create: async (data: Partial<AgentRun>) => {
      if (data.customer_id) requireWorkspaceCustomer(data.customer_id);
      if (
        data.interaction_ids?.some((id) => !workspaceInteraction(id))
      ) {
        throw new Error(
          "Agent run references an interaction outside the configured workspace."
        );
      }
      return create(store.runs, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
      } as Partial<ScopedAgentRun>);
    },
    update: async (id: string, data: Partial<AgentRun>) => {
      const existing = store.runs.find(
        (item) =>
          item.id === id &&
          item.workspace_id === deploymentWorkspaceId() &&
          (!item.customer_id || !!workspaceCustomer(item.customer_id))
      );
      if (!existing) return null;
      if (data.customer_id) requireWorkspaceCustomer(data.customer_id);
      if (
        data.interaction_ids?.some(
          (interactionId) => !workspaceInteraction(interactionId)
        )
      ) {
        throw new Error(
          "Agent run references an interaction outside the configured workspace."
        );
      }
      return update(store.runs, id, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
      });
    },
  },
  sequenceEnrollments: {
    list: async () =>
      store.enrollments.filter(
        (item) =>
          item.workspace_id === deploymentWorkspaceId() &&
          !!workspaceCustomer(item.customer_id)
      ),
    get: async (id: string) =>
      store.enrollments.find(
        (item) =>
          item.id === id &&
          item.workspace_id === deploymentWorkspaceId() &&
          !!workspaceCustomer(item.customer_id)
      ) || null,
    create: async (data: Partial<SequenceEnrollment>) => {
      requireWorkspaceCustomer(data.customer_id);
      return create(store.enrollments, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
      } as Partial<ScopedSequenceEnrollment>);
    },
    update: async (id: string, data: Partial<SequenceEnrollment>) => {
      const existing = store.enrollments.find(
        (item) =>
          item.id === id &&
          item.workspace_id === deploymentWorkspaceId() &&
          !!workspaceCustomer(item.customer_id)
      );
      if (!existing) return null;
      if (data.customer_id) requireWorkspaceCustomer(data.customer_id);
      return update(store.enrollments, id, {
        ...data,
        workspace_id: deploymentWorkspaceId(),
      });
    },
    remove: async (id: string) => {
      const index = store.enrollments.findIndex(
        (item) =>
          item.id === id &&
          item.workspace_id === deploymentWorkspaceId() &&
          !!workspaceCustomer(item.customer_id)
      );
      if (index < 0) return false;
      store.enrollments.splice(index, 1); return true;
    },
  },
  agentPrefs: {
    get: async (scope: WorkspaceMemberScope) => ensurePrefs(scope),
    update: async (
      scope: WorkspaceMemberScope,
      data: Partial<AgentPrefs>
    ) => {
      const current = ensurePrefs(scope);
      const index = store.prefs.findIndex((prefs) => inScope(prefs, scope));
      store.prefs[index] = {
        ...current,
        ...data,
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
        updated_at: now(),
      };
      return store.prefs[index];
    },
  },
  draftSnippets: {
    list: async (scope: WorkspaceMemberScope) => {
      requireMemberScope(scope);
      return store.snippets.filter((snippet) => inScope(snippet, scope));
    },
    create: async (
      scope: WorkspaceMemberScope,
      data: Partial<DraftSnippet>
    ) => {
      requireMemberScope(scope);
      return create(store.snippets, {
        ...data,
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
      } as Partial<ScopedDraftSnippet>);
    },
    update: async (
      scope: WorkspaceMemberScope,
      id: string,
      data: Partial<DraftSnippet>
    ) => {
      requireMemberScope(scope);
      const item = store.snippets.find(
        (snippet) => snippet.id === id && inScope(snippet, scope)
      );
      return item
        ? update(store.snippets, id, {
            ...data,
            workspace_id: scope.workspaceId,
            user_id: scope.userId,
          })
        : null;
    },
    bumpUse: async (scope: WorkspaceMemberScope, id: string) => {
      requireMemberScope(scope);
      const item = store.snippets.find(
        (snippet) => snippet.id === id && inScope(snippet, scope)
      );
      return item
        ? update(store.snippets, id, { uses: item.uses + 1 })
        : null;
    },
    remove: async (scope: WorkspaceMemberScope, id: string) => {
      requireMemberScope(scope);
      const index = store.snippets.findIndex(
        (item) => item.id === id && inScope(item, scope)
      );
      if (index < 0) return false;
      store.snippets.splice(index, 1); return true;
    },
  },
  agentChats: {
    list: async (scope: WorkspaceMemberScope, customerId: string) => {
      requireMemberScope(scope);
      if (!workspaceCustomer(customerId)) return [];
      return store.chats.filter(
        (item) =>
          item.customer_id === customerId && inScope(item, scope)
      );
    },
    create: async (
      scope: WorkspaceMemberScope,
      data: Partial<AgentChatMessage>
    ) => {
      requireMemberScope(scope);
      requireWorkspaceCustomer(data.customer_id);
      return create(store.chats, {
        ...data,
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
      } as Partial<ScopedAgentChatMessage>);
    },
    clear: async (scope: WorkspaceMemberScope, customerId: string) => {
      requireMemberScope(scope);
      if (!workspaceCustomer(customerId)) return 0;
      const before = store.chats.length;
      store.chats = store.chats.filter(
        (item) =>
          item.customer_id !== customerId || !inScope(item, scope)
      );
      return before - store.chats.length;
    },
  },
  freyrKb: {
    get: async () => {
      deploymentWorkspaceId();
      return store.kb;
    },
    update: async (data: Partial<FreyrKb>) => {
      deploymentWorkspaceId();
      return (store.kb = { ...store.kb, ...data });
    },
  },
};
