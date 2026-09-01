import { readRecordTeams, teamFor } from "./recordTeams";
import { orderBands } from "./connectionOrder";
import "server-only";

import { readOpportunities } from "./opportunities";
import { readSolutioning, solutioningShelf } from "./solutioning";
import { readLeads } from "./leads";
import { readContracts } from "./contracts";
import { meetingsForCustomer, readMeetings } from "./meetings";
import { canAccessModuleWith } from "./moduleAccess";
import { viewerAccessMap } from "./viewerAccess";
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
  /* THE BANDS AND THE DOOR MUST AGREE.
   *
   * This used to be `canAccessModule(path, role)` — the ROLE rules — while the
   * page that renders these bands is guarded by `requireModuleAccess`, which
   * uses `canAccessModuleWith(path, role, access)` — the PRIVILEGE TABLE. Two
   * different authorities deciding the same question, so they disagreed:
   * a BD Member has `edit` on Revenue Accruals in the stored table and no
   * access under the role rules, which meant the page answered 200 and then
   * rendered with the tab silently missing. The person sees a deal with most
   * of its tabs gone and nothing anywhere says why.
   *
   * Same resolver as the door now. If the table cannot be read,
   * `canAccessModuleWith` falls back to the role rules on its own, so this is
   * never less permissive than it was.
   */
  const access = await viewerAccessMap().catch(() => null);
  const may = (path: string) => canAccessModuleWith(path, role, access);

  const [opps, solutioning, leads, contracts, meetings, recordTeams] = await Promise.all([
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
    /* "Against the customer, what all meetings happen, who did those meetings,
       I can take a look at there" (Suren, Aug 28). */
    may("/meetings")
      ? readMeetings().then((s) => s.meetings).catch(() => [])
      : Promise.resolve([]),
    readRecordTeams(),
  ]);

  /* Records carry a customerId when they were made in-app and only a name when
     they arrived from a sheet, so both are matched. */
  const mine = <T extends { customerId?: string; customer?: string }>(rows: T[]) =>
    rows.filter(
      (r) => (r.customerId && r.customerId === customerId) || eq(r.customer, companyName)
    );

  const myDeals = mine(opps);
  /* One list, read by both the Meetings band and the Team band. */
  const accountMeetings = meetingsForCustomer(meetings, customerId, companyName);
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
    /* Classified by the store's own rule (solutioningShelf) rather than by
       `kind` alone. `kind` never holds "request", so the Solution requests
       band below counted zero on every account, while Submissions counted the
       ASKS as if they were finished submissions. */
    for (const [key, label, color] of [
      /* SOLUTION REQUESTS ARE THEIR OWN COLUMN on his grid, separate from
         the submissions and presentations they turn into — and no page
         carried them at all. "Now you should call it as solution request, not
         request; they call it solution request." */
      ["solutionRequests", "Solution requests", "#0071E3"],
      ["submissions", "Submissions", "#7C3AED"],
      ["presentations", "Presentations", "#0F766E"],
      /* Named for what it is — somebody ASKED the Solutioning team for a
         meeting — so it cannot be mistaken for the meetings that were
         actually held, which have their own band below. */
      ["meetingRequests", "Meeting requests", "#B4318F"],
    ] as const) {
      const rows = myRequests.filter((r) => solutioningShelf(r) === key);
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

  if (may("/meetings")) {
    const myMeetings = accountMeetings;
    bands.push({
      key: "meetings",
      label: "Meetings",
      icon: BAND_ICONS.meetings,
      color: "#B4318F",
      count: myMeetings.length,
      href: "/meetings",
      hrefLabel: "All meetings",
      empty: "No meeting has been held with this account yet.",
      items: [...myMeetings]
        .sort((a, b) => (b.meetingAt || "").localeCompare(a.meetingAt || ""))
        .map<Customer360Item>((m) => ({
          id: m.id,
          title: m.title,
          code: m.ref,
          /* Who ran it, which is the half of his question the date cannot
             answer: "what all meetings happen, WHO did those meetings". */
          sub: [m.type, m.owner, m.status === "completed" ? "completed" : "planned"]
            .filter(Boolean)
            .join(" · "),
          when: m.meetingAt,
          href: `/meetings/${m.id}`,
        })),
    });
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

  /* WHO IS ON THIS ACCOUNT.
     Suren, Aug 28: "let's say if I'm in a customer page, then tab is the team.
     Team wins. In the team I should know who's the OWNER, and then if there
     are other people that would be one — owner is one and then there should be
     other people is a team."

     The owner is a stored fact. The team is not stored anywhere yet, so it is
     READ FROM THE WORK rather than invented: the people who own this account's
     deals, who ran or presented at its meetings, and who fulfilled its
     solution requests. That is a true answer to "who is on this account" today
     and it needs no field nobody has filled in. An explicitly assigned team
     can replace this list later without moving the tab.

     Each name says how it got here, because "owner" and "was in one meeting"
     are very different kinds of involvement. */
  if (may("/team")) {
    const roles = new Map<string, Set<string>>();
    /* ASSIGNED FIRST, INFERRED BEHIND IT. Somebody has now said who owns this
       account and who is on it; that answer outranks anything read off the
       work. The inferred names stay, underneath, because "Elena also ran two
       meetings here" is worth knowing even when she is not on the named
       team — it just no longer pretends to BE the team. */
    const assigned = teamFor(recordTeams, "customer", customerId);
    const add = (who: string | undefined, how: string) => {
      const name = (who ?? "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = [...roles.keys()].find((k) => k === key);
      const set = existing ? roles.get(existing)! : new Set<string>();
      set.add(how);
      roles.set(key, set);
    };
    const display = new Map<string, string>();
    const remember = (who: string | undefined) => {
      const name = (who ?? "").trim();
      if (name) display.set(name.toLowerCase(), name);
    };

    if (assigned?.owner) {
      remember(assigned.owner);
      add(assigned.owner, "account owner");
    }
    for (const m of assigned?.members ?? []) {
      remember(m);
      add(m, "on the account team");
    }
    for (const d of myDeals) {
      remember(d.owner);
      add(d.owner, "owns a deal");
    }
    for (const m of accountMeetings) {
      remember(m.owner);
      add(m.owner, "ran a meeting");
      for (const p of m.presenters) {
        remember(p);
        add(p, "presented");
      }
      for (const a of m.attendees) {
        remember(a);
        add(a, "was in a meeting");
      }
    }
    for (const r of myRequests) {
      remember(r.owner);
      add(r.owner, "fulfilled a request");
      remember(r.requestedBy);
      add(r.requestedBy, "raised a request");
    }

    /* The owner leads, then whoever is doing the most on the account. */
    const people = [...roles.entries()]
      .map(([key, how]) => ({
        name: display.get(key) ?? key,
        how: [...how],
        isOwner: how.has("account owner"),
        onTeam: how.has("on the account team"),
      }))
      /* Owner, then the named team, then everyone else by how much they are
         actually doing. */
      .sort(
        (a, b) =>
          Number(b.isOwner) - Number(a.isOwner) ||
          Number(b.onTeam) - Number(a.onTeam) ||
          b.how.length - a.how.length ||
          a.name.localeCompare(b.name)
      );

    bands.push({
      key: "team",
      label: "Team",
      icon: BAND_ICONS.contacts,
      color: "#0369A1",
      count: people.length,
      href: "/team",
      hrefLabel: "The team",
      empty: "Nobody is on this account yet.",
      items: people.map<Customer360Item>((p) => ({
        id: p.name,
        title: p.name,
        sub: p.how.join(" · "),
        face: p.name,
      })),
    });
  }

  /* WHAT THIS ACCOUNT BUYS, AND WHAT IT IS BEING SOLD.
     His grid, Customer row, Offerings column: "Contracted Offerings,
     Opportunity offerings" — two different states of the same thing, and the
     difference is the useful part. An offering under contract is revenue; an
     offering on an open deal is a bet. Both are named here, and each row says
     which it is. */
  if (may("/offerings")) {
    const contracted = new Map<string, number>();
    for (const c of myContracts) {
      const label = (c as { offeringLabel?: string }).offeringLabel;
      if (label) contracted.set(label, (contracted.get(label) ?? 0) + (c.value || 0));
    }
    const proposed = new Map<string, number>();
    for (const o of myDeals) {
      if (o.status === "Won" || o.status === "Lost") continue;
      for (const label of o.offeringLabels ?? [])
        proposed.set(label, (proposed.get(label) ?? 0) + (o.value || 0));
    }
    const names = [...new Set([...contracted.keys(), ...proposed.keys()])].sort(
      (a, b) => a.localeCompare(b)
    );
    bands.push({
      key: "offerings",
      label: "Offerings",
      icon: BAND_ICONS.offerings,
      color: "#C2410C",
      count: names.length,
      href: "/offerings",
      hrefLabel: "All offerings",
      empty: "Nothing sold to or proposed for this account yet.",
      items: names.map<Customer360Item>((name) => {
        const won = contracted.get(name);
        const open = proposed.get(name);
        return {
          id: name,
          title: name,
          sub: [
            won !== undefined ? "under contract" : null,
            open !== undefined ? "on an open deal" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          amount: (won ?? 0) + (open ?? 0),
          href: "/offerings",
        };
      }),
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

  /* One shared order for every connection strip in the app. */
  return orderBands(bands);
}
