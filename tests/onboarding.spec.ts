import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { TOUR_VERSION } from "../lib/onboarding";
import {
  ADMIN_TOUR_STEPS,
  FULL_TOUR_LAST_STEP,
  FULL_TOUR_STEP_COUNT,
  PRODUCT_TOUR_STEPS,
  getProductTourSteps,
} from "../lib/productTourCatalog";

const PORT = Number(process.env.ONBOARDING_TEST_PORT || 3022);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "freyr-onboarding-test-secret-2026-long-enough";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const LAST_STEP = FULL_TOUR_LAST_STEP;
const TOTAL_STEPS = FULL_TOUR_STEP_COUNT;

function adminTourStepIndex(id: string): number {
  const index = ADMIN_TOUR_STEPS.findIndex((step) => step.id === id);
  if (index < 0) throw new Error(`Missing product-tour step: ${id}`);
  return index;
}

function catalogStepIndex(id: string): number {
  const step = PRODUCT_TOUR_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Missing product-tour catalog step: ${id}`);
  return step.catalogIndex;
}

const TO_AGENT_UI_STEP = adminTourStepIndex("to-agent");
const AGENT_UI_STEP = adminTourStepIndex("agent-workspace");
const TO_OFFERINGS_UI_STEP = adminTourStepIndex("to-offerings");
const OFFERINGS_UI_STEP = adminTourStepIndex("offerings-browser");
const AGENT_CATALOG_STEP = catalogStepIndex("agent-workspace");
const OFFERINGS_CATALOG_STEP = catalogStepIndex("offerings-browser");

function adminTourRoute(step: number): string {
  const route = ADMIN_TOUR_STEPS[step]?.route;
  if (!route) throw new Error(`Missing product-tour route for step ${step}`);
  return route.split("?")[0];
}

function catalogTourRoute(step: number): string {
  const route = PRODUCT_TOUR_STEPS[step]?.route;
  if (!route) throw new Error(`Missing catalog route for step ${step}`);
  return route.split("?")[0];
}

async function expectTourRoute(page: Page, step: number) {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(adminTourRoute(step));
}

type TourStatus = "not_started" | "in_progress" | "completed" | "skipped";
type TourRole = "sales" | "editor" | "admin";
type TourState = {
  version: number;
  status: TourStatus;
  currentStep: number;
  completedAt?: string;
  skippedAt?: string;
};
type TourAction = {
  action?: "progress" | "complete" | "skip" | "reset";
  currentStep?: number;
};

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function appSession(subject: string): string {
  return sign({
    id: subject,
    name: "Onboarding Test User",
    email: `${subject}@freyrsolutions.com`,
    roles: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function accessGrant(subject: string, grantSubject = subject): string {
  return sign({
    sub: grantSubject,
    userId: `app-${subject}`,
    email: `${subject}@freyrsolutions.com`,
    displayName: "Onboarding Test User",
    role: "admin",
    workspaceId: WORKSPACE_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

async function setAuthCookies(
  context: BrowserContext,
  subject = "onboarding-user",
  grantSubject = subject
) {
  await context.addCookies([
    {
      name: "freyr_session",
      value: appSession(subject),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "freyr_access_v2",
      value: accessGrant(subject, grantSubject),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function installOnboardingMock(
  page: Page,
  initial: Partial<TourState> = {},
  role: TourRole = "admin",
  options: { getFailures?: number } = {}
) {
  let state: TourState = {
    version: TOUR_VERSION,
    status: "not_started",
    currentStep: 0,
    ...initial,
  };
  const actions: TourAction[] = [];
  let remainingGetFailures = Math.max(0, options.getFailures || 0);

  // The real refresh route needs the access-control database. Keep this UI
  // suite deterministic while preserving middleware validation via the signed
  // cookies installed above.
  await page.route("**/api/auth/access", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, role }),
    });
  });

  await page.route("**/api/onboarding", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      if (remainingGetFailures > 0) {
        remainingGetFailures -= 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "Cache-Control": "no-store" },
          body: JSON.stringify({ error: "Onboarding is warming up." }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({ state, role }),
      });
      return;
    }
    if (method !== "PATCH") {
      await route.fulfill({ status: 405, body: "" });
      return;
    }

    const body = (route.request().postDataJSON() || {}) as TourAction;
    actions.push(body);
    const now = new Date().toISOString();
    const requestedStep = Number.isInteger(body.currentStep)
      ? Math.max(0, Math.min(LAST_STEP, Number(body.currentStep)))
      : state.currentStep;
    if (body.action === "progress") {
      state = {
        ...state,
        status: "in_progress",
        currentStep: requestedStep,
      };
    } else if (body.action === "complete") {
      state = {
        ...state,
        status: "completed",
        currentStep: requestedStep,
        completedAt: now,
        skippedAt: undefined,
      };
    } else if (body.action === "skip") {
      state = {
        ...state,
        status: "skipped",
        currentStep: requestedStep,
        skippedAt: now,
        completedAt: undefined,
      };
    } else if (body.action === "reset") {
      state = {
        version: TOUR_VERSION,
        status: "not_started",
        currentStep: 0,
      };
    } else {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unsupported onboarding action." }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ state, role }),
    });
  });

  return {
    actions,
    state: () => state,
  };
}

test("first use recovers from a transient post-login onboarding load", async ({
  context,
  page,
}) => {
  await setAuthCookies(context, "transient-load-user");
  const mock = await installOnboardingMock(
    page,
    {},
    "admin",
    { getFailures: 1 }
  );

  await page.goto("/customers");
  await expectTourRoute(page, 0);
  await expect(page.getByTestId("product-tour-dialog")).toBeVisible();
  await expect(page.getByTestId("product-tour-provider-state")).toHaveAttribute(
    "data-load-failures",
    "0"
  );
  await expect
    .poll(() =>
      mock.actions.some(
        (action) => action.action === "progress" && action.currentStep === 0
      )
    )
    .toBeTruthy();
});

test("first use launches an accessible tour and preserves progress across routes", async ({
  context,
  page,
}) => {
  await setAuthCookies(context);
  const mock = await installOnboardingMock(page);

  // First-use onboarding must launch even when a post-login deep link does not
  // already point at the tour's first page.
  await page.goto("/customers");
  await expectTourRoute(page, 0);

  const dialog = page.getByTestId("product-tour-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toBeFocused();
  await expect(page.getByTestId("product-tour-spotlight")).toBeVisible();
  const progress = page.getByTestId("product-tour-progress");
  await expect(progress).toHaveAttribute("role", "progressbar");
  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", String(TOTAL_STEPS));
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toContainText(`Step 1 of ${TOTAL_STEPS}`);

  await page.getByTestId("product-tour-next").click();
  await expectTourRoute(page, 1);
  await expect(dialog).toContainText("Start with a real prospect");

  await page.getByTestId("product-tour-next").click();
  await expectTourRoute(page, TO_AGENT_UI_STEP);
  await expect(dialog).toHaveAttribute("data-step-kind", "navigation");
  await expect(dialog).toContainText("Open Agent");
  await expect(page.getByTestId("product-tour-next")).toContainText(
    "Open Agent"
  );
  await expect(new URL(page.url()).pathname).toBe("/dashboard");

  await page.getByTestId("product-tour-next").click();
  await expectTourRoute(page, AGENT_UI_STEP);
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("product-tour-spotlight")).toBeVisible();
  await expect(progress).toHaveAttribute(
    "aria-valuenow",
    String(AGENT_UI_STEP + 1)
  );
  await expect(dialog).toContainText("Work alongside your sales agent");

  await page.getByTestId("product-tour-next").click();
  await expectTourRoute(page, TO_OFFERINGS_UI_STEP);
  await expect(dialog).toHaveAttribute("data-step-kind", "navigation");
  await expect(page.getByTestId("product-tour-next")).toContainText(
    "Open Offerings"
  );

  await page.getByTestId("product-tour-next").click();
  await expectTourRoute(page, OFFERINGS_UI_STEP);
  await expect(dialog).toBeVisible();
  await expect(progress).toHaveAttribute(
    "aria-valuenow",
    String(OFFERINGS_UI_STEP + 1)
  );

  await page.getByTestId("product-tour-back").click();
  await expectTourRoute(page, TO_OFFERINGS_UI_STEP);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-step-kind", "navigation");

  await expect
    .poll(() =>
      mock.actions.some(
        (action) =>
          action.action === "progress" &&
          action.currentStep === AGENT_CATALOG_STEP
      )
    )
    .toBeTruthy();
});

test("offerings-only filtering keeps a focused five-step path", () => {
  const offeringsOnlySteps = getProductTourSteps({
    offeringsOnly: true,
    role: "admin",
  });

  expect(offeringsOnlySteps.map((step) => step.id)).toEqual([
    "dashboard-tools",
    "offerings-browser",
    "to-settings",
    "settings-mock-mode",
    "settings-replay",
  ]);
  expect(offeringsOnlySteps[0]).toMatchObject({ route: "/offerings" });
  expect(offeringsOnlySteps[2]).toMatchObject({
    route: "/offerings",
    kind: "navigation",
    nextLabel: "Open Settings",
  });
  expect(offeringsOnlySteps[3].route).toBe("/settings?tab=workspace");
});

test("a canonical saved navigation step resumes and opens the right page", async ({
  context,
  page,
}) => {
  const role: TourRole = "sales";
  const savedCatalogStep = catalogStepIndex("to-analytics");
  const nextCatalogStep = catalogStepIndex("analytics-growth");
  const roleSteps = getProductTourSteps({ offeringsOnly: false, role });
  const savedUiStep = roleSteps.findIndex(
    (step) => step.id === PRODUCT_TOUR_STEPS[savedCatalogStep].id
  );
  expect(savedUiStep).toBeGreaterThanOrEqual(0);

  await setAuthCookies(context, "role-filter-user");
  const mock = await installOnboardingMock(
    page,
    {
      status: "in_progress",
      currentStep: savedCatalogStep,
    },
    role
  );
  await page.setViewportSize({ width: 1512, height: 861 });

  await page.goto(catalogTourRoute(savedCatalogStep));
  const dialog = page.getByTestId("product-tour-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: PRODUCT_TOUR_STEPS[savedCatalogStep].title,
      exact: true,
    })
  ).toBeVisible();
  const progress = page.getByTestId("product-tour-progress");
  await expect(progress).toHaveAttribute(
    "aria-valuemax",
    String(roleSteps.length)
  );
  await expect(progress).toHaveAttribute(
    "aria-valuenow",
    String(savedUiStep + 1)
  );
  await expect(dialog).toHaveAttribute("data-step-kind", "navigation");
  await expect(page.getByTestId("product-tour-next")).toContainText(
    "Open Analytics"
  );

  await page.getByTestId("product-tour-next").click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(catalogTourRoute(nextCatalogStep));
  await expect(dialog).toContainText("See how pipeline is growing");
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect
    .poll(async () => {
      const dialogBox = await dialog.boundingBox();
      if (!dialogBox) return Number.POSITIVE_INFINITY;
      if (dialogBox.y < 0) return Number.POSITIVE_INFINITY;
      return dialogBox.y + dialogBox.height;
    })
    .toBeLessThanOrEqual(viewport!.height + 1);
  await expect(page.getByTestId("product-tour-next")).toBeInViewport();
  await expect
    .poll(() =>
      mock.actions.some(
        (action) =>
          action.action === "progress" &&
          action.currentStep === nextCatalogStep
      )
    )
    .toBeTruthy();
});

test("skip is saved, and Settings provides the replay path", async ({
  context,
  page,
}) => {
  await setAuthCookies(context, "skip-user");
  const mock = await installOnboardingMock(page, {
    status: "in_progress",
    currentStep: OFFERINGS_CATALOG_STEP,
  });

  await page.goto(adminTourRoute(OFFERINGS_UI_STEP));
  const dialog = page.getByTestId("product-tour-dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Skip tour", exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.state().status).toBe("skipped");

  await page.goto("/settings?tab=workspace");
  await expect(
    page.getByRole("button", { name: "Open guided product tour", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open guided product tour", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("button", { name: "Take tour again", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Take tour again", exact: true })
    .click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("product-tour-progress")).toContainText("1");
  await expect
    .poll(() => mock.actions.some((action) => action.action === "reset"))
    .toBeTruthy();
});

test("Analytics gets two focused steps and Mock mode is included", async ({
  context,
  page,
}) => {
  await setAuthCookies(context, "focused-features-user");
  const mock = await installOnboardingMock(page, {
    status: "in_progress",
    currentStep: catalogStepIndex("analytics-growth"),
  });

  await page.goto("/analytics");
  const dialog = page.getByTestId("product-tour-dialog");
  await expect(dialog).toContainText("See how pipeline is growing");
  await expect(
    page.locator('[data-tour="analytics-pipeline-growth"]')
  ).toBeVisible();

  await page.getByTestId("product-tour-next").click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(dialog).toContainText("See where pipeline sits");
  await expect(
    page.locator('[data-tour="analytics-pipeline-stages"]')
  ).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await installOnboardingMock(page, {
    status: "in_progress",
    currentStep: catalogStepIndex("settings-mock-mode"),
  });
  await page.reload();
  await expect(page).toHaveURL(/\/settings\?tab=workspace$/);
  await expect(dialog).toContainText("Learn safely in Mock mode");
  await expect(page.locator('[data-tour="settings-data-mode"]')).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "Switch between real mode and mock mode",
    })
  ).toBeVisible();

  await page.getByTestId("product-tour-next").click();
  await expect(dialog).toContainText("Revisit this tour anytime");
  await expect(
    page.locator('[data-tour="settings-product-tour"]')
  ).toBeVisible();
  await expect(page.getByTestId("product-tour-next")).toContainText(
    "Finish tour"
  );

  await dialog
    .getByRole("button", { name: "Skip tour", exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Product tour", { exact: true })).toHaveCount(0);
  await page.locator('[data-tour="account-menu"]').click();
  await expect(page.getByRole("menu")).not.toContainText("Product tour");
  await expect
    .poll(() =>
      mock.actions.some(
        (action) =>
          action.action === "progress" &&
          action.currentStep === catalogStepIndex("analytics-stage")
      )
    )
    .toBeTruthy();
});

test("the final step completes once and a completed tour remains replayable", async ({
  context,
  page,
}) => {
  await setAuthCookies(context, "complete-user");
  const mock = await installOnboardingMock(page, {
    status: "in_progress",
    currentStep: LAST_STEP,
  });

  await page.goto(adminTourRoute(LAST_STEP));
  const dialog = page.getByTestId("product-tour-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish tour", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish tour", exact: true })
    .click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.state().status).toBe("completed");
  expect(
    mock.actions.filter((action) => action.action === "complete")
  ).toHaveLength(1);

  await page.goto("/dashboard");
  await expect(dialog).toBeHidden();
  await page.goto("/onboarding");
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take tour again", exact: true })
  ).toBeVisible();
});

test("onboarding APIs reject missing approval and cross-user grants", async ({
  browser,
  request,
}) => {
  const unauthenticatedGet = await request.get("/api/onboarding");
  expect(unauthenticatedGet.status()).toBe(401);
  const unauthenticatedPatch = await request.patch("/api/onboarding", {
    data: { action: "skip" },
  });
  expect(unauthenticatedPatch.status()).toBe(401);

  const identityOnly = await browser.newContext();
  await identityOnly.addCookies([
    {
      name: "freyr_session",
      value: appSession("identity-only"),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  expect(
    (await identityOnly.request.get("/api/onboarding")).status()
  ).toBe(403);
  await identityOnly.close();

  const crossed = await browser.newContext();
  await setAuthCookies(crossed, "inside-user", "outside-user");
  expect((await crossed.request.get("/api/onboarding")).status()).toBe(403);
  expect(
    (
      await crossed.request.patch("/api/onboarding", {
        data: { action: "progress", currentStep: 1 },
      })
    ).status()
  ).toBe(403);
  await crossed.close();
});
