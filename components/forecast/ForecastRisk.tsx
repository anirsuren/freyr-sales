import Link from "next/link";
import { CircleCheck, Clock3, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { HoverCard } from "@/components/ui/HoverCard";
import { InfoHint } from "@/components/ui/InfoHint";
import { BarChart, type TipItem } from "@/components/charts/Charts";
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
   FORECAST RISK — rebuilt to the standard of the By-stage block directly above
   it (Suren, Jul 27: "it just looks atrocious… the colours don't match and it
   looks very outdated").

   What was wrong, and what replaced it:

   1. THE PALETTE WASN'T THIS APP'S. A traffic-light green→orange coverage bar,
      a pale-green ACTIVE box beside a pale-orange EXPOSED box, and orange-on-
      pale-orange count pills. Nothing here is amber, yellow or orange now.
      There is ONE measure — weighted commit — drawn in the app's measure blue,
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

   HONESTY: every figure comes off a field this page already derives —
   `Deal.value`, `Deal.staleDays`, `Deal.stage`, and STAGE_PROBABILITY. No
   benchmark, no trend, no "typical" comparison, nothing bucketed into being.
--------------------------------------------------------------------------- */

/** The measure. Every dollar in this section is weighted commit, drawn blue. */
const MEASURE = "#0071E3";
/** Real red, EARNED only once a deal has actually gone past the quiet line. */
const RISK = "#B02020";
/** The all-clear. Only ever shown when there is genuinely nothing exposed. */
const CLEAR = "#1A7A35";

/** Panel shell — the same parts DealFacts and DealSnapshot are built from, so
 *  the bands across the app can't drift apart. */
const PANEL =
  "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border-light";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

/** How many open deals the quiet plot can show before the labels stop being
 *  readable. Sorted quietest-first, so the exposed end is always in view. */
const QUIET_BARS = 8;

/** Stage → the chart layer's serializable icon key. A string, not a component:
 *  this is a server component, so `icon`/`format`/`caption` are string KINDS. */
const TIP_ICON_KEY: Record<Stage, string> = {
  Prospect: "prospect",
  Engaged: "engaged",
  Qualified: "qualified",
  "Meeting Booked": "meeting",
  "Closed Lost": "lost",
};

const weightedOf = (d: Deal) => d.value * (STAGE_PROBABILITY[d.stage] ?? 0);
const oddsOf = (d: Deal) => Math.round((STAGE_PROBABILITY[d.stage] ?? 0) * 100);
const shortStage = (stage: Stage) =>
  stage === "Meeting Booked" ? "Meeting" : stage;

/** One real deal, as a tooltip row: its logo, its person, its offering, and the
 *  weighted money it carries. Never a bare number. */
const dealTip = (d: Deal): TipItem => ({
  logo: d.company,
  avatar: d.contactName,
  name: d.company,
  sub: `${d.contactName} · ${d.service}`,
  value: formatMoney(weightedOf(d)),
});

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

  // ── THE PLOT ───────────────────────────────────────────────────────────────
  // One bar per open deal: how many days since its last logged touch. Quietest
  // first, so the crossing of the quiet line reads left to right. Red is not a
  // category here — it is the same measure, past the line.
  const shown = [...open]
    .sort((a, b) => b.staleDays - a.staleDays || weightedOf(b) - weightedOf(a))
    .slice(0, QUIET_BARS);
  const bars = shown.map((d) => {
    const past = d.staleDays > rottingDays;
    return {
      label: d.company,
      value: d.staleDays,
      color: past ? RISK : MEASURE,
      icon: TIP_ICON_KEY[d.stage],
      // The money rides directly under the days, on the bar it belongs to —
      // never across a canyon from it.
      caption: formatMoney(d.value),
      tipNote: `${formatMoney(d.value)} open at ${oddsOf(d)}% odds on ${
        d.stage
      } — ${formatMoney(weightedOf(d))} of ${
        past ? "exposed" : "active"
      } commit. Last touch ${formatDateTime(d.lastActivity)}.`,
      tip: [dealTip(d)],
    };
  });

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
  const driving = quiet.slice(0, 4);
  const topExposure = driving[0] ? weightedOf(driving[0]) : 0;

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
                  {d.staleDays === 0 ? "touched today" : `${d.staleDays}d quiet`}
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
      side="top"
      width={280}
      delayMs={0}
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
              {quiet.length} of {open.length} open deals have gone quiet
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
                  text={`One measure — your weighted commit — split two ways by the ${rottingDays}-day quiet line. Hover either half, or any bar, to see the deals behind it.`}
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
                    delayMs={0}
                    className="h-full w-full cursor-pointer"
                    content={splitHover(
                      "Active",
                      `Touched within the last ${rottingDays} days — ${activePct}% of the weighted commit.`,
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
                    delayMs={0}
                    className="h-full w-full cursor-pointer"
                    content={splitHover(
                      "Exposed",
                      `No logged touch for more than ${rottingDays} days — ${riskPct}% of the weighted commit.`,
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
                  `Touched within the last ${rottingDays} days — ${activePct}% of the weighted commit.`,
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
                note={`quiet for more than ${rottingDays} days`}
                list={quiet}
                hover={splitHover(
                  "Exposed",
                  `No logged touch for more than ${rottingDays} days — ${riskPct}% of the weighted commit.`,
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
                        delayMs={0}
                        className="cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--surface)]"
                        content={splitHover(
                          s.stage,
                          `${s.deals.length} quiet ${
                            s.deals.length === 1 ? "deal" : "deals"
                          } on ${s.stage}, carrying ${share}% of everything exposed.`,
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

            {/* THE PLOT — days since the last touch, one bar per real deal. */}
            <div className="mt-3 flex flex-1 flex-col justify-end border-t border-border-light pt-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className={EYEBROW}>Days since the last touch</p>
                <p className="text-[10.5px] text-text-secondary tnum">
                  {open.length > QUIET_BARS
                    ? `the ${shown.length} quietest of ${open.length} open deals`
                    : `all ${open.length} open ${open.length === 1 ? "deal" : "deals"}`}
                </p>
              </div>
              {bars.length > 0 ? (
                <>
                  <BarChart
                    data={bars}
                    height={244}
                    format="number"
                    unit="days"
                    tipRecordsLabel="The deal behind this bar"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: MEASURE }}
                      />
                      Touched in the last {rottingDays} days
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: RISK }}
                      />
                      Quiet for more than {rottingDays} days
                    </span>
                    <span>
                      Each bar is one open deal — the number under it is what is
                      on the table
                    </span>
                  </div>
                </>
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
                <InfoHint text="The quiet deals carrying the most weighted commit — the ones worth a call today. The bar under each row is that deal's share of the whole exposed total." />
              </div>
              <p className="mt-0.5 text-[10.5px] text-text-secondary">
                Biggest exposure first — hover a row for the full record
              </p>
            </div>
          </div>

          {driving.length > 0 ? (
            <div className="flex flex-1 flex-col divide-y divide-border-light">
              {driving.map((deal) => {
                const weighted = weightedOf(deal);
                const share =
                  riskWeighted > 0
                    ? Math.round((weighted / riskWeighted) * 100)
                    : 0;
                // Ranked against the biggest exposure, not against the total:
                // scaled to the total every bar reads as a stub.
                const barPct =
                  topExposure > 0
                    ? Math.max(Math.round((weighted / topExposure) * 100), 4)
                    : 0;
                return (
                  <HoverCard
                    key={deal.sessionId}
                    side="left"
                    width={296}
                    // The row wrapper takes the flex share, so four rows spread
                    // to fill whatever height the taller panel sets instead of
                    // pooling the slack as a dead band at the bottom (Suren:
                    // equal card heights, no dead space at rest).
                    className="flex min-h-0 flex-1"
                    content={
                      <div>
                        {/* Adds what the row can't fit: the person's title, who
                            owns it, the odds arithmetic, and exactly when it
                            last moved — never a restatement of the row. */}
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
                          are getting shakier — {formatMoney(weighted)} of your
                          commit, {share}% of everything exposed.
                        </p>
                      </div>
                    }
                  >
                    <Link
                      href={`/deals/${deal.sessionId}`}
                      className="group flex w-full items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--surface)]"
                    >
                      <CompanyLogo
                        name={deal.company}
                        className="h-9 w-9 shrink-0 text-[8px]"
                      />
                      <span className="min-w-0 flex-1">
                        {/* Line 1 — the company, then the money it carries,
                            immediately after it. Never across a canyon. */}
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
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
                        <span className="mt-1 flex min-w-0 items-start gap-1.5 text-[11px] text-text-secondary">
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
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                        <span className="mt-2 flex items-center gap-2">
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
