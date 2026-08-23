import type {
  AccountDeal,
  Customer,
  CustomerOfferingActivity,
  CustomerOfferingCurrency,
  CustomerOfferingEngagementVersion,
  CustomerOfferingStatus,
  OfferingUsage,
} from "./types";

/**
 * THE FIVE ACTIVITIES a customer-offering moves through, from Suren's
 * Activities sheet (Aug 8). One colour each, distinct enough that a wall of
 * heat-map cells reads as a journey at a glance.
 */
export const CUSTOMER_OFFERING_ACTIVITIES: Record<
  CustomerOfferingActivity,
  { label: string; short: string; color: string; text: string }
> = {
  lead: { label: "Lead", short: "Lead", color: "#0071E3", text: "#FFFFFF" },
  opportunity: {
    label: "Opportunity",
    short: "Opportunity",
    color: "#7C3AED",
    text: "#FFFFFF",
  },
  pilot: { label: "Pilot", short: "Pilot", color: "#0E7490", text: "#FFFFFF" },
  contract: {
    label: "Contract",
    short: "Contract",
    color: "#C2410C",
    text: "#FFFFFF",
  },
  delivery: {
    label: "Delivery",
    short: "Delivery",
    color: "#1A7A35",
    text: "#FFFFFF",
  },
};

/** And exactly three statuses. */
export const CUSTOMER_OFFERING_STATUSES: Record<
  CustomerOfferingStatus,
  { label: string; color: string }
> = {
  initiated: { label: "Initiated", color: "#0071E3" },
  under_progress: { label: "Under progress", color: "#C2410C" },
  completed: { label: "Completed", color: "#1A7A35" },
};

/**
 * THE OLD VOCABULARY, TRANSLATED. Fourteen activities and eight statuses
 * collapse into the sheet's five and three: the legend Freyr used to keep
 * ("To pitch", "Under contract", "Implemented") was really an activity and a
 * status said as one word. Anything already stored — or typed into an API
 * call by an older client — is read through this on the way in.
 */
const LEGACY_ACTIVITY: Record<string, CustomerOfferingActivity> = {
  to_pitch: "lead",
  initial_discussions: "lead",
  opportunity: "opportunity",
  product_demonstration: "opportunity",
  proposal: "opportunity",
  pilot: "pilot",
  trial: "pilot",
  under_contract: "contract",
  contract_signature: "contract",
  contract_signed: "contract",
  need_to_deliver: "delivery",
  implementation: "delivery",
  implemented: "delivery",
  on_hold: "opportunity",
};

const LEGACY_STATUS: Record<string, CustomerOfferingStatus> = {
  not_started: "initiated",
  in_progress: "under_progress",
  submitted: "under_progress",
  in_review: "under_progress",
  approved: "completed",
  completed: "completed",
  blocked: "under_progress",
  lost: "completed",
};

/** The activity+status a retired legend word becomes. */
const LEGACY_PAIR: Record<
  string,
  { activity: CustomerOfferingActivity; status: CustomerOfferingStatus }
> = {
  to_pitch: { activity: "lead", status: "initiated" },
  initial_discussions: { activity: "lead", status: "under_progress" },
  opportunity: { activity: "opportunity", status: "initiated" },
  product_demonstration: { activity: "opportunity", status: "under_progress" },
  proposal: { activity: "opportunity", status: "under_progress" },
  pilot: { activity: "pilot", status: "under_progress" },
  trial: { activity: "pilot", status: "under_progress" },
  under_contract: { activity: "contract", status: "under_progress" },
  contract_signature: { activity: "contract", status: "under_progress" },
  contract_signed: { activity: "contract", status: "completed" },
  need_to_deliver: { activity: "delivery", status: "initiated" },
  implementation: { activity: "delivery", status: "under_progress" },
  implemented: { activity: "delivery", status: "completed" },
};

export function normalizeActivity(value: unknown): CustomerOfferingActivity {
  const key = String(value || "");
  if (key in CUSTOMER_OFFERING_ACTIVITIES) {
    return key as CustomerOfferingActivity;
  }
  return LEGACY_ACTIVITY[key] || "lead";
}

export function normalizeStatus(value: unknown): CustomerOfferingStatus {
  const key = String(value || "");
  if (key in CUSTOMER_OFFERING_STATUSES) {
    return key as CustomerOfferingStatus;
  }
  return LEGACY_STATUS[key] || "initiated";
}

/** Read a legend word from Freyr's own sheet ("Implementation in progress")
 *  as the activity + status pair it always meant. */
export function activityPairFromLegend(label: string): {
  activity: CustomerOfferingActivity;
  status: CustomerOfferingStatus;
} | null {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (LEGACY_PAIR[key]) return LEGACY_PAIR[key];
  if (key.includes("implementation_in_progress"))
    return { activity: "delivery", status: "under_progress" };
  if (key.includes("project_initiated"))
    return { activity: "delivery", status: "initiated" };
  if (key.includes("annual_contract"))
    return { activity: "contract", status: "completed" };
  return null;
}

export const CUSTOMER_OFFERING_ACTIVITY_ORDER =
  Object.keys(CUSTOMER_OFFERING_ACTIVITIES) as CustomerOfferingActivity[];

export const CUSTOMER_OFFERING_STATUS_ORDER =
  Object.keys(CUSTOMER_OFFERING_STATUSES) as CustomerOfferingStatus[];

export type HeatMapOffering = {
  id: string;
  name: string;
  category: string;
};

export type ResolvedHeatMapCell = {
  engagement: CustomerOfferingEngagementVersion | null;
  activity: CustomerOfferingActivity | null;
  status: CustomerOfferingStatus | null;
  isImplicit: boolean;
  hasHistory: boolean;
};

function normalized(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dealMatchesOffering(deal: AccountDeal, offering: HeatMapOffering) {
  const dealOffering = normalized(deal.offering);
  if (!dealOffering) return false;
  const offeringName = normalized(offering.name);
  // A deal belongs to one catalogue offering, not every offering whose name
  // happens to contain the same words. The previous substring fallback made a
  // Freya.Register deal appear in Freya.Register + Pia + Mia and + Via too.
  // Until deals carry a stable offering id, exact canonical-name equality is
  // the only safe identity match.
  return dealOffering === offeringName;
}

function dealActivity(stage: string): CustomerOfferingActivity {
  const normalizedStage = normalized(stage);
  if (normalizedStage.includes("pilot") || normalizedStage.includes("trial"))
    return "pilot";
  if (
    normalizedStage.includes("implement") ||
    normalizedStage.includes("deliver") ||
    normalizedStage.includes("closed won")
  ) {
    return "delivery";
  }
  if (
    normalizedStage.includes("contract") ||
    normalizedStage.includes("negotiat") ||
    normalizedStage.includes("signature") ||
    normalizedStage.includes("signed")
  ) {
    return "contract";
  }
  if (
    normalizedStage.includes("prospect") ||
    normalizedStage.includes("lead") ||
    normalizedStage.includes("pitch")
  ) {
    return "lead";
  }
  return "opportunity";
}

export function defaultStatusForActivity(
  activity: CustomerOfferingActivity
): CustomerOfferingStatus {
  // A newly recorded activity has been started, nothing more.
  return activity === "delivery" ? "under_progress" : "initiated";
}

export function usageForOffering(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): OfferingUsage | undefined {
  return (customer.offering_usage || []).find(
    (usage) => usage.offering_id === offeringId
  );
}

export function engagementHistory(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): CustomerOfferingEngagementVersion[] {
  return [...(usageForOffering(customer, offeringId)?.engagement_versions || [])]
    .filter((version) => version && Number.isFinite(version.version))
    .sort((a, b) => b.version - a.version);
}

export function linkedEngagement(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): CustomerOfferingEngagementVersion | null {
  return engagementHistory(customer, offeringId).find(
    (version) => version.linked
  ) || null;
}

function derivedFromDeal(
  customer: Customer,
  offering: HeatMapOffering
): CustomerOfferingEngagementVersion | null {
  const deal = (customer.account_deals || []).find((candidate) =>
    dealMatchesOffering(candidate, offering)
  );
  if (!deal) return null;
  const activity = dealActivity(deal.stage);
  return {
    id: `derived-deal-${deal.id}`,
    version: 1,
    linked: true,
    activity,
    activity_description: deal.next_step || deal.notes || deal.name || null,
    status: normalized(deal.stage).includes("closed")
      ? "completed"
      : defaultStatusForActivity(activity),
    dollar_value: Math.max(0, Number(deal.value) || 0),
    currency: "USD",
    start_date: deal.created_at?.slice(0, 10) || null,
    end_date: deal.close_date || null,
    potential_close_date: deal.close_date || null,
    opportunity_ids: [deal.id],
    proposal_ids: [],
    contract_ids: [],
    created_at: deal.created_at,
    updated_at: deal.created_at,
  };
}

function derivedFromUsage(
  customer: Customer,
  offering: HeatMapOffering
): CustomerOfferingEngagementVersion | null {
  const usage = usageForOffering(customer, offering.id);
  const isInUse = (customer.offerings_in_use || []).includes(offering.id);
  const lines = usage?.revenue_lines || [];
  if (!isInUse && lines.length === 0) return null;
  const starts = lines
    .map((line) => line.start_date)
    .filter((value): value is string => !!value)
    .sort();
  const ends = lines
    .map((line) => line.end_date)
    .filter((value): value is string => !!value)
    .sort();
  const now = customer.last_enriched_at || customer.created_at;
  return {
    id: `derived-usage-${customer.id}-${offering.id}`,
    version: 1,
    linked: true,
    activity: "delivery",
    activity_description:
      lines.find((line) => line.description)?.description ||
      "Offering is in use by this customer.",
    status: "completed",
    dollar_value: lines.reduce(
      (sum, line) => sum + Math.max(0, Number(line.amount) || 0),
      0
    ),
    currency: "USD",
    start_date: starts[0] || null,
    end_date: ends.at(-1) || null,
    potential_close_date: null,
    opportunity_ids: [],
    proposal_ids: [],
    contract_ids: lines.map((line) => line.id),
    created_at: now,
    updated_at: now,
  };
}

/**
 * THE PIPELINE IS THE RELATIONSHIP (Anir, Aug 23, after adding a J&J Medtech
 * opportunity on Freya.intelligence and finding the report still showing that
 * pairing as empty: "this report has to work differently now... that has to
 * be connected to how you are managing opportunities").
 *
 * The matrix predates the Opportunities module. It could derive a cell from
 * `account_deals` — the old per-customer deal list nobody writes to any more —
 * so every deal created the way the app now works was invisible here, and the
 * report quietly said "None" about accounts with live money on them.
 *
 * An opportunity belongs to a customer and carries offerings, which is exactly
 * a cell. Its status maps onto the same five activities the matrix already
 * speaks, so nothing new is invented: the deal's own words decide the cell.
 * Explicit engagements still win — somebody who recorded an activity by hand
 * has said something the pipeline has not.
 */
export type HeatMapOpportunity = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  offeringIds: string[];
  offeringLabels: string[];
  value: number;
  currency?: CustomerOfferingCurrency;
  status?: string;
  level?: string;
  estSignDate?: string;
  createdAt?: string;
};

/** Which of the five activities a deal's status means. Same vocabulary the
 *  matrix already uses, read off the words the deal itself carries. */
function opportunityActivity(o: HeatMapOpportunity): CustomerOfferingActivity {
  const status = normalized(o.status);
  const level = normalized(o.level);
  if (status.includes("won") || status.includes("signed")) return "contract";
  if (status.includes("pilot") || status.includes("demo")) return "pilot";
  if (
    status.includes("propose") ||
    status.includes("submitted") ||
    status.includes("review") ||
    status.includes("negotiat")
  )
    return "opportunity";
  if (status.includes("qualify") || level.includes("future")) return "lead";
  return "opportunity";
}

function derivedFromOpportunity(
  customer: Customer,
  offering: HeatMapOffering,
  opportunities: HeatMapOpportunity[]
): CustomerOfferingEngagementVersion | null {
  const account = normalized(customer.company_name);
  const offeringName = normalized(offering.name);
  const mine = opportunities.filter((o) => {
    const sameAccount = o.customerId
      ? o.customerId === customer.id
      : normalized(o.customer) === account;
    if (!sameAccount) return false;
    /* An id match is certain; the label is the fallback for a deal typed
       before the offering existed in the catalogue. Exact name equality
       only — the same rule dealMatchesOffering uses, for the same reason. */
    return (
      o.offeringIds.includes(offering.id) ||
      o.offeringLabels.some((label) => normalized(label) === offeringName)
    );
  });
  if (mine.length === 0) return null;
  /* The furthest-along deal speaks for the cell: a signed contract outranks a
     proposal outranks a lead, so an account with three deals reads as its
     best one rather than whichever happened to sort first. */
  const RANK: Record<CustomerOfferingActivity, number> = {
    lead: 0,
    opportunity: 1,
    pilot: 2,
    contract: 3,
    delivery: 4,
  };
  const best = [...mine].sort(
    (a, b) => RANK[opportunityActivity(b)] - RANK[opportunityActivity(a)]
  )[0];
  const activity = opportunityActivity(best);
  const won = normalized(best.status).includes("won");
  return {
    id: `derived-opp-${best.id}`,
    version: 1,
    linked: true,
    activity,
    activity_description: best.name || null,
    status: won ? "completed" : defaultStatusForActivity(activity),
    /* Every deal on this pairing, not just the one that names the cell — the
       report's "recorded value" has to be the money actually on the account. */
    dollar_value: mine.reduce((sum, o) => sum + Math.max(0, Number(o.value) || 0), 0),
    currency: best.currency || "USD",
    start_date: best.createdAt?.slice(0, 10) || null,
    end_date: null,
    potential_close_date: best.estSignDate || null,
    opportunity_ids: mine.map((o) => o.id),
    proposal_ids: [],
    contract_ids: [],
    created_at: best.createdAt || new Date().toISOString(),
    updated_at: best.createdAt || new Date().toISOString(),
  };
}

/**
 * Resolve the single matrix cell without inventing customer data. Explicit
 * engagement versions win. The pipeline, then existing deals and offering
 * usage, provide the read-only bridge. A customer with no recorded
 * relationship remains empty until an activity is recorded.
 */
export function resolveHeatMapCell(
  customer: Customer,
  offering: HeatMapOffering,
  opportunities: HeatMapOpportunity[] = []
): ResolvedHeatMapCell {
  const history = engagementHistory(customer, offering.id);
  const explicit = history.find((version) => version.linked) || null;
  if (explicit) {
    return {
      engagement: explicit,
      activity: explicit.activity,
      status: explicit.status,
      isImplicit: false,
      hasHistory: true,
    };
  }
  if (history.length > 0) {
    return {
      engagement: null,
      activity: null,
      status: null,
      isImplicit: false,
      hasHistory: true,
    };
  }
  const derived =
    derivedFromOpportunity(customer, offering, opportunities) ||
    derivedFromDeal(customer, offering) ||
    derivedFromUsage(customer, offering);
  if (derived) {
    return {
      engagement: derived,
      activity: derived.activity,
      status: derived.status,
      isImplicit: true,
      hasHistory: false,
    };
  }
  return {
    engagement: null,
    activity: null,
    status: null,
    isImplicit: true,
    hasHistory: false,
  };
}

export function nextEngagementVersion(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): number {
  const versions = engagementHistory(customer, offeringId);
  return versions.length ? Math.max(...versions.map((item) => item.version)) + 1 : 1;
}

/**
 * Give mock mode enough varied activity to demonstrate the matrix as an
 * actual heat map. Existing usage, deals and saved versions always win; this
 * only fills a restrained set of otherwise untouched demo pairings.
 */
export function withDemoHeatMapActivity(
  customers: Customer[],
  offerings: HeatMapOffering[]
): Customer[] {
  // Every activity but the very first: a demo wall wants movement, not a
  // column of untouched leads.
  const activeActivities = CUSTOMER_OFFERING_ACTIVITY_ORDER.filter(
    (activity) => activity !== "lead"
  );
  const day = 86_400_000;
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  return customers.map((customer, customerIndex) => {
    const offeringUsage = [...(customer.offering_usage || [])];
    let changed = false;

    offerings.forEach((offering, offeringIndex) => {
      // Roughly 1 in 11 pairings carries a meaningful active motion. The
      // pattern is deterministic so it remains stable across reloads.
      if ((customerIndex * 7 + offeringIndex * 5 + 3) % 11 !== 0) return;

      const existing = usageForOffering(
        { offering_usage: offeringUsage },
        offering.id
      );
      if (
        existing?.engagement_versions?.length ||
        existing?.revenue_lines?.length ||
        (customer.offerings_in_use || []).includes(offering.id)
      ) {
        return;
      }

      const activity =
        activeActivities[
          (customerIndex * 3 + offeringIndex) % activeActivities.length
        ];
      const startOffset = 12 + ((customerIndex * 17 + offeringIndex * 9) % 75);
      const duration = 35 + ((customerIndex * 13 + offeringIndex * 11) % 120);
      const start = new Date(today.getTime() - startOffset * day);
      const end = new Date(start.getTime() + duration * day);
      const id = `demo-${customer.id}-${offering.id}`;
      const engagement: CustomerOfferingEngagementVersion = {
        id,
        version: 1,
        linked: true,
        activity,
        activity_description: `Demo ${CUSTOMER_OFFERING_ACTIVITIES[
          activity
        ].label.toLowerCase()} motion for ${offering.name}.`,
        status: defaultStatusForActivity(activity),
        dollar_value:
          80_000 +
          ((customerIndex * 137 + offeringIndex * 83) % 18) * 45_000,
        currency: "USD",
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        potential_close_date: end.toISOString().slice(0, 10),
        opportunity_ids: activity === "opportunity" ? [`opp-${id}`] : [],
        proposal_ids: activity === "opportunity" ? [`proposal-${id}`] : [],
        contract_ids:
          activity === "contract" || activity === "delivery"
            ? [`contract-${id}`]
            : [],
        created_at: start.toISOString(),
        updated_at: start.toISOString(),
      };

      if (existing) {
        const usageIndex = offeringUsage.findIndex(
          (usage) => usage.offering_id === offering.id
        );
        offeringUsage[usageIndex] = {
          ...existing,
          engagement_versions: [engagement],
        };
      } else {
        offeringUsage.push({
          offering_id: offering.id,
          revenue_lines: [],
          engagement_versions: [engagement],
        });
      }
      changed = true;
    });

    return changed ? { ...customer, offering_usage: offeringUsage } : customer;
  });
}
