"use client";

import Link from "next/link";
import { CircleCheck, Clock3, ShieldAlert } from "lucide-react";
import { ExpandedChartControl } from "@/components/charts/ExpandedChartModal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { HoverCard } from "@/components/ui/HoverCard";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_PROBABILITY,
  formatMoney,
  type Deal,
  type Stage,
} from "@/lib/pipeline";
import { formatDateTime } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   FORECAST RISK, rebuilt to the standard of the By-stage block directly above
   it (Suren, Jul 27: "it just looks atrocious… the colours don't match and it
   looks very outdated").

   What was wrong, and what replaced it:

   1. THE PALETTE WASN'T THIS APP'S. A traffic-light green→orange coverage bar,
      a pale-green ACTIVE box beside a pale-orange EXPOSED box, and orange-on-
      pale-orange count pills. Nothing here is amber, yellow or orange now.
      There is ONE measure, weighted commit, drawn in the app's measure blue,
      and red is EARNED, only by the part of it that has genuinely gone past
      the quiet line. Same rule the deal page's runway track follows.

   2. IT WASN'T A CHART. Two big numbers, one flat bar, and a pair of bar/pie
      icon toggles that read as leftover debug controls. It now leads with a
      real plot in the idiom of the By-stage columns above: a stretchy track,
      each bar's value label pinned to ITS OWN bar, units at rest, and a hover
      breakdown naming the actual deal.

   3. NUMBERS WERE FLUNG FROM THEIR LABELS. "53% of risk · $610K open" was a
      tiny gray two-line clump hard right, miles from the company it described.
      Every number in here now sits immediately after the thing it measures.

   4. THE LIST WAS A PLAIN LIST. The rows now carry the company's logo, the
      contact's headshot on one unbroken line with their name, the offering as
      its own coloured ServiceTag, the stage as its stage-coloured + glyphed
      chip, the quiet time as a semantic pill, and the money right beside the
      share bar that proportions it.

   HONESTY: every figure comes off a field this page already derives,
   `Deal.value`, `Deal.staleDays`, `Deal.stage`, and STAGE_PROBABILITY. No
   benchmark, no trend, no "typical" comparison, nothing bucketed into being.

   ── Jul 28 pass ────────────────────────────────────────────────────────────
   5. THE DAY-COUNT COLUMN CHART WAS THE WRONG PICTURE. Suren: "that's a very
      poor way of showing that… you're trying to show how many days each one
      has been since the last touch". A column per deal made each count a
      standalone tower with nothing to read it against, the only comparison
      on offer was deal-to-deal height. It is now a QUIET PLOT: one row per
      open deal on ONE shared day axis, a dot at that deal's `staleDays`, and
      the quiet line drawn straight down the plot as a labelled threshold, so
      "how far past the line is this deal" is the shape you see first. Blue at
      or under the line, red past it. Every mark is one real deal's staleDays
     , no buckets, no averages, no benchmark.

   6. THE "DEALS DRIVING THE RISK" ROWS FLOATED IN DEAD SPACE. Suren: "why is
      there so much space in between them?" Each row was `flex-1`, so three or
      four rows stretched to swallow the whole panel and every row became a
      card adrift. Rows now take their natural height and sit tight; the
      PANEL absorbs the slack, and a footer line closes the block off.
--------------------------------------------------------------------------- */

/** The measure. Every dollar in this section is weighted commit, drawn blue. */
const MEASURE = "#0071E3";
/** Real red, EARNED only once a deal has actually gone past the quiet line. */
const RISK = "#C2410C";
/** The all-clear. Only ever shown when there is genuinely nothing exposed. */
const CLEAR = "#1A7A35";

/** Panel shell — the same parts DealFacts and DealSnapshot are built from, so
 *  the bands across the app can't drift apart. */
const PANEL =
  "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border-light";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

/** How many open deals the quiet plot can show before the rows stop being
 *  readable. Sorted quietest-first, so the exposed end is always in view. */
const QUIET_ROWS = 12;

/** How many quiet deals the exposure list names before it hands off to the
 *  pipeline. Rows are natural-height now, so the panel can carry five. */
const DRIVING_ROWS = 5;

/* --- Quiet-plot geometry --------------------------------------------------
   The name column, the value column and the gap between them are FIXED pixel
   widths so the quiet line can be positioned in the same coordinate space as
   every dot with one `calc()`, without them the threshold would have to be
   redrawn per row and could never be one continuous rule. */
const NAME_W = 128;
const VALUE_W = 58;
const COL_GAP = 10;
const GUTTER = NAME_W + VALUE_W + COL_GAP * 2;
const PLOT_COLS = `${NAME_W}px minmax(0,1fr) ${VALUE_W}px`;
/** x for a fraction of the shared day axis, in the whole plot's coordinates. */
const axisX = (frac: number) =>
  `calc(${NAME_W + COL_GAP}px + (100% - ${GUTTER}px) * ${frac})`;

/** A readable tick spacing for a day axis that runs 0 → `m`. */
const tickStep = (m: number) =>
  m <= 12 ? 2 : m <= 30 ? 5 : m <= 70 ? 10 : m <= 160 ? 25 : 50;

/** Days at rest, in words a rep would say out loud. */
const idleLabel = (days: number) =>
  days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;

const weightedOf = (d: Deal) => d.value * (STAGE_PROBABILITY[d.stage] ?? 0);
const oddsOf = (d: Deal) => Math.round((STAGE_PROBABILITY[d.stage] ?? 0) * 100);
const shortStage = (stage: Stage) =>
  stage === "Meeting Booked" ? "Meeting" : stage;

/** The stage's own colour + its own glyph — a stage is a status chip, and a
 *  status chip is never plain type on a plain background (standing rule). */
function StageChip({ stage }: { stage: Stage }) {
  const Icon = STAGE_ICON[stage];
  const color = STAGE_COLOR[stage];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-1 pr-2 text-[10px] font-semibold leading-tight"
      style={{ color, background: `${color}14` }}
    >
      <span
        className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        <Icon size={9} strokeWidth={2.4} />
      </span>
      {shortStage(stage)}
    </span>
  );
}

// These row popovers use HoverCard's default open delay — the app-wide second
// (graph tips elsewhere pass 0 and stay instant).

export function ForecastRisk({
  open,
  commit,
  activeWeighted,
  riskWeighted,
  riskPct,
  rottingDays,
}: {
  /** Every open deal in the book — real records, nothing synthesised. */
  open: Deal[];
  /** Probability-weighted commit across the open book. */
  commit: number;
  /** The share of `commit` on deals touched inside the quiet line. */
  activeWeighted: number;
  /** The share of `commit` on deals that have gone past it. */
  riskWeighted: number;
  riskPct: number;
  /** ROTTING_DAYS — the quiet line, in days. */
  rottingDays: number;
}) {
  const quiet = open
    .filter((d) => d.staleDays > rottingDays)
    .sort((a, b) => weightedOf(b) - weightedOf(a));
  const warm = open
    .filter((d) => d.staleDays <= rottingDays)
    .sort((a, b) => weightedOf(b) - weightedOf(a));
  const activePct = Math.max(0, 100 - riskPct);
  const clear = quiet.length === 0;

  // ── THE QUIET PLOT ─────────────────────────────────────────────────────────
  // One ROW per open deal, all of them on ONE day axis, with the quiet line
  // drawn down the plot. The question this answers is not "how many days is
  // this deal" (a column chart already failed at that) — it is "how far past
  // the line is each deal", which only a shared axis with the line ON it can
  // show. Quietest first, so the exposed end is the first thing read.
  const shown = [...open]
    .sort((a, b) => b.staleDays - a.staleDays || weightedOf(b) - weightedOf(a))
    .slice(0, QUIET_ROWS);
  const maxIdle = shown.reduce((n, d) => Math.max(n, d.staleDays), 0);
  // The axis always runs past the quiet line, so the line can never be pinned
  // to the right edge and read as "the end of the scale".
  const step = tickStep(Math.max(maxIdle, rottingDays + 2));
  const axisMax = Math.max(
    step,
    Math.ceil(Math.max(maxIdle, rottingDays + 2) / step) * step
  );
  const ticks = Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, i) =>
    Math.min(i * step, axisMax)
  );
  const quietFrac = rottingDays / axisMax;
  // One company can carry more than one open deal, and every row here was
  // labelled with just the company, so the same name appeared twice with no way
  // to tell the two apart (Anir, Jul 28: "Why does it say bionics twice?").
  // Where a name repeats, the row also names the offering that deal is for,
  // which is the field that actually distinguishes them.
  const companyCounts = shown.reduce<Record<string, number>>((acc, d) => {
    acc[d.company] = (acc[d.company] ?? 0) + 1;
    return acc;
  }, {});
  const marks = shown.map((d) => ({
    deal: d,
    past: d.staleDays > rottingDays,
    // The mark IS the record: one deal's own staleDays against the axis.
    pct: (d.staleDays / axisMax) * 100,
    /** Only set when this company has more than one open deal on the plot. */
    disambiguator: companyCounts[d.company] > 1 ? d.service : "",
  }));

  // ── WHERE THE EXPOSED MONEY SITS ───────────────────────────────────────────
  // The same exposed dollars, cut by stage instead of by deal. A different
  // question from the plot, not a restatement of it.
  const exposureByStage = (
    Object.keys(STAGE_COLOR) as Stage[]
  )
    .map((stage) => {
      const ds = quiet.filter((d) => d.stage === stage);
      return {
        stage,
        deals: ds,
        weighted: ds.reduce((sum, d) => sum + weightedOf(d), 0),
      };
    })
    .filter((s) => s.weighted > 0)
    .sort((a, b) => b.weighted - a.weighted);

  // ── THE RANKED EXPOSURE ────────────────────────────────────────────────────
  const driving = quiet.slice(0, DRIVING_ROWS);
  const drivingWeighted = driving.reduce((sum, d) => sum + weightedOf(d), 0);
  const drivingShare =
    riskWeighted > 0 ? Math.round((drivingWeighted / riskWeighted) * 100) : 0;

  /** The deals behind one half of the split track — the real records, never a
   *  bare percentage. */
  const splitHover = (
    title: string,
    note: string,
    money: number,
    color: string,
    list: Deal[]
  ) => (
    <div>
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {title}
        <span className="ml-auto tnum" style={{ color }}>
          {formatMoney(money)}
        </span>
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">
        {note}
      </p>
      {list.length > 0 && (
        <div className="mt-2.5 space-y-1.5 border-t border-border-light pt-2.5">
          {list.slice(0, 6).map((d) => (
            <div key={d.sessionId} className="flex items-center gap-2 text-[12px]">
              <CompanyLogo
                name={d.company}
                className="h-[18px] w-[18px] shrink-0 text-[7px]"
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-medium text-text-primary">
                  {d.company}
                </span>
                <span className="block text-[10.5px] text-text-secondary tnum">
                  {d.staleDays === 0 ? "touched today" : `${d.staleDays}d inactive`}
                </span>
              </span>
              <span className="shrink-0 text-text-secondary tnum">
                {formatMoney(weightedOf(d))}
              </span>
            </div>
          ))}
          {list.length > 6 && (
            <p className="text-[10.5px] text-text-secondary">
              +{list.length - 6} more
            </p>
          )}
        </div>
      )}
    </div>
  );

  /** The real record behind one mark on the quiet plot — the whole deal, not a
   *  restatement of the day count the row already shows at rest. */
  const quietHover = (d: Deal) => {
    const past = d.staleDays > rottingDays;
    const tone = past ? RISK : MEASURE;
    return (
      <div>
        <div className="flex items-start gap-2.5">
          <CompanyLogo
            name={d.company}
            className="h-9 w-9 shrink-0 text-[8px]"
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-text-primary">
              {d.company}
            </p>
            <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[10.5px] text-text-secondary">
              <Avatar
                name={d.contactName}
                className="mt-[1px] h-4 w-4 shrink-0 text-[6px]"
              />
              <span className="min-w-0 leading-snug break-normal">
                {d.contactName}
                {d.title ? ` · ${d.title}` : ""}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ServiceTag name={d.service} className="max-w-full text-[11px]" />
          <StageChip stage={d.stage} />
        </div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
          <div>
            <p className="text-[12px] font-bold tnum" style={{ color: tone }}>
              {d.staleDays}d
            </p>
            <p className="text-[9px] text-text-secondary">Since last touch</p>
          </div>
          <div>
            <p className="text-[12px] font-bold text-text-primary tnum">
              {formatMoney(d.value)}
            </p>
            <p className="text-[9px] text-text-secondary">Full value</p>
          </div>
          <div>
            <p className="text-[12px] font-bold text-text-primary tnum">
              {oddsOf(d)}%
            </p>
            <p className="text-[9px] text-text-secondary">Odds of closing</p>
          </div>
        </div>
        <div className="mt-2.5 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Owner</span>
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-text-primary">
              <Avatar
                name={d.owner}
                className="h-4 w-4 shrink-0 text-[6px]"
              />
              {d.owner}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Last logged touch</span>
            <span className="font-medium text-text-primary tnum">
              {formatDateTime(d.lastActivity)}
            </span>
          </div>
        </div>
        <p className="mt-2.5 border-t border-border-light pt-2.5 text-[11px] leading-relaxed text-text-secondary">
          {past
            ? `${d.staleDays - rottingDays} ${
                d.staleDays - rottingDays === 1 ? "day" : "days"
              } past the ${rottingDays}-day inactivity threshold. Weighted commit on this deal: ${formatMoney(
                weightedOf(d)
              )}.`
            : `Last activity ${d.staleDays === 0 ? "today" : `${d.staleDays} ${d.staleDays === 1 ? "day" : "days"} ago`}, inside the ${rottingDays}-day inactivity threshold. Weighted commit on this deal: ${formatMoney(
                weightedOf(d)
              )}.`}
        </p>
      </div>
    );
  };

  const quietPlotItems = marks.map(({ deal, past, disambiguator }) => ({
    key: deal.sessionId,
    label: `${deal.company}${disambiguator ? ` · ${disambiguator}` : ""}`,
    color: past ? RISK : MEASURE,
  }));

  const renderExpandedQuietPlot = (visibleKeys: readonly string[]) => {
    const visible = new Set(visibleKeys);
    const visibleMarks = marks.filter(({ deal }) => visible.has(deal.sessionId));
    if (visibleMarks.length === 0) {
      return (
        <div className="flex min-h-[320px] items-center justify-center text-[13px] text-text-secondary">
          Select at least one deal to show its inactivity.
        </div>
      );
    }

    const expandedMaxIdle = visibleMarks.reduce(
      (n, { deal }) => Math.max(n, deal.staleDays),
      0
    );
    const expandedStep = tickStep(
      Math.max(expandedMaxIdle, rottingDays + 2)
    );
    const expandedAxisMax = Math.max(
      expandedStep,
      Math.ceil(
        Math.max(expandedMaxIdle, rottingDays + 2) / expandedStep
      ) * expandedStep
    );
    const expandedTicks = Array.from(
      { length: Math.floor(expandedAxisMax / expandedStep) + 1 },
      (_, i) => Math.min(i * expandedStep, expandedAxisMax)
    );
    const thresholdPct = (rottingDays / expandedAxisMax) * 100;

    return (
      <div className="py-3">
        <div className="mb-3 grid grid-cols-[minmax(160px,230px)_minmax(0,1fr)_76px] items-end gap-4">
          <span />
          <span className="relative h-6">
            <span
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold leading-none tnum"
              style={{
                left: `${thresholdPct}%`,
                color: RISK,
                background: `${RISK}14`,
              }}
            >
              {rottingDays}-day threshold
            </span>
          </span>
          <span />
        </div>

        <div className="space-y-1">
          {visibleMarks.map(({ deal, past, disambiguator }) => {
            const tone = past ? RISK : MEASURE;
            const pct = (deal.staleDays / expandedAxisMax) * 100;
            return (
              <Link
                key={deal.sessionId}
                href={`/deals/${deal.sessionId}`}
                className="group grid grid-cols-[minmax(160px,230px)_minmax(0,1fr)_76px] items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border-light hover:bg-surface"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo
                    name={deal.company}
                    className="h-8 w-8 shrink-0 text-[8px]"
                  />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[12.5px] font-semibold text-text-primary">
                      {deal.company}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-text-tertiary">
                      {disambiguator || deal.service}
                    </span>
                  </span>
                </span>
                <span className="relative block h-9">
                  <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface" />
                  <span
                    className="chart-grow-x absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
                    style={{ width: `${pct}%`, background: tone }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 z-[1] w-px"
                    style={{
                      left: `${thresholdPct}%`,
                      backgroundImage: `repeating-linear-gradient(to bottom, ${RISK} 0 4px, transparent 4px 8px)`,
                    }}
                  />
                  <span
                    className="absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${pct}%`,
                      marginLeft: -7,
                      background: tone,
                      boxShadow: `0 0 0 4px ${tone}26`,
                    }}
                  />
                </span>
                <span
                  className="text-right text-[12px] font-bold tnum"
                  style={{ color: tone }}
                >
                  {idleLabel(deal.staleDays)}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-[minmax(160px,230px)_minmax(0,1fr)_76px] gap-4 px-3">
          <span />
          <span className="relative h-5 border-t border-border-light">
            {expandedTicks.map((t, i) => (
              <span
                key={t}
                className="absolute top-1 text-[10px] leading-none text-text-tertiary tnum"
                style={{
                  left: `${(t / expandedAxisMax) * 100}%`,
                  transform:
                    i === 0
                      ? "translateX(0)"
                      : i === expandedTicks.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {i === expandedTicks.length - 1 ? `${t} days` : t}
              </span>
            ))}
          </span>
          <span />
        </div>
      </div>
    );
  };

  /** A legend line for one half of the split: dot, glyph, label, then its own
   *  number immediately after it. */
  const SplitRead = ({
    color,
    Icon,
    label,
    money,
    pct,
    note,
    list,
    hover,
  }: {
    color: string;
    Icon: typeof CircleCheck;
    label: string;
    money: number;
    pct: number;
    note: string;
    list: Deal[];
    hover: React.ReactNode;
  }) => (
    <HoverCard
      // Opens off the row's RIGHT EDGE — clear of this panel entirely — not
      // at the pointer. A pointer-anchored card lands wherever the cursor
      // happens to be, which on a full-width row is straight on top of the
      // thing it describes (Anir, Jul 28: "it should only show the pop-up
      // right after the dot, it's covering up the graph").
      side="right"
      anchor="trigger"
      width={280}
      content={hover}
      className="min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface)]"
    >
      <span className="flex items-center gap-1.5">
        <span
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: color }}
        >
          <Icon size={11} strokeWidth={2.3} />
        </span>
        <span className="text-[11.5px] font-semibold" style={{ color }}>
          {label}
        </span>
        <span className="text-[13px] font-bold text-text-primary tnum">
          {formatMoney(money)}
        </span>
        <span className="text-[11px] font-semibold text-text-secondary tnum">
          {pct}%
        </span>
      </span>
      <span className="mt-0.5 block text-[10.5px] leading-snug text-text-secondary">
        {list.length} {list.length === 1 ? "deal" : "deals"} · {note}
      </span>
    </HoverCard>
  );

  return (
    <div className="border-t border-border-light pt-5 xl:col-span-2 xl:mt-5">
      {/* ── HEADING ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Forecast risk
            </h2>
            <InfoHint
              text={`Your weighted commit, split by how recently each deal was actually touched. A deal that has had no logged call, email or note for more than ${rottingDays} days counts as exposed.`}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            How much of the number is still being worked, and which deals are
            drifting
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            color: clear ? CLEAR : RISK,
            background: `${clear ? CLEAR : RISK}14`,
          }}
        >
          {clear ? <CircleCheck size={13} /> : <ShieldAlert size={13} />}
          {clear ? (
            <>Every open deal was touched in the last {rottingDays} days</>
          ) : (
            <span className="tnum">
              {quiet.length} of {open.length} open deals: no activity in {rottingDays}+ days
            </span>
          )}
        </span>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {/* ── LEFT — the measure, split, then plotted deal by deal ───────── */}
        <section className={PANEL}>
          <div className="flex min-h-[54px] items-start justify-between gap-3 border-b border-border-light px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[13.5px] font-semibold text-text-primary">
                  Active vs exposed
                </h3>
                <InfoHint
                  text={`Your weighted commit, split at the ${rottingDays}-day inactivity threshold. Hover either half, or any bar, to see the deals behind it.`}
                />
              </div>
              <p className="mt-0.5 text-[10.5px] text-text-secondary">
                The same {formatMoney(commit)} of weighted commit, split by how
                recently it was worked
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col p-4">
            {/* ONE measure, ONE track, split two ways. Blue is the measure;
                red is the part of it that has earned red. */}
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface">
              {activeWeighted > 0 && (
                <div className="h-full" style={{ width: `${Math.max(activePct, 2)}%` }}>
                  <HoverCard
                    side="top"
                    width={288}
                    className="h-full w-full cursor-pointer"
                    content={splitHover(
                      "Active",
                      `Touched within the last ${rottingDays} days. ${activePct}% of the weighted commit.`,
                      activeWeighted,
                      MEASURE,
                      warm
                    )}
                  >
                    <span
                      className="chart-grow-x block h-full w-full"
                      style={{ background: MEASURE }}
                    />
                  </HoverCard>
                </div>
              )}
              {riskWeighted > 0 && (
                <div className="h-full" style={{ width: `${Math.max(riskPct, 2)}%` }}>
                  <HoverCard
                    side="top"
                    width={288}
                    className="h-full w-full cursor-pointer"
                    content={splitHover(
                      "Exposed",
                      `No logged activity in over ${rottingDays} days: ${riskPct}% of the weighted commit.`,
                      riskWeighted,
                      RISK,
                      quiet
                    )}
                  >
                    <span
                      className="chart-grow-x block h-full w-full"
                      style={{ background: RISK, animationDelay: "0.12s" }}
                    />
                  </HoverCard>
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-start gap-x-2">
              <SplitRead
                color={MEASURE}
                Icon={CircleCheck}
                label="Active"
                money={activeWeighted}
                pct={activePct}
                note={`touched in the last ${rottingDays} days`}
                list={warm}
                hover={splitHover(
                  "Active",
                  `Touched within the last ${rottingDays} days. ${activePct}% of the weighted commit.`,
                  activeWeighted,
                  MEASURE,
                  warm
                )}
              />
              <SplitRead
                color={RISK}
                Icon={ShieldAlert}
                label="Exposed"
                money={riskWeighted}
                pct={riskPct}
                note={`no activity in over ${rottingDays} days`}
                list={quiet}
                hover={splitHover(
                  "Exposed",
                  `No logged activity in over ${rottingDays} days: ${riskPct}% of the weighted commit.`,
                  riskWeighted,
                  RISK,
                  quiet
                )}
              />
            </div>

            {/* WHERE THE EXPOSED MONEY IS SITTING — the same exposed dollars,
                cut by stage instead of by deal. A different question from the
                plot below, not a restatement of it. Lives beside the split it
                belongs to, so the money view is one block. */}
            {exposureByStage.length > 0 && (
              <div className="mt-3 border-t border-border-light pt-3">
                <p className={`${EYEBROW} mb-2`}>
                  Which stages the exposed commit is sitting in
                </p>
                <div className="space-y-1.5">
                  {exposureByStage.map((s) => {
                    const share =
                      riskWeighted > 0
                        ? Math.round((s.weighted / riskWeighted) * 100)
                        : 0;
                    const Icon = STAGE_ICON[s.stage];
                    const color = STAGE_COLOR[s.stage];
                    return (
                      <HoverCard
                        key={s.stage}
                        side="right"
                        width={272}
                        className="cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--surface)]"
                        content={splitHover(
                          s.stage,
                          `${s.deals.length} inactive ${
                            s.deals.length === 1 ? "deal" : "deals"
                          } on ${s.stage}: ${share}% of the exposed commit.`,
                          s.weighted,
                          color,
                          s.deals
                        )}
                      >
                        <span className="flex items-center gap-2 text-[11px]">
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ background: color }}
                          >
                            <Icon size={9} strokeWidth={2.4} />
                          </span>
                          <span className="min-w-0 flex-1 font-semibold text-text-primary">
                            {shortStage(s.stage)}
                          </span>
                          <span className="shrink-0 font-bold text-text-primary tnum">
                            {formatMoney(s.weighted)}
                          </span>
                          <span className="w-9 shrink-0 text-right text-text-secondary tnum">
                            {share}%
                          </span>
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface">
                          <span
                            className="chart-grow-x block h-full rounded-full"
                            style={{ width: `${share}%`, background: color }}
                          />
                        </span>
                      </HoverCard>
                    );
                  })}
                </div>
              </div>
            )}

            {/* THE QUIET PLOT — every open deal on ONE day axis, with the
                quiet line drawn through it. A column chart of the same numbers
                could only be read deal-against-deal; here the eye lands on the
                line first and every dot to its right is, visibly, exposed. */}
            <div className="mt-3 flex flex-1 flex-col justify-end border-t border-border-light pt-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className={EYEBROW}>Days since the last touch</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10.5px] text-text-secondary tnum">
                    {open.length > QUIET_ROWS
                      ? `the ${shown.length} longest-inactive of ${open.length} open deals`
                      : `all ${open.length} open ${open.length === 1 ? "deal" : "deals"}`}
                  </p>
                  {marks.length > 0 && (
                    <ExpandedChartControl
                      title="Days since the last touch"
                      subtitle={`Every visible open deal shares one day axis. The ${rottingDays}-day line separates actively worked deals from exposed deals.`}
                      items={quietPlotItems}
                      itemNoun="series"
                      renderExpanded={renderExpandedQuietPlot}
                      className="h-8 px-2.5 text-[11.5px]"
                    />
                  )}
                </div>
              </div>
              {marks.length > 0 ? (
                <div
                  role="img"
                  aria-label={`Days since the last touch, on a shared 0 to ${axisMax} day axis with the ${rottingDays}-day inactivity threshold marked: ${marks
                    .map((m) => `${m.deal.company} ${m.deal.staleDays} days`)
                    .join(", ")}`}
                >
                  {/* The threshold, named out loud and sitting exactly over the
                      rule it labels. */}
                  <div className="relative mb-1 h-[17px]">
                    <span
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold leading-tight tnum"
                      style={{ left: axisX(quietFrac), color: RISK, background: `${RISK}14` }}
                    >
                      {rottingDays}-day threshold
                    </span>
                  </div>

                  <div className="relative">
                    {marks.map(({ deal, past, pct, disambiguator }) => {
                      const tone = past ? RISK : MEASURE;
                      return (
                        <HoverCard
                          key={deal.sessionId}
                          // The card opens off the ROW'S RIGHT EDGE, which is
                          // the right edge of this whole panel — so it lands
                          // beside the plot, never on it. Anchoring to the
                          // cursor put it wherever the pointer was, i.e. in
                          // the middle of the chart (Anir, Jul 28: "it should
                          // only show the pop-up right after the dot, it's
                          // covering up the graph").
                          side="right"
                          width={300}
                          anchor="trigger"
                          className="cursor-pointer rounded-md transition-colors hover:bg-[var(--surface)]"
                          content={quietHover(deal)}
                        >
                          <span
                            className="grid items-center py-[3px]"
                            style={{
                              gridTemplateColumns: PLOT_COLS,
                              columnGap: COL_GAP,
                            }}
                          >
                            {/* The row names its own deal — a plot of anonymous
                                dots would be the same failure again. */}
                            <span className="flex min-w-0 items-center gap-1.5">
                              <CompanyLogo
                                name={deal.company}
                                className="h-[18px] w-[18px] shrink-0 text-[6px]"
                              />
                              <span className="flex min-w-0 flex-col leading-tight">
                                <span className="min-w-0 break-normal text-[10.5px] font-medium text-text-primary">
                                  {deal.company}
                                </span>
                                {disambiguator && (
                                  <span className="min-w-0 break-normal text-[9px] text-text-tertiary">
                                    {disambiguator}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="relative block h-[18px]">
                              {/* the axis at rest, 0 → axisMax */}
                              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-surface" />
                              {/* the stem, 0 → this deal's own idle days */}
                              <span
                                className="chart-grow-x absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                                style={{ width: `${pct}%`, background: tone }}
                              />
                              {/* the mark itself */}
                              <span
                                className="absolute top-1/2 z-[2] h-[11px] w-[11px] -translate-y-1/2 rounded-full"
                                style={{
                                  left: `${pct}%`,
                                  marginLeft: -5.5,
                                  background: tone,
                                  boxShadow: `0 0 0 3px ${tone}26`,
                                }}
                              />
                            </span>
                            <span
                              className="text-right text-[10.5px] font-semibold leading-tight tnum"
                              style={{ color: tone }}
                            >
                              {idleLabel(deal.staleDays)}
                            </span>
                          </span>
                        </HoverCard>
                      );
                    })}
                    {/* One continuous quiet line across every row. Drawn after
                        the rows so a row's hover wash can't paint over it; the
                        dots carry z-[2] so they still ride on top of it. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 z-[1] w-px"
                      style={{
                        left: axisX(quietFrac),
                        backgroundImage: `repeating-linear-gradient(to bottom, ${RISK} 0 3px, transparent 3px 7px)`,
                      }}
                    />
                  </div>

                  {/* The axis, labelled in days at rest. */}
                  <div
                    className="mt-1 grid"
                    style={{ gridTemplateColumns: PLOT_COLS, columnGap: COL_GAP }}
                  >
                    <span />
                    <span className="relative block h-[14px] border-t border-border-light">
                      {ticks.map((t, i) => (
                        <span
                          key={t}
                          className="absolute top-[2px] text-[9.5px] leading-tight text-text-tertiary tnum"
                          style={{
                            left: `${(t / axisMax) * 100}%`,
                            transform:
                              i === 0
                                ? "translateX(0)"
                                : i === ticks.length - 1
                                ? "translateX(-100%)"
                                : "translateX(-50%)",
                          }}
                        >
                          {i === ticks.length - 1 ? `${t} days` : t}
                        </span>
                      ))}
                    </span>
                    <span />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: MEASURE }}
                      />
                      Touched in the last {rottingDays} days
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: RISK }}
                      />
                      No activity in over {rottingDays} days
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-3 w-px shrink-0"
                        style={{
                          backgroundImage: `repeating-linear-gradient(to bottom, ${RISK} 0 3px, transparent 3px 7px)`,
                        }}
                      />
                      Everything right of the line is exposed
                    </span>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-[12px] text-text-secondary">
                  There are no open deals in the book yet, so there is nothing to
                  measure.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── RIGHT — the deals carrying the exposure ────────────────────── */}
        <section className={PANEL}>
          <div className="flex min-h-[54px] items-start justify-between gap-3 border-b border-border-light px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[13.5px] font-semibold text-text-primary">
                  Deals driving the risk
                </h3>
                <InfoHint text="The inactive deals carrying the most weighted commit. The bar under each row is that deal's share of the total exposed commit." />
              </div>
              <p className="mt-0.5 text-[10.5px] text-text-secondary">
                Biggest exposure first, hover a row for the full record
              </p>
            </div>
          </div>

          {driving.length > 0 ? (
            <>
            {/* A LIST, not a stack of cards. The rows used to be `flex-1` so
                they would "absorb slack", which ballooned three rows into
                three floating slabs (Suren: "why is there so much space in
                between them?"). Rows now take their natural height and sit
                tight; the panel keeps whatever height the grid gives it and
                the footer below closes the block. */}
            <div className="flex flex-col divide-y divide-border-light">
              {driving.map((deal) => {
                const weighted = weightedOf(deal);
                const share =
                  riskWeighted > 0
                    ? Math.round((weighted / riskWeighted) * 100)
                    : 0;
                // The bar IS the number beside it. It used to be scaled against
                // the biggest exposure instead of the total, so a row labelled
                // "35% of the exposed total" drew a nearly full-width rail and
                // the picture contradicted its own caption (Anir, Jul 28, on the
                // identical bug in the seats chart: "why is it saying 65% of all
                // seats, but it shows a 100% bar?"). One number, one length.
                const barPct = share;
                return (
                  <HoverCard
                    key={deal.sessionId}
                    side="left"
                    width={296}
                    content={
                      <div>
                        {/* Adds what the row can't fit: the person's title, who
                            owns it, the odds arithmetic, and exactly when it
                            last moved, never a restatement of the row. */}
                        <div className="flex items-start gap-2.5">
                          <CompanyLogo
                            name={deal.company}
                            className="h-9 w-9 shrink-0 text-[8px]"
                          />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold leading-snug text-text-primary">
                              {deal.company}
                            </p>
                            <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[10.5px] text-text-secondary">
                              <Avatar
                                name={deal.contactName}
                                className="mt-[1px] h-4 w-4 shrink-0 text-[6px]"
                              />
                              <span className="min-w-0 leading-snug break-normal">
                                {deal.contactName}
                                {deal.title ? ` · ${deal.title}` : ""}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
                          <div>
                            <p className="text-[12px] font-bold text-text-primary tnum">
                              {formatMoney(deal.value)}
                            </p>
                            <p className="text-[9px] text-text-secondary">
                              Full value
                            </p>
                          </div>
                          <div>
                            <p className="text-[12px] font-bold text-text-primary tnum">
                              {oddsOf(deal)}%
                            </p>
                            <p className="text-[9px] text-text-secondary">
                              Odds of closing
                            </p>
                          </div>
                          <div>
                            <p
                              className="text-[12px] font-bold tnum"
                              style={{ color: RISK }}
                            >
                              {deal.staleDays}d
                            </p>
                            <p className="text-[9px] text-text-secondary">
                              Since last touch
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-text-secondary">Owner</span>
                            <span className="flex min-w-0 items-center gap-1.5 font-medium text-text-primary">
                              <Avatar
                                name={deal.owner}
                                className="h-4 w-4 shrink-0 text-[6px]"
                              />
                              {deal.owner}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-text-secondary">
                              Last logged touch
                            </span>
                            <span className="font-medium text-text-primary tnum">
                              {formatDateTime(deal.lastActivity)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2.5 border-t border-border-light pt-2.5 text-[11px] leading-relaxed text-text-secondary">
                          Nothing has been logged for {deal.staleDays} days, so
                          the {oddsOf(deal)}% odds on {formatMoney(deal.value)}{" "}
                          are getting shakier, {formatMoney(weighted)} of your
                          commit, {share}% of everything exposed.
                        </p>
                      </div>
                    }
                  >
                    <Link
                      href={`/deals/${deal.sessionId}`}
                      className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-[var(--surface)]"
                    >
                      <CompanyLogo
                        name={deal.company}
                        className="h-8 w-8 shrink-0 text-[8px]"
                      />
                      <span className="min-w-0 flex-1">
                        {/* Line 1 — the company, then the money it carries,
                            immediately after it. Never across a canyon. */}
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[12.5px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-blue-primary">
                            {deal.company}
                          </span>
                          <span
                            className="text-[13px] font-bold leading-snug tnum"
                            style={{ color: RISK }}
                          >
                            {formatMoney(weighted)}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            exposed
                          </span>
                        </span>
                        {/* Line 2 — the person, headshot and name on one
                            unbroken line, wrapping rather than truncating. */}
                        <span className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[11px] text-text-secondary">
                          <Avatar
                            name={deal.contactName}
                            className="mt-[1px] h-4 w-4 shrink-0 text-[6px]"
                          />
                          <span className="min-w-0 leading-snug break-normal">
                            {deal.contactName}
                          </span>
                        </span>
                        {/* Line 3 — the offering, the stage and the quiet time,
                            each carrying its own colour and glyph. */}
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ServiceTag
                            name={deal.service}
                            className="max-w-full text-[11px]"
                          />
                          <StageChip stage={deal.stage} />
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum"
                            style={{ color: RISK, background: `${RISK}14` }}
                          >
                            <Clock3 size={10} strokeWidth={2.4} />
                            {deal.staleDays} days quiet
                          </span>
                        </span>
                        {/* Line 4 — this deal's share of the exposed total, the
                            bar and its number side by side. */}
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                            <span
                              className="chart-grow-x block h-full rounded-full"
                              style={{ width: `${barPct}%`, background: RISK }}
                            />
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-text-secondary tnum">
                            {share}% of the exposed total
                          </span>
                        </span>
                      </span>
                    </Link>
                  </HoverCard>
                );
              })}
            </div>
            {/* The panel — not the rows — takes whatever slack the grid hands
                it, and this line gives the block a bottom edge instead of
                letting the last row float. It states a fact the rows don't:
                how much of the exposed total these rows actually cover. */}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-light px-3.5 py-2.5 text-[10.5px] text-text-secondary">
              <span className="tnum">
                These {driving.length}{" "}
                {driving.length === 1 ? "deal carries" : "deals carry"}{" "}
                <span className="font-semibold" style={{ color: RISK }}>
                  {formatMoney(drivingWeighted)}
                </span>
               , {drivingShare}% of everything exposed
              </span>
              {quiet.length > driving.length && (
                <Link
                  href="/pipeline"
                  className="shrink-0 cursor-pointer font-semibold text-blue-primary tnum"
                >
                  {quiet.length - driving.length} more inactive{" "}
                  {quiet.length - driving.length === 1 ? "deal" : "deals"} →
                </Link>
              )}
            </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ color: CLEAR, background: `${CLEAR}14` }}
              >
                <CircleCheck size={20} strokeWidth={2} />
              </span>
              <p className="text-[13px] font-semibold text-text-primary">
                Nothing is drifting
              </p>
              <p className="max-w-[260px] text-[11.5px] leading-relaxed text-text-secondary">
                Every one of your {open.length} open{" "}
                {open.length === 1 ? "deal" : "deals"} has been called, emailed
                or noted in the last {rottingDays} days, so none of the{" "}
                {formatMoney(commit)} commit is exposed.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
