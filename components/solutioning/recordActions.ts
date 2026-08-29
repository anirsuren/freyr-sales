/**
 * THE HEADER BUTTONS ON A SOLUTIONING RECORD — ONE SET, FOUR PAGES.
 *
 * Anir, Aug 29: "be sure these buttons look same on all 4 sol pages too."
 *
 * Solution requests, Submissions and Presentations are one component wearing
 * three kinds, so those three always agreed. Meetings is its own module and had
 * drifted: its completion button was a SOLID BLUE fill where the other three
 * use a green tint, its padding was px-3.5 against px-4, its icons 15px against
 * 14px, and its delete square was rounded-lg against rounded-md. Four pages a
 * person moves between in one afternoon, wearing two different vocabularies for
 * the same three actions.
 *
 * The strings live here so the next person to touch one page cannot move only
 * that page. The tones are the app's own: red for a reversal, green for done,
 * plain for everything else, and never a brand fill on an action that is not
 * the primary thing to do on the page.
 */

/** Ordinary action — Edit, Reopen. */
export const RECORD_ACTION_NEUTRAL =
  "inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50";

/**
 * Undo — hand it back, take it off somebody. Red because it reverses work,
 * outlined because it is not the thing you came here to do.
 */
export const RECORD_ACTION_UNDO =
  "inline-flex items-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.35)] bg-white px-4 py-2 text-[13px] font-semibold text-[color:#DC2626] transition-colors hover:border-[color:#DC2626] hover:bg-[rgba(220,38,38,0.07)] disabled:opacity-50";

/** Finish it — the green this app reserves for signed-off and complete. */
export const RECORD_ACTION_DONE =
  "inline-flex items-center gap-1.5 rounded-lg border border-[rgba(26,122,53,0.4)] bg-[rgba(26,122,53,0.08)] px-4 py-2 text-[13px] font-semibold text-[color:#1A7A35] transition-colors hover:bg-[rgba(26,122,53,0.14)] disabled:opacity-50";

/** The icon square at the end of the row. */
export const RECORD_ACTION_DELETE =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-white text-[color:#DC2626] transition-colors hover:border-[rgba(220,38,38,0.4)] hover:bg-[rgba(220,38,38,0.06)]";

/** Icon size inside these buttons, so the glyphs match too. */
export const RECORD_ACTION_ICON = 14;
export const RECORD_ACTION_DELETE_ICON = 14.5;
