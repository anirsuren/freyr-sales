import { normalizeWorkspaceRole, type WorkspaceRole } from "./accessControl";
import { canAccessModule } from "./moduleAccess";

export type ProductTourPlacement = "auto" | "bottom" | "left" | "right" | "top";
/**
 * feature: a highlight on the page. navigation: the sidebar. mode: the Real /
 * Mock switch. showcase: no highlight, a large centred card with its own
 * visual (the WhatsApp agent).
 */
export type ProductTourStepKind = "feature" | "navigation" | "mode" | "showcase";

/**
 * THE TOUR IN CHAPTERS (Anir, Oct 1: "go through all the steps. Make sure
 * you're not forgetting anything"). A long tour reads as a list; chapters give
 * it a shape, and the progress bar is drawn per chapter so a person can see
 * where they are and jump ahead.
 */
export const TOUR_CHAPTERS = [
  "Getting around",
  "Your agent",
  "Knowledge",
  "Selling",
  "Performance",
  "Your team",
  "Settings",
] as const;
export type TourChapter = (typeof TOUR_CHAPTERS)[number];

/** Workspace features a step can depend on, answered at tour start. */
export type TourFeatures = {
  /** The workspace has a WhatsApp number people can connect to. */
  whatsapp?: boolean;
};

export type ProductTourStep = {
  /** Stable, zero-based index persisted by the onboarding API. */
  catalogIndex: number;
  id: string;
  route: string;
  kind: ProductTourStepKind;
  chapter: TourChapter;
  eyebrow: string;
  title: string;
  description: string;
  /** The same screen does a different job for some roles; say that job. */
  roleDescriptions?: Partial<Record<WorkspaceRole, string>>;
  targets: readonly string[];
  /** What this screen is called, for the "Open X" label on the previous step. */
  pageName: string;
  nextLabel?: string;
  placement?: ProductTourPlacement;
  /** Who the step was written for. Documentation; access decides inclusion. */
  roles?: readonly WorkspaceRole[];
  /** Only these roles get the step, even where the route is open to all. */
  onlyFor?: readonly WorkspaceRole[];
  /** App-wide chrome: always offered, and shown on the person's home page. */
  global?: boolean;
  /** Offered only when the workspace has this switched on. */
  requires?: keyof TourFeatures;
  /** Something the tour does when the step opens. */
  enter?: "open-notifications";
  availableInOfferingsOnly?: boolean;
  offeringsOnlyRoute?: string;
};

type ProductTourStepDefinition = Omit<ProductTourStep, "catalogIndex">;

const ALL_ROLES: readonly WorkspaceRole[] = ["bd_member", "bd_owner", "admin", "sol_member"];
/** FDL Components, Customers, Reports, Performance and Market Intel are a
 *  manager-and-admin job by default (lib/moduleAccess). The route check below
 *  decides inclusion; a person is never walked to a page they cannot open. */
const MANAGERS: readonly WorkspaceRole[] = ["bd_owner", "admin"];

/** Page overviews have one stable frame; never flash a smaller control while
 * the destination mounts or animates. */
function pageTargets(_primary: readonly string[] = []): readonly string[] {
  return ['[data-tour="page-content"]', "#main-content"];
}

/** A specific card first, the page frame when that card is not there. */
function cardTargets(selector: string): readonly string[] {
  return [selector, '[data-tour="page-content"]', "#main-content"];
}

/**
 * THE TOUR WALKS THE APP THAT EXISTS (Anir, Aug 13: "your entire guided
 * walkthrough is wrong… this is not showing anything… why is it only five
 * steps, bro?"), and ALL of it (Oct 1: "You didn't even cover any of the
 * settings", "the user doesn't even know that it [the WhatsApp agent]
 * exists").
 *
 * One step per real screen, in the order a person meets them. Settings is not
 * in the sidebar (it lives in the account menu), so its steps open from there.
 *
 * Persisted progress is the index in this list, so steps are only ever
 * APPENDED: inserting one in the middle would move everybody's saved place.
 * Display order is TOUR_DISPLAY_ORDER below.
 *
 * Copy rule for every step: one or two plain sentences a salesperson would
 * say out loud. No "leverage", no "workflow", no narrating what is on screen.
 */
const PRODUCT_TOUR_STEP_DEFINITIONS: readonly ProductTourStepDefinition[] = [
  {
    id: "top-search",
    // Global chrome exists on every module. It opens on the person's home
    // page: Offerings for most, whatever they can open for the rest.
    route: "/offerings",
    kind: "feature",
    chapter: "Getting around",
    pageName: "the app",
    eyebrow: "Top bar",
    title: "Search from anywhere",
    description:
      "Type a company, a person or the name of a page. Press Enter and the agent answers instead.",
    targets: [
      '[data-tour="global-search"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
    global: true,
    availableInOfferingsOnly: true,
  },
  {
    id: "account-menu",
    route: "/offerings",
    kind: "feature",
    chapter: "Getting around",
    pageName: "your account",
    eyebrow: "Top right",
    title: "Your account lives here",
    description:
      "Settings, light or dark mode and signing out are all in this menu. Settings is here, not in the sidebar.",
    targets: ['[data-tour="account-menu"]', '[data-tour="topbar"]'],
    placement: "bottom",
    roles: ALL_ROLES,
    global: true,
    availableInOfferingsOnly: true,
  },
  {
    id: "notifications-bell",
    route: "/offerings",
    kind: "feature",
    chapter: "Getting around",
    pageName: "notifications",
    eyebrow: "Notifications",
    title: "Anything waiting on you",
    description:
      "Setup steps, results sent back to you and approvals you owe land here. Each one clears itself once it is done.",
    // The bell's panel opens for this step (Anir, Oct 1: "The notifications
    // didn't even load until I clicked on it"): show what is in it, not the
    // closed bell.
    targets: [
      '[data-tour="notifications-panel"]',
      '[data-tour="notifications"]',
      '[data-tour="topbar"]',
    ],
    placement: "left",
    roles: ALL_ROLES,
    global: true,
    enter: "open-notifications",
    availableInOfferingsOnly: true,
  },
  {
    id: "sidebar-modules",
    route: "/offerings",
    kind: "navigation",
    chapter: "Getting around",
    pageName: "the menu",
    eyebrow: "Left side",
    title: "Everything you can open",
    description:
      "Every module your account can use, grouped by what it is for. If something is not here, your account does not have it yet.",
    roleDescriptions: {
      admin:
        "Every module in the app, grouped by what it is for. As an admin you see all of them; everyone else sees only what their access allows.",
    },
    targets: ['[data-tour="sidebar"]', "#main-content"],
    placement: "right",
    roles: ALL_ROLES,
    global: true,
    availableInOfferingsOnly: true,
  },
  {
    id: "offerings-browser",
    route: "/offerings",
    kind: "feature",
    chapter: "Knowledge",
    pageName: "Offerings",
    eyebrow: "Offerings",
    title: "Everything Freyr sells",
    description:
      "The approved catalogue. Search it, filter by category or customer type, and open one for the pitch and the sales material.",
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
    chapter: "Your agent",
    pageName: "Agent",
    eyebrow: "The Agent page",
    title: "Ask instead of hunting",
    description:
      "Ask about any customer, deal or offering. Drop in a PDF, a deck, a spreadsheet or a recording and it reads it. Ask it to draft an email, log a call or set a reminder, and it does it once you say yes.",
    targets: pageTargets([
      'textarea[aria-label="Message the agent"]',
      '[data-tour="agent-workspace"]',
    ]),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "components-browser",
    route: "/components",
    kind: "feature",
    chapter: "Knowledge",
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
    chapter: "Selling",
    pageName: "Customers",
    eyebrow: "Customers",
    title: "Every account in one place",
    description:
      "Open an account for its people, the offerings it already runs, its account plan and the last time anyone spoke to them.",
    roleDescriptions: {
      bd_member:
        "Open an account for its people, the offerings it runs and the last time anyone spoke to them. The accounts you are part of are yours to update.",
    },
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
    chapter: "Your team",
    pageName: "Team",
    eyebrow: "Team",
    title: "Who else is in here",
    description:
      "Everyone with an account, what they do and how to reach them. Message anyone on Teams straight from their row.",
    targets: pageTargets(['input[placeholder="Search the floor…"]']),
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "reports-revenue",
    route: "/reports",
    kind: "feature",
    chapter: "Performance",
    pageName: "Reports",
    eyebrow: "Reports",
    title: "What each offering earns",
    description:
      "Revenue by offering and contract type, what comes up for renewal, and the accounts behind every number.",
    targets: pageTargets(),
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "performance-goals",
    route: "/performance",
    kind: "feature",
    chapter: "Performance",
    pageName: "Goals",
    eyebrow: "Goals",
    title: "Goals and how they are tracking",
    description:
      "The goals the company set, who carries each one, and the numbers against them. Nothing here is guessed: a result counts once it is verified.",
    roleDescriptions: {
      bd_member:
        "Your goals, the results you log against them, and which ones are verified. A result counts once your group owner signs it off.",
      bd_owner:
        "Your group's goals, who carries each one, and the results waiting for your sign-off.",
    },
    targets: pageTargets(['input[placeholder^="Search goals"]']),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "market-intel",
    route: "/market-intel",
    kind: "feature",
    chapter: "Knowledge",
    pageName: "Market Intel",
    eyebrow: "Market Intel",
    title: "What customers and competitors are up to",
    description:
      "Follow the companies that matter to you. Each briefing gathers their posts, news and signals in one place, refreshed every day.",
    targets: pageTargets(['input[placeholder^="Search customers or people"]']),
    placement: "bottom",
    roles: MANAGERS,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-mock-mode",
    route: "/settings?tab=workspace",
    kind: "mode",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Workspace",
    title: "Real data, or the practice copy",
    description:
      "Real is your company's live data. Mock is a complete practice copy: try anything there and nothing real changes. Switch back whenever you like.",
    targets: cardTargets('[data-tour="settings-data-mode"]'),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-replay",
    route: "/settings?tab=workspace",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Workspace",
    title: "Take this tour again any time",
    description:
      "The tour lives here. Come back whenever you want a refresher; it adapts to whatever your account can open by then.",
    targets: cardTargets('[data-tour="settings-product-tour"]'),
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
    chapter: "Selling",
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
    chapter: "Selling",
    pageName: "Forecast",
    eyebrow: "Forecast",
    title: "What is likely to land",
    description:
      "Best case, what you are committing to, and progress against quota. Early enough to still do something about it.",
    targets: pageTargets(['[data-tour="forecast-summary"]']),
    roles: ALL_ROLES,
  },
  {
    id: "contacts-browser",
    route: "/contacts",
    kind: "feature",
    chapter: "Selling",
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
    chapter: "Selling",
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
    chapter: "Selling",
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
    chapter: "Selling",
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
    chapter: "Selling",
    pageName: "Voice agents",
    eyebrow: "Voice agents",
    title: "Calls made for you",
    description:
      "Who was called, what was said, and what came of it. Kept on the customer's record.",
    targets: pageTargets(['[data-tour="voice-lifecycle"]']),
    roles: ALL_ROLES,
  },
  {
    id: "tasks-queue",
    route: "/tasks",
    kind: "feature",
    chapter: "Selling",
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
    chapter: "Performance",
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
    chapter: "Performance",
    pageName: "Activity",
    eyebrow: "Activity",
    title: "Everything that happened",
    description:
      "Every touch, in order, with who did it and what came next.",
    targets: pageTargets(['[data-tour="activity-feed"]']),
    roles: ALL_ROLES,
  },
];

const SOLUTIONING_TOUR_STEP: ProductTourStepDefinition = {
  id: "solutioning-requests",
  route: "/solutioning",
  kind: "feature",
  chapter: "Selling",
  pageName: "Solutioning",
  eyebrow: "Solutioning",
  title: "Requests for the solutions team",
  description:
    "Ask for a submission, a presentation or a meeting. Each request carries its brief, its documents and who is working on what.",
  roleDescriptions: {
    sol_member:
      "Submissions, presentations and meetings people have asked your team for. Open a request for the brief, the documents and the latest activity.",
  },
  targets: pageTargets(['input[placeholder^="Search solutioning"]']),
  roles: ["admin", "sol_member"],
  availableInOfferingsOnly: true,
  placement: "bottom",
};

/**
 * ADDED OCT 1. Appended after everything above so saved progress keeps
 * pointing at the same screens. Where each one APPEARS is TOUR_DISPLAY_ORDER.
 */
const ADDED_TOUR_STEPS: readonly ProductTourStepDefinition[] = [
  {
    id: "agent-dock",
    route: "/offerings",
    kind: "feature",
    chapter: "Your agent",
    pageName: "the agent bubble",
    eyebrow: "The agent bubble",
    title: "It follows you to every page",
    description:
      "This bubble opens the agent wherever you are, and it already knows which customer, deal or offering you are looking at.",
    targets: ['[data-tour="agent-dock"]'],
    placement: "left",
    roles: ALL_ROLES,
    global: true,
    availableInOfferingsOnly: true,
  },
  {
    id: "whatsapp-agent",
    route: "/offerings",
    kind: "showcase",
    chapter: "Your agent",
    pageName: "WhatsApp",
    eyebrow: "Your agent on WhatsApp",
    title: "And it lives in your pocket",
    description:
      "Text your agent from your own phone. Ask about a deal on the way to a meeting, send a voice note or a PDF, and get reminders at the minute you set. It answers with your access, nothing more.",
    targets: [],
    roles: ALL_ROLES,
    global: true,
    requires: "whatsapp",
    availableInOfferingsOnly: true,
  },
  {
    id: "leads-board",
    route: "/leads",
    kind: "feature",
    chapter: "Selling",
    pageName: "Leads",
    eyebrow: "Leads",
    title: "New interest starts here",
    description:
      "Every lead, where it came from and who is on it. Qualify the good ones and they become opportunities.",
    targets: pageTargets(),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "opportunities-browser",
    route: "/opportunities",
    kind: "feature",
    chapter: "Selling",
    pageName: "Opportunities",
    eyebrow: "Opportunities",
    title: "The deals in play",
    description:
      "Each deal carries its customer, offering, value, stage and revenue schedule. Open one for its people, meetings and activity.",
    roleDescriptions: {
      bd_member:
        "Each deal carries its customer, offering, value, stage and revenue schedule. The deals you are part of are yours to update; anything else you can see is read-only.",
    },
    targets: pageTargets(),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "contracts-browser",
    route: "/contracts",
    kind: "feature",
    chapter: "Selling",
    pageName: "Contracts",
    eyebrow: "Contracts",
    title: "Signed work",
    description:
      "Every signed contract: what it covers, what it is worth and when it comes up for renewal.",
    targets: pageTargets(),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "admin-console",
    route: "/admin",
    kind: "feature",
    chapter: "Your team",
    pageName: "Admin",
    eyebrow: "Admin",
    title: "Who can do what",
    description:
      "Approve new sign-ups, invite people, put them in groups and set what each person can open, module by module.",
    targets: pageTargets(),
    roles: ["admin"],
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-profile",
    route: "/settings?tab=profile",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Profile",
    title: "How your team sees you",
    description:
      "Your photo, job title and phone number appear wherever your name does. Touch ID for signing in is set up here too.",
    targets: cardTargets('[data-tour="settings-profile-card"]'),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-appearance",
    route: "/settings?tab=appearance",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Appearance",
    title: "Light, dark, and easy to read",
    description:
      "Pick light, dark or match your computer, and the font that is easiest on your eyes.",
    targets: cardTargets('[data-tour="settings-appearance-card"]'),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-notifications",
    route: "/settings?tab=notifications",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Notifications",
    title: "Only the alerts you want",
    description:
      "Choose which alerts reach you and when the digest arrives.",
    targets: pageTargets(),
    roles: ALL_ROLES,
  },
  {
    id: "settings-integrations",
    route: "/settings?tab=integrations",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Integrations",
    title: "Your phone, connected",
    description:
      "This is where your phone connects to the agent. Come back any time to connect it, or to switch to a new phone.",
    targets: cardTargets('[data-tour="settings-whatsapp-card"]'),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
  },
  {
    id: "settings-access",
    route: "/settings?tab=access",
    kind: "feature",
    chapter: "Settings",
    pageName: "Settings",
    eyebrow: "Settings · Access",
    title: "Who gets in",
    description:
      "Anyone with a company address joins on their own. Everyone else waits at a pending screen until an admin lets them in.",
    targets: cardTargets('[data-tour="settings-access-card"]'),
    roles: ["admin"],
    onlyFor: ["admin"],
    availableInOfferingsOnly: true,
  },
];

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [
  ...PRODUCT_TOUR_STEP_DEFINITIONS,
  SOLUTIONING_TOUR_STEP,
  ...ADDED_TOUR_STEPS,
].map((step, catalogIndex) => ({
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

// Display order is independent of persisted catalog indexes. Keep saved
// progress attached to the same feature when the walkthrough is reorganized.
const TOUR_DISPLAY_ORDER = [
  // Getting around
  "top-search", "account-menu", "notifications-bell", "sidebar-modules",
  // Your agent: the page, the bubble on every page, then the phone.
  "agent-workspace", "agent-dock", "whatsapp-agent",
  // Knowledge
  "offerings-browser", "components-browser", "market-intel",
  // Selling, in the order the work flows.
  "leads-board", "opportunities-browser", "solutioning-requests",
  "contracts-browser", "customers-browser", "contacts-browser",
  "pipeline-board", "forecast-summary", "sessions-browser", "sequences-timeline",
  "campaigns-workflow", "voice-overview", "tasks-queue",
  // Performance
  "performance-goals", "reports-revenue", "analytics-growth", "activity-feed",
  // Your team
  "team-roster", "admin-console",
  // Settings, tab by tab, ending where the tour can be found again.
  "settings-profile", "settings-appearance", "settings-notifications",
  "settings-integrations", "settings-access", "settings-mock-mode",
  "settings-replay",
];

const HOME_PAGE_NAMES: Record<string, string> = {
  "/offerings": "Offerings",
  "/solutioning": "Solutioning",
  "/settings?tab=workspace": "Settings",
};

export function getProductTourSteps({
  offeringsOnly,
  role,
  allowedRoutes,
  features = {},
}: {
  offeringsOnly: boolean;
  role: WorkspaceRole | null | undefined;
  allowedRoutes?: readonly string[];
  features?: TourFeatures;
}): ProductTourStep[] {
  const normalizedRole = normalizeWorkspaceRole(role);
  const canOpen = (route: string) => allowedRoutes
    ? allowedRoutes.includes(route)
    : !!normalizedRole && canAccessModule(route, normalizedRole);
  const home = canOpen("/offerings") ? "/offerings" : canOpen("/solutioning") ? "/solutioning" : "/settings?tab=workspace";
  const filtered = PRODUCT_TOUR_STEPS.filter((step) => {
    if (offeringsOnly && !step.availableInOfferingsOnly) return false;
    if (step.onlyFor && (!normalizedRole || !step.onlyFor.includes(normalizedRole))) return false;
    if (step.requires && !features[step.requires]) return false;
    if (step.global) return true;
    return canOpen(step.route);
  }).map((step) => ({
    ...step,
    description:
      (normalizedRole && step.roleDescriptions?.[normalizedRole]) || step.description,
    // App-wide chrome is shown on the home page, so "Open X" on the step
    // before it names that page, not the bubble or the bell.
    pageName: step.global ? HOME_PAGE_NAMES[home] ?? step.pageName : step.pageName,
    route:
      step.global ? home : offeringsOnly && step.offeringsOnlyRoute
        ? step.offeringsOnlyRoute
        : step.route,
  }));

  /**
   * "Next" names where it goes, computed AFTER filtering, so it can never
   * promise a screen this person's role or release does not have. A step that
   * stays on the same screen keeps the plain "Next"; only a real move earns
   * "Open Reports".
   */
  filtered.sort((a, b) => TOUR_DISPLAY_ORDER.indexOf(a.id) - TOUR_DISPLAY_ORDER.indexOf(b.id));
  return filtered.map((step, index) => {
    if (index === filtered.length - 1) return { ...step, nextLabel: "Finish tour" };
    if (step.nextLabel) return step;
    const next = filtered[index + 1];
    if (!next || next.route === step.route) return step;
    // Between Settings tabs the page stays; name the tab, not "Settings".
    const samePage = next.route.split("?")[0] === step.route.split("?")[0];
    const tab = next.eyebrow.startsWith("Settings · ") ? next.eyebrow.slice("Settings · ".length) : next.pageName;
    return { ...step, nextLabel: `Open ${samePage ? tab : next.pageName}` };
  });
}

/** The chapters a filtered tour actually has, with where each one starts. */
export function tourChaptersOf(
  steps: readonly ProductTourStep[]
): { chapter: TourChapter; start: number; count: number }[] {
  const chapters: { chapter: TourChapter; start: number; count: number }[] = [];
  steps.forEach((step, index) => {
    const last = chapters[chapters.length - 1];
    if (last && last.chapter === step.chapter) last.count += 1;
    else chapters.push({ chapter: step.chapter, start: index, count: 1 });
  });
  return chapters;
}

/**
 * WHICH LEFT-NAV ITEM A ROUTE LIVES UNDER, as spotlight selectors.
 *
 * Anir, Sep 6, testing as a new rep: "whenever you're switching tabs, clearly
 * show that we're about to go to this tab... show that we're clicking on this
 * on the left side." The tour presses the sidebar entry it is opening before
 * every page change, so each move is anchored to the thing a person would
 * actually click.
 *
 * The prefix selector covers nested nav ids (`/performance` lights
 * `nav-performance-org`, the first Performance entry in document order).
 * Settings has no sidebar entry at all (it opens from the account menu, which
 * the tour teaches up front), so its transitions point there instead. The
 * sidebar itself is the last resort so the pointer never lands on nothing.
 */
export function navIntroSelectorsFor(route: string): readonly string[] {
  const [path, query = ""] = route.split("?");
  if (path.startsWith("/settings")) {
    // Already in Settings: press the tab itself. Anywhere else: the menu
    // Settings opens from.
    const tab = new URLSearchParams(query).get("tab");
    return [
      ...(tab ? [`[data-tour="settings-tab-${tab}"]`] : []),
      '[data-tour="account-menu"]',
      '[data-tour="topbar"]',
    ];
  }
  const slug = path.slice(1).replaceAll("/", "-");
  if (!slug || slug === "dashboard") return ['[data-tour="sidebar"]'];
  return [
    `[data-tour="nav-${slug}"]`,
    `[data-tour^="nav-${slug}"]`,
  ];
}
