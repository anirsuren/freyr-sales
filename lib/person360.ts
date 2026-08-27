import "server-only";

import { readOpportunities } from "./opportunities";
import { readSolutioning } from "./solutioning";
import { readLeads } from "./leads";
import { readContracts } from "./contracts";
import { readPerformance } from "./performance";
import {
  listOfferings,
  listOfferingCategories,
  initializeLiveOfferings,
} from "./offerings";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { getDb } from "./db";
import { canAccessModule } from "./moduleAccess";
import type { UserIdentityRole } from "./userIdentity";
import type { Customer360Band } from "@/components/customers/Customer360";

/**
 * ONE PERSON, EVERYTHING THEY OWN (Suren, Aug 25).
 *
 * Verbatim: "In the people module there are 50 people. I click on the person's
 * name. The first thing I see is — if he's a sales guy, wherever he's been
 * called as an owner: if he's called an owner for a customer, those customers
 * will come; what opportunities is he an owner of, those opportunities will
 * come; offerings, if he has any offerings as an owner, his name is referred
 * as an owner there. Similarly if he's a submission owner in the solutioning,
 * this guy is responding to the submission, then those submissions will show;
 * and if he's responsible for presentation creation he'll come; meetings, the
 * sales guy is connecting meetings because he is the one who created those
 * meetings, and his meetings will come; and his goals, all the goals are
 * assigned to him. So I have a people view of all the 50 people — I want one
 * short understanding of what is this guy doing."
 *
 * AND EXPLICITLY NOT BY ROLE. Abhishek asked whether each person should have
 * one role so offerings only show for a sales person; Suren cut it off: "no,
 * offering will not show up for you, only for an offering owner it will show
 * up… a person can play multiple roles — whatever is connected there, all data
 * points and connections which are tied to that particular person." So every
 * band is "is your name on this record", never "is this your job title".
 */

const same = (a: string | undefined | null, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export async function buildPerson360(
  personName: string,
  role: UserIdentityRole
): Promise<Customer360Band[]> {
  const may = (path: string) => canAccessModule(path, role);
  await initializeLiveOfferings().catch(() => undefined);

  const [opps, solutioning, leads, contracts, perf, customers] = await Promise.all([
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
    may("/performance") ? readPerformance().catch(() => null) : Promise.resolve(null),
    may("/customers") ? getDb().customers.list().catch(() => []) : Promise.resolve([]),
  ]);

  const bands: Customer360Band[] = [];

  if (may("/customers")) {
    const mine = customers.filter((c) => same(c.owner, personName));
    bands.push({
      key: "customers",
      label: "Customers",
      icon: "contacts",
      color: "#0891B2",
      count: mine.length,
      href: "/customers",
      hrefLabel: "All customers",
      empty: "No account has this person as its owner.",
      items: mine.map((c) => ({
        id: c.id,
        title: c.company_name,
        sub: c.industry || undefined,
        href: `/customers/${c.id}`,
      })),
    });
  }

  if (may("/opportunities")) {
    const mine = opps.filter((o) => same(o.owner, personName));
    bands.push({
      key: "opportunities",
      label: "Opportunities",
      icon: "opportunities",
      color: "#0071E3",
      count: mine.length,
      total: mine.reduce((s, o) => s + (o.value || 0), 0),
      href: "/opportunities",
      hrefLabel: "All deals",
      empty: "No deal carries this person's name.",
      items: [...mine]
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .map((o) => ({
          id: o.id,
          title: o.name,
          sub: [o.customer, o.level, o.status].filter(Boolean).join(" · "),
          amount: o.value,
          logo: o.customer,
          href: `/opportunities?deal=${encodeURIComponent(o.id)}`,
        })),
    });
  }

  if (may("/offerings")) {
    /* "Only for an offering owner it will show up." A claim that is still
       `requested` is not ownership. */
    const mine = listOfferings().filter((o) =>
      (o.owners ?? []).some((x) => x.status === "owner" && same(x.name, personName))
    );
    /* Category → colour, keyed the SAME way the catalog keys it (palette by
       position), so an offering wears the same hue here as on its own page
       (Anir, Aug 27: "retain the UI... the offerings, etc."). */
    const catColor: Record<string, string> = {};
    listOfferingCategories().forEach((c, i) => {
      catColor[c.name] = FILTER_PALETTE[i % FILTER_PALETTE.length];
    });
    bands.push({
      key: "offerings",
      label: "Offerings",
      icon: "offerings",
      color: "#7C3AED",
      count: mine.length,
      href: "/offerings",
      hrefLabel: "All offerings",
      empty: "This person owns no offering.",
      items: mine.map((o) => ({
        id: o.id,
        title: o.offering_name,
        sub: [o.offering_type, o.offering_category].filter(Boolean).join(" · ") || undefined,
        tone: o.offering_category ? catColor[o.offering_category] || "#2563EB" : undefined,
        href: `/offerings/${o.id}`,
      })),
    });
  }

  if (may("/solutioning")) {
    /* Owner OR requester: he named both sides — the person "responding to the
       submission", and "the sales guy is connecting meetings because he is the
       one who created those meetings". */
    const touched = solutioning.filter(
      (r) => same(r.owner, personName) || same(r.requestedBy, personName)
    );
    for (const [key, label, kind, color] of [
      ["submissions", "Submissions", "submission", "#7C3AED"],
      ["presentations", "Presentations", "presentation", "#0F766E"],
      ["meetings", "Meetings", "meeting", "#B4318F"],
    ] as const) {
      const rows = touched.filter((r) => r.kind === kind);
      bands.push({
        key,
        label,
        icon: key,
        color,
        count: rows.length,
        href: "/solutioning",
        hrefLabel: "Solutioning",
        empty: `No ${label.toLowerCase()} with this person's name on it.`,
        items: [...rows]
          .sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""))
          .map((r) => ({
            id: r.id,
            title: r.title,
            code: r.ref || undefined,
            logo: r.customer || undefined,
            sub: [
              r.customer,
              same(r.owner, personName) ? "owner" : "requested it",
            ]
              .filter(Boolean)
              .join(" · "),
            when: r.meetingAt || r.requestedAt,
            href: `/solutioning?open=${encodeURIComponent(r.id)}`,
          })),
      });
    }
  }

  if (may("/leads")) {
    const mine = leads.filter((l) => same(l.owner, personName));
    bands.push({
      key: "leads",
      label: "Leads",
      icon: "leads",
      color: "#4338CA",
      count: mine.length,
      href: "/leads",
      hrefLabel: "All leads",
      empty: "No lead is assigned to this person.",
      items: mine.map((l) => ({
        id: l.id,
        title: l.name || l.company,
        code: l.ref || undefined,
        logo: l.company || undefined,
        sub: [l.company, l.status].filter(Boolean).join(" · "),
        when: l.createdAt,
        href: "/leads",
      })),
    });
  }

  if (may("/contracts")) {
    const mine = contracts.filter((c) => same(c.owner, personName));
    bands.push({
      key: "contracts",
      label: "Contracts",
      icon: "contracts",
      color: "#16A34A",
      count: mine.length,
      total: mine.reduce((s, c) => s + c.value, 0),
      href: "/contracts",
      hrefLabel: "All contracts",
      empty: "No contract has this person as its owner.",
      items: mine.map((c) => ({
        id: c.id,
        title: c.name,
        code: c.reference || undefined,
        logo: c.customer || undefined,
        sub: [c.customer, c.status].filter(Boolean).join(" · "),
        amount: c.value,
        href: "/contracts",
      })),
    });
  }

  if (perf) {
    /* "And his goals — all the goals are assigned to him." A goal counts as
       this person's when they carry a target on it. */
    const mine = (perf.goals ?? []).filter((g) =>
      (g.assignments ?? []).some((a) => same(a.person, personName))
    );
    bands.push({
      key: "goals",
      label: "Goals",
      icon: "goals",
      color: "#0F766E",
      count: mine.length,
      href: `/performance/people?person=${encodeURIComponent(personName)}`,
      hrefLabel: "Their goals",
      empty: "No goal is assigned to this person.",
      items: mine.map((g) => {
        const target = (g.assignments ?? [])
          .filter((a) => same(a.person, personName))
          .reduce((s, a) => s + (a.target || 0), 0);
        /* THE FOLD IS THE GOALS PAGE'S OWN PERSON PANEL (Anir, Aug 27:
           "when I click on it, it should look the exact same as the goals
           page... literally just copy this, but I don't think you need the
           organization group person. I honestly think you just need the
           person"). So the row carries what PersonGoalPanel — the exact
           component the goals page opens per person — needs to run: the
           goal itself and a state trimmed to THIS person's entries on THIS
           goal's family, so six rows do not ship six copies of everyone's
           numbers. */
        const family = new Set([g.id, ...(g.componentGoalIds ?? [])]);
        const myEntries = (perf.actuals ?? []).filter(
          (a) => family.has(a.goalId) && same(a.person, personName)
        );
        return {
          id: g.id,
          title: g.name,
          goalType: g.type || undefined,
          goalDrill: {
            goalId: g.id,
            person: personName,
            /* GoalZoom itself renders the fold (Anir, Aug 27: "it should
               look the exact same as the goals page"), fed a state trimmed
               to this person: their entries only, and the goal's target
               swapped for THEIR assignment target so every bar and pace
               verdict measures them against their own number — the same
               scale the org table's per-person rows use. Component goals
               ride along so a composite still draws its cards. */
            state: {
              types: perf.types ?? [],
              goals: [
                { ...g, target },
                ...(g.componentGoalIds ?? [])
                  .map((id) => (perf.goals ?? []).find((x) => x.id === id))
                  .filter((x): x is NonNullable<typeof x> => Boolean(x)),
              ],
              groups: [],
              actuals: myEntries,
              ...(perf.rates ? { rates: perf.rates } : {}),
            },
          },
          href: `/performance/goal/${encodeURIComponent(g.id)}`,
        };
      }),
    });
  }

  return bands;
}
