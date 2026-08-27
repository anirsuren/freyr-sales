"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  Contact as ContactIcon,
  FileSignature,
  FileText,
  Goal,
  Package,
  Presentation,
  Target,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { TypeChip, TypeIconTile, typeMeta } from "@/components/performance/bits";
import { GoalZoom } from "@/components/performance/GoalZoom";
import type { PerformanceState } from "@/lib/performanceShared";
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
  /** A goal's own columns — target, actual, % met — already formatted. */
  goalFacts?: { target?: string; actual?: string; pct: number | null };
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

const BAND_ICON_MAP = {
  opportunities: Target,
  /* Goals wore the meetings calendar and offerings wore the contracts pen —
     each area gets its own glyph. */
  goals: Goal,
  offerings: Package,
  submissions: FileText,
  presentations: Presentation,
  meetings: CalendarClock,
  contacts: ContactIcon,
  leads: UserPlus,
  contracts: FileSignature,
} satisfies Record<string, LucideIcon>;

export type BandIconKey = keyof typeof BAND_ICON_MAP;

/** The names a server page may use. Values are the keys, not the components. */
export const BAND_ICONS = {
  opportunities: "opportunities",
  goals: "goals",
  offerings: "offerings",
  submissions: "submissions",
  presentations: "presentations",
  meetings: "meetings",
  contacts: "contacts",
  leads: "leads",
  contracts: "contracts",
} satisfies Record<BandIconKey, BandIconKey>;

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
  const active =
    live.find((b) => b.key === activeKey) ?? (live.length ? live[0] : null);

  return (
    <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <Briefcase size={15} strokeWidth={2} className="text-blue-primary" />
        {heading ?? `Everything on ${company}`}
        <InfoHint text="Every module that has something on this account, counted in one place: deals, submissions, presentations, meetings, contacts, leads and contracts. Each tab shows that area; Open jumps to the module that owns it." />
      </h2>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">
        {live.length === 0
          ? (emptyLine ?? "Nothing is connected to this account yet.")
          : `${live.length} of ${bands.length} areas have something here.`}
      </p>

      {live.length > 0 && active && (
        <>
          {/* The same strip the offering page uses — counts stay readable in
              one pass even while only one area's rows are showing. */}
          <div role="tablist" className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-border-light">
            {live.map((b) => {
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
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icon size={13.5} strokeWidth={2.2} style={{ color: b.color }} />
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
          </div>

          {/* Keyed so switching areas animates the panel, never the strip. */}
          <div key={active.key} className="tab-panel" data-c360-band={active.key}>
            {active.items.some((i) => i.goalFacts) ? (
              /* GOALS ARE A TABLE, BECAUSE THE GOALS PAGE IS ONE (Anir,
                 Aug 27, on the loose-list first cut: "what the fuck is this
                 ui"). Rows with no target were collapsing to a bare title
                 while their neighbours stacked three lines — ragged. The
                 goals page keeps every row the same shape and prints "·"
                 where a number is not set, so this does exactly that: tile,
                 name and chip, then Target / Actual / Progress columns. */
              <div className="overflow-x-auto">
                <table className="mt-1 w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-border-light">
                      {["Goal", "Target", "Actual", "Progress"].map((h) => (
                        <th
                          key={h}
                          className="py-2 pr-4 text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {active.items.slice(0, 8).map((item) => {
                      const goalOpen = openGoal === item.id;
                      const accent = item.goalType
                        ? typeMeta(item.goalType).color
                        : active.color;
                      return (
                      <Fragment key={item.id}>
                      {/* ROWS FOLD OPEN, like the goals page's (Anir, Aug 27:
                          "I want the drop down too. But there doesn't have
                          to be so much detail as goals"). Row click toggles;
                          the name stays the link — the standing grammar. */}
                      {/* THE ROW IS THE ORG GOALS TABLE'S ROW (Anir, Aug 27:
                          "the fucking table is still not the same... there's
                          some weird thing with this weird arrow there"). The
                          goals table has NO chevron — the row itself toggles
                          and the name is the link — so neither does this.
                          Same open treatment: tint plus a rail in the type's
                          own colour, via the same CSS variable. */}
                      <tr
                        onClick={() => setOpenGoal(goalOpen ? null : item.id)}
                        aria-expanded={goalOpen}
                        className={cn(
                          "cursor-pointer transition-all hover:bg-surface",
                          goalOpen &&
                            "bg-surface [box-shadow:inset_3px_0_0_0_var(--goal-accent)]",
                          openGoal !== null && !goalOpen && "opacity-45 hover:opacity-100"
                        )}
                        style={{ ["--goal-accent" as string]: accent }}
                      >
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-3">
                            {item.goalType && <TypeIconTile type={item.goalType} />}
                            <span className="flex min-w-0 flex-col gap-1.5">
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
                              {/* In a flex ROW, so the pill hugs its words —
                                  as a bare flex-column child it stretched to
                                  the widest line and read as a banner (Anir,
                                  Aug 27: "look how big the pill is"). */}
                              {item.goalType && (
                                <span className="flex flex-wrap items-center gap-2">
                                  <TypeChip type={item.goalType} size="sm" />
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-[12.5px] font-semibold tnum text-text-primary">
                          {item.goalFacts?.target ?? (
                            <span className="font-normal text-text-tertiary">·</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-[12.5px] font-semibold tnum text-text-primary">
                          {item.goalFacts?.actual ?? (
                            <span className="font-normal text-text-tertiary">·</span>
                          )}
                        </td>
                        <td className="w-[30%] min-w-[170px] py-2.5">
                          {item.goalFacts?.pct !== null &&
                          item.goalFacts?.pct !== undefined ? (
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border-light">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.max(2, Math.min(100, item.goalFacts.pct))}%`,
                                    background: item.goalType
                                      ? typeMeta(item.goalType).color
                                      : active.color,
                                  }}
                                />
                              </span>
                              <span className="shrink-0 text-[11.5px] font-semibold tnum text-text-secondary">
                                {item.goalFacts.pct}%
                              </span>
                            </span>
                          ) : (
                            <span className="text-[12px] text-text-tertiary">·</span>
                          )}
                        </td>
                      </tr>
                      {goalOpen && (
                        <tr className="!border-t-0">
                          {/* The goals page's own drawer: rail carried down
                              on the same CSS variable, top padding gone so
                              row and drill read as one block, and the
                              tab-panel entrance — the SAME animation the
                              goals table plays (Anir, Aug 27: "the animation
                              isn't the same"). */}
                          <td
                            colSpan={4}
                            className="px-2 pb-4 pt-0 [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                            style={{ ["--goal-accent" as string]: accent }}
                          >
                          <div className="tab-panel space-y-3 pb-2 pl-3.5 pt-1">
                            {/* THE GOALS PAGE ITSELF, not a lookalike
                                (Anir, Aug 27: "it should look the exact
                                same as the goals page... literally just
                                copy this — I honestly think you just need
                                the person"). This IS GoalZoom — the exact
                                component a goals-page row unfolds into —
                                in its solo-person mode: the period rail,
                                the granularity picker, the period folds,
                                minus boxes 2 and 3. Every number is this
                                person's, because the state it gets holds
                                only their entries and their target. */}
                            {item.goalDrill ? (
                              <GoalZoom
                                embedded
                                soloPerson={item.goalDrill.person}
                                state={item.goalDrill.state}
                                goalId={item.goalDrill.goalId}
                                meName={item.goalDrill.person}
                              />
                            ) : (
                              <p className="text-[12px] text-text-secondary">
                                Nothing logged on this goal yet.
                              </p>
                            )}
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
            ) : (
            <ul className="mt-1 divide-y divide-border-light">
              {active.items.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  {/* The module's own left mark: a company brings its logo,
                      an offering its category-coloured tile. */}
                  {item.logo ? (
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
            {(active.count > 8 || active.href) && (
              <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border-light pt-2 text-[12px] text-text-tertiary">
                <span>
                  {active.count > 8 ? `and ${active.count - 8} more` : "\u00A0"}
                </span>
                {active.href && (
                  <Link
                    href={active.href}
                    className="font-semibold text-blue-primary hover:underline"
                  >
                    {active.hrefLabel ?? "Open"} &rsaquo;
                  </Link>
                )}
              </p>
            )}
          </div>
        </>
      )}

      {/* Empty bands, named rather than silent — the gap is the useful part. */}
      {bands.some((b) => b.count === 0) && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Nothing yet on:{" "}
          {bands
            .filter((b) => b.count === 0)
            .map((b) => b.label.toLowerCase())
            .join(", ")}
          .
        </p>
      )}
    </section>
  );
}
