import type {
  AccountDeal,
  Customer,
  CustomerOfferingActivity,
  CustomerOfferingEngagementVersion,
  CustomerOfferingStatus,
  OfferingUsage,
} from "./types";

export const CUSTOMER_OFFERING_ACTIVITIES: Record<
  CustomerOfferingActivity,
  { label: string; short: string; color: string; text: string }
> = {
  to_pitch: {
    label: "To pitch",
    short: "To pitch",
    color: "#DC4C4C",
    text: "#FFFFFF",
  },
  opportunity: {
    label: "Opportunity",
    short: "Opportunity",
    color: "#F47A45",
    text: "#FFFFFF",
  },
  proposal: {
    label: "Proposal",
    short: "Proposal",
    color: "#F5A742",
    text: "#3B2500",
  },
  under_contract: {
    label: "Under contract",
    short: "Contracting",
    color: "#F2C14E",
    text: "#332600",
  },
  contract_signed: {
    label: "Contract signed",
    short: "Signed",
    color: "#D8E98A",
    text: "#263000",
  },
  need_to_deliver: {
    label: "Need to deliver",
    short: "To deliver",
    color: "#A7D86F",
    text: "#173000",
  },
  implementation: {
    label: "Implementation",
    short: "Implementing",
    color: "#65C4A3",
    text: "#063B2C",
  },
  implemented: {
    label: "Implemented",
    short: "Implemented",
    color: "#3F91B4",
    text: "#FFFFFF",
  },
  on_hold: {
    label: "On hold",
    short: "On hold",
    color: "#8B5CF6",
    text: "#FFFFFF",
  },
};

export const CUSTOMER_OFFERING_STATUSES: Record<
  CustomerOfferingStatus,
  { label: string; color: string }
> = {
  not_started: { label: "Not started", color: "#DC4C4C" },
  in_progress: { label: "In progress", color: "#F47A45" },
  submitted: { label: "Submitted", color: "#F5A742" },
  in_review: { label: "In review", color: "#F2C14E" },
  approved: { label: "Approved", color: "#A7D86F" },
  completed: { label: "Completed", color: "#3F91B4" },
  blocked: { label: "Blocked", color: "#8B5CF6" },
  lost: { label: "Lost", color: "#C2410C" },
};

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
  return (
    dealOffering === offeringName ||
    dealOffering.includes(offeringName) ||
    offeringName.includes(dealOffering)
  );
}

function dealActivity(stage: string): CustomerOfferingActivity {
  const normalizedStage = normalized(stage);
  if (normalizedStage.includes("proposal")) return "proposal";
  if (
    normalizedStage.includes("contract") ||
    normalizedStage.includes("negotiat")
  ) {
    return "under_contract";
  }
  if (
    normalizedStage.includes("closed won") ||
    normalizedStage.includes("signed")
  ) {
    return "contract_signed";
  }
  if (
    normalizedStage.includes("implement") ||
    normalizedStage.includes("deliver")
  ) {
    return "implementation";
  }
  if (
    normalizedStage.includes("closed lost") ||
    normalizedStage.includes("hold")
  ) {
    return "on_hold";
  }
  return "opportunity";
}

export function defaultStatusForActivity(
  activity: CustomerOfferingActivity
): CustomerOfferingStatus {
  if (activity === "to_pitch") return "not_started";
  if (activity === "proposal") return "submitted";
  if (
    activity === "contract_signed" ||
    activity === "implemented"
  ) {
    return "completed";
  }
  if (activity === "on_hold") return "blocked";
  return "in_progress";
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
    status:
      normalized(deal.stage).includes("closed lost")
        ? "lost"
        : defaultStatusForActivity(activity),
    dollar_value: Math.max(0, Number(deal.value) || 0),
    currency: "USD",
    start_date: deal.created_at?.slice(0, 10) || null,
    end_date: deal.close_date || null,
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
    activity: "implemented",
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
    opportunity_ids: [],
    proposal_ids: [],
    contract_ids: lines.map((line) => line.id),
    created_at: now,
    updated_at: now,
  };
}

/**
 * Resolve the single matrix cell without inventing customer data. Explicit
 * engagement versions win. Existing deals and offering usage provide a useful
 * read-only bridge for records created before this report existed. A customer
 * with no recorded relationship remains empty until an activity is recorded.
 */
export function resolveHeatMapCell(
  customer: Customer,
  offering: HeatMapOffering
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
  const activeActivities = CUSTOMER_OFFERING_ACTIVITY_ORDER.filter(
    (activity) => activity !== "to_pitch"
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
        opportunity_ids:
          activity === "opportunity" ? [`opp-${id}`] : [],
        proposal_ids:
          activity === "proposal" ? [`proposal-${id}`] : [],
        contract_ids:
          activity === "under_contract" ||
          activity === "contract_signed" ||
          activity === "implementation" ||
          activity === "implemented"
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
