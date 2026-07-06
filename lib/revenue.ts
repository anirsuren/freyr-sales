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

// ---------------------------------------------------------------- portfolio
// The executive / offering-owner report (Suren, Jul 5: "how many licenses,
// how many customers have bought licenses, how much revenue, is there any
// progress currently going on") — everything cumulated across ALL offerings
// and ALL customers, from the per-customer revenue lines they entered.

export interface OfferingRevenueRow {
  offering_id: string;
  name: string;
  category: string;
  customers: number;
  revenue: number;
  licenses: number;
  lines: number;
}

export interface RenewalRow {
  customer_id: string;
  customer: string;
  offering_id: string;
  offering: string;
  revenue_type: RevenueType;
  amount: number;
  end_date: string;
  daysLeft: number;
}

export interface PortfolioReport {
  totalRevenue: number;
  totalLicenses: number;
  customerCount: number; // distinct customers using ≥1 offering
  offeringCount: number; // distinct offerings with revenue
  lineCount: number;
  activeCount: number; // revenue lines currently active (start ≤ today ≤ end)
  byOffering: OfferingRevenueRow[];
  byCategory: { label: string; value: number }[];
  byType: { type: RevenueType; label: string; revenue: number; count: number }[];
  renewals: RenewalRow[]; // lines with an end date, soonest first
}

type MiniOffering = {
  id: string;
  offering_name: string;
  offering_category: string;
};

export function portfolioReport(
  customers: Pick<
    Customer,
    "id" | "company_name" | "offering_usage" | "offerings_in_use"
  >[],
  offerings: MiniOffering[],
  now: Date = new Date()
): PortfolioReport {
  const offById = new Map(offerings.map((o) => [o.id, o]));
  const byOffering = new Map<string, OfferingRevenueRow>();
  const byCategory = new Map<string, number>();
  const byType = new Map<RevenueType, { revenue: number; count: number }>();
  const renewals: RenewalRow[] = [];
  const usingCustomers = new Set<string>();
  let totalRevenue = 0;
  let totalLicenses = 0;
  let lineCount = 0;
  let activeCount = 0;
  const today = now.getTime();

  for (const c of customers) {
    let customerUses = (c.offerings_in_use || []).length > 0;
    for (const u of c.offering_usage || []) {
      const off = offById.get(u.offering_id);
      const name = off?.offering_name || u.offering_id;
      const category = off?.offering_category || "Uncategorized";
      const rev = sumLines(u.revenue_lines);
      const lic = sumLicenses(u.revenue_lines);
      if (u.revenue_lines.length > 0) customerUses = true;

      const row =
        byOffering.get(u.offering_id) ||
        ({
          offering_id: u.offering_id,
          name,
          category,
          customers: 0,
          revenue: 0,
          licenses: 0,
          lines: 0,
        } as OfferingRevenueRow);
      row.customers += 1;
      row.revenue += rev;
      row.licenses += lic;
      row.lines += u.revenue_lines.length;
      byOffering.set(u.offering_id, row);

      byCategory.set(category, (byCategory.get(category) || 0) + rev);
      totalRevenue += rev;
      totalLicenses += lic;
      lineCount += u.revenue_lines.length;

      for (const l of u.revenue_lines) {
        const t = byType.get(l.revenue_type) || { revenue: 0, count: 0 };
        t.revenue += l.amount || 0;
        t.count += 1;
        byType.set(l.revenue_type, t);
        const start = l.start_date ? Date.parse(l.start_date) : NaN;
        const end = l.end_date ? Date.parse(l.end_date) : NaN;
        if (
          (isNaN(start) || start <= today) &&
          (isNaN(end) || end >= today)
        )
          activeCount += 1;
        if (!isNaN(end)) {
          renewals.push({
            customer_id: c.id,
            customer: c.company_name,
            offering_id: u.offering_id,
            offering: name,
            revenue_type: l.revenue_type,
            amount: l.amount || 0,
            end_date: l.end_date as string,
            daysLeft: Math.round((end - today) / 86_400_000),
          });
        }
      }
    }
    if (customerUses) usingCustomers.add(c.id);
  }

  return {
    totalRevenue,
    totalLicenses,
    customerCount: usingCustomers.size,
    offeringCount: byOffering.size,
    lineCount,
    activeCount,
    byOffering: Array.from(byOffering.values()).sort(
      (a, b) => b.revenue - a.revenue
    ),
    byCategory: Array.from(byCategory.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byType: REVENUE_TYPES.map((type) => ({
      type,
      label: REVENUE_TYPE_META[type].label,
      revenue: byType.get(type)?.revenue || 0,
      count: byType.get(type)?.count || 0,
    })).filter((t) => t.count > 0),
    renewals: renewals.sort((a, b) => a.daysLeft - b.daysLeft),
  };
}
