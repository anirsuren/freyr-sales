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
} from "./types";

// Clean-workspace fallback. It lets a new team onboard and create records before
// a production database is connected. It is process-local by design; production
// health/status calls expose whether a durable database is configured.
type LiveStore = {
  customers: Customer[];
  contacts: Contact[];
  sessions: PitchSession[];
  interactions: Interaction[];
  runs: AgentRun[];
  enrollments: SequenceEnrollment[];
  snippets: DraftSnippet[];
  chats: AgentChatMessage[];
  prefs: AgentPrefs;
  kb: FreyrKb;
};

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
  prefs: {
    id: uuidv4(), focus_industry: null, only_mine: false,
    autopilot_reengage: false, autopilot_stabilize: false,
    autopilot_max_value: null, draft_tone: "warm", autopilot_cadence: "off",
    autopilot_last_run: null, digest_cadence: "off", digest_last_sent: null,
    updated_at: now(),
  },
  kb: { id: uuidv4(), structured_kb: { services: [], solutions: [], industries: [], geographies: [], differentiators: [], proof_points: [], regulatory_frameworks: [] }, raw_crawl_text: null,
    crawled_at: null, page_count: 0, version: 0 },
};
globalThis.__FREYR_LIVE_STORE__ = store;

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
    list: async () => [...store.customers].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    get: async (id: string) => store.customers.find((item) => item.id === id) || null,
    findByName: async (name: string) => store.customers.find((item) => item.company_name.toLowerCase() === name.toLowerCase()) || null,
    create: async (data: Partial<Customer>) => create(store.customers, {
      ...data, last_enriched_at: now(),
    } as Partial<Customer>),
    update: async (id: string, data: Partial<Customer>) => update(store.customers, id, { ...data, last_enriched_at: now() }),
  },
  contacts: {
    list: async (customerId?: string) => store.contacts.filter((item) => !customerId || item.customer_id === customerId),
    get: async (id: string) => store.contacts.find((item) => item.id === id) || null,
    create: async (data: Partial<Contact>) => create(store.contacts, { ...data, last_enriched_at: now() } as Partial<Contact>),
    update: async (id: string, data: Partial<Contact>) => update(store.contacts, id, data),
  },
  pitchSessions: {
    list: async (customerId?: string, contactId?: string) => store.sessions.filter((item) =>
      (!customerId || item.customer_id === customerId) && (!contactId || item.contact_id === contactId)),
    get: async (id: string) => store.sessions.find((item) => item.id === id) || null,
    create: async (data: Partial<PitchSession>) => create(store.sessions, data),
    update: async (id: string, data: Partial<PitchSession>) => update(store.sessions, id, data),
  },
  interactions: {
    list: async (customerId?: string, contactId?: string) => store.interactions.filter((item) =>
      (!customerId || item.customer_id === customerId) && (!contactId || item.contact_id === contactId)),
    create: async (data: Partial<Interaction>) => create(store.interactions, data),
    remove: async (id: string) => {
      const index = store.interactions.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.interactions.splice(index, 1); return true;
    },
  },
  agentRuns: {
    list: async () => [...store.runs],
    get: async (id: string) => store.runs.find((item) => item.id === id) || null,
    create: async (data: Partial<AgentRun>) => create(store.runs, data),
    update: async (id: string, data: Partial<AgentRun>) => update(store.runs, id, data),
  },
  sequenceEnrollments: {
    list: async () => [...store.enrollments],
    get: async (id: string) => store.enrollments.find((item) => item.id === id) || null,
    create: async (data: Partial<SequenceEnrollment>) => create(store.enrollments, data),
    update: async (id: string, data: Partial<SequenceEnrollment>) => update(store.enrollments, id, data),
    remove: async (id: string) => {
      const index = store.enrollments.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.enrollments.splice(index, 1); return true;
    },
  },
  agentPrefs: {
    get: async () => store.prefs,
    update: async (data: Partial<AgentPrefs>) => (store.prefs = { ...store.prefs, ...data, updated_at: now() }),
  },
  draftSnippets: {
    list: async () => [...store.snippets],
    create: async (data: Partial<DraftSnippet>) => create(store.snippets, data),
    update: async (id: string, data: Partial<DraftSnippet>) => update(store.snippets, id, data),
    bumpUse: async (id: string) => {
      const item = store.snippets.find((snippet) => snippet.id === id);
      return item ? update(store.snippets, id, { uses: item.uses + 1 }) : null;
    },
    remove: async (id: string) => {
      const index = store.snippets.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.snippets.splice(index, 1); return true;
    },
  },
  agentChats: {
    list: async (customerId: string) => store.chats.filter((item) => item.customer_id === customerId),
    create: async (data: Partial<AgentChatMessage>) => create(store.chats, data),
    clear: async (customerId: string) => {
      const before = store.chats.length;
      store.chats = store.chats.filter((item) => item.customer_id !== customerId);
      return before - store.chats.length;
    },
  },
  freyrKb: {
    get: async () => store.kb,
    update: async (data: Partial<FreyrKb>) => (store.kb = { ...store.kb, ...data }),
  },
};
