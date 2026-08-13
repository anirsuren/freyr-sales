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

type Role = "rep" | "manager" | "admin";

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function roleContext(
  browser: Browser,
  role: Role,
  identityKey: string = role,
  name = `${identityKey} Guardrail`
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const subject = `guardrail-${identityKey}-subject`;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await context.addCookies([
    {
      name: "freyr_session",
      value: sign({
        id: subject,
        name,
        email: `${identityKey}@example.com`,
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
        sub: subject,
        userId: `guardrail-${identityKey}-member`,
        email: `${identityKey}@example.com`,
        displayName: name,
        role,
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

test("sales members cannot approve or send workspace-wide queues", async ({
  browser,
}) => {
  const sales = await roleContext(browser, "rep");
  try {
    const review = await sales.request.post("/api/sessions/sess-003/review", {
      data: { action: "approve" },
    });
    expect(review.status()).toBe(403);

    const approveAll = await sales.request.post("/api/agent/approve-all");
    expect(approveAll.status()).toBe(403);

    const sendAll = await sales.request.post("/api/agent/send-all");
    expect(sendAll.status()).toBe(403);
  } finally {
    await sales.close();
  }
});

test("campaign edits are limited to the stable owner or an admin", async ({
  browser,
}) => {
  const owner = await roleContext(
    browser,
    "rep",
    "campaign-owner",
    "Campaign Owner"
  );
  const other = await roleContext(
    browser,
    "rep",
    "campaign-other",
    "Campaign Other"
  );
  const editor = await roleContext(browser, "manager", "campaign-editor");
  const admin = await roleContext(browser, "admin", "campaign-admin");
  try {
    const created = await owner.request.post("/api/campaigns", {
      data: {
        name: "Owner-protected campaign",
        subject: "Original",
        body: "Original body",
      },
    });
    expect(created.ok()).toBeTruthy();
    const campaign = (await created.json()).campaign as {
      id: string;
      owner: string;
      owner_user_id: string;
    };
    expect(campaign).toMatchObject({
      owner: "Campaign Owner",
      owner_user_id: "guardrail-campaign-owner-member",
    });

    expect(
      (
        await other.request.patch(`/api/campaigns/${campaign.id}`, {
          data: { subject: "Stolen" },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await editor.request.patch(`/api/campaigns/${campaign.id}`, {
          data: { subject: "Editor is not the owner" },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await owner.request.patch(`/api/campaigns/${campaign.id}`, {
          data: { subject: "Owner edit" },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await admin.request.patch(`/api/campaigns/${campaign.id}`, {
          data: { subject: "Admin edit" },
        })
      ).ok()
    ).toBeTruthy();
  } finally {
    await Promise.all([
      owner.close(),
      other.close(),
      editor.close(),
      admin.close(),
    ]);
  }
});

test("sequence edits and deletion are limited to the stable owner or an admin", async ({
  browser,
}) => {
  const owner = await roleContext(
    browser,
    "rep",
    "sequence-owner",
    "Sequence Owner"
  );
  const other = await roleContext(
    browser,
    "rep",
    "sequence-other",
    "Sequence Other"
  );
  const editor = await roleContext(browser, "manager", "sequence-editor");
  const admin = await roleContext(browser, "admin", "sequence-admin");
  try {
    const created = await owner.request.post("/api/sequences", {
      data: {
        name: "Owner-protected sequence",
        description: "Signed ownership",
        steps: [{ day: 0, channel: "email", label: "Introduction" }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const sequence = (await created.json()).sequence as {
      id: string;
      owner: string;
      owner_user_id: string;
    };
    expect(sequence).toMatchObject({
      owner: "Sequence Owner",
      owner_user_id: "guardrail-sequence-owner-member",
    });

    expect(
      (
        await other.request.patch(`/api/sequences/${sequence.id}`, {
          data: { name: "Stolen sequence" },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await editor.request.delete(`/api/sequences/${sequence.id}`)
      ).status()
    ).toBe(403);
    expect(
      (
        await owner.request.patch(`/api/sequences/${sequence.id}`, {
          data: { name: "Owner-updated sequence" },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (await admin.request.delete(`/api/sequences/${sequence.id}`)).ok()
    ).toBeTruthy();
  } finally {
    await Promise.all([
      owner.close(),
      other.close(),
      editor.close(),
      admin.close(),
    ]);
  }
});

test("agent undo is limited to the run creator or a manager", async ({
  browser,
}) => {
  const owner = await roleContext(browser, "rep", "run-owner", "Run Owner");
  const other = await roleContext(browser, "rep", "run-other", "Run Other");
  const manager = await roleContext(
    browser,
    "manager",
    "run-manager",
    "Run Manager"
  );
  try {
    const first = await owner.request.post("/api/agent/act", {
      data: { kind: "followup", customerId: "cust-001" },
    });
    expect(first.ok()).toBeTruthy();
    const firstRunId = (await first.json()).runId as string;
    expect(firstRunId).toBeTruthy();

    expect(
      (
        await other.request.post("/api/agent/undo", {
          data: { runId: firstRunId },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await manager.request.post("/api/agent/undo", {
          data: { runId: firstRunId },
        })
      ).ok()
    ).toBeTruthy();

    const second = await owner.request.post("/api/agent/act", {
      data: { kind: "followup", customerId: "cust-001" },
    });
    const secondRunId = (await second.json()).runId as string;
    expect(
      (
        await owner.request.post("/api/agent/undo", {
          data: { runId: secondRunId },
        })
      ).ok()
    ).toBeTruthy();
  } finally {
    await Promise.all([owner.close(), other.close(), manager.close()]);
  }
});

test("mock voice runs stay simulated for teammates and enforce a bulk cap", async ({
  browser,
}) => {
  const owner = await roleContext(
    browser,
    "rep",
    "voice-owner",
    "Voice Owner"
  );
  const other = await roleContext(
    browser,
    "rep",
    "voice-other",
    "Voice Other"
  );
  const editor = await roleContext(browser, "manager", "voice-editor");
  const admin = await roleContext(browser, "admin", "voice-admin");
  const category = "Regulatory Affairs";
  try {
    expect(
      (
        await other.request.post("/api/voice/queue", {
          data: { contactIds: ["cont-001"], category },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await editor.request.post("/api/voice/queue", {
          data: { contactIds: ["cont-001"], category },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await owner.request.post("/api/voice/queue", {
          data: { contactIds: ["cont-001", "cont-001"], category },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await admin.request.post("/api/voice/queue", {
          data: { contactIds: ["cont-001"], category },
        })
      ).ok()
    ).toBeTruthy();

    const single = await other.request.post("/api/voice/call", {
      data: { contactId: "cont-001", offeringId: "of-001" },
    });
    expect(single.ok()).toBeTruthy();
    expect(await single.json()).toMatchObject({
      ok: true,
      status: "waiting_for_number",
    });

    const tooMany = Array.from({ length: 101 }, (_, index) => `contact-${index}`);
    const capped = await admin.request.post("/api/voice/queue", {
      data: { contactIds: tooMany, category },
    });
    expect(capped.status()).toBe(400);
    expect(await capped.json()).toMatchObject({
      error: "A bulk voice run is limited to 100 contacts.",
    });
  } finally {
    await Promise.all([
      owner.close(),
      other.close(),
      editor.close(),
      admin.close(),
    ]);
  }
});

test("knowledge-base mutations are admin-only", async ({ browser }) => {
  const sales = await roleContext(browser, "rep");
  try {
    expect((await sales.request.post("/api/kb/crawl")).status()).toBe(403);
    expect(
      (
        await sales.request.post("/api/kb/services", {
          data: { name: "Unauthorized service" },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await sales.request.patch("/api/kb/services", {
          data: { index: 0, name: "Unauthorized edit" },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await sales.request.delete("/api/kb/services?index=0")
      ).status()
    ).toBe(403);
  } finally {
    await sales.close();
  }
});

test("pitch sending requires approval and uses the session contact", async ({
  browser,
}) => {
  const sales = await roleContext(browser, "rep");
  try {
    const draftSend = await sales.request.post("/api/sessions/sess-001/send", {
      data: {
        subject: "Must stay gated",
        to: "p.mehta@bionextherapeutics.com",
        body: "This must not be delivered.",
      },
    });
    expect(draftSend.status()).toBe(409);

    const wrongRecipient = await sales.request.post(
      "/api/sessions/sess-009/send",
      {
        data: {
          subject: "Approved but wrong recipient",
          to: "attacker@example.com",
          body: "This must not be delivered.",
        },
      }
    );
    expect(wrongRecipient.status()).toBe(400);
    expect(await wrongRecipient.json()).toMatchObject({
      error: "The recipient must match the contact on this pitch.",
    });

    const driftedCopy = await sales.request.post(
      "/api/sessions/sess-009/send",
      {
        data: {
          subject: "Approved and contact-bound",
          body: "This copy was never approved.",
        },
      }
    );
    expect(driftedCopy.status()).toBe(409);
    expect(await driftedCopy.json()).toMatchObject({
      error:
        "The email no longer matches the approved pitch. Save the changes and submit it for approval again.",
    });

    // The route derives both destination and content from the approved session,
    // so it does not need to trust browser-supplied email fields.
    const derivedRecipient = await sales.request.post(
      "/api/sessions/sess-009/send",
      { data: {} }
    );
    expect(derivedRecipient.ok()).toBeTruthy();
  } finally {
    await sales.close();
  }
});

test("changing approved pitch content resets compliance approval", async ({
  browser,
}) => {
  const sales = await roleContext(browser, "rep", "pitch-editor", "Pitch Editor");
  const manager = await roleContext(
    browser,
    "manager",
    "pitch-manager",
    "Pitch Manager"
  );
  try {
    const duplicateResponse = await sales.request.post(
      "/api/sessions/sess-009/duplicate"
    );
    expect(duplicateResponse.ok()).toBeTruthy();
    const duplicate = (await duplicateResponse.json()) as { id: string };

    const approved = await manager.request.post(
      `/api/sessions/${duplicate.id}/review`,
      { data: { action: "approve" } }
    );
    expect(approved.ok()).toBeTruthy();

    const changed = await sales.request.patch(
      `/api/sessions/${duplicate.id}/pitch`,
      {
        data: {
          pitch_email: {
            subject_lines: ["Changed after approval"],
            body: "This content needs a fresh compliance decision.",
          },
        },
      }
    );
    expect(changed.ok()).toBeTruthy();
    expect(await changed.json()).toMatchObject({ review_status: "draft" });

    const stored = await sales.request.get(`/api/sessions/${duplicate.id}`);
    expect(stored.ok()).toBeTruthy();
    expect(await stored.json()).toMatchObject({
      session: {
        review_status: "draft",
        reviewer: null,
        review_note: null,
        reviewed_at: null,
      },
    });

    expect(
      (
        await manager.request.post(
          `/api/sessions/${duplicate.id}/review`,
          { data: { action: "approve" } }
        )
      ).ok()
    ).toBeTruthy();
    const regenerated = await sales.request.post(
      `/api/sessions/${duplicate.id}/regenerate`
    );
    expect(regenerated.ok()).toBeTruthy();
    expect(await regenerated.json()).toMatchObject({ review_status: "draft" });
  } finally {
    await Promise.all([sales.close(), manager.close()]);
  }
});

test("session outcomes ignore caller-supplied customer and contact ids", async ({
  browser,
}) => {
  const sales = await roleContext(browser, "rep");
  try {
    const response = await sales.request.post(
      "/api/sessions/sess-005/outcome",
      {
        data: {
          outcome: "in_progress",
          customer_id: "cust-999",
          contact_id: "cont-999",
          notes: "Guardrail verification",
        },
      }
    );
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({
      interaction: {
        pitch_session_id: "sess-005",
        customer_id: "cust-005",
        contact_id: "cont-005",
      },
    });
  } finally {
    await sales.close();
  }
});
