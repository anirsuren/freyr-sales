import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  Hourglass,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { DonutChart, type TipItem } from "@/components/charts/Charts";
import { HEALTH_COLOR } from "@/lib/health";
import { STAGE_COLOR, STAGE_ICON, formatMoney, type Stage } from "@/lib/pipeline";
import { formatDate } from "@/lib/utils";
import { daysLabel } from "./dealTime";

/* ---------------------------------------------------------------------------
   THE COLOUR LAW FOR THIS CARD — colour by MEANING, exactly like /forecast.

   The previous version painted every element in the deal's stage colour, so a
   Prospect deal rendered as a wall of burnt orange (Anir: "all the colors are
   the same, but why is it all fucking red? That's so negative"). The stage now
   appears exactly ONCE — its chip on the first panel — and everything else
   borrows the meanings the rest of the app already taught the reader:

     blue-primary   the measure. The probability ring, the counted money and
                    the days-used fill are all "your number today", the same
                    blue as the quota-attainment bar on /forecast.
     blue-subtle    the upside — value not counted yet. The same pairing as
                    /forecast's solid-commit vs light best-case bar.
     traffic light  momentum (HEALTH_COLOR), so a slowing deal looks exactly
                    like an account slipping to "watch".
     RISK red       ONLY past the 14-day quiet line. If it's red, act.
--------------------------------------------------------------------------- */

/** Real red. Earned only by a deal that has gone past the quiet line. */
const RISK = "#FF3B30"; // = --error
/** The measure: the same blue as /forecast's commit bar. */
const MEASURE = "#0071E3"; // = blue-primary
/** The upside share: /forecast's best-case light blue. */
const UPSIDE = "#C7DCFA"; // = blue-subtle
/** A closed deal's spent track — muted, no alarm. */
const SPENT = "#B7C4D4";
/** The quiet half of a gauge: same hue, 12%. */
const quiet = (c: string) => `${c}1F`;

// One rhythm for all three panels, lifted straight off /forecast: tiny uppercase
// eyebrow, one dominant number, generous air, equal heights.
const PANEL = "flex h-full flex-col rounded-xl border border-border-light p-4";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";
const HERO = "text-[25px] font-bold leading-none tracking-[-0.01em] text-text-primary tnum";
const HERO_SUB = "text-[12.5px] leading-snug text-text-secondary";
const NOTE = "text-[11.5px] leading-snug text-text-secondary";

export function DealSnapshot({
  company,
  contactName,
  stage,
  winProb,
  value,
  weighted,
  daysInStage,
  stageStartedAt,
  rottingDays,
}: {
  company: string;
  contactName: string | null;
  stage: Stage;
  winProb: number;
  value: number;
  weighted: number;
  /** Days the deal has been sitting on the stage it's on now. */
  daysInStage: number;
  stageStartedAt: string;
  rottingDays: number;
}) {
  const lost = stage === "Closed Lost";
  const gap = Math.max(0, value - weighted);
  const stageColor = STAGE_COLOR[stage];
  const StageIcon = STAGE_ICON[stage];

  return (
    <Card className="mb-6">
      <div className="mb-5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">Deal snapshot</h2>
          <InfoHint text="The three things worth knowing before you call: how likely it is, what it's worth, and whether it's still moving." />
        </div>
        {/* No colour key here any more. A legend only ever existed because the
            colours weren't self-evident — the fix was the colours. */}
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          Where this deal stands, at a glance
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 1 — WIN CHANCE. The percentage is printed ONCE, in the middle of the
            ring, and nowhere else in this section. The last version put it in a
            hero line AND the ring centre; Suren counted it out loud. */}
        <section className={PANEL}>
          <PanelHead
            label="Win chance"
            hint="Set by the stage this deal has reached — every deal at the same stage is counted at the same odds."
          >
            <Pill color={stageColor} Icon={StageIcon}>
              {stage}
            </Pill>
          </PanelHead>

          <div className="mt-3 flex flex-1 items-center gap-3.5">
            {/* The remainder arc is painted TRANSPARENT on purpose: DonutChart
                already lays a full --border-light track under every ring, so
                the empty share reads as the app's own quiet neutral in both
                light and dark, and there is no hardcoded tint to go wrong. The
                salmon that used to live here is gone for good — an empty gauge
                is not an alarm. */}
            <span className="shrink-0">
              <DonutChart
                segments={
                  lost
                    ? [{ label: "No chance left", value: 100, color: "transparent" }]
                    : [
                        {
                          label: "Likely to close",
                          value: winProb,
                          color: MEASURE,
                          tip: [
                            {
                              name: company,
                              sub: `Counted in your forecast at ${stage}`,
                              value: formatMoney(weighted),
                              logo: company,
                              avatar: contactName || undefined,
                            } as TipItem,
                          ],
                        },
                        {
                          label: "Might not close",
                          value: 100 - winProb,
                          color: "transparent",
                          tip: [
                            {
                              name: "The part the forecast leaves out",
                              sub: "it only lands if you win the deal",
                              value: formatMoney(gap),
                            } as TipItem,
                          ],
                        },
                      ]
                }
                size={104}
                thickness={11}
                centerLabel={`${winProb}%`}
                centerSub="to close"
                format="percent"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug text-text-primary">
                {lost ? "this one is closed lost" : "chance this deal closes"}
              </p>
              <p className={`mt-1 ${NOTE}`}>
                {lost ? (
                  "The forecast counts none of it."
                ) : (
                  <>
                    Set by the stage — every{" "}
                    <span className="font-semibold" style={{ color: stageColor }}>
                      {stage}
                    </span>{" "}
                    deal is counted the same.
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* 2 — VALUE AT STAKE. One dominant number, then the split as two
            aligned rows in the /forecast legend idiom: tinted icon tile, label,
            money, share bar. The share is shown as a BAR, never as a second
            printing of the percentage. */}
        <section className={PANEL}>
          <PanelHead
            label="Value at stake"
            hint="The whole deal, split into the share your forecast already counts and the share it doesn't."
          >
            {lost ? (
              <Pill color={STAGE_COLOR["Closed Lost"]} Icon={XCircle}>
                Out of forecast
              </Pill>
            ) : (
              <Pill color={MEASURE} Icon={CircleCheck}>
                In your forecast
              </Pill>
            )}
          </PanelHead>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
            <span className={HERO}>{formatMoney(value)}</span>
            <span className={HERO_SUB}>on the table</span>
          </div>

          <div className="mt-3 flex flex-1 flex-col justify-center gap-2">
            <Tooltip
              label={`${formatMoney(value)} is the whole deal. Your forecast counts ${formatMoney(weighted)} of it today; the rest only lands if you win.`}
              side="top"
              className="w-full cursor-pointer"
            >
              <span className="block w-full space-y-2">
                {/* Counted = solid blue, not-counted = light blue — the exact
                    commit/best-case pairing from /forecast, so the reader has
                    already learnt these two colours. */}
                <SplitRow
                  Icon={CircleCheck}
                  ink={lost ? SPENT : MEASURE}
                  bar={lost ? SPENT : MEASURE}
                  tile={0.14}
                  label="Counted today"
                  money={formatMoney(weighted)}
                  pct={winProb}
                />
                <SplitRow
                  Icon={CircleDashed}
                  ink={lost ? SPENT : "#5B8DC9"}
                  bar={lost ? quiet(SPENT) : UPSIDE}
                  tile={0.1}
                  label="Not counted yet"
                  money={formatMoney(gap)}
                  pct={100 - winProb}
                />
              </span>
            </Tooltip>
          </div>
        </section>

        {/* 3 — DAYS IN THIS STAGE. The old panel asked a question nobody had
            ("Time at this stage", with a hatched bar comparing it to other
            deals) and Suren couldn't read it at all. The rep's real question is
            "is this going stale?", so the track IS the 14-day runway: filled by
            days spent, and only red once it's overdrawn. */}
        <section className={PANEL}>
          <PanelHead
            label="Days in this stage"
            hint={`How long it has sat where it is. Past ${rottingDays} days without moving, a deal counts as gone quiet.`}
          >
            <MomentumPill lost={lost} days={daysInStage} rottingDays={rottingDays} />
          </PanelHead>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
            <span className={HERO}>{daysLabel(daysInStage)}</span>
            <span className={HERO_SUB}>
              {lost ? "since it was marked lost" : `in ${stage}`}
            </span>
          </div>

          <div className="mt-3 flex flex-1 flex-col justify-center gap-2.5">
            <QuietTrack
              days={daysInStage}
              rottingDays={rottingDays}
              color={lost ? SPENT : MEASURE}
              lost={lost}
            />
            <p className={NOTE}>
              {lost
                ? `Marked lost on ${formatDate(stageStartedAt)} — nothing left to chase.`
                : daysInStage < rottingDays
                  ? `${daysLabel(rottingDays - daysInStage)} before it goes quiet.`
                  : daysInStage === rottingDays
                    ? "It just hit the quiet line — time to chase it."
                    : `${daysLabel(daysInStage - rottingDays)} past the quiet line — time to chase it.`}
            </p>
          </div>
        </section>
      </div>
    </Card>
  );
}

/** The identical top row on all three panels: what this is, plus one status chip
 *  in the colour that panel is about. */
function PanelHead({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="flex items-center gap-1">
        <span className={EYEBROW}>{label}</span>
        <InfoHint text={hint} />
      </span>
      {children}
    </div>
  );
}

/** Colour + icon, never plain type — the standing rule for any status chip. */
function Pill({
  color,
  Icon,
  children,
}: {
  color: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `${color}1A`, color }}
    >
      <Icon size={11} strokeWidth={2.2} />
      {children}
    </span>
  );
}

/** One row of the money split, built to the same column rhythm as the /forecast
 *  donut legend — tinted icon tile, label, value, share bar — minus the percent,
 *  because that number already lives in the ring one panel to the left. */
function SplitRow({
  Icon,
  ink,
  bar,
  tile,
  label,
  money,
  pct,
}: {
  Icon: LucideIcon;
  ink: string;
  bar: string;
  /** Strength of the wash behind the glyph, 0–1. */
  tile: number;
  label: string;
  money: string;
  pct: number;
}) {
  const wash = Math.round(tile * 255)
    .toString(16)
    .padStart(2, "0");
  return (
    <span className="grid grid-cols-[18px_minmax(0,auto)_auto_minmax(36px,1fr)] items-center gap-x-2 text-[12px]">
      <span
        className="flex h-[18px] w-[18px] items-center justify-center rounded-md"
        style={{ background: `${ink}${wash}` }}
      >
        <Icon size={11} strokeWidth={2.2} style={{ color: ink }} />
      </span>
      <span className="min-w-0 text-text-secondary">{label}</span>
      <span className="justify-self-end font-semibold text-text-primary tnum">
        {money}
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(pct, 3)}%`, background: bar }}
        />
      </span>
    </span>
  );
}

/** The 14-day runway. The whole track IS the quiet threshold, so the fill is
 *  literally "how much of your time is used up" — and it only turns red once
 *  the deal has actually overdrawn it. */
function QuietTrack({
  days,
  rottingDays,
  color,
  lost,
}: {
  days: number;
  rottingDays: number;
  /** Six-digit hex — the alpha suffixes are added here, never by the caller. */
  color: string;
  lost: boolean;
}) {
  const overdue = !lost && days >= rottingDays;
  const pct = lost ? 100 : Math.min(100, (days / Math.max(rottingDays, 1)) * 100);
  // Real red is earned only by a deal that has actually overdrawn its runway.
  // A closed deal has no clock left to run, so it reads as a spent track.
  const base = overdue ? RISK : color;
  const fill = base;
  return (
    <Tooltip
      label={
        lost
          ? "This deal is closed — there is no clock left to run."
          : overdue
            ? `${daysLabel(days)} on this stage. Anything past ${rottingDays} days counts as gone quiet.`
            : `${daysLabel(days)} of the ${rottingDays}-day runway used.`
      }
      side="top"
      className="w-full cursor-pointer"
    >
      <span
        className="block h-2 w-full overflow-hidden rounded-full"
        style={{ background: quiet(base) }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(pct, days > 0 || lost ? 3 : 0)}%`, background: fill }}
        />
      </span>
    </Tooltip>
  );
}

function MomentumPill({
  lost,
  days,
  rottingDays,
}: {
  lost: boolean;
  days: number;
  rottingDays: number;
}) {
  const m = momentum(lost, days, rottingDays);
  return (
    <Pill color={m.color} Icon={m.Icon}>
      {m.label}
    </Pill>
  );
}

// Momentum borrows the app's account-health traffic light rather than inventing
// a fourth palette: a deal that is slowing down should look exactly like an
// account slipping to "watch". HEALTH_COLOR carries no yellow-band colour.
function momentum(lost: boolean, days: number, rottingDays: number) {
  if (lost)
    return { label: "Closed lost", color: STAGE_COLOR["Closed Lost"], Icon: XCircle };
  if (days >= rottingDays)
    return { label: "Stalled", color: HEALTH_COLOR.at_risk.color, Icon: AlertTriangle };
  if (days >= rottingDays / 2)
    return { label: "Slowing", color: HEALTH_COLOR.watch.color, Icon: Hourglass };
  return { label: "Moving", color: HEALTH_COLOR.healthy.color, Icon: TrendingUp };
}
