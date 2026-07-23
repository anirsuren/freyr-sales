import type { WorkspaceRole } from "./accessControl";

export type ProductTourPlacement = "auto" | "bottom" | "left" | "right" | "top";

export type ProductTourStep = {
  /** Stable, zero-based index persisted by the onboarding API. */
  catalogIndex: number;
  id: string;
  route: string;
  title: string;
  description: string;
  targets: readonly string[];
  placement?: ProductTourPlacement;
  roles?: readonly WorkspaceRole[];
  availableInOfferingsOnly?: boolean;
  offeringsOnlyRoute?: string;
  offeringsOnlyOrder?: number;
};

type ProductTourStepDefinition = Omit<ProductTourStep, "catalogIndex">;

const ALL_ROLES: readonly WorkspaceRole[] = ["sales", "editor", "admin"];

function pageTargets(nav: string): readonly string[] {
  return [
    '[data-tour="page-header"]',
    `[data-tour="nav-${nav}"]`,
    '[data-tour="page-content"]',
    "#main-content",
  ];
}

/**
 * The order is the persisted, zero-based tour order. Keep it stable within a
 * tour version. Role and release filters operate on this list, but persistence
 * always uses catalogIndex so filtering cannot change a saved step's meaning.
 */
const PRODUCT_TOUR_STEP_DEFINITIONS = [
  {
    id: "dashboard",
    route: "/dashboard",
    title: "Your sales command center",
    description:
      "Start here for pipeline health, priorities, recent activity, and the signals that need attention today.",
    targets: pageTargets("dashboard"),
    roles: ALL_ROLES,
  },
  {
    id: "global-search",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    title: "Find anything from one place",
    description:
      "Search offerings, accounts, contacts, and pages without leaving the work in front of you. Press Command-K anytime.",
    targets: [
      '[data-tour="global-search"]',
      'button[aria-label="Search"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 1,
  },
  {
    id: "create-new",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    title: "Create work without losing context",
    description:
      "Use New for the fastest path to a session, account, contact, offering, or import.",
    targets: [
      '[data-tour="create-new"]',
      'button[aria-label="Create new"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 2,
  },
  {
    id: "notifications",
    route: "/dashboard",
    title: "Keep up with changes",
    description:
      "Notifications collect approvals, deal movement, and other updates that should not wait for your next review.",
    targets: [
      '[data-tour="notifications"]',
      'button[aria-label="Notifications"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
  },
  {
    id: "agent-assistant",
    route: "/dashboard",
    title: "Bring the agent into any page",
    description:
      "Open the assistant for help with the page you are viewing, then keep the conversation with your current context.",
    targets: [
      '[data-tour="agent-assistant"]',
      'button[aria-label="Ask your agent"]',
      '[data-tour="topbar"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
  },
  {
    id: "agent",
    route: "/agent",
    title: "Work alongside your sales agent",
    description:
      "Ask questions, plan account work, and review agent recommendations from a dedicated workspace.",
    targets: [
      '[data-tour="page-content"]',
      '[data-tour="nav-agent"]',
      "#main-content",
    ],
    roles: ALL_ROLES,
  },
  {
    id: "offerings",
    route: "/offerings",
    title: "Know exactly what Freyr sells",
    description:
      "Browse approved offerings, customer fit, availability, owners, and supporting material before recommending a service.",
    targets: pageTargets("offerings"),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 0,
  },
  {
    id: "pipeline",
    route: "/pipeline",
    title: "Move deals through the pipeline",
    description:
      "See every active deal by stage, spot stalled work, and keep the next move visible.",
    targets: pageTargets("pipeline"),
    roles: ALL_ROLES,
  },
  {
    id: "forecast",
    route: "/forecast",
    title: "Turn pipeline into a forecast",
    description:
      "Review commit, best-case, and weighted projections so the team can act before the quarter is decided.",
    targets: pageTargets("forecast"),
    roles: ALL_ROLES,
  },
  {
    id: "customers",
    route: "/customers",
    title: "Build account intelligence",
    description:
      "Open an account to see its contacts, opportunities, sessions, notes, activity, and matched offerings in one place.",
    targets: pageTargets("customers"),
    roles: ALL_ROLES,
  },
  {
    id: "contacts",
    route: "/contacts",
    title: "Understand every buyer",
    description:
      "Keep roles, engagement, account context, and the right next outreach connected to each contact.",
    targets: pageTargets("contacts"),
    roles: ALL_ROLES,
  },
  {
    id: "team",
    route: "/team",
    title: "See how the team is performing",
    description:
      "Compare ownership, activity, conversion, and coaching signals across the sales team.",
    targets: pageTargets("team"),
    roles: ALL_ROLES,
  },
  {
    id: "sessions",
    route: "/sessions",
    title: "Return to every sales session",
    description:
      "Sessions preserve research, service matching, generated pitches, reviews, outcomes, and follow-up context.",
    targets: pageTargets("sessions"),
    roles: ALL_ROLES,
  },
  {
    id: "sequences",
    route: "/sequences",
    title: "Make follow-up consistent",
    description:
      "Enroll accounts in structured outreach while keeping every drafted touch visible for human review.",
    targets: pageTargets("sequences"),
    roles: ALL_ROLES,
  },
  {
    id: "campaigns",
    route: "/campaigns",
    title: "Coordinate focused campaigns",
    description:
      "Choose an audience, prepare compliant messaging, review the campaign, and queue it from one guided workflow.",
    targets: pageTargets("campaigns"),
    roles: ALL_ROLES,
  },
  {
    id: "voice",
    route: "/voice",
    title: "Run voice outreach with context",
    description:
      "Manage voice agents, queued calls, live status, recordings, and outcomes without separating them from account work.",
    targets: pageTargets("voice"),
    roles: ALL_ROLES,
  },
  {
    id: "tasks",
    route: "/tasks",
    title: "Keep the next action clear",
    description:
      "Tasks bring approvals, follow-ups, and agent-recommended work into one actionable queue.",
    targets: pageTargets("tasks"),
    roles: ALL_ROLES,
  },
  {
    id: "analytics",
    route: "/analytics",
    title: "Learn from the whole funnel",
    description:
      "Use conversion, activity, and rep performance trends to understand what is working and where execution slips.",
    targets: pageTargets("analytics"),
    roles: ALL_ROLES,
  },
  {
    id: "reports",
    route: "/reports",
    title: "Share a consistent view of performance",
    description:
      "Reports package the metrics leaders need without rebuilding the same analysis for every review.",
    targets: pageTargets("reports"),
    roles: ALL_ROLES,
  },
  {
    id: "activity",
    route: "/activity",
    title: "Trace what happened",
    description:
      "The activity stream provides a chronological record of important customer, deal, and agent events.",
    targets: pageTargets("activity"),
    roles: ALL_ROLES,
  },
  {
    id: "settings",
    route: "/settings",
    title: "Make the workspace yours",
    description:
      "Manage your profile, preferences, workspace behavior, notifications, and connected systems here.",
    targets: pageTargets("settings"),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 3,
  },
  {
    id: "access-management",
    route: "/settings?tab=team",
    title: "Keep workspace access intentional",
    description:
      "Admins can invite teammates, approve requests, assign roles, and suspend access from the Team settings.",
    targets: [
      '[role="tab"][aria-selected="true"]',
      '[data-tour="page-header"]',
      '[data-tour="nav-settings"]',
      '[data-tour="page-content"]',
      "#main-content",
    ],
    roles: ["admin"],
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 4,
  },
  {
    id: "knowledge-base",
    route: "/admin",
    title: "Keep source knowledge current",
    description:
      "The Knowledge base controls the trusted material used to ground research, matching, and generated sales work.",
    targets: pageTargets("admin"),
    roles: ALL_ROLES,
  },
  {
    id: "service-catalog",
    route: "/services",
    title: "Check connected service readiness",
    description:
      "Review the systems Freyr can use for enrichment, messaging, CRM, and other production workflows.",
    targets: pageTargets("services"),
    roles: ALL_ROLES,
  },
  {
    id: "recordings",
    route: "/recordings",
    title: "Turn calls into coaching context",
    description:
      "Review recordings, transcripts, moments, comments, and scorecards without losing the account connection.",
    targets: [
      '[data-tour="page-content"]',
      '[data-tour="page-header"]',
      "#main-content",
    ],
    roles: ALL_ROLES,
  },
  {
    id: "import",
    route: "/import",
    title: "Bring approved data into Freyr",
    description:
      "Import the offering workbook or CRM account and contact export with validation before records are created.",
    targets: [
      '[data-tour="page-header"]',
      '[data-tour="create-new"]',
      '[data-tour="page-content"]',
      "#main-content",
    ],
    roles: ALL_ROLES,
  },
  {
    id: "new-session",
    route: "/intake",
    title: "Start with a real prospect",
    description:
      "A new session combines a prospect, contact, research, service matching, and a channel-specific pitch.",
    targets: [
      '[data-tour="page-header"]',
      '[data-tour="new-session"]',
      '[data-tour="page-content"]',
      "#main-content",
    ],
    roles: ALL_ROLES,
  },
] as const satisfies readonly ProductTourStepDefinition[];

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

  if (offeringsOnly) {
    filtered.sort(
      (left, right) =>
        (left.offeringsOnlyOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.offeringsOnlyOrder ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return filtered;
}
