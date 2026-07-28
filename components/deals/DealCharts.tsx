import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { HoverCard } from "@/components/ui/HoverCard";
import { BarChart, type TipItem } from "@/components/charts/Charts";
import {
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_PROBABILITY,
  formatMoney,
  type Deal,
  type Stage,
} from "@/lib/pipeline";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Interaction } from "@/lib/types";
import { daysLabel, daysSince } from "./dealTime";
import { outcomeMark } from "./dealOutcome";

/* ---------------------------------------------------------------------------
   THE TWO CHARTS THIS PAGE EARNED.

   Both are built from fields that already exist on this record — nothing is
   modelled, bucketed or benchmarked into existence:

     STAGE JOURNEY   how many CALENDAR DAYS the deal sat in each stage it
                     actually walked. Every row comes from `stageDates`, which
                     is the date of the real logged interaction that moved it
                     there (and session.created_at for Prospect). A stage the
                     deal passed through with nothing logged has no measurable
                     duration, so it gets no row — a fabricated zero would be a
                     lie about the record.

     SIZES UP        this deal's value against the other OPEN deals in the book.
                     Real `value` off real deals, ranked, this one ringed.

   WHY THE JOURNEY IS ROWS AND NOT COLUMNS.
   It was a column chart in a fixed 252px box, and a deal that has touched two
   stages rendered as two lonely bars marooned in a huge empty rectangle (Suren:
   "a fucking huge-ass space and then I have two bars in one chart"). A column
   chart reserves its full height whether it has two entries or five. Rows don't:
   the block is exactly as tall as the number of stages the deal actually
   walked — one stage is one row, five stages is five — with no dead space at
   either end.

   It borrows the /forecast by-stage vocabulary (the stage's own colour, the
   value pinned above the track, a light tint behind a solid fill, a coloured
   mark beside the stage name, a hover naming the real records) but runs
   HORIZONTALLY and counts DAYS rather than money, so nobody mistakes this for
   the forecast page.

   WHY THE TWO CHARTS STACK.
   Side by side, whichever panel was shorter grew a dead band under itself — the
   same bug in a different place. And eight peer bars crammed into a half-width
   column clamped every company name ("NovaGene Therapeut"). Full width gives
   each peer column roughly 2.5x the room, so labels wrap onto their own two
   lines intact instead of being cut.
--------------------------------------------------------------------------- */

/** How many bars the comparison can show before it stops being readable.
 *  Held at five while BarChart still clamps its x-labels to two lines inside
 *  112px: five columns across the full card width leaves every company name
 *  room to wrap whole. Raise it the moment BarChart lands per-datum `logo`
 *  marks and a horizontal scroll container — the ranking is honest at any N,
 *  it is only the label width that constrains it today. */
const PEERS_SHOWN = 8;

type JourneyStep = {
  stage: Stage;
  enteredAt: string;
  /** When it moved on, or null while it's still sitting here. */
  leftAt: string | null;
  days: number;
  /** The logged touch that PUT it in this stage (Prospect has none — the deal
   *  was simply created). */
  enteredBy: Interaction | null;
  /** The logged touch that moved it OUT of this stage. */
  leftBy: Interaction | null;
};

/** Walk the funnel and turn the dated stage entries into measured stays. */
function buildJourney(
  stage: Stage,
  stageDates: Record<string, string | undefined>,
  interactions: Interaction[],
  nowIso: string
): JourneyStep[] {
  const lost = stage === "Closed Lost";
  const path: Stage[] = lost ? [...OPEN_STAGES, "Closed Lost"] : [...OPEN_STAGES];
  const currentIdx = path.indexOf(stage);
  const at = (iso: string | undefined) =>
    iso ? interactions.find((i) => i.created_at === iso) || null : null;

  // Only the stages the deal has actually reached AND that carry a real date.
  const dated = path
    .slice(0, currentIdx + 1)
    .map((s) => ({ stage: s, enteredAt: stageDates[s] }))
    .filter((s): s is { stage: Stage; enteredAt: string } => !!s.enteredAt);

  return dated.map((s, i) => {
    const next = dated[i + 1];
    const leftAt = next ? next.enteredAt : null;
    return {
      stage: s.stage,
      enteredAt: s.enteredAt,
      leftAt,
      days: Math.max(0, daysSince(s.enteredAt, leftAt ?? nowIso) ?? 0),
      enteredBy: at(s.enteredAt),
      leftBy: leftAt ? at(leftAt) : null,
    };
  });
}

/** One real logged touch, rendered the way every other hover in the app renders
 *  a record: the person's headshot, what they logged, and their note. */
function TouchRow({
  interaction,
  lead,
}: {
  interaction: Interaction;
  lead: string;
}) {
  const m = outcomeMark(interaction.outcome);
  const Icon = m.icon;
  return (
    <div className="flex items-start gap-2">
      <Avatar
        name={interaction.logged_by}
        className="mt-[1px] h-[22px] w-[22px] shrink-0 text-[7px]"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold leading-snug text-text-primary">
          {lead}
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
            style={{ background: `${m.color}1A`, color: m.color }}
          >
            <Icon size={9} strokeWidth={2.4} />
            {m.label}
          </span>
        </p>
        <p className="mt-0.5 text-[10px] text-text-tertiary tnum">
          {formatDateTime(interaction.created_at)} · logged by{" "}
          {interaction.logged_by}
        </p>
        {interaction.notes && (
          <p className="mt-1 text-[10.5px] leading-relaxed text-text-secondary">
            {interaction.notes}
          </p>
        )}
      </div>
    </div>
  );
}

/** The breakdown behind one stay: the dates that bookend it and the real
 *  touches that opened and closed it. Never a restatement of the row. */
function StayHover({
  step,
  isCurrent,
  longestDays,
}: {
  step: JourneyStep;
  isCurrent: boolean;
  longestDays: number;
}) {
  const color = STAGE_COLOR[step.stage];
  const StageIcon = STAGE_ICON[step.stage];
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border-light pb-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${color}1A`, color }}
        >
          <StageIcon size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug text-text-primary">
            {step.stage}
          </p>
          <p className="text-[10.5px] text-text-tertiary">
            {isCurrent ? "where the deal is sitting now" : "a completed step"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold leading-none text-text-primary tnum">
            {step.days}
          </p>
          <p className="mt-1 text-[9.5px] text-text-tertiary">
            {step.days === 1 ? "day" : "days"}
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {[
          ["Entered", formatDate(step.enteredAt)],
          ["Moved on", step.leftAt ? formatDate(step.leftAt) : "still here"],
          [
            "Share of the run",
            longestDays > 0
              ? `${Math.round((step.days / longestDays) * 100)}% of the longest stay`
              : "—",
          ],
        ].map(([l, v]) => (
          <div
            key={l}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <span className="text-text-tertiary">{l}</span>
            <span className="font-semibold text-text-primary tnum">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 space-y-2.5 border-t border-border-light pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
          What moved it
        </p>
        {step.enteredBy ? (
          <TouchRow interaction={step.enteredBy} lead="In:" />
        ) : (
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">In:</span> the deal
            was created on {formatDate(step.enteredAt)} — no touch was needed to
            put it here.
          </p>
        )}
        {step.leftBy ? (
          <TouchRow interaction={step.leftBy} lead="Out:" />
        ) : (
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">Out:</span> nothing
            has moved it on yet — this stay is still counting.
          </p>
        )}
      </div>
    </div>
  );
}

/** The journey itself: one row per dated stay, so the block is exactly as tall
 *  as the deal is long. Value pinned above the track, /forecast style. */
function StageJourney({
  journey,
  currentStage,
}: {
  journey: JourneyStep[];
  currentStage: Stage;
}) {
  const maxDays = Math.max(...journey.map((s) => s.days), 1);
  return (
    <div data-journey-plot className="space-y-1.5">
      {journey.map((step, i) => {
        const color = STAGE_COLOR[step.stage];
        const StageIcon = STAGE_ICON[step.stage];
        const isCurrent = step.stage === currentStage;
        // A same-day stay is real and must still be visible, so the fill has a
        // floor — but the label says "same day" rather than dressing a 0 up as
        // a duration.
        const fillPct = Math.max(
          (step.days / maxDays) * 100,
          step.days > 0 ? 4 : 2.5
        );
        return (
          <HoverCard
            key={step.stage}
            side="top"
            width={320}
            delayMs={0}
            anchor="cursor"
            content={
              <StayHover step={step} isCurrent={isCurrent} longestDays={maxDays} />
            }
            clearAncestor="[data-journey-plot]"
            className="block cursor-pointer"
          >
            <div
              className="rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
              style={
                isCurrent
                  ? {
                      background: `${color}0F`,
                      // The same ring BarChart draws on its activeIndex bar, so
                      // "you are here" looks identical on both charts.
                      boxShadow: `0 0 0 2px ${color}`,
                    }
                  : undefined
              }
            >
              {/* Line 1 — the stage, and its elapsed days pinned above the
                  track, exactly where /forecast puts a column's value. */}
              <div className="flex items-center gap-2">
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: color }}
                >
                  <StageIcon size={11} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 break-normal text-[12.5px] font-semibold leading-snug text-text-primary">
                  {step.stage}
                </span>
                {isCurrent && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{ background: `${color}1F`, color }}
                  >
                    You are here
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[12.5px] font-bold text-text-primary tnum">
                  {step.days === 0 ? "same day" : daysLabel(step.days)}
                </span>
              </div>

              {/* Line 2 — the track. Light wash of the stage's own colour with
                  the solid fill scaled against the longest stay. */}
              <span
                className="mt-1.5 block h-2 w-full overflow-hidden rounded-full"
                style={{ background: `${color}1F` }}
              >
                <span
                  className="chart-grow-x block h-full rounded-full"
                  style={{
                    width: `${fillPct}%`,
                    background: color,
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              </span>

              {/* Line 3 — the dates the measurement actually came from. */}
              <p className="mt-1 text-[10.5px] leading-snug text-text-tertiary tnum">
                {formatDate(step.enteredAt)} →{" "}
                {step.leftAt ? formatDate(step.leftAt) : "still counting"}
              </p>
            </div>
          </HoverCard>
        );
      })}
    </div>
  );
}

export function DealCharts({
  stage,
  stageDates,
  interactions,
  nowIso,
  sessionId,
  value,
  openDeals,
}: {
  stage: Stage;
  stageDates: Record<string, string | undefined>;
  interactions: Interaction[];
  nowIso: string;
  sessionId: string;
  value: number;
  /** Every open deal in the book, this one included — real records only. */
  openDeals: Deal[];
}) {
  const journey = buildJourney(stage, stageDates, interactions, nowIso);
  const totalDays = journey.reduce((sum, s) => sum + s.days, 0);
  const longest = journey.reduce((a, b) => (b.days > a.days ? b : a), journey[0]);

  // The ranked open book. Sorted by the same real field the bars draw.
  const ranked = [...openDeals].sort((a, b) => b.value - a.value);
  const rank = ranked.findIndex((d) => d.sessionId === sessionId) + 1;
  const head = ranked.slice(0, PEERS_SHOWN);
  const shown = head.some((d) => d.sessionId === sessionId)
    ? head
    : [...ranked.slice(0, PEERS_SHOWN - 1), ranked[rank - 1]].filter(Boolean);
  const activeIndex = shown.findIndex((d) => d.sessionId === sessionId);
  const peerBars = shown.map((d) => ({
    label: d.company,
    logo: d.company,
    value: d.value,
    color: STAGE_COLOR[d.stage],
    caption: d.stage === "Meeting Booked" ? "Meeting" : d.stage,
    tipNote: `${Math.round((STAGE_PROBABILITY[d.stage] ?? 0) * 100)}% odds at ${d.stage} — ${formatMoney(
      d.value * (STAGE_PROBABILITY[d.stage] ?? 0)
    )} of weighted pipeline`,
    tip: [
      {
        logo: d.company,
        avatar: d.contactName,
        name: d.company,
        service: d.service,
        sub: `${daysLabel(d.staleDays)} since last touch`,
        value: formatMoney(d.value),
      } as TipItem,
    ],
  }));

  return (
    <Card className="mb-6 p-5">
      {/* ---- STAGE JOURNEY — elapsed time, one row per stage actually walked. */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Stage journey
          </h2>
          <InfoHint text="How long this deal sat in each step it actually walked, measured between the dates of the touches that moved it. A step nothing was logged against has no measured stay, so it gets no row — an empty bar would claim a duration this record doesn't have." />
        </div>
        <p className="mb-3 text-[11px] text-text-tertiary">
          {journey.length > 0
            ? `${daysLabel(totalDays)} from the day it opened to today${
                journey.length > 1 && longest
                  ? ` · longest stay ${daysLabel(longest.days)} in ${longest.stage}`
                  : ""
              }`
            : "Days spent at each step, oldest first"}
        </p>
        {journey.length > 0 ? (
          <StageJourney journey={journey} currentStage={stage} />
        ) : (
          <p className="text-[12.5px] text-text-secondary">
            Nothing has been logged against this deal yet, so there is no dated
            journey to draw.
          </p>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-text-secondary">
          Each track is scaled against the longest stay. The ringed row is where
          the deal is sitting right now, and it is still counting.
        </p>
      </div>

      {/* ---- HOW THIS DEAL SIZES UP — money, across the open book. */}
      <div className="mt-5 border-t border-border-light pt-5">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            How this deal sizes up
          </h2>
          <InfoHint text="This deal's full value against the largest open deals in the book. Each bar is coloured by the stage that deal is on. Closed-lost deals are left out — they aren't competing for your time." />
        </div>
        <p className="mb-3 text-[11px] text-text-tertiary">
          {rank > 0
            ? `${formatMoney(value)} — #${rank} of ${ranked.length} open deals by value`
            : `${formatMoney(value)} on the table`}
        </p>
        {peerBars.length > 1 ? (
          <BarChart
            data={peerBars}
            height={248}
            format="money"
            activeIndex={activeIndex >= 0 ? activeIndex : null}
            tipRecordsLabel="The deal behind this bar"
          />
        ) : (
          <p className="text-[12.5px] text-text-secondary">
            This is the only open deal in the book right now, so there is nothing
            to compare it against yet.
          </p>
        )}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span className="inline-flex items-center gap-2">
            {/* Drawn with the exact box-shadow BarChart puts on its activeIndex
                bar, so the key and the chart can't drift. */}
            <span
              className="ml-1 h-2.5 w-2.5 rounded-sm"
              style={{
                background: STAGE_COLOR[stage],
                boxShadow: `0 0 0 2px ${STAGE_COLOR[stage]}`,
              }}
            />
            This deal
          </span>
          <span>Every other bar is a real open deal — hover one to see it.</span>
        </p>
      </div>
    </Card>
  );
}
