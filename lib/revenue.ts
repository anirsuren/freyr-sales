// Revenue on in-use offerings (Suren's Jul 5 dictation). Shared labels +
// aggregation so the customer Offerings tab and the offering Reports tab agree.
import type {
  Customer,
  OfferingRevenueLine,
  OfferingUsage,
  RevenueType,
} from "./types";

export const REVENUE_TYPE_META: Record<
  RevenueType,
  { label: string; short: string }
> = {
  annual: { label: "Annual revenue", short: "Annual" },
  project: { label: "Project revenue", short: "Project" },
  annual_service: { label: "Annual service", short: "Service" },
  license: { label: "License revenue", short: "License" },
};

export const REVENUE_TYPES: RevenueType[] = [
  "annual",
  "project",
  "annual_service",
  "license",
];

export function usageFor(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): OfferingUsage | null {
  return (
    (customer.offering_usage || []).find((u) => u.offering_id === offeringId) ||
    null
  );
}

export function linesFor(
  customer: Pick<Customer, "offering_usage">,
  offeringId: string
): OfferingRevenueLine[] {
  return usageFor(customer, offeringId)?.revenue_lines || [];
}

export function sumLines(lines: OfferingRevenueLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export function sumLicenses(lines: OfferingRevenueLine[]): number {
  return lines.reduce(
    (s, l) => s + (l.revenue_type === "license" ? Number(l.num_licenses) || 0 : 0),
    0
  );
}

// Cumulative report for ONE offering across every customer using it — the
// offering owner's view (Suren: "how many customers, how much revenue, how
// many licensed users, all coming from this table from different customers").
export interface OfferingReport {
  customers: {
    id: string;
    name: string;
    lines: OfferingRevenueLine[];
    revenue: number;
    licenses: number;
  }[];
  customerCount: number;
  totalRevenue: number;
  totalLicenses: number;
  lineCount: number;
}

export function reportForOffering(
  customers: Pick<Customer, "id" | "company_name" | "offering_usage" | "offerings_in_use">[],
  offeringId: string
): OfferingReport {
  const rows: OfferingReport["customers"] = [];
  for (const c of customers) {
    const lines = linesFor(c, offeringId);
    const inUse = (c.offerings_in_use || []).includes(offeringId);
    // Include a customer if they carry revenue lines OR simply mark it in use.
    if (lines.length === 0 && !inUse) continue;
    rows.push({
      id: c.id,
      name: c.company_name,
      lines,
      revenue: sumLines(lines),
      licenses: sumLicenses(lines),
    });
  }
  rows.sort((a, b) => b.revenue - a.revenue);
  return {
    customers: rows,
    customerCount: rows.length,
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
    totalLicenses: rows.reduce((s, r) => s + r.licenses, 0),
    lineCount: rows.reduce((s, r) => s + r.lines.length, 0),
  };
}
