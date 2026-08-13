import type { WorkspaceRole } from "./accessControl";

export type ProductTourPlacement = "auto" | "bottom" | "left" | "right" | "top";
export type ProductTourStepKind = "feature" | "navigation" | "mode";

export type ProductTourStep = {
  /** Stable, zero-based index persisted by the onboarding API. */
  catalogIndex: number;
  id: string;
  route: string;
  kind: ProductTourStepKind;
  eyebrow: string;
  title: string;
  description: string;
  targets: readonly string[];
  /** What this screen is called, for the "Open X" label on the previous step. */
  pageName: string;
  nextLabel?: string;
  placement?: ProductTourPlacement;
  roles?: readonly WorkspaceRole[];
  availableInOfferingsOnly?: boolean;
  offeringsOnlyRoute?: string;
};

type ProductTourStepDefinition = Omit<ProductTourStep, "catalogIndex">;

const ALL_ROLES: readonly WorkspaceRole[] = ["sales", "editor", "admin"];
/** FDL Components, Customers, Reports, Performance and Market Intel are a
 *  manager-and-admin job (lib/moduleAccess). A rep must never be walked to a
 *  page they cannot open. */
const MANAGERS: readonly WorkspaceRole[] = ["editor", "admin"];

/**
 * Primary target first, then the page's own header, then the whole page. The
 * header is a real, meaningful frame — the title, the one-line explanation and
 * the page's main action — so a step never falls back to outlining the entire
 * screen unless the page genuinely has not rendered.
 */
function pageTargets(primary: readonly string[] = []): readonly string[] {
  return [
    ...primary,
    '[data-tour="page-header"]',
    '[data-tour="page-content"]',
    "#main-content",
  ];
}

/**
 * THE TOUR WALKS THE APP THAT EXISTS (Anir, Aug 13: "your entire guided
 * walkthrough is wrong… this is not showing anything… why is it only five
 * steps, bro?").
 *
 * Two things were wrong, and they had the same cause: the tour was written for
 * an older app. It walked people through Pipeline, Forecast, Contacts,
 * Sessions, Sequences, Campaigns, Voice, Tasks and Analytics — none of which
 * are released — and only five of its steps survived the release filter. It
 * also never mentioned FDL Components, Customers, Reports, Performance or
 * Market Intel, which are the modules people actually open. One step targeted
 * an element (`create-new`) that does not exist anywhere in the app, so its
 * highlight fell back to outlining the whole screen.
 *
 * It now has one step per real screen, in the order you meet them, and no
 * filler: the old catalogue alternated "Open Team" cards with "Team" cards,
 * which doubled the length and said everything twice. Moving to the next screen
 * is what the Next button already does — so Next simply says where it goes.
 *
 * SETTINGS IS NOT IN THE SIDEBAR (Anir: "why are you saying 'open settings'?
 * The settings are up top in the top right"). It never was — it lives in the
 * account menu — so the old "Open Settings" step highlighted the sidebar and
 * pointed at nothing. The account menu is now its own step, taught up front
 * where you first look, and the Settings steps simply follow.
 *
 * Copy rule for every step below: one plain sentence a salesperson would say
 * out loud. No "leverage", no "workflow", no narrating what the reader can see.
 */
const PRODUCT_TOUR_STEP_DEFINITIONS: readonly ProductTourStepDefinition[] = [
  {
    id: "top-search",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    kind: "feature",
    pageName: "the app",
    eyebrow: "Top bar",
    title: "Search from anywhere",
    description:
      "Type a company, a person, or the name of a page. Press Enter and the assistant answers instead.",
    targets: [
      '[data-tour="global-search"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "account-menu",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    kind: "feature",
    pageName: "your account",
    eyebrow: "Top right",
    title: "Your account lives here",
    description:
      "Settings, light or dark, switching to another account, and signing out. This is where Settings is — not the sidebar.",
    targets: ['[data-tour="account-menu"]', '[data-tour="topbar"]'],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "notifications-bell",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    kind: "feature",
    pageName: "notifications",
    eyebrow: "Top bar",
    title: "Anything waiting on you",
    description:
      "Right now that means two things: finish this walkthrough, and set up Touch ID so you can sign in with your fingerprint.",
    targets: ['[data-tour="notifications"]', '[data-tour="topbar"]'],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "sidebar-modules",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    kind: "navigation",
    pageName: "the menu",
    eyebrow: "Left side",
    title: "Everything you can open",
    description:
      "The whole app is in this list, and it only shows what your account is allowed to open.",
    targets: ['[data-tour="sidebar"]', "#main-content"],
    placement: "right",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "offerings-browser",
    route: "/offerings",
    kind: "feature",
    pageName: "Offerings",
    eyebrow: "Offerings",
    title: "Everything Freyr sells",
    description:
      "The approved catalogue. Search it, narrow it by category or customer type, and open one to read the pitch and download the sales material.",
    targets: pageTargets([
      'input[aria-label="Search offerings"]',
      'input[placeholder="Search offerings…"]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "agent-workspace",
    route: "/agent",
    kind: "feature",
    pageName: "the assistant",
    eyebrow: "Assistant",
    title: "Ask instead of hunting",
    description:
      "It has read the catalogue and the material uploaded to it. Ask what fits a customer, or what an offering actually does.",
    targets: pageTargets([
      'textarea[placeholder^="Ask about an offering"]',
      '[data-tour="agent-workspace"]',
    ]),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "components-browser",
    route: "/components",
    kind: "feature",
    pageName: "FDL Components",
    eyebrow: "FDL Components",
    title: "The parts offerings are built from",
    description:
      "Each component has its own versions and features. An offering is a bundle of these, so this is where you check what a customer is actually running.",
    targets: pageTargets(['input[placeholder^="Search components"]']),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "customers-browser",
    route: "/customers",
    kind: "feature",
    pageName: "Customers",
    eyebrow: "Customers",
    title: "Every account in one place",
    description:
      "Open an account to see its people, the offerings it already runs, and what happened the last time anyone spoke to them.",
    targets: pageTargets([
      'input[placeholder="Search customers…"]',
      'input[placeholder="Search customers..."]',
    ]),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "team-roster",
    route: "/team",
    kind: "feature",
    pageName: "Team",
    eyebrow: "Team",
    title: "Who else is in here",
    description:
      "Everyone with an account, what they are allowed to do, and how to reach them. Message anyone on Teams straight from their row.",
    targets: pageTargets(['input[placeholder="Search the floor…"]']),
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "reports-revenue",
    route: "/reports",
    kind: "feature",
    pageName: "Reports",
    eyebrow: "Reports",
    title: "What each offering earns",
    description:
      "Revenue by offering and contract type, when things come up for renewal, and the accounts sitting behind every number.",
    targets: pageTargets(),
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "performance-goals",
    route: "/performance",
    kind: "feature",
    pageName: "Performance",
    eyebrow: "Performance",
    title: "Goals and how they are tracking",
    description:
      "The goals the company set, who owns each one, and the numbers against them. Empty until targets are filled in — nothing here is guessed.",
    targets: pageTargets(['input[placeholder^="Search goals"]']),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "market-intel",
    route: "/market-intel",
    kind: "feature",
    pageName: "Market Intel",
    eyebrow: "Market Intel",
    title: "What competitors are up to",
    description:
      "Companies you track, what they post, and what gets written about them. Sample data for now, and every page says so.",
    targets: pageTargets(['input[placeholder^="Search customers or people"]']),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-mock-mode",
    route: "/settings?tab=workspace",
    kind: "mode",
    pageName: "Settings",
    eyebrow: "Settings",
    title: "Finished, or still being built",
    description:
      "The app ships in stages. This switch shows you the parts still under construction, with sample data, so you can look without touching anything real.",
    targets: pageTargets([
      '[data-tour="settings-data-mode"]',
      'div[aria-label="Workspace data mode"]',
      'button[role="switch"][aria-label="Switch between real mode and mock mode"]',
    ]),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-replay",
    route: "/settings?tab=workspace",
    kind: "feature",
    pageName: "Settings",
    eyebrow: "Settings",
    title: "Run this again whenever",
    description:
      "The walkthrough lives here. Nothing to remember — come back and start it again any time.",
    targets: pageTargets([
      '[data-tour="settings-product-tour"]',
      'a[href="/onboarding"]',
    ]),
    nextLabel: "Finish tour",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },

  /* ------------------------------------------------------------------ *
   * Below: modules that only exist in the in-progress (mock) workspace.
   * They are filtered out of the live tour, and rejoin it automatically
   * the day each module ships.
   * ------------------------------------------------------------------ */
  {
    id: "pipeline-board",
    route: "/pipeline",
    kind: "feature",
    pageName: "Pipeline",
    eyebrow: "Pipeline",
    title: "Every open deal, by stage",
    description:
      "Where each deal has got to, what it is worth, and which ones have gone quiet.",
    targets: pageTargets([
      '[data-tour="pipeline-board"]',
      'input[placeholder="Search deals…"]',
    ]),
    roles: ALL_ROLES,
  },
  {
    id: "forecast-summary",
    route: "/forecast",
    kind: "feature",
    pageName: "Forecast",
    eyebrow: "Forecast",
    title: "What is likely to land",
    description:
      "Best case, what you are committing to, and progress against quota — early enough to still do something about it.",
    targets: pageTargets(['[data-tour="forecast-summary"]']),
    roles: ALL_ROLES,
  },
  {
    id: "contacts-browser",
    route: "/contacts",
    kind: "feature",
    pageName: "Contacts",
    eyebrow: "Contacts",
    title: "The people you sell to",
    description:
      "Search by person or company, and open anyone for their history and the next thing to send them.",
    targets: pageTargets([
      'input[placeholder="Search contacts…"]',
      'input[placeholder="Search contacts..."]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
  },
  {
    id: "sessions-browser",
    route: "/sessions",
    kind: "feature",
    pageName: "Sessions",
    eyebrow: "Sessions",
    title: "Every pitch you have run",
    description:
      "Reopen the research, the offering match and the pitch itself, exactly as they were.",
    targets: pageTargets([
      'input[placeholder="Search sessions…"]',
      'input[placeholder="Search sessions..."]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
  },
  {
    id: "sequences-timeline",
    route: "/sequences",
    kind: "feature",
    pageName: "Sequences",
    eyebrow: "Sequences",
    title: "Follow-up that does not get forgotten",
    description:
      "A fixed run of emails and calls. Drafts wait for you to read them before anything is sent.",
    targets: pageTargets(['[data-tour="sequences-timeline"]']),
    roles: ALL_ROLES,
  },
  {
    id: "campaigns-workflow",
    route: "/campaigns",
    kind: "feature",
    pageName: "Campaigns",
    eyebrow: "Campaigns",
    title: "One message, many accounts",
    description:
      "Pick an offering and an audience, write it once, read it back, and only then send.",
    targets: pageTargets(['[data-tour="campaigns-overview"]']),
    roles: ALL_ROLES,
  },
  {
    id: "voice-overview",
    route: "/voice",
    kind: "feature",
    pageName: "Voice agents",
    eyebrow: "Voice agents",
    title: "Calls made for you",
    description:
      "Who was called, what was said, and what came of it — kept on the customer's record.",
    targets: pageTargets(['[data-tour="voice-lifecycle"]']),
    roles: ALL_ROLES,
  },
  {
    id: "tasks-queue",
    route: "/tasks",
    kind: "feature",
    pageName: "To-do",
    eyebrow: "To-do",
    title: "The next thing to do",
    description:
      "One queue for approvals, follow-ups and anything overdue, most urgent at the top.",
    targets: pageTargets([
      '[data-tour="tasks-work-queue"]',
      'input[aria-label="Search tasks"]',
    ]),
    roles: ALL_ROLES,
  },
  {
    id: "analytics-growth",
    route: "/analytics",
    kind: "feature",
    pageName: "Analytics",
    eyebrow: "Analytics",
    title: "How the whole funnel is doing",
    description:
      "Pipeline over time and where it is stuck. Hover anything to see the accounts behind the number.",
    targets: pageTargets(['[data-tour="analytics-pipeline-growth"]']),
    roles: ALL_ROLES,
  },
  {
    id: "activity-feed",
    route: "/activity",
    kind: "feature",
    pageName: "Activity",
    eyebrow: "Activity",
    title: "Everything that happened",
    description:
      "Every touch, in order, with who did it and what came next.",
    targets: pageTargets(['[data-tour="activity-feed"]']),
    roles: ALL_ROLES,
  },
];

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] =
  PRODUCT_TOUR_STEP_DEFINITIONS.map((step, catalogIndex) => ({
    ...step,
    catalogIndex,
  }));

export const ADMIN_TOUR_STEPS = PRODUCT_TOUR_STEPS.filter(
  (step) => !step.roles || step.roles.includes("admin")
);

export const FULL_TOUR_STEP_COUNT = ADMIN_TOUR_STEPS.length;
export const FULL_TOUR_LAST_STEP = FULL_TOUR_STEP_COUNT - 1;

/**
 * Persisted progress is a canonical catalog index. When a role or release
 * filter removes that exact step, resume at the closest available feature.
 */
export function localTourIndexForCatalogStep(
  steps: readonly ProductTourStep[],
  catalogIndex: number
): number {
  if (steps.length === 0) return 0;
  const exact = steps.findIndex((step) => step.catalogIndex === catalogIndex);
  if (exact >= 0) return exact;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const distance = Math.abs(step.catalogIndex - catalogIndex);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function getProductTourSteps({
  offeringsOnly,
  role,
}: {
  offeringsOnly: boolean;
  role: WorkspaceRole | null | undefined;
}): ProductTourStep[] {
  const filtered = PRODUCT_TOUR_STEPS.filter((step) => {
    if (offeringsOnly && !step.availableInOfferingsOnly) return false;
    if (role && step.roles && !step.roles.includes(role)) return false;
    return true;
  }).map((step) => ({
    ...step,
    route:
      offeringsOnly && step.offeringsOnlyRoute
        ? step.offeringsOnlyRoute
        : step.route,
  }));

  /**
   * "Next" names where it goes — computed AFTER filtering, so it can never
   * promise a screen this person's role or release does not have. A step that
   * stays on the same screen keeps the plain "Next"; only a real move earns
   * "Open Reports".
   */
  return filtered.map((step, index) => {
    if (step.nextLabel) return step;
    const next = filtered[index + 1];
    if (!next || next.route === step.route) return step;
    return { ...step, nextLabel: `Open ${next.pageName}` };
  });
}
