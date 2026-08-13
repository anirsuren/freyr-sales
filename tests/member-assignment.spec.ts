import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  focusActions,
  type AgentAction,
} from "../lib/agent";
import {
  buildRepStats,
  salesTeamFor,
  type Deal,
} from "../lib/pipeline";
import type { Customer } from "../lib/types";

const PORT = Number(process.env.ASSIGNMENT_TEST_PORT || 3014);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "freyr-assignment-test-secret-2026-long-enough";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ANIR = {
  subject: "assignment-auth-anir",
  memberId: "00000000-0000-4000-8000-000000000101",
  name: "Anir Suren",
  email: "anir.s@freyrsolutions.com",
};

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function signIn(
  context: BrowserContext,
  role: "admin" | "manager" | "rep" = "admin"
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await context.addCookies([
    {
      name: "freyr_session",
      value: sign({
        id: ANIR.subject,
        name: ANIR.name,
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
      value: sign({
        sub: ANIR.subject,
        userId: ANIR.memberId,
        email: ANIR.email,
        displayName: ANIR.name,
        role,
        workspaceId: WORKSPACE_ID,
        exp,
      }),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("live account and deal ownership use the signed member id and reject spoofed identities", async ({
  context,
}) => {
  await signIn(context);
  const company = `Stable owner ${Date.now()}`;
  const csv = [
    "company_name,website_url,industry,geography,size_tier,owner",
    `${company},https://example.com,Biotechnology,United States,mid,`,
  ].join("\n");
  const imported = await context.request.post("/api/import/crm", {
    multipart: {
      file: {
        name: "stable-owner.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      },
    },
  });
  expect(imported.ok()).toBeTruthy();

  const customers = (await (
    await context.request.get("/api/customers")
  ).json()) as {
    customers: {
      id: string;
      company_name: string;
      owner: string | null;
      owner_user_id: string | null;
      account_deals?: { name: string; owner: string; owner_user_id: string }[];
    }[];
  };
  const customer = customers.customers.find(
    (item) => item.company_name === company
  );
  expect(customer).toBeTruthy();

  const spoofed = await context.request.patch(
    `/api/customers/${customer!.id}`,
    {
      data: {
        owner: "Walter Hensley",
        owner_user_id: "00000000-0000-4000-8000-000000000202",
      },
    }
  );
  expect(spoofed.ok()).toBeFalsy();

  const assigned = await context.request.patch(
    `/api/customers/${customer!.id}`,
    {
      data: {
        owner: ANIR.name,
        owner_user_id: ANIR.memberId,
      },
    }
  );
  expect(assigned.ok()).toBeTruthy();
  const assignedCustomer = (await assigned.json()).customer;
  expect(assignedCustomer).toMatchObject({
    owner: ANIR.name,
    owner_user_id: ANIR.memberId,
    workspace_id: WORKSPACE_ID,
  });

  const spoofedDeal = await context.request.patch(
    `/api/customers/${customer!.id}`,
    {
      data: {
        addDeal: {
          name: "Spoofed deal",
          owner: "Walter Hensley",
          owner_user_id: "00000000-0000-4000-8000-000000000202",
        },
      },
    }
  );
  expect(spoofedDeal.ok()).toBeFalsy();

  const ownDeal = await context.request.patch(
    `/api/customers/${customer!.id}`,
    {
      data: {
        addDeal: {
          name: "Verified deal",
          owner: ANIR.name,
          owner_user_id: ANIR.memberId,
        },
      },
    }
  );
  expect(ownDeal.ok()).toBeTruthy();
  expect((await ownDeal.json()).customer.account_deals[0]).toMatchObject({
    name: "Verified deal",
    owner: ANIR.name,
    owner_user_id: ANIR.memberId,
  });

  const cleared = await context.request.patch(
    `/api/customers/${customer!.id}`,
    { data: { owner: "", owner_user_id: "" } }
  );
  expect(cleared.ok()).toBeTruthy();
  expect((await cleared.json()).customer).toMatchObject({
    owner: null,
    owner_user_id: null,
  });

  await signIn(context, "rep");
  const salesReassignment = await context.request.patch(
    `/api/customers/${customer!.id}`,
    {
      data: {
        owner: "Walter Hensley",
        owner_user_id: "00000000-0000-4000-8000-000000000202",
      },
    }
  );
  expect(salesReassignment.status()).toBe(403);
  expect(await salesReassignment.json()).toMatchObject({
    error: "Sales users can assign ownership only to themselves.",
  });
});

test("My accounts does not merge two teammates who share a display name", () => {
  const sharedName = "Alex Smith";
  const customers = [
    {
      id: "customer-alex-one",
      company_name: "Alex One Account",
      owner: sharedName,
      owner_user_id: "member-alex-one",
    },
    {
      id: "customer-alex-two",
      company_name: "Alex Two Account",
      owner: sharedName,
      owner_user_id: "member-alex-two",
    },
  ] as Customer[];
  const actions = customers.map(
    (customer, index): AgentAction => ({
      id: `action-${index}`,
      kind: "followup",
      title: customer.company_name,
      rationale: "Test ownership",
      href: `/customers/${customer.id}`,
      cta: "Open",
      customerId: customer.id,
    })
  );

  const result = focusActions(
    actions,
    customers,
    { only_mine: true },
    sharedName,
    "member-alex-one"
  );
  expect(result.actions.map((action) => action.customerId)).toEqual([
    "customer-alex-one",
  ]);
  expect(result.hidden).toBe(1);
});

test("signed Suren does not inherit seeded name-only analytics", () => {
  const signedSuren = {
    id: "auth-suren",
    memberId: "member-suren",
    name: "Walter Hensley",
  };
  const legacyDeal: Deal = {
    sessionId: "seed-session",
    customerId: "seed-customer",
    contactId: "seed-contact",
    company: "Seeded Demo Account",
    sizeTier: "mid",
    contactName: "Demo Contact",
    title: "VP Regulatory",
    service: "Regulatory Intelligence",
    value: 250_000,
    stage: "Qualified",
    lastActivity: "2026-07-20T12:00:00.000Z",
    staleDays: 4,
    owner: "Walter Hensley",
    ownerUserId: null,
    createdAt: "2026-07-01T12:00:00.000Z",
  };

  const roster = salesTeamFor(signedSuren);
  const stats = buildRepStats([legacyDeal], { roster });
  const current = stats.find((rep) => rep.memberId === signedSuren.memberId);
  const seeded = stats.find(
    (rep) => rep.source === "demo" && rep.name === signedSuren.name
  );

  expect(current).toMatchObject({
    name: "Walter Hensley",
    memberId: "member-suren",
    deals: 0,
    openValue: 0,
  });
  expect(seeded).toMatchObject({
    name: "Walter Hensley",
    memberId: null,
    deals: 1,
    openValue: 250_000,
  });
  expect(current?.key).not.toBe(seeded?.key);
  expect(current?.slug).not.toBe(seeded?.slug);
  expect(new Set(roster.map((rep) => rep.key)).size).toBe(roster.length);
  expect(new Set(roster.map((rep) => rep.slug)).size).toBe(roster.length);
});
