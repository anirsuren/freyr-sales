import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute the real authorization and route code. Only persistence/framework
// context are substituted; no .env is loaded and all network is prohibited.
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const prefs = new Map();
const durableRows = new Map();
const privileges = new Set();
let directoryOverride = null;
let allowCustomers = false;
let allowOpportunities = false;
let accountReads = 0;
let providerCalls = 0;
let lastProviderPrompt = "";
const fixtureCustomer = {
  id: "customer-real",
  company_name: "Verified company",
  owner: "Verified owner",
  competitor: null,
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network forbidden in isolated enterprise privilege tests");
};
process.env.AUTH_MODE = "supabase";
process.env.AUTH_COOKIE_SECRET =
  "isolated-agent-audit-secret-at-least-32-characters";
process.env.AUTH_SESSION_SECRET = process.env.AUTH_COOKIE_SECRET;
process.env.FREYR_WORKSPACE_ID = "fixture-workspace";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const localRequire = (name) => {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js")
      return {
        createClient: (url) => {
          assert.equal(url, "https://agent-fixture.invalid");
          return {
            rpc: async (name, args) => {
              assert.equal(name, "save_agent_history_if_unchanged");
              const row = durableRows.get(args.p_id);
              if (JSON.stringify(row?.catalog) !== JSON.stringify(args.p_expected)) return {data:false,error:null};
              durableRows.set(args.p_id, {id:args.p_id,catalog:structuredClone(args.p_catalog)});
              return {data:true,error:null};
            },
            from: (table) => {
              assert.equal(table, "offering_catalog_state");
              let id;
              const query = {
                select: () => query,
                eq: (column, value) => {
                  assert.equal(column, "id");
                  id = value;
                  return query;
                },
                maybeSingle: async () => ({
                  data: durableRows.get(id) ?? null,
                  error: null,
                }),
                insert: async (row) => {
                  if (durableRows.has(row.id)) return {error: {code:"23505"}};
                  durableRows.set(row.id, structuredClone(row));
                  return {error:null};
                },
                upsert: async (row) => {
                  durableRows.set(row.id, structuredClone(row));
                  return { error: null };
                },
              };
              return query;
            },
          };
        },
      };
    if (name === "next/headers")
      return {
        cookies() {
          throw new Error("No ambient cookie scope");
        },
        headers() {
          throw new Error("No ambient headers");
        },
      };
    if (name === "react") return { cache: (fn) => fn };
    const resolved = name.startsWith("@/")
      ? path.join(root, name.slice(2))
      : name.startsWith(".")
        ? path.resolve(path.dirname(filename), name)
        : null;
    if (resolved === path.join(root, "lib/currentUser"))
      return {
        memberIdForEmail: () => {
          throw new Error("Unexpected local identity fallback");
        },
      };
    if (resolved === path.join(root, "lib/dataMode"))
      return { getDataMode: () => "mock" };
    if (resolved === path.join(root, "lib/memberPrivilegeIdentity"))
      return {
        verifiedMemberPrivileges: async (state, memberId) =>
          load("lib/memberPrivilegeBindings.ts").privilegesForMember(
            state,
            memberId,
            directoryOverride ??
              users.map((user) => ({
                id: user.userId,
                display_name: user.name,
                active: true,
              })),
          ),
      };
    if (resolved === path.join(root, "lib/privileges"))
      return {
        readPrivileges: async () => ({
          peoplePrivileges: Object.fromEntries(
            [...privileges].map((name) => [name, ["admin"]]),
          ),
        }),
        privilegesForPerson: (state, name) =>
          load("lib/privileges.ts").privilegesForPerson(state, name),
      };
    if (resolved === path.join(root, "lib/moduleAccessServer"))
      return {
        canOpenModule: async (p) =>
          p === "/customers"
            ? allowCustomers
            : p === "/opportunities"
              ? allowOpportunities
              : false,
      };
    if (resolved === path.join(root, "lib/usageCounters"))
      return { bumpUsage() {} };
    if (resolved === path.join(root, "lib/memberProfile"))
      return { readMemberProfile: async () => ({ title: "", signature: "" }) };
    if (resolved === path.join(root, "lib/repIdentity"))
      return { repIdentityBlock: () => "" };
    if (resolved === path.join(root, "lib/claude"))
      return {
        agentAnswer: async (_system, prompt) => {
          providerCalls++;
          lastProviderPrompt = prompt;
          return "Verified reply";
        },
        narrateBriefing: async () => {
          providerCalls++;
          return "Verified briefing";
        },
      };
    if (resolved === path.join(root, "lib/opportunities"))
      return {
        readOpportunities: async () => {
          assert.ok(
            allowOpportunities,
            "Denied opportunities must not be read",
          );
          return { opportunities: [] };
        },
      };
    if (resolved === path.join(root, "lib/pipeline"))
      return {
        buildDeals: () => [],
        dealsFromOpportunities: () => [],
        ROTTING_DAYS: 30,
        formatMoney: (value) => `$${value}`,
      };
    if (resolved === path.join(root, "lib/agent"))
      return {
        answerAccountQuestion: () => "",
        buildAccountBriefing: (context) => ({ narrative: context.company }),
        nextBestActions: () => [],
        focusActions: () => ({ actions: [] }),
        DRAFTABLE: [],
      };
    if (resolved === path.join(root, "lib/db"))
      return {
        getDb: () => ({
          customers: {
            get: async (id) => {
              accountReads++;
              return id === fixtureCustomer.id ? fixtureCustomer : null;
            },
            list: async () => {
              accountReads++;
              return [fixtureCustomer];
            },
          },
          contacts: {
            list: async () => {
              throw new Error("Denied Contacts must not be read");
            },
          },
          interactions: {
            list: async () => {
              accountReads++;
              return [];
            },
          },
          pitchSessions: {
            list: async () => {
              throw new Error("Denied Sessions must not be read");
            },
          },
          agentChats: {
            list: async () => [],
            create: async () => ({}),
            clear: async () => {},
          },
          agentPrefs: {
            get: async (scope) => prefs.get(JSON.stringify(scope)),
            update: async (scope, value) => {
              prefs.set(JSON.stringify(scope), structuredClone(value));
            },
          },
        }),
      };
    if (resolved) return load(`${path.relative(root, resolved)}.ts`);
    if (name === "next/server") return require(name);
    throw new Error(`Unexpected import: ${name}`);
  };
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "module", "exports", output)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
const access = load("lib/accessControl.ts");
const session = load("lib/appSession.ts");
const scope = load("lib/memberScope.ts");
const workflow = load("lib/workflowAuthorization.ts");
const conversations = load("app/api/agent/conversations/route.ts");
const { NextRequest } = require("next/server");
const users = ["bd_member", "bd_owner", "sol_member", "admin"].map(
  (role, index) => ({
    id: `subject-${index}`,
    userId: `member-${index}`,
    name: `Fixture ${role}`,
    email: `fixture${index}@freyrsolutions.com`,
    role,
  }),
);
async function request(user, options = {}) {
  const principal = await session.signAppSession({
    id: user.id,
    name: "Provider name ignored",
    email: user.email,
    roles: ["admin"],
  });
  const grant = await access.signAccessGrant({
    sub: user.id,
    userId: user.userId,
    email: user.email,
    displayName: user.name,
    role: user.role,
    workspaceId: "fixture-workspace",
    ...options.grant,
  });
  return new NextRequest(
    "http://fixture.invalid/api/agent/conversations?userId=member-victim&workspaceId=other",
    {
      method: options.body === undefined ? "GET" : "PUT",
      headers: {
        cookie: `${session.APP_SESSION_COOKIE}=${options.principal ?? principal}; ${access.ACCESS_COOKIE}=${options.token ?? grant}`,
        "Content-Type": "application/json",
        "x-user-id": "member-victim",
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  );
}
for (const user of users) {
  test(`${user.role}: actor comes from signed workspace identity, ignoring provider role and spoofed ids`, async () => {
    const req = await request(user);
    assert.deepEqual(await scope.verifiedRequestMemberScope(req), {
      workspaceId: "fixture-workspace",
      userId: user.userId,
    });
    const actor = await workflow.verifiedWorkflowActor(req);
    assert.equal(actor.role, user.role);
    assert.equal(actor.name, user.name);
    assert.equal(actor.userId, user.userId);
    assert.equal(
      workflow.isWorkflowOwner(actor, user.userId, "different name"),
      true,
    );
    assert.equal(
      workflow.isWorkflowOwner(actor, "other-user", user.name),
      false,
    );
    assert.equal(workflow.isWorkflowOwner(actor, null, user.name), false);
    assert.equal(
      workflow.isWorkflowOwnerOrAdmin(actor, "other-user", user.name),
      user.role === "admin",
    );
    assert.equal(
      workflow.isWorkflowOwnerOrManager(actor, "other-user", user.name),
      ["admin", "bd_owner"].includes(user.role),
    );
  });
  test(`${user.role}: conversation create/read/update/delete stays private`, async () => {
    const body = {
      base: [],
      userId: "member-victim",
      workspaceId: "other",
      conversations: [
        {
          id: "same-id",
          title: user.name,
          messages: [{ role: "user", text: `Private ${user.userId}`, ts: 1 }, {role:"agent",text:"Answer",ts:2,suggestions:["Show the next step?","Compare my goals?"]}],
          updated: 1,
        },
      ],
    };
    assert.equal(
      (await conversations.PUT(await request(user, { body }))).status,
      200,
    );
    const saved = await (await conversations.GET(await request(user))).json();
    assert.equal(
      saved.conversations[0].messages[0].text,
      `Private ${user.userId}`,
    );
    assert.deepEqual(saved.conversations[0].messages[1].suggestions, ["Show the next step?", "Compare my goals?"]);
    for (const other of users.filter((other) => other.id !== user.id)) {
      const response = await (
        await conversations.GET(await request(other))
      ).json();
      assert.equal(
        JSON.stringify(response).includes(`Private ${user.userId}`),
        false,
      );
    }
    body.base = structuredClone(body.conversations);
    body.conversations[0].title = "Updated";
    assert.equal(
      (await conversations.PUT(await request(user, { body }))).status,
      200,
    );
    assert.equal(
      (await (await conversations.GET(await request(user))).json())
        .conversations[0].title,
      "Updated",
    );
    assert.equal(
      (
        await conversations.PUT(
          await request(user, { body: { conversations: [], base: body.conversations } }),
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await (await conversations.GET(await request(user))).json())
        .conversations,
      [],
    );
  });
}
for (const [label, options] of [
  ["subject mismatch", { grant: { sub: "different-subject" } }],
  ["foreign workspace", { grant: { workspaceId: "foreign-workspace" } }],
  ["forged grant", { token: "forged.payload" }],
  ["forged login", { principal: "forged.payload" }],
]) {
  test(`${label}: authentication fails closed for read and write`, async () => {
    assert.equal(
      await workflow.verifiedWorkflowActor(await request(users[0], options)),
      null,
    );
    assert.equal(
      (await conversations.GET(await request(users[0], options))).status,
      403,
    );
    assert.equal(
      (
        await conversations.PUT(
          await request(users[0], { ...options, body: { conversations: [], base: [] } }),
        )
      ).status,
      403,
    );
  });
}
test("expired role grant requires refresh even while login session is still valid", async () => {
  const req = await request(users[0]);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 16 * 60 * 1000;
  try {
    assert.equal(await workflow.verifiedWorkflowActor(req), null);
  } finally {
    Date.now = originalNow;
  }
});
test("malformed histories reject roles, message limits and oversized payload without writes", async () => {
  const before = JSON.stringify([...prefs]);
  for (const body of [
    {
      conversations: [
        { id: "bad", messages: [{ role: "system", text: "Promote me" }] },
      ],
    },
    {
      conversations: Array.from({ length: 501 }, () => ({
        id: "id",
        messages: [],
      })),
    },
  ]) {
    assert.equal(
      (await conversations.PUT(await request(users[0], { body }))).status,
      400,
    );
  }
  assert.equal(
    (
      await conversations.PUT(
        await request(users[0], {
          body: { conversations: [], padding: "x".repeat(8_000_001) },
        }),
      )
    ).status,
    413,
  );
  assert.equal(JSON.stringify([...prefs]), before);
});
test("same-name accounts cannot inherit a legacy Admin privilege", async () => {
  privileges.add("Duplicate Name");
  directoryOverride = [users[0], users[2]].map((user) => ({
    id: user.userId,
    display_name: "Duplicate Name",
    active: true,
  }));
  try {
    const first = await workflow.verifiedWorkflowActor(
      await request({ ...users[0], name: "Duplicate Name" }),
    );
    const second = await workflow.verifiedWorkflowActor(
      await request({ ...users[2], name: "Duplicate Name" }),
    );
    assert.notEqual(first.userId, second.userId);
    assert.equal(first.role, "bd_member");
    assert.equal(second.role, "sol_member");
  } finally {
    privileges.clear();
    directoryOverride = null;
  }
});
test("2,000 isolated member accounts retain distinct durable conversation rows", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://agent-fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
  try {
    const accounts = Array.from({ length: 2000 }, (_, i) => ({
      ...users[i % 4],
      id: `scale-subject-${i}`,
      userId: `scale-member-${i}`,
      name: `Fixture member ${i}`,
    }));
    // Bounded concurrency exercises shared row addressing, not network/server capacity.
    for (let offset = 0; offset < accounts.length; offset += 50) {
      await Promise.all(
        accounts.slice(offset, offset + 50).map(async (user) => {
          const body = {
            base: [],
            userId: "victim",
            conversations: [
              {
                id: "same-chat-id",
                title: user.name,
                messages: [{ role: "user", text: user.userId, ts: 1 }],
                updated: 1,
              },
            ],
          };
          assert.equal(
            (await conversations.PUT(await request(user, { body }))).status,
            200,
          );
          const saved = await (
            await conversations.GET(await request(user))
          ).json();
          assert.equal(saved.conversations[0].messages[0].text, user.userId);
        }),
      );
    }
    assert.equal(durableRows.size, 2000);
    for (const user of accounts) {
      const row = durableRows.get(
        `agent-conversations:fixture-workspace:${user.userId}`,
      );
      assert.equal(row.catalog.userId, user.userId);
      assert.equal(row.catalog.conversations[0].messages[0].text, user.userId);
    }
    assert.equal(
      (
        await conversations.PUT(
          await request(accounts[0], { body: { conversations: [], base: durableRows.get(`agent-conversations:fixture-workspace:${accounts[0].userId}`).catalog.conversations } }),
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await conversations.GET(await request(accounts[1]))).json())
        .conversations.length,
      1,
    );
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    durableRows.clear();
  }
});
test("all ancillary agent endpoints refuse denied Customers before reading or calling a model", async () => {
  allowCustomers = false;
  const beforeReads = accountReads,
    beforeCalls = providerCalls;
  for (const [route, methods] of [
    ["summary", ["GET"]],
    ["inbox", ["GET"]],
    ["draft", ["POST"]],
    ["chat", ["GET", "POST", "DELETE"]],
    ["ask", ["POST"]],
    ["briefing", ["POST"]],
  ]) {
    const handlers = load(`app/api/agent/${route}/route.ts`);
    for (const method of methods) {
      const req = await request(
        users[0],
        method === "GET"
          ? {}
          : {
              body: {
                customerId: "customer-real",
                question: "Tell me",
                context: { company: "Spoof" },
              },
            },
      );
      const response = await handlers[method](req);
      assert.equal(response.status, 403, `${route} ${method} must deny`);
    }
  }
  assert.equal(accountReads, beforeReads);
  assert.equal(providerCalls, beforeCalls);
});
test("account ask and chat ignore supplied facts and gate opportunity context", async () => {
  allowCustomers = true;
  allowOpportunities = false;
  try {
    for (const route of ["ask", "chat"]) {
      const handler = load(`app/api/agent/${route}/route.ts`);
      const response = await handler.POST(
        await request(users[0], {
          body: {
            customerId: "customer-real",
            question: "Tell me about it",
            context: {
              company: "Spoof company",
              owner: "Spoof owner",
              openValue: "$999 billion",
            },
          },
        }),
      );
      assert.equal(response.status, 200);
      assert.match(lastProviderPrompt, /Verified company/);
      assert.doesNotMatch(lastProviderPrompt, /Spoof|999 billion/);
    }
    const response = await load("app/api/agent/ask/route.ts").POST(
      await request(users[0], {
        body: { customerId: "missing", question: "Hi" },
      }),
    );
    assert.equal(response.status, 404);
  } finally {
    allowCustomers = false;
  }
});
test("legacy ask and briefing reject unauthenticated calls before provider spend", async () => {
  allowCustomers = true;
  const before = providerCalls;
  try {
    for (const route of ["ask", "briefing"]) {
      const response = await load(`app/api/agent/${route}/route.ts`).POST(
        await request(users[0], {
          principal: "forged.login",
          body: { customerId: "customer-real", question: "Hi" },
        }),
      );
      assert.equal(response.status, 403);
    }
    assert.equal(providerCalls, before);
  } finally {
    allowCustomers = false;
  }
});
test.after(() => {
  globalThis.fetch = originalFetch;
});

test("stable privilege migration binds unique members and denies ambiguous, inactive and missing members", () => {
  const { bindLegacyMemberPrivileges, privilegesForMember } = load(
    "lib/memberPrivilegeBindings.ts",
  );
  const state = {
    peoplePrivileges: {
      "Unique Name": ["admin"],
      "Duplicate Name": ["admin"],
      "Inactive Name": ["admin"],
    },
  };
  const directory = [
    { id: "one", display_name: "unique name", active: true },
    { id: "two", display_name: "Duplicate Name", active: true },
    { id: "three", display_name: "Duplicate Name", active: true },
    { id: "four", display_name: "Inactive Name", active: false },
  ];
  assert.deepEqual(bindLegacyMemberPrivileges(state, directory), {
    one: ["admin"],
  });
  assert.deepEqual(privilegesForMember(state, "one", directory), ["admin"]);
  for (const id of ["two", "three", "four", "missing", null])
    assert.deepEqual(privilegesForMember(state, id, directory), []);
  const bound = { ...state, memberPrivileges: { one: ["admin"], two: [] } };
  const renamed = directory.map((member) =>
    member.id === "one" ? { ...member, display_name: "Renamed" } : member,
  );
  assert.deepEqual(privilegesForMember(bound, "one", renamed), ["admin"]);
  assert.deepEqual(privilegesForMember(bound, "two", renamed), []);
});

test("admin save migration preserves bindings and applies unique-name revocations", () => {
  const { reconcileMemberPrivilegeBindings } = load(
    "lib/memberPrivilegeBindings.ts",
  );
  const members = [
    { id: "one", display_name: "Unique", active: true },
    { id: "two", display_name: "Renamed", active: true },
    { id: "three", display_name: "Duplicate", active: true },
    { id: "four", display_name: "Duplicate", active: true },
  ];
  const before = {
    peoplePrivileges: {
      Unique: ["admin"],
      "Old Name": ["admin"],
      Duplicate: ["admin"],
    },
    memberPrivileges: { one: ["admin"], two: ["admin"] },
  };
  const next = {
    peoplePrivileges: { "Old Name": ["admin"], Duplicate: ["admin"] },
  };
  const result = reconcileMemberPrivilegeBindings(next, before, members);
  assert.deepEqual(result.memberPrivileges, { one: [], two: ["admin"] });
  assert.deepEqual(result.peoplePrivileges, next.peoplePrivileges);
});

test("case variants merge legacy badges and stable empty bindings stay revoked",()=>{
 const {bindLegacyMemberPrivileges}=load("lib/memberPrivilegeBindings.ts");
 const members=[{id:"one",display_name:"Unique",active:true}];
 const state={peoplePrivileges:{Unique:["admin"]," unique ":["bd_owner"]}};
 assert.deepEqual(bindLegacyMemberPrivileges(state,members),{one:["admin","bd_owner"]});
 assert.deepEqual(bindLegacyMemberPrivileges({...state,memberPrivileges:{one:[]}},members),{one:[]});
 const normalized=load("lib/privileges.ts").normalizePrivilegeState({...state,memberPrivileges:{one:[]}});
 assert.deepEqual(normalized.memberPrivileges,{one:[]});
});
