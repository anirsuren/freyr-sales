import { expect, test } from "@playwright/test";
import { getDataMode, setDataMode } from "../lib/dataMode";
import { buildSupabaseAdapter } from "../lib/db";
import { liveDb } from "../lib/live-db";
import {
  getStoredVoiceConversation,
  listStoredVoiceConversations,
  upsertVoiceConversation,
} from "../lib/voiceEvents";

const WORKSPACE_A = "00000000-0000-4000-8000-00000000000a";
const WORKSPACE_B = "00000000-0000-4000-8000-00000000000b";

type ResettableLiveStore = {
  customers: unknown[];
  contacts: unknown[];
  sessions: unknown[];
  interactions: unknown[];
  runs: unknown[];
  enrollments: unknown[];
  snippets: unknown[];
  chats: unknown[];
  prefs: unknown[];
};

function resetLiveStore(): void {
  const store = (
    globalThis as typeof globalThis & {
      __FREYR_LIVE_STORE__?: ResettableLiveStore;
    }
  ).__FREYR_LIVE_STORE__;
  if (!store) return;
  for (const collection of [
    store.customers,
    store.contacts,
    store.sessions,
    store.interactions,
    store.runs,
    store.enrollments,
    store.snippets,
    store.chats,
    store.prefs,
  ]) {
    collection.splice(0);
  }
}

function resetLiveVoiceStore(): void {
  const store = (
    globalThis as typeof globalThis & {
      __freyrLiveVoiceEvents?: { records: Map<string, unknown> };
    }
  ).__freyrLiveVoiceEvents;
  store?.records.clear();
}

type RecordedQuery = {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  select?: string;
};

class RecordingQuery implements PromiseLike<{
  data: unknown;
  error: null;
}> {
  readonly record: RecordedQuery;

  constructor(
    private readonly client: RecordingSupabase,
    table: string
  ) {
    this.record = { table, operation: "select", filters: [] };
  }

  select(columns = "*") {
    this.record.select = columns;
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.record.operation = "insert";
    this.record.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.record.operation = "update";
    this.record.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown>) {
    this.record.operation = "upsert";
    this.record.payload = payload;
    return this;
  }

  delete() {
    this.record.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.record.filters.push([column, value]);
    return this;
  }

  ilike(column: string, value: unknown) {
    this.record.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return this.client.finish(this.record, true);
  }

  maybeSingle() {
    return this.client.finish(this.record, true);
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.client
      .finish(this.record, false)
      .then(onfulfilled, onrejected);
  }
}

class RecordingSupabase {
  readonly completed: RecordedQuery[] = [];

  from(table: string) {
    return new RecordingQuery(this, table);
  }

  async finish(record: RecordedQuery, single: boolean) {
    this.completed.push(structuredClone(record));
    if (record.table === "workspaces") {
      return { data: { id: WORKSPACE_A }, error: null };
    }
    if (record.operation === "insert" || record.operation === "upsert") {
      return {
        data: { id: `${record.table}-new`, ...record.payload },
        error: null,
      };
    }
    if (record.table === "contacts" && single) {
      return {
        data: {
          id: "contact-a",
          customer_id: "customer-a",
          customers: { workspace_id: WORKSPACE_A },
        },
        error: null,
      };
    }
    return { data: single ? null : [], error: null };
  }

  latest(table: string): RecordedQuery {
    const found = this.completed.findLast((query) => query.table === table);
    if (!found) throw new Error(`No ${table} query was recorded.`);
    return found;
  }
}

test("Supabase service-role queries force the configured workspace", async () => {
  const previousWorkspace = process.env.FREYR_WORKSPACE_ID;
  process.env.FREYR_WORKSPACE_ID = WORKSPACE_A;

  try {
    const client = new RecordingSupabase();
    const db = buildSupabaseAdapter(client);

    await db.customers.list();
    expect(client.latest("customers").filters).toContainEqual([
      "workspace_id",
      WORKSPACE_A,
    ]);

    await db.customers.create({
      company_name: "Scoped account",
      workspace_id: WORKSPACE_B,
    });
    expect(client.latest("customers").payload).toMatchObject({
      company_name: "Scoped account",
      workspace_id: WORKSPACE_A,
    });

    await db.contacts.get("contact-a");
    expect(client.latest("contacts")).toMatchObject({
      select: "*, customers!inner(workspace_id)",
      filters: expect.arrayContaining([
        ["id", "contact-a"],
        ["customers.workspace_id", WORKSPACE_A],
      ]),
    });

    await db.pitchSessions.list();
    expect(client.latest("pitch_sessions").filters).toEqual(
      expect.arrayContaining([
        ["workspace_id", WORKSPACE_A],
        ["customers.workspace_id", WORKSPACE_A],
      ])
    );

    await db.agentRuns.list();
    expect(client.latest("agent_runs").filters).toContainEqual([
      "workspace_id",
      WORKSPACE_A,
    ]);

    await db.sequenceEnrollments.list();
    expect(client.latest("sequence_enrollments").filters).toEqual(
      expect.arrayContaining([
        ["workspace_id", WORKSPACE_A],
        ["customers.workspace_id", WORKSPACE_A],
      ])
    );

    expect(
      client.completed.filter((query) => query.table === "workspaces")
    ).toHaveLength(1);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.FREYR_WORKSPACE_ID;
    } else {
      process.env.FREYR_WORKSPACE_ID = previousWorkspace;
    }
  }
});

test("Supabase live access fails closed without a configured workspace", () => {
  const previousWorkspace = process.env.FREYR_WORKSPACE_ID;
  delete process.env.FREYR_WORKSPACE_ID;
  try {
    expect(() => buildSupabaseAdapter(new RecordingSupabase())).toThrow(
      /FREYR_WORKSPACE_ID is required/
    );
  } finally {
    if (previousWorkspace !== undefined) {
      process.env.FREYR_WORKSPACE_ID = previousWorkspace;
    }
  }
});

test("live records cannot be read, changed, or linked across workspaces", async () => {
  const previousWorkspace = process.env.FREYR_WORKSPACE_ID;
  resetLiveStore();

  try {
    process.env.FREYR_WORKSPACE_ID = WORKSPACE_A;
    const customer = await liveDb.customers.create({
      company_name: "Workspace A account",
    });
    const contact = await liveDb.contacts.create({
      customer_id: customer.id,
      full_name: "Workspace A contact",
    });
    const session = await liveDb.pitchSessions.create({
      customer_id: customer.id,
      contact_id: contact.id,
    });
    const interaction = await liveDb.interactions.create({
      customer_id: customer.id,
      contact_id: contact.id,
      pitch_session_id: session.id,
    });
    const run = await liveDb.agentRuns.create({
      customer_id: customer.id,
      interaction_ids: [interaction.id],
    });
    const enrollment = await liveDb.sequenceEnrollments.create({
      customer_id: customer.id,
    });

    process.env.FREYR_WORKSPACE_ID = WORKSPACE_B;

    await expect(liveDb.customers.list()).resolves.toEqual([]);
    await expect(liveDb.contacts.get(contact.id)).resolves.toBeNull();
    await expect(liveDb.pitchSessions.get(session.id)).resolves.toBeNull();
    await expect(liveDb.agentRuns.get(run.id)).resolves.toBeNull();
    await expect(
      liveDb.sequenceEnrollments.get(enrollment.id)
    ).resolves.toBeNull();
    await expect(
      liveDb.customers.update(customer.id, { industry: "Wrong workspace" })
    ).resolves.toBeNull();
    await expect(liveDb.interactions.remove(interaction.id)).resolves.toBe(
      false
    );
    await expect(
      liveDb.contacts.create({
        customer_id: customer.id,
        full_name: "Cross-workspace contact",
      })
    ).rejects.toThrow(/configured workspace/i);
    await expect(
      liveDb.agentRuns.create({ customer_id: customer.id })
    ).rejects.toThrow(/configured workspace/i);
    await expect(
      liveDb.agentChats.create(
        { workspaceId: WORKSPACE_B, userId: "member-b" },
        {
          customer_id: customer.id,
          role: "me",
          text: "Cross-workspace chat",
        }
      )
    ).rejects.toThrow(/configured workspace/i);

    process.env.FREYR_WORKSPACE_ID = WORKSPACE_A;
    const unchangedCustomer = await liveDb.customers.get(customer.id);
    expect(unchangedCustomer).toMatchObject({
      id: customer.id,
      workspace_id: WORKSPACE_A,
    });
    expect(unchangedCustomer?.industry).not.toBe("Wrong workspace");
    await expect(
      liveDb.customers.findByName("Workspace A account", WORKSPACE_B)
    ).resolves.toBeNull();
    await expect(
      liveDb.agentPrefs.get({
        workspaceId: WORKSPACE_B,
        userId: "member-b",
      })
    ).rejects.toThrow(/does not match/i);
    await expect(liveDb.contacts.get(contact.id)).resolves.toMatchObject({
      id: contact.id,
      customer_id: customer.id,
    });
    await expect(liveDb.interactions.list(customer.id)).resolves.toHaveLength(
      1
    );
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.FREYR_WORKSPACE_ID;
    } else {
      process.env.FREYR_WORKSPACE_ID = previousWorkspace;
    }
    resetLiveStore();
  }
});

test("live voice transcripts and CRM links stay in their workspace", async () => {
  const previousWorkspace = process.env.FREYR_WORKSPACE_ID;
  const previousMode = getDataMode();
  resetLiveStore();
  resetLiveVoiceStore();
  setDataMode("live");

  try {
    process.env.FREYR_WORKSPACE_ID = WORKSPACE_A;
    const customer = await liveDb.customers.create({
      company_name: "Workspace A voice account",
    });
    const contact = await liveDb.contacts.create({
      customer_id: customer.id,
      full_name: "Workspace A caller",
    });
    const conversation = await upsertVoiceConversation({
      conversation_id: "conversation-workspace-a",
      agent_id: "agent-a",
      status: "completed",
      customer_id: customer.id,
      contact_id: contact.id,
      transcript: [{ role: "agent", message: "Workspace A private transcript" }],
    });

    process.env.FREYR_WORKSPACE_ID = WORKSPACE_B;
    await expect(listStoredVoiceConversations()).resolves.toEqual([]);
    await expect(
      getStoredVoiceConversation(conversation.conversation_id!)
    ).resolves.toBeNull();
    await expect(
      upsertVoiceConversation({
        conversation_id: "cross-workspace-voice",
        agent_id: "agent-b",
        status: "initiated",
        customer_id: customer.id,
        contact_id: contact.id,
      })
    ).rejects.toThrow(/outside the configured workspace/i);

    process.env.FREYR_WORKSPACE_ID = WORKSPACE_A;
    await expect(listStoredVoiceConversations()).resolves.toHaveLength(1);
    await expect(
      getStoredVoiceConversation(conversation.conversation_id!)
    ).resolves.toMatchObject({
      id: conversation.id,
      workspace_id: WORKSPACE_A,
    });
  } finally {
    setDataMode(previousMode);
    if (previousWorkspace === undefined) {
      delete process.env.FREYR_WORKSPACE_ID;
    } else {
      process.env.FREYR_WORKSPACE_ID = previousWorkspace;
    }
    resetLiveStore();
    resetLiveVoiceStore();
  }
});
