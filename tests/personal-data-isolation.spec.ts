import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

const PORT = Number(process.env.AUTH_TEST_PORT || 3011);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "freyr-auth-test-secret-2026-long-enough";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

type TestMember = {
  subject: string;
  userId: string;
  name: string;
  email: string;
};

const ALICE: TestMember = {
  subject: "personal-scope-alice-auth",
  userId: "personal-scope-alice-member",
  name: "Alice Scope",
  email: "alice.scope@example.com",
};
const BOB: TestMember = {
  subject: "personal-scope-bob-auth",
  userId: "personal-scope-bob-member",
  name: "Bob Scope",
  email: "bob.scope@example.com",
};

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function memberContext(
  browser: Browser,
  member: TestMember
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await context.addCookies([
    {
      name: "freyr_session",
      value: sign({
        id: member.subject,
        name: member.name,
        email: member.email,
        roles: [],
        exp,
      }),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "freyr_access_v2",
      value: sign({
        sub: member.subject,
        userId: member.userId,
        email: member.email,
        displayName: member.name,
        role: "rep",
        workspaceId: WORKSPACE_ID,
        exp,
      }),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}

test("preferences, snippets, and account chats stay private per member", async ({
  browser,
}) => {
  const alice = await memberContext(browser, ALICE);
  const bob = await memberContext(browser, BOB);

  try {
    const alicePrefsUpdate = await alice.request.put("/api/agent/prefs", {
      data: { only_mine: true, draft_tone: "formal" },
    });
    expect(alicePrefsUpdate.ok()).toBeTruthy();

    const bobPrefs = await (await bob.request.get("/api/agent/prefs")).json();
    expect(bobPrefs.prefs.only_mine).toBe(false);
    expect(bobPrefs.prefs.draft_tone).toBe("warm");

    const alicePrefs = await (
      await alice.request.get("/api/agent/prefs")
    ).json();
    expect(alicePrefs.prefs.only_mine).toBe(true);
    expect(alicePrefs.prefs.draft_tone).toBe("formal");

    const aliceDefaults = await (
      await alice.request.get("/api/agent/snippets")
    ).json();
    const bobDefaults = await (
      await bob.request.get("/api/agent/snippets")
    ).json();
    expect(aliceDefaults.snippets).toHaveLength(1);
    expect(bobDefaults.snippets).toHaveLength(1);
    expect(aliceDefaults.snippets[0].id).not.toBe(
      bobDefaults.snippets[0].id
    );

    const createdResponse = await alice.request.post("/api/agent/snippets", {
      data: {
        title: "Alice private draft",
        subject: "Private subject",
        body: "Only Alice should see this.",
      },
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()).snippet;

    const bobList = await (
      await bob.request.get("/api/agent/snippets")
    ).json();
    expect(
      bobList.snippets.some(
        (snippet: { id: string }) => snippet.id === created.id
      )
    ).toBe(false);

    const bobEdit = await bob.request.patch("/api/agent/snippets", {
      data: { id: created.id, body: "Bob changed Alice's draft." },
    });
    expect(bobEdit.status()).toBe(404);
    const bobDelete = await bob.request.delete("/api/agent/snippets", {
      data: { id: created.id },
    });
    expect(await bobDelete.json()).toMatchObject({ ok: false });

    const aliceAfterAttack = await (
      await alice.request.get("/api/agent/snippets")
    ).json();
    expect(
      aliceAfterAttack.snippets.find(
        (snippet: { id: string }) => snippet.id === created.id
      )?.body
    ).toBe("Only Alice should see this.");

    const customerId = "cust-001";
    await Promise.all([
      alice.request.delete("/api/agent/chat", { data: { customerId } }),
      bob.request.delete("/api/agent/chat", { data: { customerId } }),
    ]);
    const aliceChat = await alice.request.post("/api/agent/chat", {
      data: {
        customerId,
        question: "What should I do next?",
        context: {
          company: "BioNex Therapeutics",
          healthLabel: "Healthy",
          healthScore: 82,
          openValue: "$100K",
          dealCount: 1,
          contactCount: 1,
        },
      },
    });
    expect(aliceChat.ok()).toBeTruthy();

    const bobChat = await (
      await bob.request.get(`/api/agent/chat?customerId=${customerId}`)
    ).json();
    expect(bobChat.messages).toEqual([]);

    await bob.request.delete("/api/agent/chat", { data: { customerId } });
    const aliceChatAfterBobClear = await (
      await alice.request.get(`/api/agent/chat?customerId=${customerId}`)
    ).json();
    expect(aliceChatAfterBobClear.messages.length).toBeGreaterThanOrEqual(2);
    expect(
      aliceChatAfterBobClear.messages.some(
        (message: { text: string }) =>
          message.text === "What should I do next?"
      )
    ).toBe(true);
  } finally {
    await Promise.all([alice.close(), bob.close()]);
  }
});
