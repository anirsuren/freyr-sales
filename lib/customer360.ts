import "server-only";

import { readOpportunities } from "./opportunities";
import { readSolutioning } from "./solutioning";
import { readLeads } from "./leads";
import { readContracts } from "./contracts";
import { canAccessModule } from "./moduleAccess";
import type { UserIdentityRole } from "./userIdentity";
import {
  BAND_ICONS,
  type Customer360Band,
  type Customer360Item,
} from "@/lib/customer360Shared";

/**
 * ONE READ THAT ANSWERS "WHAT IS GOING ON AT THIS ACCOUNT" (Suren, Aug 25:
 * "one customer perspective will get everything, one shot").
 *
 * Every module that can carry an account is asked once, and each band is gated
 * on whether THIS person may open the module it came from — showing a manager
 * a count of submissions they cannot open would be a worse answer than not
 * showing the band at all.
 *
 * Failures are swallowed per module on purpose: an account page must still
 * render its deals when the solutioning row is unreachable.
 */

const eq = (a: string | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export async function buildCustomer360(
  customerId: string,
  companyName: string,
  role: UserIdentityRole
): Promise<Customer360Band[]> {
  const may = (path: string) => canAccessModule(path, role);

  const [opps, solutioning, leads, contracts] = await Promise.all([
    may("/opportunities")
      ? readOpportunities().then((s) => s.opportunities).catch(() => [])
      : Promise.resolve([]),
    may("/solutioning")
      ? readSolutioning().then((s) => s.requests).catch(() => [])
      : Promise.resolve([]),
    may("/leads") ? readLeads().then((s) => s.leads).catch(() => []) : Promise.resolve([]),
    may("/contracts")
      ? readContracts().then((s) => s.contracts).catch(() => [])
      : Promise.resolve([]),
  ]);

  /* Records carry a customerId when they were made in-app and only a name when
     they arrived from a sheet, so both are matched. */
  const mine = <T extends { customerId?: string; customer?: string }>(rows: T[]) =>
    rows.filter(
      (r) => (r.customerId && r.customerId === customerId) || eq(r.customer, companyName)
    );

  const myDeals = mine(opps);
  const myRequests = mine(solutioning);
  const myContracts = mine(contracts);
  const myLeads = leads.filter(
    (l) => (l.customerId && l.customerId === customerId) || eq(l.company, companyName)
  );

  const bands: Customer360Band[] = [];

  if (may("/opportunities")) {
    bands.push({
      key: "opportunities",
      label: "Opportunities",
      icon: BAND_ICONS.opportunities,
      color: "#0071E3",
      count: myDeals.length,
      total: myDeals.reduce((s, d) => s + (d.value || 0), 0),
      href: `/opportunities?customer=${encodeURIComponent(companyName)}`,
      hrefLabel: "All deals",
      empty: "No opportunity on this account yet.",
      items: [...myDeals]
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .map<Customer360Item>((d) => ({
          id: d.id,
          title: d.name,
          sub: [d.level, d.status].filter(Boolean).join(" · "),
          amount: d.value,
          href: `/opportunities?deal=${encodeURIComponent(d.id)}`,
        })),
    });
  }

  if (may("/solutioning")) {
    /* Submissions, presentations and meetings are three separate questions he
       asked separately ("how many presentations are happening, how many
       submissions have I done"), so they are three bands, not one. */
    const byKind = (kind: string) => myRequests.filter((r) => r.kind === kind);
    for (const [key, label, kind, color] of [
      ["submissions", "Submissions", "submission", "#7C3AED"],
      ["presentations", "Presentations", "presentation", "#0F766E"],
      ["meetings", "Meetings", "meeting", "#B4318F"],
    ] as const) {
      const rows = byKind(kind);
      bands.push({
        key,
        label,
        icon: BAND_ICONS[key],
        color,
        count: rows.length,
        href: `/solutioning?customer=${encodeURIComponent(customerId)}`,
        hrefLabel: "Solutioning",
        empty: `No ${label.toLowerCase()} on this account yet.`,
        items: [...rows]
          .sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""))
          .map<Customer360Item>((r) => ({
            id: r.id,
            title: r.title,
            sub: [r.ref, r.subtype, r.status.replace("_", " ")]
              .filter(Boolean)
              .join(" · "),
            when: r.meetingAt || r.requestedAt,
            href: `/solutioning?open=${encodeURIComponent(r.id)}`,
          })),
      });
    }
  }

  if (may("/leads")) {
    bands.push({
      key: "leads",
      label: "Leads",
      icon: BAND_ICONS.leads,
      color: "#4338CA",
      count: myLeads.length,
      href: "/leads",
      hrefLabel: "All leads",
      empty: "No lead came in from this company.",
      items: [...myLeads]
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .map<Customer360Item>((l) => ({
          id: l.id,
          title: l.name || l.company,
          sub: [l.ref, l.source, l.status].filter(Boolean).join(" · "),
          when: l.createdAt,
          href: "/leads",
        })),
    });
  }

  if (may("/contracts")) {
    bands.push({
      key: "contracts",
      label: "Contracts",
      icon: BAND_ICONS.contracts,
      color: "#16A34A",
      count: myContracts.length,
      total: myContracts.reduce((s, c) => s + (c.value || 0), 0),
      href: "/contracts",
      hrefLabel: "All contracts",
      empty: "Nothing signed with this account yet.",
      items: [...myContracts]
        .sort((a, b) => b.value - a.value)
        .map<Customer360Item>((c) => ({
          id: c.id,
          title: c.name,
          sub: [c.reference, c.status].join(" · "),
          amount: c.value,
          href: "/contracts",
        })),
    });
  }

  return bands;
}
