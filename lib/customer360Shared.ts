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
  /* WHEN THE MONEY LANDS (Suren, Sep 1, on the deal page: "one more tab
     called revenue accruals"). Its own key because its own glyph: the note
     above this map is what happens when several bands share one, and a plan
     of months is not a contract, a goal or an opportunity. */
  revenueAccruals: "revenueAccruals",
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
  /**
   * A PERSON'S OWN FACE, for the bands whose rows are people rather than
   * records (Anir has corrected this three times: "profile pictures", "never
   * do this mistake again with the profile pictures"). A company brings its
   * logo through `logo`; a person brings their headshot through this.
   */
  face?: string;
  code?: string;
  goalType?: string;
  /**
   * THE ROW'S REAL COLUMNS (Anir, Sep 4, looking at a lone "Detail" column
   * holding "Pipeline · Submitted to client": "what does that detail even
   * mean? It should be a proper table that has at least 3, 4, 5 columns. This
   * goes for every single page").
   *
   * `sub` mashed everything a row knew into one string, so a deal's stage, its
   * status and its owner arrived as one grey sentence under a heading that
   * said nothing. Keyed to the band's own `columns` below, so each tab decides
   * what its rows are made of instead of every tab getting the same three.
   *
   * `sub` still works and is still drawn where a band has not been given
   * columns — nothing had to be migrated to keep reading correctly.
   */
  cells?: Record<string, string>;
  /** Everything the goals page's own GoalZoom needs to run in the row's
      fold — a state trimmed to this person's entries on this goal. */
  goalDrill?: {
    goalId: string;
    person: string;
    state: PerformanceState;
  };
};

/** One column of a band's table. */
export type Customer360Column = {
  /** Matches a key in an item's `cells`. */
  key: string;
  label: string;
  align?: "left" | "right";
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
  /**
   * OPTIONAL, because one band deliberately has no number.
   *
   * Manoj's change sheet, item 21: "Remove number against Revenue Accrual in
   * dashboard." The accruals band was counting SCHEDULE ROWS — a single plan
   * spread over four months read as "Revenue accruals 4", which says four
   * accruals when there is one. Every other band counts records, so the same
   * badge meant two different things depending on which tab you were looking
   * at. A band that leaves this undefined shows its label and no badge.
   */
  count?: number;
  /** Money where money is the point — deals and contracts. */
  total?: number;
  items: Customer360Item[];
  /** What this band's table is made of. Omitted keeps the old three columns. */
  columns?: Customer360Column[];
  href?: string;
  hrefLabel?: string;
  /** Shown instead of the list when the band is empty. */
  empty: string;
};
