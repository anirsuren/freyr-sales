import { orderBands } from "./connectionOrder";
import { canAccessModule } from "./moduleAccess";
import type { UserIdentityRole } from "./userIdentity";
import { readSolutioning } from "./solutioning";
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
    const itemType = (r: (typeof solutioning)[number]) =>
      (r as { type?: string }).type ?? r.kind;

    for (const [key, label, kind, color] of [
      ["submissions", "Submissions", "submission", "#7C3AED"],
      ["presentations", "Presentations", "presentation", "#0F766E"],
      /* Named as a REQUEST, the same correction the customer page needed:
         a meeting asked of the Solutions team is not a meeting held. */
      ["meetingRequests", "Meeting requests", "meeting", "#B4318F"],
    ] as const) {
      const rows = mine.filter((r) => itemType(r) === kind);
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
    const mine = contracts.filter((c) =>
      against((c as { opportunityIds?: string[] }).opportunityIds)
    );
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
