"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
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
import { InfoHint } from "@/components/ui/InfoHint";
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

const BAND_ICON_MAP = {
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
} satisfies Record<string, LucideIcon>;



/**
 * The same panel answers the same question for a PERSON (Suren, Aug 25: "I
 * click on the person's name… wherever he's been called an owner, those will
 * come… I want one-shot understanding of what is this guy doing"). Only the
 * heading changes, so it takes one rather than growing a second component that
 * would drift away from this one.
 */
export function Customer360({
  company,
  bands,
  heading,
  emptyLine,
}: {
  company: string;
  bands: Customer360Band[];
  heading?: string;
  emptyLine?: string;
}) {
  const live = bands.filter((b) => b.count > 0);
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
    ordered.find((b) => b.key === activeKey) ??
    live[0] ??
    (ordered.length ? ordered[0] : null);

  return (
    <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <Briefcase size={15} strokeWidth={2} className="text-blue-primary" />
        {heading ?? `Everything on ${company}`}
        <InfoHint text="Every module that has something on this account, counted in one place: deals, submissions, presentations, meetings, contacts, leads and contracts. Each tab shows that area; Open jumps to the module that owns it." />
      </h2>
      {/* The strip below counts every area, so restating "1 of 7 areas have
          something here" underneath it was a second way of saying the same
          thing. Only the genuinely empty account still needs a sentence. */}
      {live.length === 0 && (
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          {emptyLine ?? "Nothing is connected to this account yet."}
        </p>
      )}

      {ordered.length > 0 && active && (
        <>
          {/* The same strip the offering page uses — counts stay readable in
              one pass even while only one area's rows are showing. */}
          <div role="tablist" className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-1 border-b border-border-light">
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
                    "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] transition-colors",
                    isActive
                      ? "border-blue-primary font-medium text-text-primary"
                      : "border-transparent hover:text-text-primary",
                    /* An area with nothing in it is still a tab, just a
                       quieter one, so a full area and an empty one are never
                       mistaken for each other at a glance. */
                    !isActive && (b.count === 0 ? "text-text-tertiary" : "text-text-secondary")
                  )}
                >
                  <Icon
                    size={13.5}
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
            {active.href && (
              <Link
                href={active.href}
                className="-mb-px ml-auto border-b-2 border-transparent pb-2.5 text-[12.5px] font-semibold text-blue-primary hover:underline"
              >
                {active.hrefLabel ?? "Open"} &rsaquo;
              </Link>
            )}
          </div>

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
                Nothing on {active.label.toLowerCase()} for {company} yet.
              </p>
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
            {active.count > 8 && (
              <p className="mt-2 border-t border-border-light pt-2 text-[12px] text-text-tertiary">
                and {active.count - 8} more
              </p>
            )}
          </div>
        </>
      )}

    </section>
  );
}
