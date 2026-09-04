import { formatDate } from "./utils";
import { cache } from "react";
import { orderDealBands } from "./connectionOrder";
import { canAccessModuleWith } from "./moduleAccess";
import { viewerAccessMap } from "./viewerAccess";
import type { UserIdentityRole } from "./userIdentity";
import { readSolutioning, solutioningShelf } from "./solutioning";
import { readMeetings } from "./meetings";
import { readContracts } from "./contracts";
import { readRevenueAccruals } from "./revenueAccruals";
import { monthLabel, type AccrualLine } from "./revenueAccrualsShared";
import { formatMoney } from "./pipeline";
import { BAND_ICONS, type Customer360Band, type Customer360Item } from "./customer360Shared";

/**
 * ONE READ OF THE ACCRUAL PLANS PER REQUEST, NOT ONE PER DEAL.
 *
 * Every plan in the company lives in a single stored row, and the pipeline
 * page builds a band set for EVERY opportunity in the list — so asking the
 * store inside the loop is the same row fetched a hundred times over. React's
 * cache collapses that to one round trip, exactly as lib/recordAssignments.ts
 * does for the same reason.
 */
const readAccrualPlans = cache(async () => {
  const state = await readRevenueAccruals().catch(() => null);
  return state?.plans ?? [];
});

/**
 * AND THE OTHER THREE STORES, FOR EXACTLY THE SAME REASON.
 *
 * The note above was written about the accrual plans and only the accrual
 * plans got the cache; solutioning, meetings and contracts stayed inside the
 * loop, so a page with N deals read those three tables N times over.
 *
 * Measured in the loop: the Opportunities page in MOCK mode, which carries 406
 * deals against real's 103, never finished — 120 seconds and still going —
 * while the API behind it answered in 1.9. Real mode took 9.5s for a quarter
 * of the data, so this was already the slowest page in the app and was going
 * to arrive in real mode too, on its own, as the pipeline grew past a hundred.
 *
 * React's `cache` is per-REQUEST memoisation: same answer, one round trip,
 * nothing held between requests and no staleness introduced.
 */
const requestsOnce = cache(async () =>
  readSolutioning().then((s) => s.requests).catch(() => [])
);
const meetingsOnce = cache(async () =>
  readMeetings().then((s) => s.meetings).catch(() => [])
);
const contractsOnce = cache(async () =>
  readContracts().then((s) => s.contracts).catch(() => [])
);

/**
 * HOW ONE MONTH'S TOTAL WAS MADE UP (Suren, Sep 1: "what if we need a
 * separation between month-on-month revenue and one-time revenue? You can make
 * another column: OTS amount in USD, ARR amount in USD... and then you can
 * have a total column, which will come for every month").
 *
 * The row already shows the total, so this is the breakdown beside it. Plans
 * written before that split existed carry neither figure and say nothing here
 * rather than printing a zero nobody entered.
 */
function accrualSplit(line: AccrualLine): string {
  return [
    line.ots ? `One-time ${formatMoney(line.ots)}` : null,
    line.arr ? `Recurring ${formatMoney(line.arr)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * EVERYTHING ON ONE DEAL.
 *
 * Suren, Aug 28: "this will happen everywhere: opportunities everywhere,
 * connections. If I go to opportunities and click on opportunity, all the
 * presentation and everything will come... all the materials, everything, like
 * how you're showing customers, all that should show up."
 *
 * So the deal gets the same band strip the customer has, scoped to itself: the
 * submissions written for THIS deal, the decks built for THIS deal, the
 * meetings held against it, the contract it became. Same component, same
 * shapes, same rules — the only thing that changes is the filter.
 *
 * WHY THE FILTER IS THE DEAL AND NOT THE ACCOUNT. A large account can carry
 * six deals at once and a rep working one of them does not want the other
 * five's decks in their list. Every record here already stores the
 * opportunity ids it was raised against, so this reads rather than guesses; a
 * record that names the customer but no deal belongs on the customer page and
 * deliberately does not appear here.
 */
export async function buildOpportunity360(
  opportunityId: string,
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

  const [solutioning, meetings, contracts, accrualPlans] = await Promise.all([
    may("/solutioning") ? requestsOnce() : Promise.resolve([]),
    may("/meetings") ? meetingsOnce() : Promise.resolve([]),
    may("/contracts") ? contractsOnce() : Promise.resolve([]),
    may("/revenue-accruals") ? readAccrualPlans() : Promise.resolve([]),
  ]);

  const against = (ids: unknown) =>
    Array.isArray(ids) && ids.some((x) => String(x) === opportunityId);

  const bands: Customer360Band[] = [];

  if (may("/solutioning")) {
    const mine = solutioning.filter((r) => against(r.opportunityIds));
    /**
     * WHICH SHELF A RECORD BELONGS ON.
     *
     * This used to read `type ?? kind`, which put every REQUEST on no shelf at
     * all: a meeting request is stored as `type: "request", kind: "meeting"`,
     * so `type ?? kind` answered "request" and the Meeting requests band —
     * which was looking for "meeting" — could never match one. Same for a
     * submission request. Found Aug 31 with the data sitting right there in
     * the store: Submissions 3, Meeting requests 0, on a deal carrying two.
     *
     * `type` says whether it is the work or the ASK for the work; `kind` says
     * what the work is. The shelf needs both.
     */

    for (const [key, label, color] of [
      ["submissions", "Submissions", "var(--ink-violet-soft)"],
      ["presentations", "Presentations", "var(--ink-teal-deep)"],
      /* Named as a REQUEST, the same correction the customer page needed:
         a meeting asked of the Solutioning team is not a meeting held. */
      ["meetingRequests", "Meeting requests", "var(--ink-magenta)"],
      /* What sales has asked for on this deal and nobody has turned into work
         yet — the half of Solutioning that was invisible from the deal. */
      ["solutionRequests", "Solution requests", "var(--ink-orange)"],
    ] as const) {
      const rows = mine.filter((r) => solutioningShelf(r) === key);
      bands.push({
        key,
        columns: [
          { key: "status", label: "Status" },
          { key: "owner", label: "Owner" },
          { key: "docs", label: "Documents", align: "right" },
          { key: "needed", label: "Needed by", align: "right" },
        ],
        label,
        icon: BAND_ICONS[key],
        color,
        count: rows.length,
        href: "/solutioning",
        hrefLabel: "Solutioning",
        empty: `No ${label.toLowerCase()} on this deal yet.`,
        items: rows.map<Customer360Item>((r) => ({
          id: r.id,
          title: r.title,
          code: r.ref,
          when: r.neededBy || r.requestedAt,
          href: `/solutioning/${r.id}`,
          /* The documents built for this deal are the "all the materials"
             half of what he asked for, said on the row that owns them. */
          sub: [
            r.status.replace(/_/g, " "),
            r.owner || null,
            r.docs.length > 0
              ? `${r.docs.length} ${r.docs.length === 1 ? "document" : "documents"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          cells: {
            status: r.status.replace(/_/g, " "),
            owner: r.owner || "Unassigned",
            docs: r.docs.length ? String(r.docs.length) : "",
            needed: r.neededBy ? formatDate(r.neededBy) : "",
          },
        })),
      });
    }
  }

  if (may("/meetings")) {
    const mine = meetings.filter((m) => against(m.opportunityIds));
    bands.push({
      key: "meetings",
      columns: [
        { key: "type", label: "Type" },
        { key: "owner", label: "Who ran it" },
        { key: "status", label: "Status" },
      ],
      label: "Meetings",
      icon: BAND_ICONS.meetings,
      color: "var(--ink-magenta)",
      count: mine.length,
      href: "/meetings",
      hrefLabel: "All meetings",
      empty: "No meeting has been held against this deal yet.",
      items: [...mine]
        .sort((a, b) => (b.meetingAt || "").localeCompare(a.meetingAt || ""))
        .map<Customer360Item>((m) => ({
          id: m.id,
          title: m.title,
          code: m.ref,
          sub: `${m.type} · ${m.owner} · ${m.status}`,
          cells: {
            type: m.type || "",
            owner: m.owner || "Unassigned",
            status: m.status === "completed" ? "Completed" : "Planned",
          },
          when: m.meetingAt,
          href: `/meetings/${m.id}`,
        })),
    });
  }

  if (may("/revenue-accruals")) {
    /**
     * WHEN THIS DEAL'S MONEY LANDS, ON THE DEAL ITSELF.
     *
     * Suren, Sep 1: "one more tab called revenue accruals" — and earlier in
     * the same call, what the tab is for: "we can enter accrued revenue... the
     * accruals actually go into the revenue accrual module, but you can enter
     * from here. You can have this tab, and then you can create accrual for
     * it."
     *
     * So this READS the accruals module rather than keeping a second copy of
     * the plan. One plan per opportunity, ever, keyed by opportunityId, and
     * /revenue-accruals/{id} is the page where it is written.
     *
     * THE BAND EXISTS WITH NOTHING IN IT, which is the whole point of the tab:
     * a deal nobody has planned is precisely the deal somebody needs to plan,
     * and the tab is the way in. Hiding it until a plan existed would mean the
     * only deals you could plan from here are the ones already planned.
     */
    const plan = accrualPlans.find((p) => p.opportunityId === opportunityId);
    /* A plan is a calendar, so it reads in calendar order whatever order the
       rows were saved in. "YYYY-MM" sorts as text exactly as it does as a
       date, which is why the store writes months that way. */
    const lines = [...(plan?.lines ?? [])].sort((a, b) =>
      a.month.localeCompare(b.month)
    );
    bands.push({
      key: "revenueAccruals",
      label: "Revenue accruals",
      icon: BAND_ICONS.revenueAccruals,
      color: "#0369A1",
      /* NO NUMBER ON THIS BAND (Manoj's change sheet, item 21: "Remove number
         against Revenue Accrual in dashboard"). It was `lines.length`, the
         number of MONTHS in the schedule, so one plan spread over four months
         read as "Revenue accruals 4" — four accruals, on a deal that has one.
         Every other band counts records. The total below still says what the
         plan is worth, which is the number anybody actually wanted. */
      /**
       * ACCRUALS ARE USD, FULL STOP (Suren, Sep 1: "we don't have to go to
       * local currency. It automatically only picks up USD, and everywhere
       * reporting will be USD. Only within the opportunity you will see the
       * local currency").
       *
       * So the amounts leave here as the plain numbers the store holds and
       * wear the app's own money format on the other side. No conversion, no
       * currency code, nothing for a second rate table to disagree with.
       */
      total: lines.reduce((sum, l) => sum + (l.amount || 0), 0),
      href: "/revenue-accruals",
      hrefLabel: "Revenue accruals",
      empty:
        "No accrual plan on this deal yet. Make one in Revenue accruals to say which months its money lands in.",
      items: lines.map<Customer360Item>((line) => {
        const split = accrualSplit(line);
        return {
          id: `${opportunityId}:${line.month}`,
          title: monthLabel(line.month),
          amount: line.amount,
          /* NO href, deliberately. This used to point at
             `/revenue-accruals/{deal}`, which was that deal's own plan page.
             That page is gone: Suren, Sep 1, looking at it beside the dialog,
             said "I don't want a different screen, it has to be consistent",
             so the route is now a redirect to the module list and the plan is
             edited in a dialog that opens on the deal itself.

             Leaving the href here meant clicking a month walked you off the
             deal and dumped you on a list, which is the exact journey he
             rejected. OpportunityDetail was deleting this property on the way
             past to stop that; the fix belongs here, at the source, so no
             other renderer of these bands inherits the same trap. That
             downstream delete is now a harmless no-op. */
          ...(split ? { sub: split } : {}),
        };
      }),
    });
  }

  if (may("/contracts")) {
    /* A CONTRACT HOLDS ONE DEAL, NOT A LIST. This filtered `opportunityIds`,
       a field a contract has never had (the store writes `opportunityId`), so
       `against()` read undefined and the band counted zero on every deal in
       every mode — a tab that could not have worked. The array form is still
       accepted in case one is ever written that way. */
    const mine = contracts.filter((c) => {
      const one = (c as { opportunityId?: string }).opportunityId;
      if (one && one === opportunityId) return true;
      return against((c as { opportunityIds?: string[] }).opportunityIds);
    });
    bands.push({
      key: "contracts",
      columns: [{ key: "status", label: "Status" }],
      label: "Contracts",
      icon: BAND_ICONS.contracts,
      color: "var(--ink-teal-deep)",
      count: mine.length,
      href: "/contracts",
      hrefLabel: "Contracts",
      empty: "No contract has come from this deal yet.",
      items: mine.map<Customer360Item>((c) => ({
        id: c.id,
        title: c.name,
        sub: [c.reference, c.status].filter(Boolean).join(" · "),
        cells: { status: c.status || "" },
        amount: c.value,
        href: "/contracts",
      })),
    });
  }

  /* One shared order for every connection strip in the app. */
  return orderDealBands(bands);
}
