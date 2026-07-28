import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { AreaChart, BarChart, VIZ, type TipItem } from "@/components/charts/Charts";
import {
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  formatMoney,
  type Deal,
} from "@/lib/pipeline";

// Stage → the chart layer's SERIALIZABLE icon key. STAGE_ICON holds LucideIcon
// components, and a component can never cross into a "use client" chart from a
// server component — the same rule `format` follows. Identical mapping to the
// one /forecast uses, so a stage wears the same glyph on both pages.
const TIP_ICON_KEY: Record<string, string> = {
  Prospect: "prospect",
  Engaged: "engaged",
  Qualified: "qualified",
  "Meeting Booked": "meeting",
};

const DAY = 86_400_000;
// Enough points that the curve reads as a line across the full width, few
// enough that every point is a legible dot with its own breakdown.
const POINTS = 12;
const RECENT_DAYS = 7;

const AREA_H = 240;
// The area chart hangs its x-axis date row 16px BELOW its own box (absolute
// -bottom-4), so the left panel reserves 20px under the plot. Matching the bar
// chart to AREA_H + that gutter bottom-aligns both plots on one baseline.
const BAR_H = AREA_H + 20;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The analytics band that sits between the pipeline KPI tiles and the board.
 *
 * HONESTY CONTRACT — every number here is computed from the deals this page
 * already renders on the board. There is no synthetic series, no smoothing and
 * no benchmark line:
 *  - The curve is sampled at 12 real timestamps spread across the real window
 *    (first open deal → now). Each point is an exact sum: the value of the
 *    deals open TODAY that already existed at that moment. A flat stretch means
 *    no new pipeline arrived — it is a fact about the book, not a gap we filled.
 *  - Stage history does not exist in the data model (a deal carries only its
 *    current stage), so the curve deliberately never claims to show deals that
 *    have since been lost. It answers one question honestly: how the pipeline
 *    you are working today was built up.
 *  - No quota/goal line. Comparing raw OPEN pipeline against a quota would
 *    imply 1× coverage is the target, which is not a number this data supports.
 */
export function PipelineAnalytics({ deals }: { deals: Deal[] }) {
  // Closed Lost is not pipeline, on either chart. A deal with an unusable
  // createdAt cannot be placed on a timeline, and inventing one for it is the
  // one thing this band must never do — so it drops out of the WHOLE band, not
  // just the curve. Filtering once is what guarantees the curve's last point
  // and the headline beside it are the same arithmetic; the band can then only
  // ever under-report against the tiles above, never overstate.
  const dated = deals
    .filter((d) => d.stage !== "Closed Lost")
    .map((d) => ({ deal: d, t: new Date(d.createdAt).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  // Nothing open (or nothing dateable) = nothing honest to plot. The tiles
  // above already say so; an empty chart would say it worse.
  if (dated.length === 0) return null;

  const open = dated.map((x) => x.deal);

  const now = Date.now();
  const firstT = dated[0].t;
  // At least a day of extent so a book created in one sitting still has an axis.
  const spanMs = Math.max(now - firstT, DAY);
  const step = spanMs / (POINTS - 2);
  // Start one step BEFORE the first deal so the line rises from a true zero:
  // "$0 of this pipeline existed yet" is a fact on that date, not a filler point.
  const startT = firstT - step;

  const series: number[] = [];
  const pointTips: TipItem[][] = [];
  const xLabels: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const at = startT + i * step;
    const live = dated
      .filter((x) => x.t <= at)
      .map((x) => x.deal)
      .sort((a, b) => b.value - a.value);
    series.push(live.reduce((sum, d) => sum + d.value, 0));
    xLabels.push(shortDate(at));
    pointTips.push(
      live.map((d) => ({
        logo: d.company,
        // `avatar` carries the person, and the tip row gives them their own
        // unbreakable line — so `sub` holds ONLY the trailing clause. Packing
        // "Name · clause" into one string is what wrapped a contact's name
        // across two lines (Suren, Jul 27: "that looks really bad").
        avatar: d.contactName,
        name: d.company,
        // Say what it IS. `stage` renders the board's own colour+icon chip;
        // as a bare `sub` string it was flat gray text (Suren, Jul 27:
        // "colors, please — colors, tags on the outcome thing").
        stage: d.stage,
        value: formatMoney(d.value),
      }))
    );
  }

  const openValue = open.reduce((sum, d) => sum + d.value, 0);
  const recentCutoff = now - RECENT_DAYS * DAY;
  const recent = dated.filter((x) => x.t >= recentCutoff);
  const recentValue = recent.reduce((sum, x) => sum + x.deal.value, 0);

  const stageBars = OPEN_STAGES.map((stage) => {
    const inStage = open
      .filter((d) => d.stage === stage)
      .sort((a, b) => b.value - a.value);
    const value = inStage.reduce((sum, d) => sum + d.value, 0);
    const odds = STAGE_PROBABILITY[stage] ?? 0;
    return {
      label: stage,
      value,
      color: STAGE_COLOR[stage],
      icon: TIP_ICON_KEY[stage],
      // Count under the money, at rest — the bar states both facts without a hover.
      caption: `${inStage.length} ${inStage.length === 1 ? "deal" : "deals"}`,
      // The bar is the FULL value; this names what the odds trim it to, so the
      // headline number can never be mistaken for likely revenue.
      tipNote: `${Math.round(odds * 100)}% odds at this step · ${formatMoney(
        value * odds
      )} likely`,
      tip: inStage.map((d) => ({
        logo: d.company,
        avatar: d.contactName,
        name: d.company,
        // Every bar in this chart IS one stage, so repeating it on each row
        // would be noise — the rows carry the fact the stage doesn't tell you.
        // Just the clause: the contact's name is rendered on its own line
        // beside their headshot, never joined to this with a "·".
        sub: `${d.staleDays}d since last touch`,
        value: formatMoney(d.value),
      })),
    };
  });

  const lateStages: string[] = ["Qualified", "Meeting Booked"];
  const late = open.filter((d) => lateStages.includes(d.stage));
  const lateValue = late.reduce((sum, d) => sum + d.value, 0);

  const Eyebrow = ({ children, hint }: { children: string; hint: string }) => (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
      {children}
      <InfoHint text={hint} />
    </span>
  );

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            How your pipeline is moving
          </h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Both graphs are drawn straight from the deals on this board — real
            totals on real dates, nothing estimated or filled in.
          </p>
        </div>
        <p className="text-[11px] font-medium text-text-secondary tnum">
          {shortDate(startT)} → today
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr]">
        {/* LEFT — the wide left-to-right curve: how the open book was built. */}
        <div className="flex flex-col xl:pr-5">
          <Eyebrow hint="Every point is the total value of the deals you have open today that already existed on that date. A flat stretch means no new pipeline came in that week. Deals that were already lost are left out at every point, because they are not part of what you are working now.">
            Open pipeline, day by day
          </Eyebrow>
          <p className="mt-1.5 text-[25px] font-bold leading-none text-text-primary tnum">
            {formatMoney(openValue)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-text-secondary">
            {open.length} {open.length === 1 ? "deal" : "deals"} still in play ·{" "}
            <span className="font-semibold text-text-primary tnum">
              {formatMoney(recentValue)}
            </span>{" "}
            of that arrived in the last {RECENT_DAYS} days
          </p>
          <div className="mt-5 flex flex-1 flex-col justify-end pb-5">
            <AreaChart
              id="pipeline-open-area"
              data={series}
              xLabels={xLabels}
              pointTips={pointTips}
              format="money"
              unit="USD"
              color={VIZ.blue}
              height={AREA_H}
            />
          </div>
        </div>

        {/* RIGHT — where that same money is sitting right now. Divider is a
            border-t while the panels stack, a border-l once they sit side by
            side, so the wide layout never leaves a dead band under the bars. */}
        <div className="mt-5 flex flex-col border-t border-border-light pt-5 xl:mt-0 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <Eyebrow hint="The same open money, split by the step each deal is sitting on right now. Bar height is the full value of the deals in that step; the line under it is how many deals make it up. Lost deals are excluded — they are not pipeline any more.">
            Where that money sits
          </Eyebrow>
          <p className="mt-1.5 text-[25px] font-bold leading-none text-text-primary tnum">
            {formatMoney(lateValue)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-text-secondary">
            {late.length} of {open.length} are Qualified or Meeting Booked — the
            steps closest to a signature
          </p>
          <div className="mt-5 flex flex-1 flex-col justify-end">
            <BarChart
              data={stageBars}
              format="money"
              unit="USD"
              height={BAR_H}
              tipRecordsLabel="Deals in this step"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
