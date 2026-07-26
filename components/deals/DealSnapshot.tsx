import { AlertTriangle, Hourglass, TrendingUp, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { DonutChart, VIZ, type TipItem } from "@/components/charts/Charts";
import {
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  formatMoney,
  type Stage,
} from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";
import { daysLabel } from "./dealTime";
import { STAGE_ICON } from "./DealTimeline";

const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";
const RISK_AMBER = "#FF9F0A";
const QUIET_RED = "#FF3B30";

export function DealSnapshot({
  company,
  contactName,
  stage,
  winProb,
  value,
  weighted,
  daysInStage,
  stageStartedAt,
  peerDays,
  peerCount,
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
  /** Median days the OTHER open deals at this stage have been there. */
  peerDays: number | null;
  peerCount: number;
  rottingDays: number;
}) {
  const lost = stage === "Closed Lost";
  const gap = Math.max(0, value - weighted);
  const missPct = Math.max(0, 100 - winProb);

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-1.5">
        <h2 className="text-[13px] font-semibold text-text-primary">Deal snapshot</h2>
        <InfoHint text="The three numbers a rep needs before picking up the phone: how likely this deal is to close, how much money rides on it, and whether it's still moving." />
      </div>
      <p className="mb-4 mt-1 text-[12px] text-text-tertiary">
        The chance of closing, the money at stake, and whether this deal is still moving.
      </p>

      {/* Three equal-height panels. Every chart inside is full-width — Suren on
          the old value chart: "it's so small. You could literally use that
          entire space, but you're not." */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 1 — Win chance, with the stage ladder that produces the number. */}
        <section className="flex h-full flex-col rounded-xl border border-border-light p-4">
          <p className={EYEBROW}>Win chance</p>
          <div className="mt-2 flex flex-1 items-center justify-between gap-3">
            <DonutChart
              segments={[
                {
                  label: "Likely to close",
                  value: winProb,
                  color: VIZ.blue,
                  tip: [
                    {
                      name: company,
                      sub: `${stage} — counted at ${winProb}%`,
                      value: formatMoney(weighted),
                      logo: company,
                      avatar: contactName || undefined,
                    } as TipItem,
                  ],
                },
                {
                  label: lost ? "Marked lost" : "Might not close",
                  value: missPct,
                  color: lost ? STAGE_COLOR["Closed Lost"] : VIZ.amber,
                  tip: [
                    {
                      name: lost
                        ? "This deal is marked lost"
                        : `${missPct}% chance this one slips away`,
                      sub: "the part the forecast leaves out",
                      value: formatMoney(gap),
                    } as TipItem,
                  ],
                },
              ]}
              size={120}
              thickness={13}
              centerLabel={`${winProb}%`}
              centerSub="to close"
              format="percent"
            />
            {/* The ladder the percentage comes from — the breakdown, not a
                restatement of the same number. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {OPEN_STAGES.map((s) => {
                const Icon = STAGE_ICON[s];
                const pct = Math.round((STAGE_PROBABILITY[s] ?? 0) * 100);
                const now = s === stage;
                return (
                  <span
                    key={s}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11.5px]",
                      now ? "font-semibold" : "text-text-secondary"
                    )}
                    style={
                      now
                        ? {
                            background: `${STAGE_COLOR[s]}14`,
                            boxShadow: `inset 0 0 0 1px ${STAGE_COLOR[s]}40`,
                            color: STAGE_COLOR[s],
                          }
                        : undefined
                    }
                  >
                    <Icon
                      size={12}
                      strokeWidth={2.1}
                      style={{ color: STAGE_COLOR[s] }}
                      className="shrink-0"
                    />
                    <span className="min-w-0">{s}</span>
                    <span className="ml-auto tnum">{pct}%</span>
                  </span>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-snug text-text-secondary">
            Freyr counts every {stage} deal at {winProb}%. That is what turns{" "}
            <span className="font-semibold text-text-primary tnum">{formatMoney(value)}</span> into{" "}
            <span className="font-semibold text-text-primary tnum">{formatMoney(weighted)}</span> in
            the forecast.
          </p>
        </section>

        {/* 2 — Value at stake: two full-width bars, both labelled in dollars. */}
        <section className="flex h-full flex-col rounded-xl border border-border-light p-4">
          <p className={EYEBROW}>Value at stake</p>
          <div className="mt-3 flex flex-1 flex-col justify-center gap-4">
            <ValueBar
              label={`Full value if ${company} signs`}
              money={formatMoney(value)}
              pct={100}
              color={VIZ.blue}
              hint={`${formatMoney(value)} is the whole deal — what Freyr bills if ${company} signs everything on the table.`}
            />
            <ValueBar
              label={`What the forecast counts today (${winProb}%)`}
              money={formatMoney(weighted)}
              pct={winProb}
              color={VIZ.green}
              hint={`${formatMoney(value)} × ${winProb}% (the ${stage} stage) = ${formatMoney(weighted)}. This is the number that shows up on the forecast page.`}
            />
          </div>
          <p
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11.5px] leading-snug text-text-secondary"
            style={{ background: `${RISK_AMBER}14` }}
          >
            <AlertTriangle
              size={14}
              strokeWidth={2}
              className="mt-[1px] shrink-0"
              style={{ color: RISK_AMBER }}
            />
            <span>
              {lost ? (
                <>
                  This deal is marked lost, so the forecast counts none of it. The{" "}
                  <span className="font-semibold text-text-primary tnum">{formatMoney(value)}</span>{" "}
                  only comes back if it is reopened.
                </>
              ) : (
                <>
                  <span className="font-semibold text-text-primary tnum">{formatMoney(gap)}</span> of
                  it isn&apos;t counted yet. That gap is the {missPct}% chance this deal
                  doesn&apos;t close — close it and the forecast gains {formatMoney(gap)}.
                </>
              )}
            </span>
          </p>
        </section>

        {/* 3 — Replaces the old "4/5 stage" donut, which Suren couldn't read at
            all: "the pipeline progress, I don't understand what that is."
            A rep's real question at a glance is whether the deal is stuck. */}
        <section className="flex h-full flex-col rounded-xl border border-border-light p-4">
          <div className="flex items-start justify-between gap-2">
            <p className={EYEBROW}>Time at this stage</p>
            <MomentumPill lost={lost} days={daysInStage} rottingDays={rottingDays} />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold leading-none text-text-primary tnum">
              {daysInStage}
            </span>
            <span className="text-[13px] text-text-secondary">
              {daysInStage === 1 ? "day" : "days"} {lost ? "since it was lost" : `in ${stage}`}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">
            since {formatDate(stageStartedAt)}
          </p>

          <div className="mt-3 flex flex-1 flex-col justify-center gap-3">
            <DayBar
              label="This deal"
              days={daysInStage}
              scaleMax={scaleFor(daysInStage, peerDays, rottingDays)}
              // A closed-lost deal can't go quiet — there's nothing left to
              // chase — so it doesn't get the quiet line drawn across it.
              quietAt={lost ? null : rottingDays}
              color={momentum(lost, daysInStage, rottingDays).color}
            />
            {peerDays != null && (
              <DayBar
                label={
                  peerCount === 1
                    ? `Your other ${stage} deal`
                    : `Your other ${peerCount} ${stage} deals`
                }
                days={peerDays}
                scaleMax={scaleFor(daysInStage, peerDays, rottingDays)}
                quietAt={lost ? null : rottingDays}
                color={VIZ.slate}
              />
            )}
          </div>

          <p className="mt-3 text-[11.5px] leading-snug text-text-secondary">
            {lost ? (
              `This deal was marked lost on ${formatDate(stageStartedAt)}. Nothing here needs chasing.`
            ) : (
              <>
                <span
                  className="mr-1.5 inline-block h-2.5 w-0 translate-y-[2px] border-l-2 border-dashed"
                  style={{ borderColor: QUIET_RED }}
                  aria-hidden
                />
                {rottingDays} days with nothing logged is where a deal goes quiet.{" "}
                {peerDays == null
                  ? `No other open deals are sitting at ${stage} right now, so there's nothing to compare this one against.`
                  : peerCount === 1
                    ? `Your one other ${stage} deal has been there ${daysLabel(peerDays)} — this one is ${pace(daysInStage, peerDays)}.`
                    : `The median across your other ${peerCount} is ${daysLabel(peerDays)} — this one is ${pace(daysInStage, peerDays)}.`}
              </>
            )}
          </p>
        </section>
      </div>
    </Card>
  );
}

/** One full-width money bar. The dollar figure is printed at rest; the hover
 *  explains where the number comes from rather than repeating it. */
function ValueBar({
  label,
  money,
  pct,
  color,
  hint,
}: {
  label: string;
  money: string;
  pct: number;
  color: string;
  hint: string;
}) {
  return (
    <Tooltip label={hint} side="top" className="w-full cursor-pointer">
      <span className="block w-full">
        {/* Number first, label right beside it — never a canyon of white space
            between a figure and the thing it belongs to (Suren). */}
        <span className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-bold text-text-primary tnum">{money}</span>
          <span className="text-[12px] text-text-secondary">{label}</span>
        </span>
        <span className="block h-3.5 w-full overflow-hidden rounded-full bg-surface">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }}
          />
        </span>
      </span>
    </Tooltip>
  );
}

/** A day count on a shared scale, with the "gone quiet" line drawn across it. */
function DayBar({
  label,
  days,
  scaleMax,
  quietAt,
  color,
}: {
  label: string;
  days: number;
  scaleMax: number;
  quietAt: number | null;
  color: string;
}) {
  const pct = Math.max(2, Math.min(100, (days / scaleMax) * 100));
  const quietPct = quietAt == null ? null : Math.min(99, (quietAt / scaleMax) * 100);
  return (
    <span className="block">
      <span className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px]">
        <span className="text-text-secondary">{label}</span>
        <span className="font-semibold text-text-primary tnum">{daysLabel(days)}</span>
      </span>
      <span className="relative block h-3 w-full rounded-full bg-surface">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
        {quietPct != null && (
          <span
            aria-hidden
            className="absolute -inset-y-1 border-l-2 border-dashed"
            style={{ left: `${quietPct}%`, borderColor: QUIET_RED }}
          />
        )}
      </span>
    </span>
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
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `${m.color}1A`, color: m.color }}
    >
      <m.Icon size={11} strokeWidth={2.2} />
      {m.label}
    </span>
  );
}

function momentum(lost: boolean, days: number, rottingDays: number) {
  if (lost) return { label: "Closed lost", color: "#EF4444", Icon: XCircle };
  if (days >= rottingDays) return { label: "Stalled", color: QUIET_RED, Icon: AlertTriangle };
  if (days >= rottingDays / 2) return { label: "Slowing", color: RISK_AMBER, Icon: Hourglass };
  return { label: "Moving", color: "#34C759", Icon: TrendingUp };
}

/** Headroom above the largest number so the "gone quiet" line never lands on
 *  the very edge of the track. */
function scaleFor(days: number, peerDays: number | null, rottingDays: number): number {
  return Math.max(rottingDays, days, peerDays ?? 0, 1) * 1.15;
}

// Deliberately blunt about small gaps: one day either side of the comparison is
// noise, and calling it "slower" would be a verdict the data can't support.
function pace(days: number, peerDays: number): string {
  const gap = days - peerDays;
  if (peerDays <= 0 || Math.abs(gap) < 3) return "right in line with that";
  return gap < 0 ? "moving quicker than that" : "moving slower than that";
}
