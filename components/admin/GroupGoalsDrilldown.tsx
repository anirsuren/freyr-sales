"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  PersonGoalPanel,
  TypeIconTile,
  typeMeta,
} from "@/components/performance/bits";
import { cn } from "@/lib/utils";
import {
  actualValue,
  scopeStateToPeople,
  type PerfActual,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { tint } from "@/lib/tint";

/**
 * WHAT THIS GROUP IS ACTUALLY CARRYING, TWO CLICKS DEEP (Anir, Aug 25: "I
 * would like to see here who the six goals are. I want to see more. If I click
 * on Group 1 I want to see all their goals and how they're doing on the goals.
 * Maybe when I click the dropdown below the people, it shows me the goals, and
 * then I can click into each goal. It's another dropdown, and then I can see
 * what I have to verify. It's just saying '1 to verify'").
 *
 * The card said "6 goals" and "1 to verify" and stopped there — two numbers
 * with no way to reach what they counted, so the only way to find out WHICH
 * goal, or WHOSE result was waiting, was to leave for Group performance and
 * hunt. The people list opens the group; the goals open under it; each goal
 * opens onto the people carrying it and the results waiting on a signature.
 *
 * Every number here comes from scopeStateToPeople and actualValue, the same
 * two functions Group performance uses, for the reason written on the rollup
 * above: these chips have drifted from that room once already and must not
 * again.
 */

const PENDING: PerfActual["status"][] = ["reported", "sent_back"];
const isPending = (a: PerfActual) => PENDING.includes(a.status);

function money(n: number, unit: PrimaryGoal["unit"]): string {
  if (unit !== "currency") return n.toLocaleString();
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function GroupGoalsDrilldown({
  state,
  groupId,
  groupName,
  members,
}: {
  state: PerformanceState;
  groupId: string;
  groupName: string;
  members: string[];
}) {
  /* OPEN ON ARRIVAL (Anir, Aug 25: "when I click on the group, it will
     automatically show me the goals"). Opening a group to find one more closed
     thing between you and the goals is a step nobody asked for. */
  const [open, setOpen] = useState(true);
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  /* AND A DROPDOWN PER PERSON (Anir, Aug 25: "for each person within the goal,
     I have a dropdown. I should be able to click on sales meetings, and then it
     shows me all the people, but then I can individually click into each
     person"). Opening a goal used to unroll every member's full panel at once,
     which is why three levels of nesting read as one wall. */
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const scoped = scopeStateToPeople(state, members, groupId);
  const goals = scoped.goals;
  const inGroup = (name: string) =>
    members.some((m) => m.toLowerCase() === name.trim().toLowerCase());

  /** Everything waiting on a signature, across the whole group. */
  const waitingAll = state.actuals.filter(
    (a) => inGroup(a.person) && isPending(a)
  );

  return (
    <div className="mt-3 border-t border-border-light pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface"
      >
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-200",
            open ? "text-blue-primary" : "-rotate-90 text-text-tertiary"
          )}
        />
        <ClipboardList size={13} strokeWidth={2.2} className="shrink-0 text-blue-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          The goals this group carries
        </span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-bold text-text-tertiary tnum">
          {goals.length}
        </span>
        {waitingAll.length > 0 && (
          <span className="rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ink-amber)] tnum">
            {waitingAll.length} to verify
          </span>
        )}
      </button>

      {open && (
        <div className="tab-panel mt-2 space-y-2">
          {goals.length === 0 ? (
            <p className="px-1 text-[12.5px] text-text-secondary">
              Nobody in {groupName} carries a goal yet. Assign one on the Goal
              Master and it appears here.
            </p>
          ) : (
            goals.map((goal) => {
              const isOpen = openGoal === goal.id;
              const target = goal.target || 0;
              const achieved = actualValue(scoped.actuals, goal, {
                rates: scoped.rates,
              });
              const pct =
                target > 0
                  ? Math.min(100, Math.round((achieved / target) * 100))
                  : 0;
              /* Who is on it, and what each of them has logged — the answer to
                 "how they're doing on the goals", per person rather than as
                 one group total. */
              const rows = members
                .map((person) => {
                  const theirs = scoped.actuals.filter(
                    (a) => a.goalId === goal.id && a.person === person
                  );
                  const assigned = (goal.assignments ?? []).find(
                    (x) => x.person.toLowerCase() === person.toLowerCase()
                  );
                  if (!theirs.length && !assigned) return null;
                  return {
                    person,
                    share: assigned?.target ?? 0,
                    done: actualValue(theirs, goal, { rates: scoped.rates }),
                    waiting: theirs.filter(isPending),
                  };
                })
                .filter((r): r is NonNullable<typeof r> => !!r);
              const goalWaiting = rows.reduce(
                (n, r) => n + r.waiting.length,
                0
              );

              return (
                /* AN OPEN GOAL IS ONE BLOCK (Anir, Aug 25: "you have to do a
                   better job of separating it because it's really confusing...
                   literally everything from the group all the way down to each
                   individual person has to be easily separated"). The rail and
                   the tint are the deal table's own idiom for "this header and
                   everything under it are the same thing". */
                /* THE SAME IDIOM AS GOAL MASTER (Anir, Aug 29: "where are the
                   fucking icons? When I click on something it should hide it,
                   it should dim the other things. Look at the goals page and do
                   a full audit... and I need the colours too for the goals
                   thing with the icon").

                   Three things brought over from the master rows: the type's
                   coloured icon tile, the rail in that same type colour rather
                   than a flat blue, and the open goal stepping the others back
                   so one goal is obviously the subject. */
                <div
                  key={goal.id}
                  style={{
                    ["--goal-accent" as string]: typeMeta(goal.type).color,
                  }}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-white transition-all",
                    /* THE RAIL, NOT A RAIL AND A BORDER (Anir, Aug 29: "what's
                       wrong with the left line vertical on the left, you see
                       that"). I had put the accent on the border AND kept the
                       inset rail, so the open goal wore a coloured outline with
                       a second thicker line inside it down the left edge —
                       reading as a stray line rather than as one block. Goal
                       Master uses the rail alone; so does this now. */
                    isOpen
                      ? "border-border-light [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                      : "border-border-light",
                    openGoal !== null && !isOpen && "opacity-45 hover:opacity-100"
                  )}
                >
                  {/* THE LINK RIDES THE GOAL'S OWN ROW (Anir, Aug 30: "I
                      don't want this button here, this button should be in the
                      same row as the email prospecting campaign is launched").
                      It used to sit under everything the fold contains, so on a
                      goal with six people you scrolled past all of them to
                      reach the one control that acts on the goal — and it read
                      as belonging to the last person rather than to the goal.

                      A row, not a button, because an anchor cannot live inside
                      a button: the disclosure is its own button and takes the
                      flexible width; the link is a sibling. */}
                  <div
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 transition-colors",
                      isOpen ? "bg-surface" : "hover:bg-surface"
                    )}
                  >
                  <button
                    type="button"
                    onClick={() => setOpenGoal(isOpen ? null : goal.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                  >
                    <ChevronRight
                      size={13}
                      strokeWidth={2.3}
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-text-tertiary transition-transform duration-200",
                        isOpen && "rotate-90 text-[color:var(--goal-accent)]"
                      )}
                    />
                    <TypeIconTile type={goal.type} className="h-7 w-7 rounded-lg" />
                    {/* NAME OVER YEAR, the way the master row stacks it — the
                        drilldown printed the name alone, so two goals of the
                        same name in different years were indistinguishable. */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {goal.name}
                      </span>
                      <span className="block text-[10px] text-text-tertiary tnum">
                        {goal.year}
                      </span>
                    </span>
                    {/* NO CATEGORY CHIP (Anir, Aug 29: "why are the categories
                        there"). The master needs it because that table has no
                        icon column; here the coloured icon already says which
                        type this is, so the chip was the same fact twice and it
                        was eating the width the progress bar needed. */}
                    {target > 0 && (
                      <>
                        {/* THE BAR TAKES THE GOAL'S COLOUR, painted inline.

                            It was `bg-[color:var(--goal-accent)]/15`, and
                            Tailwind cannot apply an opacity modifier to a CSS
                            variable — it compiles to nothing, so the track had
                            no background at all and the bar vanished (Anir:
                            "don't even see progress bar bro"). The hex-alpha
                            suffix is what TypeIconTile already does for the
                            same reason. */}
                        <span
                          className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:flex"
                          style={{ background: tint(typeMeta(goal.type).color, 14) }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: typeMeta(goal.type).color,
                            }}
                          />
                        </span>
                        {/* THE PERCENTAGE, ON EVERY GOAL (Anir, Aug 25: "for
                            each goal, I need to see the percentages too"). The
                            row printed the raw pair and left the reader to do
                            the division. Capped at 100 like every other verdict
                            in the module. */}
                        <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-[color:var(--goal-accent)] tnum">
                          {pct}%
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11.5px] text-text-secondary tnum">
                          {money(achieved, goal.unit)} of {money(target, goal.unit)}
                        </span>
                      </>
                    )}
                    {goalWaiting > 0 && (
                      <span className="shrink-0 rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ink-amber)] tnum">
                        {goalWaiting} to verify
                      </span>
                    )}
                  </button>
                  {/* THE WAY TO ACTUALLY DO SOMETHING ABOUT IT. Reading that a
                      result is waiting and having nowhere to sign it off is
                      what made "1 to verify" a dead number.

                      JUST THE ICON (Anir, Aug 30: "I don't care about the text,
                      I just needed an icon that just says the arrow coming out
                      of the box"). Eight goals meant the same sentence eight
                      times down the column, each one wider than the numbers it
                      followed. This is the app's existing open-elsewhere
                      control, identical to the one in the group row above it —
                      the words live on the tooltip and the aria-label. */}
                  <Link
                    href={`/performance/groups?group=${encodeURIComponent(groupId)}&goal=${encodeURIComponent(goal.id)}`}
                    title={
                      goalWaiting > 0
                        ? `Verify ${goalWaiting} on Group performance`
                        : "Open this goal on Group performance"
                    }
                    aria-label={
                      goalWaiting > 0
                        ? `Verify ${goalWaiting} on ${goal.name} on Group performance`
                        : `Open ${goal.name} on Group performance`
                    }
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <ArrowUpRight size={13} strokeWidth={2.2} />
                  </Link>
                  </div>

                  {isOpen && (
                    <div className="tab-panel border-t border-border-light bg-surface/60 px-3 py-2.5 pl-5">
                      {rows.length === 0 ? (
                        <p className="text-[12px] text-text-secondary">
                          Nobody in this group has logged against it yet.
                        </p>
                      ) : (
                        /* THE SAME PANEL THE PERFORMANCE ROOMS DRAW (Anir,
                           Aug 25: "it should actually show me enough stuff,
                           kind of like how you are showing it on the
                           performance piece... visually pretty similar at
                           least, on people performance or group performance,
                           with that line with the brackets that show the line
                           and the target").

                           Not a lookalike: PersonGoalPanel itself, so the
                           target/counted/waiting cards, the bracketed track
                           with its target marker, month by month and the entry
                           list are the identical thing in both places and
                           cannot drift apart. */
                        <div className="space-y-1.5">
                          {rows.map((r) => {
                            const mine = openPerson === `${goal.id}:${r.person}`;
                            const theirPct =
                              r.share > 0
                                ? Math.min(100, Math.round((r.done / r.share) * 100))
                                : null;
                            return (
                              <div
                                key={r.person}
                                className="overflow-hidden rounded-lg border border-border-light bg-white"
                              >
                                <button
                                  type="button"
                                  aria-expanded={mine}
                                  onClick={() =>
                                    setOpenPerson(mine ? null : `${goal.id}:${r.person}`)
                                  }
                                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface"
                                >
                                  <ChevronRight
                                    size={12}
                                    strokeWidth={2.3}
                                    aria-hidden="true"
                                    className={cn(
                                      "shrink-0 text-text-tertiary transition-transform duration-200",
                                      mine && "rotate-90 text-blue-primary"
                                    )}
                                  />
                                  <Avatar
                                    name={r.person}
                                    className="h-6 w-6 shrink-0 text-[8px]"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                                    {r.person}
                                  </span>
                                  {theirPct !== null && (
                                    <>
                                      <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)] sm:flex">
                                        <span
                                          className="block h-full rounded-full bg-blue-primary"
                                          style={{ width: `${theirPct}%` }}
                                        />
                                      </span>
                                      <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-blue-primary tnum">
                                        {theirPct}%
                                      </span>
                                    </>
                                  )}
                                  <span className="shrink-0 whitespace-nowrap text-[11.5px] text-text-secondary tnum">
                                    {money(r.done, goal.unit)}
                                    {r.share > 0 && <> of {money(r.share, goal.unit)}</>}
                                  </span>
                                  {r.waiting.length > 0 && (
                                    <span className="shrink-0 rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ink-amber)] tnum">
                                      {r.waiting.length} to verify
                                    </span>
                                  )}
                                </button>
                                {mine && (
                                  <div className="tab-panel border-t border-border-light bg-white px-3 py-2.5">
                                    <PersonGoalPanel
                                      goal={goal}
                                      person={r.person}
                                      target={r.share}
                                      done={r.done}
                                      state={state}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
