"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CalendarClock,
  CalendarPlus,
  Contact as ContactIcon,
  FileSignature,
  FileText,
  Inbox,
  Goal,
  Package,
  Presentation,
  Target,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  BAND_ICONS,
  type BandIconKey,
  type Customer360Band,
  type Customer360Item,
} from "@/lib/customer360Shared";
/* Re-exported so the pages that already import these from here keep working;
   the definitions live in lib/customer360Shared.ts because server code needs
   BAND_ICONS as a real value, not a client reference. */
export { BAND_ICONS };
export type { BandIconKey, Customer360Band, Customer360Item };
import { Card } from "@/components/ui/Card";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import {
  MetPill,
  MiniBar,
  PacePill,
  TypeChip,
  TypeIconTile,
  VerifiedPill,
  typeMeta,
} from "@/components/performance/bits";
import { GoalZoom } from "@/components/performance/GoalZoom";
import {
  actualValue,
  entryStatus,
  fmtAmount,
  goalFamilyActuals,
  milestoneByNow,
  paceVerdict,
  type PerformanceState,
} from "@/lib/performanceShared";
import { formatMoney } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";

/**
 * THE WHOLE ACCOUNT, IN ONE SHOT (Suren, Aug 25).
 *
 * His ask, verbatim: "when I go to a particular customer, I want to get all
 * the view of the customer one shot for that customer — how many opportunities
 * are running, how many meetings are happening, how many presentations are
 * happening, how many submissions have I done. That view has to come together
 * within the customer… so one customer perspective will get everything, one
 * shot. Every time you look at that particular module, what are all connected,
 * everything should come together."
 *
 * The page already had nine tabs holding these facts one at a time, which is
 * the opposite of one shot: answering "what is going on at Takeda" meant
 * opening four of them and remembering the numbers. This is the top of the
 * Overview tab — every connected thing, counted, with the three most recent of
 * each and a way through to the module that owns it.
 *
 * WHAT IT NEVER DOES is invent a section. A band with nothing in it says so in
 * plain words rather than showing a zero and letting you wonder whether the
 * data failed to load.
 */

/* Exported so a band strip drawn somewhere else (the opportunity overview's
   dashboard boxes) wears the same glyph as the band it opens — two maps would
   drift and the same word would carry two icons. */
export const BAND_ICON_MAP = {
  opportunities: Target,
  /* Goals wore the meetings calendar and offerings wore the contracts pen —
     each area gets its own glyph. */
  goals: Goal,
  offerings: Package,
  solutionRequests: Inbox,
  submissions: FileText,
  presentations: Presentation,
  meetings: CalendarClock,
  meetingRequests: CalendarPlus,
  contacts: ContactIcon,
  leads: UserPlus,
  contracts: FileSignature,
  /* Money, not a third calendar. Meetings already wear the clock and meeting
     requests the plus, and a plan of months beside them would have read as a
     third kind of diary rather than as revenue. */
  revenueAccruals: Banknote,
} satisfies Record<string, LucideIcon>;



/**
 * The same panel answers the same question for a PERSON (Suren, Aug 25: "I
 * click on the person's name… wherever he's been called an owner, those will
 * come… I want one-shot understanding of what is this guy doing"). Only the
 * heading changes, so it takes one rather than growing a second component that
 * would drift away from this one.
 */
/** "Opportunities" is not "Opportunitie". Anything not plural is left alone. */
function singularLabel(label: string): string {
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("ss")) return label;
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
}

export function Customer360({
  company,
  bands,
  emptyLine,
  bandActions,
  bandEmpty = false,
  chromeless = false,
  forceKey,
}: {
  company: string;
  bands: Customer360Band[];
  emptyLine?: string;
  /**
   * LET AN EMPTY BAND SAY ITS OWN SENTENCE.
   *
   * Every band already writes one — "No meeting has been held against this
   * deal yet.", "No goal is assigned to this person." — and the type says it
   * is "shown instead of the list when the band is empty". This panel has
   * always drawn a generic "Nothing on {label} for {company} yet." over the
   * top of them instead, so not one of them has ever been read.
   *
   * It matters most on the deal page, where the generic line names the
   * CUSTOMER on a page about one deal and points nowhere, and where Revenue
   * accruals is a tab whose entire job when empty is to say where the plan
   * gets made (Suren, Sep 1: "you can have this tab, and then you can create
   * accrual for it").
   *
   * OPT-IN, not switched on for everybody, because the customer and person
   * pages would change their wording too and nobody asked for that.
   */
  bandEmpty?: boolean;
  /**
   * A control belonging to ONE area, keyed by band. The Team tab needs a way
   * to say who is on the record, and that control has no business appearing
   * over Submissions. The page supplies it because the page knows the record;
   * this component only knows where to put it.
   */
  bandActions?: Record<string, React.ReactNode>;
  /**
   * ONE PAGE, ONE TAB ROW (Suren, Aug 28: "all the tabs have to be on one
   * line... I think he just doesn't want there to be a box, bro... maybe just
   * combine them all and make it one big thing, because there's no point
   * having two tabs. The entire thing should be just one big page").
   *
   * The customer page had two tab rows stacked — this card's, and the page's
   * own Digital components / Activity — inside a box, above a second box.
   * Chromeless drops the card and the heading and lets the page own the row,
   * so a band renders as a full-width section of one page rather than a blurb
   * in a panel.
   */
  chromeless?: boolean;
  /** The page is driving which band shows. */
  forceKey?: string;
}) {
  /* A band that deliberately carries no badge (item 21) is still live when it
     has items — "no number" is not "nothing here". */
  const live = bands.filter((b) => (b.count ?? b.items.length) > 0);
  /**
   * ONE TAB PER AREA (Anir, Aug 27, on the rep profile: "maybe have four
   * different tabs, just like you do on offerings, for each of these four
   * things" — after "I hate when you have something on the left and then I
   * have to look like a hundred thousand pixels to the right just to see
   * it"). The 2x2 card grid put four half-filled boxes side by side, flushed
   * every amount to the far edge, and left a void under any short list. The
   * strip keeps every count in one glance — the one-shot Suren asked for —
   * and the panel below gives the active area the full width, with each
   * row's facts sitting BESIDE its words.
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** Which goal row is folded open — same row-click grammar as the goals
      page: the name is the link, every other pixel toggles the fold. */
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  /** Folded goal families — the goals page's own header fold. */
  const [shutFamilies, setShutFamilies] = useState<string[]>([]);
  /**
   * EVERY AREA IS A TAB, INCLUDING THE EMPTY ONES (Anir, Aug 28: "at the
   * bottom 'Nothing yet on: contacts, submissions...' is ugly").
   *
   * The gap is the useful part — an account with no contacts is worth
   * noticing — but it was reported as a grey run-on sentence pinned under the
   * card, in a different place and a different shape from the counts it
   * belonged with. The empty areas join the strip instead, dimmed and showing
   * a zero, so the whole picture is one row of tabs and the sentence is gone.
   */
  /* THE ORDER IS HIS, NOT THE DATA'S (Suren, Aug 28, dictating the tabs and
     then writing the same sequence out as a grid: "so this is like the order
     in which I need everything to be shown").

     These were sorted with the non-empty areas first, which meant the tabs
     moved every time a record was added and the same page never looked the
     same twice. A fixed order is what makes a strip learnable: Submissions is
     always in the same place whether it holds nine or none. The empty ones
     stay dimmed and showing a zero, which is what carries the "nothing here
     yet" signal that the reordering used to carry.

     The first ACTIVE tab is still a non-empty one where there is one, so
     opening a page still lands on something worth reading. */
  const ordered = bands;
  const active =
    (forceKey ? ordered.find((b) => b.key === forceKey) : null) ??
    ordered.find((b) => b.key === activeKey) ??
    live[0] ??
    (ordered.length ? ordered[0] : null);
  /* Which columns this band actually fills in. */
  const anyAmount = !!active?.items.some((i) => i.amount !== undefined && i.amount > 0);
  const anyWhen = !!active?.items.some((i) => !!i.when);
  /* Detail earns its column the same way Value and When do. Every band that
     existed when this table was written filled it in, so it was drawn
     unconditionally; Revenue accruals is a month and an amount and nothing
     else, and it drew six rows of em-dashes under a heading — the exact thing
     the note on this table says a column must not be. */
  const anySub = !!active?.items.some((i) => !!i.sub);

  return (
    <section
      className={
        chromeless
          ? ""
          : "rounded-xl border border-border-light bg-white p-5 shadow-card"
      }
    >
      {/* NO HEADING (Anir, Aug 29: "you don't even have to say this on any of
          the pages"). "Everything Anir owns" / "Everything on Opella" labelled
          a strip that already names every area it counts, on a page whose
          title is the person or the company — three ways of saying whose page
          this is, stacked. The tabs are the heading. */}
      {/* The strip below counts every area, so restating "1 of 7 areas have
          something here" underneath it was a second way of saying the same
          thing. Only the genuinely empty account still needs a sentence. */}
      {!chromeless && live.length === 0 && (
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          {emptyLine ?? "Nothing is connected to this account yet."}
        </p>
      )}

      {ordered.length > 0 && active && (
        <>
          {/* PROPER TABS (Suren, Aug 28, on the person page: "I need tabs,
              man. I don't like this thing, this looks very small for me. I
              need tabs, proper tabs").

              It was 13.5px with a 2px rule and six pixels of air — a strip you
              had to lean in to read, on a page whose other tab row is 14px
              with real spacing. Same size and rhythm as every other tab row in
              the app now: the count stays a bolder weight beside the label so
              the number is still the thing you scan for. */}
          {/* ONE LINE, SCROLLED — never wrapped (Suren, Aug 28: "all the tabs
              have to be on one line… obviously you have to scroll left and
              right to click on it"; Anir, Aug 29, finding this strip still
              wrapping on the person page: "what the fuck is this").

              flex-wrap put eleven areas on two rows and pushed the "All
              offerings" link down onto the second one with nothing to align
              to. The customer page's strip was fixed for exactly this a day
              earlier; this one is the same component wearing different
              classes, which is how it got missed. Same behaviour now: one
              row, hidden scrollbar, and the action pinned OUTSIDE the
              scroller so it stays put instead of scrolling away. */}
          {chromeless ? null : (
          <div className="mt-3 flex items-end gap-4 border-b border-border-light">
          <div className="flex min-w-0 flex-1">
          <div
            role="tablist"
            /* pr-3 so the last visible tab is not sliced flush against the
               pinned link beside it. */
            className="flex min-w-0 flex-1 flex-nowrap items-end gap-5 overflow-x-auto overflow-y-hidden pr-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {ordered.map((b) => {
              const Icon = BAND_ICON_MAP[b.icon] ?? Target;
              const isActive = b.key === active.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  onClick={() => setActiveKey(b.key)}
                  aria-selected={isActive}
                  className={cn(
                    "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors",
                    isActive
                      ? "border-blue-primary font-semibold text-blue-primary"
                      : "border-transparent hover:text-text-primary",
                    /* An area with nothing in it is still a tab, just a
                       quieter one, so a full area and an empty one are never
                       mistaken for each other at a glance. */
                    !isActive && (b.count === 0 ? "text-text-tertiary" : "text-text-secondary")
                  )}
                >
                  <Icon
                    size={14.5}
                    strokeWidth={2.2}
                    style={{ color: b.count === 0 ? undefined : b.color }}
                    className={b.count === 0 ? "text-text-tertiary" : undefined}
                  />
                  {b.label}
                  <b className="tnum font-semibold">{b.count}</b>
                  {b.total !== undefined && b.total > 0 && (
                    <span className="tnum text-[12px] text-text-secondary">
                      · {formatMoney(b.total)}
                    </span>
                  )}
                </button>
              );
            })}
            {/* THE WAY IN, AT THE END OF THE STRIP (Anir, Aug 28: "'all
                deals' is ugly and awkwardly placed"). It used to sit in a
                footer row whose left half was a non-breaking space whenever
                there were eight rows or fewer, so the link floated alone
                against the bottom-right corner with nothing to align to.
                Here it lands in the empty right of the tab strip, which is
                also space the card was not using. */}
          </div>
          </div>
            <span className="-mb-px flex shrink-0 items-center gap-3 whitespace-nowrap border-b-2 border-transparent pb-2">
              {bandActions?.[active.key]}
              {active.href && (
                <Link
                  href={active.href}
                  className="text-[12.5px] font-semibold text-blue-primary hover:underline"
                >
                  {active.hrefLabel ?? "Open"} &rsaquo;
                </Link>
              )}
            </span>
          </div>
          )}

          {/* THE WHOLE THING, NOT A BLURB (Suren, Aug 28: "it has to be the
              whole thing, bro, visually — numbers, stats, everything, not just
              a little blurb").

              A tab that owns the page needs a head on it: what this area is,
              how much of it there is, and what it is worth, at the size the
              rest of the app writes a number. Two thin rows under a tab strip
              was the old panel doing a summary's job on a page that is no
              longer a summary. */}
          {chromeless && (
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-6">
                {/* THE SAME NUMBER THE REST OF THE APP WRITES (Anir, Aug 28:
                    "this 298K, that doesn't look like a font that we've used").
                    It was 30px semibold at -0.02em, invented here; every stat
                    tile in the app is 24px BOLD at -0.01em. Matched, so a
                    number on this page reads as the same kind of number as one
                    on the tiles above it. */}
                <span className="flex items-baseline gap-2">
                  <span className="text-[24px] font-bold leading-none tracking-[-0.01em] tnum text-text-primary">
                    {active.count}
                  </span>
                  <span className="text-[13px] text-text-secondary">
                    {/* "1 opportunities" was wrong on every band holding one
                        of anything. */}
                    {active.count === 1
                      ? singularLabel(active.label).toLowerCase()
                      : active.label.toLowerCase()}
                  </span>
                </span>
                {active.total !== undefined && active.total > 0 && (
                  <span className="flex items-baseline gap-2">
                    <span
                      className="text-[24px] font-bold leading-none tracking-[-0.01em] tnum"
                      style={{ color: active.color }}
                    >
                      {formatMoney(active.total)}
                    </span>
                    <span className="text-[13px] text-text-secondary">
                      in value
                    </span>
                  </span>
                )}
              </div>
              <span className="flex items-center gap-3">
                {bandActions?.[active.key]}
                {active.href && (
                  <Link
                    href={active.href}
                    className="text-[12.5px] font-semibold text-blue-primary hover:underline"
                  >
                    {active.hrefLabel ?? "Open"} &rsaquo;
                  </Link>
                )}
              </span>
            </div>
          )}

          {/* Keyed so switching areas animates the panel, never the strip. */}
          <div key={active.key} className="tab-panel" data-c360-band={active.key}>
            {active.items.some((i) => i.goalDrill) ? (
              /* THE PEOPLE-PERFORMANCE TABLE, ON THE PERSON'S OWN PAGE
                 (Anir, Aug 27: "show me all the columns, bro: the target,
                 the actual, the met, the percent met, all that stuff. If I
                 go to people performance, shouldn't I see all this data too
                 on that person?"). Same families, same six columns, same
                 cells — the pills, the pace, and the goals table's own
                 fixed-width MiniBar, which is what "make it to scale" means:
                 the bar caps at 100% and the number sits beside it instead
                 of stretching to the cell edge and clipping. Every figure is
                 THIS person's: their entries, their target. */
              <div className="mt-3 space-y-3">
                {(() => {
                  const rows = active.items.filter((i) => i.goalDrill);
                  const families = new Map<string, typeof rows>();
                  for (const r of rows) {
                    const key = r.goalType || "Other";
                    families.set(key, [...(families.get(key) ?? []), r]);
                  }
                  return [...families.entries()].map(([family, kin]) => {
                    const shut = shutFamilies.includes(family);
                    return (
                    /* THE FAMILY HEADER IS THE GOALS PAGE'S OWN — a foldable
                       band on its own card, not a chip floating above a table
                       (Anir, Aug 27: "awkward place to put it", and "I want
                       the exact same animation when I click"). Identical
                       markup to the org table's family fold: surface band,
                       chevron turning, chip and count, tab-panel body. */
                    <Card key={family} className="overflow-hidden p-0">
                      <button
                        type="button"
                        onClick={() =>
                          setShutFamilies((current) =>
                            current.includes(family)
                              ? current.filter((t) => t !== family)
                              : [...current, family]
                          )
                        }
                        aria-expanded={!shut}
                        className="flex w-full cursor-pointer items-center gap-2 bg-surface px-4 py-2.5 text-left transition-colors hover:bg-blue-light/30"
                      >
                        <ChevronDown
                          size={15}
                          strokeWidth={2.2}
                          className={cn(
                            "shrink-0 text-text-tertiary transition-transform duration-200",
                            shut && "-rotate-90"
                          )}
                        />
                        <TypeChip type={family} />
                        <span className="text-[11px] font-semibold text-text-tertiary tnum">
                          {kin.length} {kin.length === 1 ? "goal" : "goals"}
                        </span>
                      </button>
                      {!shut && (
                      <div className="tab-panel overflow-x-auto border-t border-border-light">
                      {/* ONE GRID FOR EVERY FAMILY (Anir, Aug 27: "make
                          sure that all the columns are aligned with each
                          other. There shouldn't be different columns...
                          maybe spread it out more. It's okay if I have to
                          scroll"). table-fixed plus an identical colgroup
                          means Target under Target and Met under Met across
                          every family table, whatever the words inside; the
                          shared widths are generous and the page may
                          scroll. */}
                      <table className="w-full min-w-[880px] table-fixed text-left">
                        <colgroup>
                          <col />
                          <col style={{ width: 120 }} />
                          <col style={{ width: 120 }} />
                          <col style={{ width: 104 }} />
                          <col style={{ width: 208 }} />
                          <col style={{ width: 156 }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border-light">
                            {["Goal", "Target", "Actual", "Met", "% met", "Verified"].map(
                              (h) => (
                                <th
                                  key={h}
                                  className="py-2 pr-4 text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light">
                          {kin.map((item) => {
                            const drill = item.goalDrill!;
                            const goal = drill.state.goals.find(
                              (g) => g.id === drill.goalId
                            );
                            if (!goal) return null;
                            const acts = drill.state.actuals;
                            const rates = drill.state.rates;
                            const actual = actualValue(acts, goal, { rates });
                            const verifiedActual = actualValue(
                              acts.filter((a) => entryStatus(a) === "verified"),
                              goal,
                              { rates }
                            );
                            const kinActs = goalFamilyActuals({ actuals: acts }, goal);
                            const pace = paceVerdict(
                              actual,
                              goal.target,
                              goal.year,
                              goal.measure,
                              new Date(),
                              milestoneByNow(goal)
                            );
                            const goalOpen = openGoal === item.id;
                            const accent = typeMeta(goal.type).color;
                            return (
                              <Fragment key={item.id}>
                              <tr
                                onClick={() =>
                                  setOpenGoal(goalOpen ? null : item.id)
                                }
                                aria-expanded={goalOpen}
                                className={cn(
                                  "cursor-pointer transition-all hover:bg-surface",
                                  goalOpen &&
                                    "bg-surface [box-shadow:inset_3px_0_0_0_var(--goal-accent)]",
                                  openGoal !== null &&
                                    !goalOpen &&
                                    "opacity-45 hover:opacity-100"
                                )}
                                style={{ ["--goal-accent" as string]: accent }}
                              >
                                <td className="py-3 pr-4">
                                  <span className="flex items-center gap-3">
                                    <TypeIconTile type={goal.type} />
                                    <span className="flex min-w-0 flex-col gap-1">
                                      {item.href ? (
                                        <Link
                                          href={item.href}
                                          onClick={(e) => e.stopPropagation()}
                                          className="self-start text-[13.5px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                                        >
                                          {item.title}
                                        </Link>
                                      ) : (
                                        <span className="self-start text-[13.5px] font-semibold text-text-primary">
                                          {item.title}
                                        </span>
                                      )}
                                      {/* The family is named once, above the
                                          table — the row keeps the year, as
                                          the grouped goals table does. */}
                                      <span className="text-[10.5px] text-text-tertiary tnum">
                                        {goal.year}
                                      </span>
                                    </span>
                                  </span>
                                </td>
                                <td className="whitespace-nowrap py-3 pr-4">
                                  {goal.target > 0 ? (
                                    <span className="text-[13px] font-semibold text-text-primary tnum">
                                      {fmtAmount(goal.unit, goal.target, goal.currency)}
                                    </span>
                                  ) : (
                                    <span className="text-[13px] text-text-tertiary">·</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-4">
                                  <span className="text-[13px] font-semibold text-text-primary tnum">
                                    {fmtAmount(goal.unit, actual, goal.currency)}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap py-3 pr-4">
                                  {goal.target > 0 ? (
                                    <MetPill
                                      met={verifiedActual >= goal.target}
                                      size="sm"
                                    />
                                  ) : (
                                    <span className="text-[12px] text-text-tertiary">·</span>
                                  )}
                                </td>
                                <td className="py-3 pr-4">
                                  <span className="mb-1 block">
                                    <PacePill pace={pace} size="sm" />
                                  </span>
                                  <MiniBar
                                    actual={verifiedActual}
                                    claimed={actual}
                                    target={goal.target}
                                  />
                                </td>
                                <td className="py-3">
                                  <VerifiedPill
                                    verified={
                                      Boolean(goal.verified) ||
                                      (kinActs.length > 0 &&
                                        kinActs.every(
                                          (a) => entryStatus(a) === "verified"
                                        ))
                                    }
                                    nothingToVerify={kinActs.length === 0}
                                    size="sm"
                                  />
                                </td>
                              </tr>
                              {goalOpen && (
                                <tr className="!border-t-0">
                                  <td
                                    colSpan={6}
                                    className="px-2 pb-4 pt-0 [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                                    style={{ ["--goal-accent" as string]: accent }}
                                  >
                                    <div className="tab-panel space-y-3 pb-2 pl-3.5 pt-1">
                                      <GoalZoom
                                        embedded
                                        soloPerson={drill.person}
                                        state={drill.state}
                                        goalId={drill.goalId}
                                        meName={drill.person}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                      )}
                    </Card>
                    );
                  });
                })()}
              </div>
            ) : active.count === 0 ? (
              <p className="mt-1 py-6 text-center text-[12.5px] text-text-secondary">
                {bandEmpty
                  ? active.empty
                  : `Nothing on ${active.label.toLowerCase()} for ${company} yet.`}
              </p>
            ) : chromeless ? (
              /* A REAL TABLE, ONE ROW PER RECORD (Suren, Aug 28: "he wants it
                 in probably one row, like a table format, for everything, and
                 you have to make it look at the goals — look how full those
                 rows are. That table is exactly like that for every single
                 one").

                 The two-column list below is a SUMMARY, and it is right where
                 it still is a summary: inside an expanded deal row, or on a
                 card. Here the band owns the whole page, so it gets the shape
                 every other full page in this app uses — a header row, one
                 record per line, the facts in columns that line up down the
                 table, and no cap, because the page is not borrowing space
                 from anything. */
              <div className="overflow-x-auto">
                {/* A COLUMN NOBODY IN THIS BAND FILLS IN IS NOT A COLUMN.
                    A team has no value and no date; a contract has both. Drawing
                    every column for every band gave a table of em-dashes, which
                    is the opposite of "look how full those rows are". */}
                <table className="w-full min-w-[480px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        {singularLabel(active.label)}
                      </th>
                      {anySub && (
                        <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                          Detail
                        </th>
                      )}
                      {anyAmount && (
                        <th className="pb-2 pr-4 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                          Value
                        </th>
                      )}
                      {anyWhen && (
                        <th className="pb-2 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                          When
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {active.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border-light transition-colors last:border-b-0 hover:bg-surface/60"
                      >
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-2.5">
                            {item.face ? (
                              <Avatar
                                name={item.face}
                                className="h-7 w-7 shrink-0 text-[9px]"
                              />
                            ) : item.logo ? (
                              <CompanyLogo
                                name={item.logo}
                                className="h-7 w-7 shrink-0 text-[8px]"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                                style={{
                                  background: `${item.tone ?? active.color}1A`,
                                  color: item.tone ?? active.color,
                                }}
                              >
                                <Package size={14} strokeWidth={2.2} />
                              </span>
                            )}
                            <span className="min-w-0">
                              {item.href ? (
                                <Link
                                  href={item.href}
                                  className="block truncate text-[13.5px] font-semibold text-text-primary hover:text-blue-primary"
                                >
                                  {item.title}
                                </Link>
                              ) : (
                                <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                                  {item.title}
                                </span>
                              )}
                              {item.code && (
                                <span className="mt-0.5 block text-[10.5px] font-bold tnum text-text-tertiary">
                                  {item.code}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        {anySub && (
                          <td className="py-3 pr-4 text-[12.5px] text-text-secondary">
                            {item.sub || "—"}
                          </td>
                        )}
                        {anyAmount && (
                          <td className="py-3 pr-4 text-right">
                            {item.amount !== undefined && item.amount > 0 ? (
                              <b
                                className="text-[13px] font-semibold tnum"
                                style={{ color: active.color }}
                              >
                                {formatMoney(item.amount)}
                              </b>
                            ) : (
                              <span className="text-[12.5px] text-text-tertiary">—</span>
                            )}
                          </td>
                        )}
                        {anyWhen && (
                          <td className="py-3 text-right text-[12.5px] tnum text-text-secondary">
                            {item.when ? formatDate(item.when) : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {active.items.length === 0 && (
                  <p className="py-10 text-center text-[13px] text-text-secondary">
                    {active.empty}
                  </p>
                )}
              </div>
            ) : (
            /* TWO COLUMNS ON A WIDE CARD (Anir, Aug 28: "theres so much space
               to the right ur not taking advantage of"). Two deals used to
               stack down the left third of a full-width card with the rest of
               it blank. The facts still sit BESIDE the words rather than
               flushed to a far edge — that was the original complaint and it
               stands — there are simply two columns of them.

               A border on each row rather than divide-y on the list: dividers
               run between grid CELLS, so in two columns they draw a line down
               the middle and skip the row boundaries. */
            <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {active.items.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 border-t border-border-light py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                >
                  {/* The module's own left mark: a company brings its logo,
                      an offering its category-coloured tile, a person
                      their headshot. */}
                  {item.face ? (
                    <Avatar
                      name={item.face}
                      className="mt-0.5 h-7 w-7 shrink-0 text-[9px]"
                    />
                  ) : item.logo ? (
                    <CompanyLogo
                      name={item.logo}
                      className="mt-0.5 h-7 w-7 shrink-0 text-[8px]"
                    />
                  ) : item.tone ? (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${item.tone}1A`, color: item.tone }}
                    >
                      <Package size={14} strokeWidth={2.2} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    {/* THE FACTS SIT BESIDE THE WORDS — code, amount and the
                        goal-type chip ride the title line; nothing asks the
                        eye to cross the card for one number. */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                      {item.code && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tnum"
                          style={{
                            background: `${item.tone ?? active.color}14`,
                            color: item.tone ?? active.color,
                          }}
                        >
                          {item.code}
                        </span>
                      )}
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="inline-block max-w-full truncate font-semibold text-text-primary hover:text-blue-primary"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <span className="inline-block max-w-full truncate font-semibold text-text-primary">
                          {item.title}
                        </span>
                      )}
                      {item.amount !== undefined && item.amount > 0 && (
                        <b
                          className="tnum text-[12.5px] font-semibold"
                          style={{ color: active.color }}
                        >
                          {formatMoney(item.amount)}
                        </b>
                      )}
                    </p>
                    {(item.sub || item.when) && (
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-text-secondary">
                        {item.sub && <span className="min-w-0">{item.sub}</span>}
                        {item.when && (
                          <span className="tnum text-text-tertiary">
                            {formatDate(item.when)}
                          </span>
                        )}
                      </p>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            )}
            {(active.count ?? active.items.length) > 8 && (
              <p className="mt-2 border-t border-border-light pt-2 text-[12px] text-text-tertiary">
                and {(active.count ?? active.items.length) - 8} more
              </p>
            )}
          </div>
        </>
      )}

    </section>
  );
}
