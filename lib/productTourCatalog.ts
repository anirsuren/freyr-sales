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
  nextLabel?: string;
  placement?: ProductTourPlacement;
  roles?: readonly WorkspaceRole[];
  availableInOfferingsOnly?: boolean;
  offeringsOnlyRoute?: string;
  offeringsOnlyOrder?: number;
};

type ProductTourStepDefinition = Omit<ProductTourStep, "catalogIndex">;

const ALL_ROLES: readonly WorkspaceRole[] = ["sales", "editor", "admin"];

function featureTargets(
  nav: string,
  primary: readonly string[] = []
): readonly string[] {
  return [
    ...primary,
    '[data-tour="page-header"]',
    `[data-tour="nav-${nav}"]`,
    '[data-tour="page-content"]',
    "#main-content",
  ];
}

function navigationStep({
  id,
  route,
  nav,
  href,
  destination,
  description,
  availableInOfferingsOnly,
  offeringsOnlyRoute,
  offeringsOnlyOrder,
}: {
  id: string;
  route: string;
  nav: string;
  href: string;
  destination: string;
  description: string;
  availableInOfferingsOnly?: boolean;
  offeringsOnlyRoute?: string;
  offeringsOnlyOrder?: number;
}): ProductTourStepDefinition {
  return {
    id,
    route,
    kind: "navigation",
    eyebrow: "Up next",
    title: `Open ${destination}`,
    description,
    targets: [
      `[data-tour="nav-${nav}"]`,
      `a[href="${href}"]`,
      '[data-tour="sidebar"]',
      "#main-content",
    ],
    nextLabel: `Open ${destination}`,
    placement: "right",
    roles: ALL_ROLES,
    availableInOfferingsOnly,
    offeringsOnlyRoute,
    offeringsOnlyOrder,
  };
}

/**
 * The order is the persisted, zero-based tour order. Keep it stable within a
 * tour version. Role and release filters operate on this list, but persistence
 * always uses catalogIndex so filtering cannot change a saved step's meaning.
 */
const PRODUCT_TOUR_STEP_DEFINITIONS: readonly ProductTourStepDefinition[] = [
  {
    id: "dashboard-tools",
    route: "/dashboard",
    offeringsOnlyRoute: "/offerings",
    kind: "feature",
    eyebrow: "Quick actions",
    title: "Find, create, and stay current",
    description:
      "Use the top bar to search the workspace, create new work, ask the agent for help, and catch important notifications.",
    targets: [
      '[data-tour="topbar"]',
      '[data-tour="global-search"]',
      '[data-tour="create-new"]',
      "#main-content",
    ],
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 0,
  },
  {
    id: "dashboard-new-session",
    route: "/dashboard",
    kind: "feature",
    eyebrow: "Dashboard",
    title: "Start with a real prospect",
    description:
      "New Session brings a prospect, contact, research, offering match, and channel-ready pitch into one guided workflow.",
    targets: [
      '[data-tour="new-session"]',
      'button[title="New Session"]',
      '[data-tour="sidebar"]',
      "#main-content",
    ],
    placement: "right",
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-agent",
    route: "/dashboard",
    nav: "agent",
    href: "/agent",
    destination: "Agent",
    description:
      "Continue to the Agent workspace to plan account work and review recommended next moves.",
  }),
  {
    id: "agent-workspace",
    route: "/agent",
    kind: "feature",
    eyebrow: "Agent",
    title: "Work alongside your sales agent",
    description:
      "Ask questions, plan account work, and review agent recommendations while keeping every consequential action under human control.",
    targets: featureTargets("agent", [
      '[data-tour="agent-workspace"]',
      '[data-tour="agent-tabs"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-offerings",
    route: "/agent",
    nav: "offerings",
    href: "/offerings",
    destination: "Offerings",
    description:
      "Next, open the approved catalog of everything Freyr can recommend and sell.",
  }),
  {
    id: "offerings-browser",
    route: "/offerings",
    kind: "feature",
    eyebrow: "Offerings",
    title: "Find the right offering",
    description:
      "Search the approved catalog, then use customer fit, availability, owners, and supporting material to choose confidently.",
    targets: featureTargets("offerings", [
      'input[aria-label="Search offerings"]',
      'input[placeholder="Search offerings…"]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 1,
  },
  navigationStep({
    id: "to-pipeline",
    route: "/offerings",
    nav: "pipeline",
    href: "/pipeline",
    destination: "Pipeline",
    description:
      "Move from what Freyr sells to the live opportunities progressing through the sales process.",
  }),
  {
    id: "pipeline-board",
    route: "/pipeline",
    kind: "feature",
    eyebrow: "Pipeline",
    title: "Move every deal forward",
    description:
      "Use the stage board to see active deals, spot stalled work, compare weighted value, and keep the next move visible.",
    targets: featureTargets("pipeline", [
      '[data-tour="pipeline-board"]',
      'div[aria-label="Filter deals by company size"]',
      'input[placeholder="Search deals…"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-forecast",
    route: "/pipeline",
    nav: "forecast",
    href: "/forecast",
    destination: "Forecast",
    description:
      "Next, turn the open pipeline into a realistic view of what is likely to land.",
  }),
  {
    id: "forecast-summary",
    route: "/forecast",
    kind: "feature",
    eyebrow: "Forecast",
    title: "See what is likely to land",
    description:
      "Review best case, commit, stage-weighted projections, and quota progress so the team can act before the quarter is decided.",
    targets: featureTargets("forecast", [
      '[data-tour="forecast-summary"]',
      '[data-tour="forecast-overview"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-customers",
    route: "/forecast",
    nav: "customers",
    href: "/customers",
    destination: "Customers",
    description:
      "Open Customers to connect pipeline numbers to the companies behind them.",
  }),
  {
    id: "customers-browser",
    route: "/customers",
    kind: "feature",
    eyebrow: "Customers",
    title: "Build account intelligence",
    description:
      "Find an account and open it to see contacts, opportunities, sessions, notes, activity, and matched offerings in one place.",
    targets: featureTargets("customers", [
      'input[placeholder="Search customers…"]',
      'input[placeholder="Search customers..."]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-contacts",
    route: "/customers",
    nav: "contacts",
    href: "/contacts",
    destination: "Contacts",
    description:
      "Continue to the people inside those accounts and the context for reaching each one.",
  }),
  {
    id: "contacts-browser",
    route: "/contacts",
    kind: "feature",
    eyebrow: "Contacts",
    title: "Know every buyer",
    description:
      "Search contacts by person or company, then keep roles, engagement, account context, and the right next outreach connected.",
    targets: featureTargets("contacts", [
      'input[placeholder="Search contacts…"]',
      'input[placeholder="Search contacts..."]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-team",
    route: "/contacts",
    nav: "team",
    href: "/team",
    destination: "Team",
    description:
      "Open Team to see who owns the work and how execution compares across the sales floor.",
  }),
  {
    id: "team-performance",
    route: "/team",
    kind: "feature",
    eyebrow: "Team",
    title: "See ownership and performance",
    description:
      "Compare pipeline ownership, activity, conversion, and coaching signals, then open a rep for the full breakdown.",
    targets: featureTargets("team", [
      '[data-tour="team-roster"]',
      'button[aria-label*=" open pipeline:"]',
      'button[aria-label="Grid view"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-sessions",
    route: "/team",
    nav: "sessions",
    href: "/sessions",
    destination: "Sessions",
    description:
      "Continue to the durable history of research, pitches, reviews, outcomes, and follow-up context.",
  }),
  {
    id: "sessions-browser",
    route: "/sessions",
    kind: "feature",
    eyebrow: "Sessions",
    title: "Return to every sales session",
    description:
      "Search the session history to reopen research, offering matches, generated pitches, review decisions, and outcomes.",
    targets: featureTargets("sessions", [
      'input[placeholder="Search sessions…"]',
      'input[placeholder="Search sessions..."]',
    ]),
    placement: "bottom",
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-sequences",
    route: "/sessions",
    nav: "sequences",
    href: "/sequences",
    destination: "Sequences",
    description:
      "Open Sequences to turn successful follow-up patterns into a visible, reviewed cadence.",
  }),
  {
    id: "sequences-timeline",
    route: "/sequences",
    kind: "feature",
    eyebrow: "Sequences",
    title: "Make follow-up consistent",
    description:
      "Review every email and call in the timeline, then enroll the right accounts while keeping drafted touches visible for human review.",
    targets: featureTargets("sequences", [
      '[data-tour="sequences-timeline"]',
      '[aria-label$="timeline, scroll horizontally for all steps"]',
      'input[placeholder="Search sequences..."]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-campaigns",
    route: "/sequences",
    nav: "campaigns",
    href: "/campaigns",
    destination: "Campaigns",
    description:
      "Continue to a coordinated workflow for building and reviewing audience-based campaigns.",
  }),
  {
    id: "campaigns-workflow",
    route: "/campaigns",
    kind: "feature",
    eyebrow: "Campaigns",
    title: "Build a reviewed campaign",
    description:
      "Choose an offering and audience, prepare compliant messaging, review the final campaign, and only then queue it.",
    targets: featureTargets("campaigns", [
      '[data-tour="campaigns-overview"]',
      '[data-testid="campaign-composer"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-voice",
    route: "/campaigns",
    nav: "voice",
    href: "/voice",
    destination: "Voice agents",
    description:
      "Open Voice agents to see how calls are prepared, queued, monitored, and returned to account context.",
  }),
  {
    id: "voice-overview",
    route: "/voice",
    kind: "feature",
    eyebrow: "Voice agents",
    title: "Run voice outreach with context",
    description:
      "See each specialist agent, queued call, live status, recording, and outcome without separating voice work from the customer record.",
    targets: featureTargets("voice", [
      '[data-tour="voice-lifecycle"]',
      '[data-tour="voice-overview"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-tasks",
    route: "/voice",
    nav: "tasks",
    href: "/tasks",
    destination: "Tasks",
    description:
      "Continue to the single queue for reviews, follow-ups, overdue work, and agent-ready actions.",
  }),
  {
    id: "tasks-queue",
    route: "/tasks",
    kind: "feature",
    eyebrow: "Tasks",
    title: "Work the next action first",
    description:
      "Filter the work queue by urgency and type so approvals, follow-ups, and overdue items stay actionable.",
    targets: featureTargets("tasks", [
      '[data-tour="tasks-work-queue"]',
      'div[role="group"][aria-label="Filter tasks"]',
      'input[aria-label="Search tasks"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-analytics",
    route: "/tasks",
    nav: "analytics",
    href: "/analytics",
    destination: "Analytics",
    description:
      "Open Analytics to move from individual actions to patterns across the whole funnel.",
  }),
  {
    id: "analytics-growth",
    route: "/analytics",
    kind: "feature",
    eyebrow: "Analytics · Growth",
    title: "See how pipeline is growing",
    description:
      "The growth curve shows how open pipeline accumulated over time, including the accounts behind every point and progress toward quota.",
    targets: featureTargets("analytics", [
      '[data-tour="analytics-pipeline-growth"]',
      'svg[role="img"][aria-label^="Trend chart"]',
    ]),
    roles: ALL_ROLES,
  },
  {
    id: "analytics-stage",
    route: "/analytics",
    kind: "feature",
    eyebrow: "Analytics · Stages",
    title: "See where pipeline sits",
    description:
      "Pipeline by Stage shows where open value is concentrated. Open a stage to reveal the exact deals and people behind it.",
    targets: featureTargets("analytics", [
      '[data-tour="analytics-pipeline-stages"]',
      'button[title^="Prospect —"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-reports",
    route: "/analytics",
    nav: "reports",
    href: "/reports",
    destination: "Reports",
    description:
      "Continue to Reports for a consistent, shareable view of offering revenue and performance.",
  }),
  {
    id: "reports-revenue",
    route: "/reports",
    kind: "feature",
    eyebrow: "Reports",
    title: "Share the revenue picture",
    description:
      "Review revenue by offering category and contract type, renewal timing, licenses, customers, and work still in flight.",
    targets: featureTargets("reports", [
      '[data-tour="reports-revenue"]',
      '[data-tour="reports-overview"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-activity",
    route: "/reports",
    nav: "activity",
    href: "/activity",
    destination: "Activity",
    description:
      "Open Activity to trace the customer touches and follow-ups behind the summary numbers.",
  }),
  {
    id: "activity-feed",
    route: "/activity",
    kind: "feature",
    eyebrow: "Activity",
    title: "Trace every customer touch",
    description:
      "Use the chronological feed to see what happened, who was involved, what outcome was logged, and what follow-up comes next.",
    targets: featureTargets("activity", [
      '[data-tour="activity-feed"]',
      '[data-tour="activity-timeline"]',
    ]),
    roles: ALL_ROLES,
  },
  navigationStep({
    id: "to-settings",
    route: "/activity",
    nav: "settings",
    href: "/settings",
    destination: "Settings",
    description:
      "Finish in Settings, where workspace behavior and this guided tour remain available without occupying the sidebar.",
    availableInOfferingsOnly: true,
    offeringsOnlyRoute: "/offerings",
    offeringsOnlyOrder: 2,
  }),
  {
    id: "settings-mock-mode",
    route: "/settings?tab=workspace",
    kind: "mode",
    eyebrow: "Workspace mode",
    title: "Learn safely in Mock mode",
    description:
      "Mock mode uses safe sample records so you can explore workflows without changing business data. Production mode is controlled by your workspace deployment.",
    targets: featureTargets("settings", [
      '[data-tour="settings-data-mode"]',
      'div[aria-label="Workspace data mode"]',
      'button[role="switch"][aria-label="Switch between real mode and mock mode"]',
    ]),
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 3,
  },
  {
    id: "settings-replay",
    route: "/settings?tab=workspace",
    kind: "feature",
    eyebrow: "Settings · Help",
    title: "Revisit this tour anytime",
    description:
      "The walkthrough now lives in Settings instead of the permanent sidebar. Come back whenever you want a refresher.",
    targets: featureTargets("settings", [
      '[data-tour="settings-product-tour"]',
      'a[href="/onboarding"]',
    ]),
    nextLabel: "Finish tour",
    roles: ALL_ROLES,
    availableInOfferingsOnly: true,
    offeringsOnlyOrder: 4,
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

  if (offeringsOnly) {
    filtered.sort(
      (left, right) =>
        (left.offeringsOnlyOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.offeringsOnlyOrder ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return filtered;
}
