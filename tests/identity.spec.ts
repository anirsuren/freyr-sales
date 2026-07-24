import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

const PORT = Number(process.env.AUTH_TEST_PORT || 3011);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "freyr-auth-test-secret-2026-long-enough";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

type Identity = {
  subject: string;
  memberId: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "sales";
  firstName: string;
  initials: string;
  photo: string | null;
};

const ANIR: Identity = {
  subject: "auth-anir",
  memberId: "member-anir",
  name: "Anir Suren",
  email: "anir.s@freyrsolutions.com",
  role: "admin",
  firstName: "Anir",
  initials: "AS",
  photo: null,
};

const SUREN: Identity = {
  subject: "auth-suren",
  memberId: "member-suren",
  name: "Suren Dheen",
  email: "suren.dheen@freyrsolutions.com",
  role: "sales",
  firstName: "Suren",
  initials: "SD",
  photo: "/avatars/suren-dheen.png",
};

const AVERY: Identity = {
  subject: "auth-avery",
  memberId: "member-avery",
  name: "Avery Partner",
  email: "avery@partner.org",
  role: "sales",
  firstName: "Avery",
  initials: "AP",
  photo: null,
};

const IDENTITIES = [ANIR, SUREN, AVERY] as const;

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function appSession(identity: Identity): string {
  return sign({
    id: identity.subject,
    name: identity.name,
    email: identity.email,
    roles: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function accessGrant(identity: Identity): string {
  return sign({
    sub: identity.subject,
    userId: identity.memberId,
    email: identity.email,
    displayName: identity.name,
    role: identity.role,
    workspaceId: WORKSPACE_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

async function setIdentity(
  context: BrowserContext,
  identity: Identity
): Promise<void> {
  await context.addCookies([
    {
      name: "freyr_session",
      value: appSession(identity),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "freyr_access_v2",
      value: accessGrant(identity),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function fulfillJson(
  route: Route,
  value: unknown,
  status = 200
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function installAppStubs(
  page: Page,
  activeIdentity: () => Identity
): Promise<void> {
  await page.route("**/api/auth/access", (route) =>
    fulfillJson(route, { ok: true, role: activeIdentity().role })
  );
  await page.route("**/api/onboarding", (route) =>
    fulfillJson(route, {
      state: {
        version: 2,
        status: "completed",
        currentStep: 127,
        completedAt: "2026-07-24T00:00:00.000Z",
      },
      role: activeIdentity().role,
    })
  );
  await page.route("**/api/settings/access", (route) => {
    const identity = activeIdentity();
    return fulfillJson(route, {
      members: [
        {
          id: identity.memberId,
          name: identity.name,
          email: identity.email,
          role: identity.role,
          active: true,
          lastSeenAt: "2026-07-24T00:00:00.000Z",
        },
      ],
      requests: [],
      invitations: [],
    });
  });
  await page.route("**/api/agent/inbox", (route) =>
    fulfillJson(route, { needsApproval: 0, reworks: 0 })
  );
  await page.route("**/api/agent/summary", (route) =>
    fulfillJson(route, {
      ok: true,
      needsApproval: 0,
      cooling: 0,
      atRisk: 0,
    })
  );
  await page.route("**/api/agent/entities", (route) =>
    fulfillJson(route, { companies: [], contacts: [] })
  );
  await page.route("**/api/agent/converse", async (route) => {
    const request = route.request().postDataJSON() as { message?: string };
    await fulfillJson(route, {
      reply: `Private reply for ${request.message || activeIdentity().name}`,
      suggestions: [],
    });
  });
  await page.route("**/api/agent/assistant", async (route) => {
    const request = route.request().postDataJSON() as { question?: string };
    await fulfillJson(route, {
      answer: `Private answer for ${request.question || activeIdentity().name}`,
    });
  });
}

function shellSidebar(page: Page) {
  return page.locator("aside").filter({
    has: page.locator('nav[aria-label="Primary"]'),
  });
}

async function expectCurrentUserAvatar(
  scope: Locator,
  identity: Identity
): Promise<void> {
  const surenPhoto = scope.locator('img[src*="/avatars/suren-dheen.png"]');
  if (identity.photo) {
    await expect(surenPhoto).toBeVisible();
    await expect(
      scope.locator(`img[alt="${identity.name}"]`)
    ).toHaveAttribute("src", new RegExp(identity.photo.replaceAll("/", "\\/")));
  } else {
    await expect(surenPhoto).toHaveCount(0);
    await expect(scope.getByText(identity.initials, { exact: true })).toBeVisible();
  }
}

async function expectSignedInChrome(
  page: Page,
  identity: Identity,
  otherIdentities: readonly Identity[] = []
): Promise<void> {
  const sidebar = shellSidebar(page);
  await expect(sidebar.getByText(identity.name, { exact: true })).toBeVisible();
  await expect(sidebar.getByText(identity.email, { exact: true })).toBeVisible();
  await expectCurrentUserAvatar(sidebar, identity);

  const accountButton = page.getByRole("button", { name: "Account menu" });
  await expect(accountButton).toContainText(identity.name);
  await expectCurrentUserAvatar(accountButton, identity);

  for (const other of otherIdentities) {
    await expect(
      sidebar.getByText(other.name, { exact: true })
    ).toHaveCount(0);
    await expect(
      sidebar.getByText(other.email, { exact: true })
    ).toHaveCount(0);
  }
}

function spoofedIdentityFields(identity: Identity) {
  return {
    owner: identity.name,
    sender: identity.name,
    senderName: identity.name,
    repName: identity.name,
    actorName: identity.name,
    author: identity.name,
    createdBy: identity.name,
    logged_by: identity.name,
    userId: identity.memberId,
  };
}

function expectAttributedCopy(
  value: unknown,
  signedIn: Identity,
  attemptedImpersonation: Identity
): void {
  const copy = typeof value === "string" ? value : JSON.stringify(value);
  expect(copy).toContain(signedIn.name);
  expect(copy).not.toContain(attemptedImpersonation.name);
}

async function createdSessionPitch(
  request: APIRequestContext,
  attemptedImpersonation: Identity
): Promise<unknown> {
  // Regenerate a duplicate so this verifies the session-pitch writer without
  // modifying the legitimate seeded Suren session or invoking live enrichment.
  const duplicateResponse = await request.post(
    "/api/sessions/sess-001/duplicate",
    {
      data: spoofedIdentityFields(attemptedImpersonation),
    }
  );
  expect(duplicateResponse.ok()).toBeTruthy();
  const duplicate = (await duplicateResponse.json()) as { id: string };
  expect(duplicate.id).toBeTruthy();

  const response = await request.post(
    `/api/sessions/${duplicate.id}/regenerate`,
    {
      data: spoofedIdentityFields(attemptedImpersonation),
    }
  );
  expect(response.ok()).toBeTruthy();
  const result = (await response.json()) as {
    pitches: {
      pitch_email: unknown;
      pitch_5min_script: string;
      pitch_call_script: unknown;
    };
  };

  const seededResponse = await request.get("/api/sessions/sess-001");
  expect(seededResponse.ok()).toBeTruthy();
  const seeded = (await seededResponse.json()) as {
    session: {
      pitch_email: unknown;
      pitch_5min_script: string;
      pitch_call_script: unknown;
    };
  };
  expect(JSON.stringify(seeded.session)).toContain(SUREN.name);

  return result.pitches;
}

test.describe("verified signed identities", () => {
  for (const identity of IDENTITIES) {
    test(`${identity.name} drives the shell, settings, and personal greetings`, async ({
      context,
      page,
    }) => {
      const activeIdentity = identity;
      await installAppStubs(page, () => activeIdentity);
      await setIdentity(context, identity);

      // Old shared demo-profile data must never replace a verified session.
      await page.addInitScript(() => {
        localStorage.setItem(
          "freyr_profile",
          JSON.stringify({
            name: "Wrong Shared Profile",
            email: "wrong@example.com",
            title: "Wrong shared title",
            signature: "Wrong shared signature",
          })
        );
      });

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole("heading", {
          name: `Good morning, ${identity.firstName}`,
        })
      ).toBeVisible();

      const sidebar = shellSidebar(page);
      await expect(
        sidebar.getByText(identity.name, { exact: true })
      ).toBeVisible();
      await expect(
        sidebar.getByText(identity.email, { exact: true })
      ).toBeVisible();
      await expectCurrentUserAvatar(sidebar, identity);

      const accountButton = page.getByRole("button", {
        name: "Account menu",
      });
      await expect(accountButton).toContainText(identity.name);
      await expectCurrentUserAvatar(accountButton, identity);
      await accountButton.click();

      const accountMenu = page.getByRole("menu", { name: "Account menu" });
      await expect(
        accountMenu.getByText(identity.name, { exact: true })
      ).toBeVisible();
      await expect(
        accountMenu.getByText(identity.email, { exact: true })
      ).toBeVisible();
      await expectCurrentUserAvatar(accountMenu, identity);

      await page.goto("/settings?tab=profile");
      await expect(page.getByLabel("Full name")).toHaveValue(identity.name);
      // Editable by design: members rename themselves through the
      // server-verified profile API (canonical directory write). Email stays
      // identity-managed and locked.
      await expect(page.getByLabel("Full name")).toBeEditable();
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
        identity.email
      );
      await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
        "readonly",
        ""
      );
      await expect(page.getByLabel("Email signature")).toHaveValue(
        new RegExp(`^${identity.name}`)
      );
      await expect(page.getByText("Wrong Shared Profile")).toHaveCount(0);
      await expectCurrentUserAvatar(page.locator("#main-content"), identity);

      await page.goto("/agent");
      await expect(
        page.getByRole("heading", {
          name: `Hey ${identity.firstName} — what do you want to work on?`,
        })
      ).toBeVisible();

      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Open your agent" }).click();
      await expect(
        page.getByText(new RegExp(`^Hi ${identity.firstName} —`))
      ).toBeVisible();
    });
  }
});

test("canonical workspace name overrides mutable provider metadata in UI and writes", async ({
  context,
  page,
}) => {
  const activeIdentity = ANIR;
  await installAppStubs(page, () => activeIdentity);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await context.addCookies([
    {
      name: "freyr_session",
      value: sign({
        id: ANIR.subject,
        name: SUREN.name,
        email: ANIR.email,
        roles: [],
        exp,
      }),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "freyr_access_v2",
      value: accessGrant(ANIR),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/settings?tab=profile");
  await expect(page.getByLabel("Full name")).toHaveValue(ANIR.name);
  await expect(shellSidebar(page).getByText(ANIR.name, { exact: true })).toBeVisible();
  await expect(
    shellSidebar(page).getByText(SUREN.name, { exact: true })
  ).toHaveCount(0);

  const spoofedAuthor = {
    author: SUREN.name,
    enrolled_by: SUREN.name,
    logged_by: SUREN.name,
    senderName: SUREN.name,
  };

  const draft = await context.request.post("/api/agent/draft", {
    data: {
      customerId: "cust-012",
      tone: "brief",
      ...spoofedAuthor,
    },
  });
  expect(draft.ok()).toBeTruthy();
  expectAttributedCopy(
    (await draft.json() as { body: string }).body,
    ANIR,
    SUREN
  );

  const noteBody = `Canonical attribution ${Date.now()}`;
  const note = await context.request.patch("/api/customers/cust-012", {
    data: {
      addNote: {
        body: noteBody,
        kind: "note",
        author: SUREN.name,
      },
      ...spoofedAuthor,
    },
  });
  expect(note.ok()).toBeTruthy();
  const notedCustomer = (await note.json()) as {
    customer: { notes_log: { body: string; author: string }[] };
  };
  expect(
    notedCustomer.customer.notes_log.find((item) => item.body === noteBody)
  ).toMatchObject({ author: ANIR.name });

  const sequenceName = `Canonical sequence ${Date.now()}`;
  const sequenceResponse = await context.request.post("/api/sequences", {
    data: {
      name: sequenceName,
      description: "Canonical enrollment attribution",
      steps: [{ day: 0, channel: "email", label: "Introduction" }],
      ...spoofedAuthor,
    },
  });
  expect(sequenceResponse.ok()).toBeTruthy();
  const sequenceId = (await sequenceResponse.json() as {
    sequence: { id: string };
  }).sequence.id;
  const enrollment = await context.request.post(
    "/api/sequences/enrollments",
    {
      data: {
        sequenceId,
        customerIds: ["cust-012"],
        ...spoofedAuthor,
      },
    }
  );
  expect(enrollment.ok()).toBeTruthy();
  expect(await enrollment.json()).toMatchObject({ enrolled: 1 });

  const crmPush = await context.request.post("/api/sessions/sess-012/crm", {
    data: { target: "hubspot", ...spoofedAuthor },
  });
  expect(crmPush.ok()).toBeTruthy();

  const outcome = await context.request.post(
    "/api/sessions/sess-012/outcome",
    {
      data: {
        outcome: "in_progress",
        notes: `Canonical outcome ${Date.now()}`,
        ...spoofedAuthor,
      },
    }
  );
  expect(outcome.ok()).toBeTruthy();
  expect(await outcome.json()).toMatchObject({
    interaction: { logged_by: ANIR.name },
  });

  const customerResponse = await context.request.get(
    "/api/customers/cust-012"
  );
  expect(customerResponse.ok()).toBeTruthy();
  const customer = (await customerResponse.json()) as {
    interactions: { notes: string; logged_by: string }[];
  };
  const canonicalInteractions = customer.interactions.filter(
    (item) =>
      item.notes.includes(sequenceName) ||
      item.notes === "Pushed to HubSpot from the pitch workspace"
  );
  expect(canonicalInteractions).toHaveLength(2);
  for (const interaction of canonicalInteractions) {
    expect(interaction.logged_by).toBe(ANIR.name);
    expect(interaction.logged_by).not.toBe(SUREN.name);
  }
});

test.describe("verified server-side attribution", () => {
  for (const [index, identity] of IDENTITIES.entries()) {
    const attemptedImpersonation =
      identity === SUREN ? ANIR : SUREN;

    test(`${identity.name} cannot attribute new work to ${attemptedImpersonation.name}`, async ({
      context,
    }) => {
      test.setTimeout(60_000);
      await setIdentity(context, identity);
      const nonce = `${identity.firstName.toLowerCase()}-${Date.now()}-${index}`;
      const spoofed = spoofedIdentityFields(attemptedImpersonation);

      const sequenceResponse = await context.request.post("/api/sequences", {
        data: {
          name: `Identity sequence ${nonce}`,
          description: "Server attribution regression",
          steps: [{ day: 0, channel: "email", label: "Verified sender" }],
          ...spoofed,
        },
      });
      expect(sequenceResponse.ok()).toBeTruthy();
      const sequence = (await sequenceResponse.json()) as {
        sequence: { owner: string };
      };
      expect(sequence.sequence.owner).toBe(identity.name);
      expect(sequence.sequence.owner).not.toBe(attemptedImpersonation.name);

      const campaignResponse = await context.request.post("/api/campaigns", {
        data: {
          name: `Identity campaign ${nonce}`,
          offeringId: "of-001",
          recipientContactIds: [],
          ...spoofed,
        },
      });
      expect(campaignResponse.ok()).toBeTruthy();
      const campaign = (await campaignResponse.json()) as {
        campaign: { owner: string; body: string };
      };
      expect(campaign.campaign.owner).toBe(identity.name);
      expect(campaign.campaign.owner).not.toBe(
        attemptedImpersonation.name
      );
      expectAttributedCopy(
        campaign.campaign.body,
        identity,
        attemptedImpersonation
      );

      const outreachResponse = await context.request.post(
        "/api/contacts/cont-001/message",
        {
          data: {
            kind: "email",
            offeringId: "of-001",
            ...spoofed,
          },
        }
      );
      expect(outreachResponse.ok()).toBeTruthy();
      const outreach = (await outreachResponse.json()) as {
        draft: { message: string };
      };
      expectAttributedCopy(
        outreach.draft.message,
        identity,
        attemptedImpersonation
      );

      const agentDraftResponse = await context.request.post(
        "/api/agent/draft",
        {
          data: {
            customerId: "cust-001",
            tone: "brief",
            variant: 0,
            ...spoofed,
          },
        }
      );
      expect(agentDraftResponse.ok()).toBeTruthy();
      const agentDraft = (await agentDraftResponse.json()) as {
        body: string;
      };
      expectAttributedCopy(
        agentDraft.body,
        identity,
        attemptedImpersonation
      );

      const sessionPitch = await createdSessionPitch(
        context.request,
        attemptedImpersonation
      );
      expectAttributedCopy(
        sessionPitch,
        identity,
        attemptedImpersonation
      );
    });
  }
});

test("legitimate seeded Suren history remains attributed to Suren", async ({
  context,
}) => {
  await setIdentity(context, ANIR);

  const sequencesResponse = await context.request.get("/api/sequences");
  expect(sequencesResponse.ok()).toBeTruthy();
  const sequences = (await sequencesResponse.json()) as {
    sequences: { id: string; owner: string }[];
  };
  for (const id of ["reg-exec", "reengage", "post-meeting"]) {
    expect(sequences.sequences.find((sequence) => sequence.id === id)?.owner).toBe(
      SUREN.name
    );
  }

  const campaignsResponse = await context.request.get("/api/campaigns");
  expect(campaignsResponse.ok()).toBeTruthy();
  const campaigns = (await campaignsResponse.json()) as {
    campaigns: { id: string; owner: string }[];
  };
  for (const id of ["camp-seed-001", "camp-seed-002", "camp-seed-003"]) {
    expect(campaigns.campaigns.find((campaign) => campaign.id === id)?.owner).toBe(
      SUREN.name
    );
  }

  const accountResponse = await context.request.get("/api/customers/cust-001");
  expect(accountResponse.ok()).toBeTruthy();
  const account = (await accountResponse.json()) as {
    interactions: { id: string; logged_by: string }[];
  };
  expect(
    account.interactions.find((interaction) => interaction.id === "int-001")
      ?.logged_by
  ).toBe(SUREN.name);
});

test("server-private agent preferences follow the verified member across account switches", async ({
  context,
}) => {
  const nonce = Date.now().toString();
  const anirFocus = `Anir private industry ${nonce}`;
  const surenFocus = `Suren private industry ${nonce}`;

  await setIdentity(context, ANIR);
  const anirUpdate = await context.request.put("/api/agent/prefs", {
    data: {
      focus_industry: anirFocus,
      draft_tone: "formal",
      userId: SUREN.memberId,
      owner: SUREN.name,
    },
  });
  expect(anirUpdate.ok()).toBeTruthy();

  await setIdentity(context, SUREN);
  const surenBefore = (await (
    await context.request.get("/api/agent/prefs")
  ).json()) as {
    prefs: { focus_industry: string | null; draft_tone: string };
  };
  expect(surenBefore.prefs.focus_industry).not.toBe(anirFocus);
  expect(surenBefore.prefs.draft_tone).toBe("warm");

  const surenUpdate = await context.request.put("/api/agent/prefs", {
    data: {
      focus_industry: surenFocus,
      draft_tone: "brief",
      userId: AVERY.memberId,
      owner: AVERY.name,
    },
  });
  expect(surenUpdate.ok()).toBeTruthy();

  await setIdentity(context, AVERY);
  const averyPrefs = (await (
    await context.request.get("/api/agent/prefs")
  ).json()) as {
    prefs: { focus_industry: string | null; draft_tone: string };
  };
  expect(averyPrefs.prefs.focus_industry).not.toBe(anirFocus);
  expect(averyPrefs.prefs.focus_industry).not.toBe(surenFocus);
  expect(averyPrefs.prefs.draft_tone).toBe("warm");

  await setIdentity(context, ANIR);
  const anirAfter = (await (
    await context.request.get("/api/agent/prefs")
  ).json()) as {
    prefs: { focus_industry: string | null; draft_tone: string };
  };
  expect(anirAfter.prefs.focus_industry).toBe(anirFocus);
  expect(anirAfter.prefs.draft_tone).toBe("formal");

  await setIdentity(context, SUREN);
  const surenAfter = (await (
    await context.request.get("/api/agent/prefs")
  ).json()) as {
    prefs: { focus_industry: string | null; draft_tone: string };
  };
  expect(surenAfter.prefs.focus_industry).toBe(surenFocus);
  expect(surenAfter.prefs.draft_tone).toBe("brief");
});

test("profile and agent threads stay isolated when one browser switches accounts", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);

  let activeIdentity: Identity = ANIR;
  await installAppStubs(page, () => activeIdentity);
  await setIdentity(context, activeIdentity);

  const nonce = Date.now().toString().slice(-7);
  const anirTitle = `Anir private title ${nonce}`;
  const anirSignature = `Anir private signature ${nonce}`;
  const anirChat = `Anir private chat ${nonce}`;
  const anirDock = `Anir private dock ${nonce}`;
  const surenTitle = `Suren private title ${nonce}`;
  const surenSignature = `Suren private signature ${nonce}`;
  const surenChat = `Suren private chat ${nonce}`;
  const surenDock = `Suren private dock ${nonce}`;

  await page.goto("/settings?tab=profile");
  await expectSignedInChrome(page, ANIR, [SUREN, AVERY]);
  await page.getByLabel("Title").fill(anirTitle);
  await page.getByLabel("Email signature").fill(anirSignature);
  await page.getByRole("button", { name: "Save profile" }).click();

  await page.goto("/agent");
  await page.getByLabel("Message the agent").fill(anirChat);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(anirChat, { exact: true }).first()).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open your agent" }).click();
  await page.locator('input[placeholder^="Ask "]').fill(anirDock);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(anirDock, { exact: true })).toBeVisible();

  activeIdentity = SUREN;
  await setIdentity(context, activeIdentity);

  await page.goto("/settings?tab=profile");
  await expectSignedInChrome(page, SUREN, [ANIR, AVERY]);
  await expect(page.getByLabel("Full name")).toHaveValue(SUREN.name);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    SUREN.email
  );
  await expect(page.getByLabel("Title")).not.toHaveValue(anirTitle);
  await expect(page.getByLabel("Email signature")).not.toHaveValue(
    anirSignature
  );
  await page.getByLabel("Title").fill(surenTitle);
  await page.getByLabel("Email signature").fill(surenSignature);
  await page.getByRole("button", { name: "Save profile" }).click();

  await page.goto("/agent");
  await expect(page.getByText(anirChat, { exact: true })).toHaveCount(0);
  await page.getByLabel("Message the agent").fill(surenChat);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(surenChat, { exact: true }).first()).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open your agent" }).click();
  await expect(page.getByText(anirDock, { exact: true })).toHaveCount(0);
  await page.locator('input[placeholder^="Ask "]').fill(surenDock);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(surenDock, { exact: true })).toBeVisible();

  activeIdentity = AVERY;
  await setIdentity(context, activeIdentity);

  await page.goto("/settings?tab=profile");
  await expectSignedInChrome(page, AVERY, [ANIR, SUREN]);
  await expect(page.getByLabel("Full name")).toHaveValue(AVERY.name);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    AVERY.email
  );
  await expect(page.getByLabel("Title")).not.toHaveValue(anirTitle);
  await expect(page.getByLabel("Title")).not.toHaveValue(surenTitle);
  await expect(page.getByLabel("Email signature")).not.toHaveValue(
    anirSignature
  );
  await expect(page.getByLabel("Email signature")).not.toHaveValue(
    surenSignature
  );

  await page.goto("/agent");
  await expect(page.getByText(anirChat, { exact: true })).toHaveCount(0);
  await expect(page.getByText(surenChat, { exact: true })).toHaveCount(0);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open your agent" }).click();
  await expect(page.getByText(anirDock, { exact: true })).toHaveCount(0);
  await expect(page.getByText(surenDock, { exact: true })).toHaveCount(0);

  activeIdentity = ANIR;
  await setIdentity(context, activeIdentity);

  await page.goto("/settings?tab=profile");
  await expectSignedInChrome(page, ANIR, [SUREN, AVERY]);
  await expect(page.getByLabel("Full name")).toHaveValue(ANIR.name);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    ANIR.email
  );
  await expect(page.getByLabel("Title")).toHaveValue(anirTitle);
  await expect(page.getByLabel("Email signature")).toHaveValue(anirSignature);

  await page.goto("/agent");
  await expect(page.getByText(anirChat, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(surenChat, { exact: true })).toHaveCount(0);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open your agent" }).click();
  await expect(page.getByText(anirDock, { exact: true })).toBeVisible();
  await expect(page.getByText(surenDock, { exact: true })).toHaveCount(0);
});
