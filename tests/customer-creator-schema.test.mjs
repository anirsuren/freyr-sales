import test from "node:test";
import assert from "node:assert/strict";
import { buildSupabaseAdapter } from "../lib/db.ts";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";

function clientWithoutCustomerCreator() {
  const writes = [];
  const client = {
    from(table) {
      const query = {
        payload: null,
        operation: "select",
        select() { return this; },
        eq() { return this; },
        insert(payload) { this.payload = payload; this.operation = "insert"; return this; },
        update(payload) { this.payload = payload; this.operation = "update"; return this; },
        async single() { return this.finish(); },
        async maybeSingle() { return this.finish(); },
        finish() {
          if (table === "workspaces") return { data: { id: WORKSPACE }, error: null };
          writes.push({ operation: this.operation, payload: this.payload });
          if ("created_by" in this.payload) return {
            data: null,
            error: { code: "PGRST204", message: "Could not find the 'created_by' column of 'customers' in the schema cache" },
          };
          return { data: { id: "account-id", ...this.payload }, error: null };
        },
      };
      return query;
    },
  };
  return { client, writes };
}

test("customer writes retry without unsupported creator while retaining workspace scope", async () => {
  const before = process.env.FREYR_WORKSPACE_ID;
  process.env.FREYR_WORKSPACE_ID = WORKSPACE;
  try {
    const { client, writes } = clientWithoutCustomerCreator();
    const db = buildSupabaseAdapter(client);
    const created = await db.customers.create({ company_name: "Example", created_by: "Anir" });
    assert.equal(created.company_name, "Example");
    assert.deepEqual(writes.map(write => "created_by" in write.payload), [true, false]);
    assert.equal(writes[1].payload.workspace_id, WORKSPACE);

    const updated = await db.customers.update("account-id", { company_name: "Example 2", created_by: "Anir" });
    assert.equal(updated?.company_name, "Example 2");
    assert.deepEqual(writes.slice(2).map(write => "created_by" in write.payload), [true, false]);
    assert.equal(writes[3].payload.workspace_id, WORKSPACE);
  } finally {
    if (before === undefined) delete process.env.FREYR_WORKSPACE_ID;
    else process.env.FREYR_WORKSPACE_ID = before;
  }
});
