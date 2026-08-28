import type { PerformanceState } from "./performanceShared";

/**
 * THE PARTS OF THE 360 PANEL BOTH SIDES NEED, IN A MODULE NEITHER SIDE OWNS.
 *
 * These lived in components/customers/Customer360.tsx, which carries
 * "use client". lib/customer360.ts and lib/person360.ts are server code and
 * imported BAND_ICONS from it as a runtime value — and a value imported from a
 * client module across that boundary is not the value, it is a client
 * reference. So `BAND_ICONS.contacts` was undefined, every band was built with
 * `icon: undefined`, the lookup on the other side missed, and all seven tabs
 * fell through to the same target glyph (found by hand, Aug 28: seven tabs,
 * one distinct icon).
 *
 * Types alone would have been fine — `import type` is erased. It is the one
 * runtime constant that had to move. Same reason every other pair in this
 * codebase has a *Shared module.
 */

/** The icon names a server page may put on a band. */
export const BAND_ICONS = {
  opportunities: "opportunities",
  goals: "goals",
  offerings: "offerings",
  solutionRequests: "solutionRequests",
  submissions: "submissions",
  presentations: "presentations",
  meetings: "meetings",
  /* A MEETING ASKED FOR IS NOT A MEETING HELD. Both bands were keyed and
     labelled "meetings", so the customer page showed the word twice with two
     different counts beside it (found in the browser, Aug 28: "Meetings 1"
     and "Meetings 0" three columns apart). */
  meetingRequests: "meetingRequests",
  contacts: "contacts",
  leads: "leads",
  contracts: "contracts",
} as const;

export type BandIconKey = keyof typeof BAND_ICONS;

export type Customer360Item = {
  id: string;
  title: string;
  sub?: string;
  when?: string;
  amount?: number;
  href?: string;
  tone?: string;
  /**
   * EACH TAB WEARS ITS MODULE'S OWN CLOTHES (Anir, Aug 27: "can you retain
   * the UI? Like the goals, I want it to look like how it does on the goals
   * page and then the submissions, the offerings, etc."). These are the
   * module rows' own parts, passed as data: the company's logo, the record's
   * reference code, the goal's type chip and its progress bar — the same
   * marks those pages draw, not a lookalike.
   */
  logo?: string;
  code?: string;
  goalType?: string;
  /** Everything the goals page's own GoalZoom needs to run in the row's
      fold — a state trimmed to this person's entries on this goal. */
  goalDrill?: {
    goalId: string;
    person: string;
    state: PerformanceState;
  };
};

export type Customer360Band = {
  key: string;
  label: string;
  /**
   * A KEY, NOT A COMPONENT. This crosses the server/client boundary, and a
   * React component is a function — Next refuses to serialise one ("only plain
   * objects can be passed to Client Components"). Same rule the charts learned:
   * the server names the icon, the client resolves it.
   */
  icon: BandIconKey;
  color: string;
  count: number;
  /** Money where money is the point — deals and contracts. */
  total?: number;
  items: Customer360Item[];
  href?: string;
  hrefLabel?: string;
  /** Shown instead of the list when the band is empty. */
  empty: string;
};
