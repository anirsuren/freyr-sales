import { orderBands } from "./connectionOrder";
import { canAccessModule } from "./moduleAccess";
import type { UserIdentityRole } from "./userIdentity";
import { readSolutioning, solutioningShelf } from "./solutioning";
import { readMeetings } from "./meetings";
import { readContracts } from "./contracts";
import { BAND_ICONS, type Customer360Band, type Customer360Item } from "./customer360Shared";

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
  const may = (path: string) => canAccessModule(path, role);

  const [solutioning, meetings, contracts] = await Promise.all([
    may("/solutioning")
      ? readSolutioning().then((s) => s.requests).catch(() => [])
      : Promise.resolve([]),
    may("/meetings")
      ? readMeetings().then((s) => s.meetings).catch(() => [])
      : Promise.resolve([]),
    may("/contracts")
      ? readContracts().then((s) => s.contracts).catch(() => [])
      : Promise.resolve([]),
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
      ["submissions", "Submissions", "#7C3AED"],
      ["presentations", "Presentations", "#0F766E"],
      /* Named as a REQUEST, the same correction the customer page needed:
         a meeting asked of the Solutioning team is not a meeting held. */
      ["meetingRequests", "Meeting requests", "#B4318F"],
      /* What sales has asked for on this deal and nobody has turned into work
         yet — the half of Solutioning that was invisible from the deal. */
      ["solutionRequests", "Solution requests", "#C2410C"],
    ] as const) {
      const rows = mine.filter((r) => solutioningShelf(r) === key);
      bands.push({
        key,
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
        })),
      });
    }
  }

  if (may("/meetings")) {
    const mine = meetings.filter((m) => against(m.opportunityIds));
    bands.push({
      key: "meetings",
      label: "Meetings",
      icon: BAND_ICONS.meetings,
      color: "#B4318F",
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
          when: m.meetingAt,
          href: `/meetings/${m.id}`,
        })),
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
      label: "Contracts",
      icon: BAND_ICONS.contracts,
      color: "#0F766E",
      count: mine.length,
      href: "/contracts",
      hrefLabel: "Contracts",
      empty: "No contract has come from this deal yet.",
      items: mine.map<Customer360Item>((c) => ({
        id: c.id,
        title: c.name,
        sub: [c.reference, c.status].filter(Boolean).join(" · "),
        amount: c.value,
        href: "/contracts",
      })),
    });
  }

  /* One shared order for every connection strip in the app. */
  return orderBands(bands);
}
