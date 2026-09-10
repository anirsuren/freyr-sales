/**
 * THE THREE OPPORTUNITIES TABS (Manoj, Sep 10: "Move entire Revenue Accruals
 * to Opportunities. Under Opportunities, we need three tabs. 'Est. Booked
 * Revenue', 'Est. Accrual Revenue', 'Deviations'").
 *
 * A plain module, not a "use client" file: the page validates against this on
 * the server and the strip draws from it on the client, and a value exported
 * from a client component does not survive that crossing (see lib/adminTabs).
 */
export const OPPORTUNITY_TABS = ["booked", "accrual", "deviations"] as const;

export type OpportunityTab = (typeof OPPORTUNITY_TABS)[number];

export const OPPORTUNITY_TAB_LABEL: Record<OpportunityTab, string> = {
  booked: "Est. Booked Revenue",
  accrual: "Est. Accrual Revenue",
  deviations: "Deviations",
};

export const OPPORTUNITY_TAB_HREF: Record<OpportunityTab, string> = {
  booked: "/opportunities",
  accrual: "/opportunities?tab=accrual",
  deviations: "/opportunities?tab=deviations",
};

/** Where each tab puts its buttons: the right side of the tab row. */
export const OPPORTUNITY_ACTIONS_SLOT = "opportunities-tab-actions";

export function parseOpportunityTab(raw: string | string[] | undefined | null): OpportunityTab {
  const v = String(Array.isArray(raw) ? raw[0] : (raw ?? "")).toLowerCase();
  if (v === "accrual" || v === "accruals") return "accrual";
  if (v === "deviations" || v === "deviation") return "deviations";
  return "booked";
}
