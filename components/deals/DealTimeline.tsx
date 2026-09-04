import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { InfoHint } from "@/components/ui/InfoHint";
import { GLOSSARY, stageKey } from "@/lib/glossary";
import {
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_ICON,
  type Stage,
} from "@/lib/pipeline";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { Interaction } from "@/lib/types";
import { daysLabel, daysSince, whenLabel } from "./dealTime";
import { outcomeMark } from "./dealOutcome";
import { tint } from "@/lib/tint";

/* ---------------------------------------------------------------------------
   ONE AXIS, AND IT IS THE FUNNEL IN TIME.

   The old rail read Prospect -> Engaged -> Today -> Next step -> Qualified ->
   Meeting Booked. A date marker and a calendar item were sitting in the line as
   if they were pipeline stages, and the stages the deal hadn't reached yet came
   AFTER them. Nobody could say what the axis was.

   Now the rail is the funnel and nothing else, always in funnel order.

   WHAT MOVED IN HERE ON JUL 28, AND WHY.
   There used to be a second card lower down the page, "Stage journey", drawing
   the same walk as a proportional bar. Anir: "I really think this is useless. It
   says it at the top anyway. You would probably make the deal stage thing at the
   top a little bit more detailed. It's kind of merging it into one at the top."
   So it was deleted, and the one fact it carried that this rail did not (HOW
   LONG the deal sat in each step) now sits under the segment it belongs to.

   THE GEOMETRY.
     - The rail spans the card edge to edge. It used to be inset, because every
       segment was centred under a stage pill, which left dead margin at both
       ends ("make sure it goes from left to right all the way").
     - A stage's column starts at its own dot and runs to the next stage's dot,
       so the width of that column IS the time the deal spent in that stage.
       Dated columns are sized by their real day counts; stages the deal has not
       reached carry no date, so they cannot be timed and split what is left in
       equal shares under a dashed rail.
     - Every label is left-aligned at its own dot rather than centred, so the
       pill, the date and the duration all belong to one unambiguous point.

   Stage colours and glyphs come from lib/pipeline so a stage can never look like
   two different things on two different screens.
--------------------------------------------------------------------------- */

const OVERDUE_RED = "var(--ink-red)"; // a problem, and only for an overdue follow-up
const NEXT_BLUE = "var(--ink-bright-blue)"; // = --blue-primary

/** No column is drawn narrower than this share of the rail. Sized so the stage
 *  pill above a same-day stay still fits inside its own column at the narrowest
 *  desktop width, rather than leaning into its neighbour. */
const MIN_SHARE = 0.13;

/** Every dot rides in a box this wide, whatever its own diameter, so the dot's
 *  centre sits at a fixed x inside its column. */
const DOT_BOX = 15;
/** Half of it: the x every label group starts on, so a stage's pill, date and
 *  duration all line up on the centre of the dot they belong to. This is what
 *  replaced the vertical droppers. */
const DOT_CENTRE = DOT_BOX / 2;

type State = "done" | "current" | "todo";

type Rung = {
  stage: Stage;
  Icon: LucideIcon;
  color: string;
  state: State;
  dateLine: string;
  subLine: string;
  hint: string;
  /** The raw ISO date the deal reached this stage, when there is one. */
  enteredAt: string | null;
  /** Calendar days the deal held this stage, or null when the stage carries no
   *  date and therefore no measurable stay. */
  days: number | null;
  /** True while this stage is the one the deal is sitting on: its stay has no
   *  end date yet. */
  running: boolean;
  /** Share of the rail's width, already normalised to sum to 100. */
  width: number;
  /** The logged touch that put the deal here, for the drill-down. */
  enteredBy: Interaction | null;
  /** The logged touch that moved it on, for the drill-down. */
  leftBy: Interaction | null;
};

export function DealTimeline({
  stage,
  stageDates,
  interactions,
  nextStep,
  nowIso,
}: {
  stage: Stage;
  stageDates: Record<string, string | undefined>;
  /** Every touch logged against this deal, so the rail can name the real record
   *  that moved it between two steps. */
  interactions: Interaction[];
  /** Scheduled follow-up date, if a rep booked one (yyyy-mm-dd). */
  nextStep: string | null;
  nowIso: string;
}) {
  const lost = stage === "Closed Lost";
  // A live deal is never shown ending on "Closed Lost". The stage vocabulary has
  // no Closed Won, so printing the loss step on an open deal made a healthy deal
  // look dead — we render the open path and only draw the loss when it's real.
  const path: Stage[] = lost ? [...OPEN_STAGES, "Closed Lost"] : [...OPEN_STAGES];
  const currentIdx = path.indexOf(stage);
  const touchAt = (iso: string | undefined) =>
    iso ? interactions.find((i) => i.created_at === iso) || null : null;

  // How long the deal held each DATED step: from its own date to the date of the
  // next dated step, or to today for the one it is sitting on. A step the deal
  // walked past with nothing logged has no date, so it has no measurable stay
  // and gets none — a fabricated zero would be a lie about the record.
  const datedIdx = path
    .map((s, i) => (i <= currentIdx && stageDates[s] ? i : -1))
    .filter((i) => i >= 0);
  const stayDays = new Map<number, number>();
  datedIdx.forEach((idx, n) => {
    const next = datedIdx[n + 1];
    const endIso = (next != null ? stageDates[path[next]] : nowIso) ?? nowIso;
    stayDays.set(idx, Math.max(0, daysSince(stageDates[path[idx]], endIso) ?? 0));
  });

  const totalStay = Math.max(
    [...stayDays.values()].reduce((a, b) => a + b, 0),
    1
  );
  // The dated run gets a slice of the rail in proportion to how much of the
  // funnel it covers; the undated remainder splits the rest evenly, because
  // there is no date to size it by.
  const datedBudget = datedIdx.length / path.length;
  const otherCount = path.length - datedIdx.length;
  const otherEach = otherCount > 0 ? (1 - datedBudget) / otherCount : 0;
  const raw = path.map((_, i) =>
    Math.max(
      stayDays.has(i)
        ? ((stayDays.get(i) as number) / totalStay) * datedBudget
        : otherEach,
      MIN_SHARE
    )
  );
  const rawSum = raw.reduce((a, b) => a + b, 0);

  const rungs: Rung[] = path.map((s, i) => {
    const date = stageDates[s];
    const reached = i <= currentIdx;
    const state: State = i === currentIdx ? "current" : reached ? "done" : "todo";
    const def = GLOSSARY[stageKey(s)]?.def ?? "";
    const nextDated = datedIdx[datedIdx.indexOf(i) + 1];
    return {
      stage: s,
      Icon: STAGE_ICON[s],
      color: STAGE_COLOR[s],
      state,
      // Two short rows per column and nothing else — a sentence here would leave
      // the rail ragged. The full story is in the hover.
      dateLine: date ? formatDate(date) : reached ? "Not logged" : "Not yet",
      subLine: date ? whenLabel(daysSince(date, nowIso)) : reached ? "skipped" : "",
      hint: date
        ? `${def} Logged ${formatDateTime(date)}.`
        : reached
          ? `${def} Nothing was logged at this step. The deal moved straight past it.`
          : `${def} This deal hasn't got here yet.`,
      enteredAt: date ?? null,
      days: stayDays.has(i) ? (stayDays.get(i) as number) : null,
      running: stayDays.has(i) && datedIdx[datedIdx.length - 1] === i,
      width: (raw[i] / rawSum) * 100,
      enteredBy: touchAt(date),
      leftBy: nextDated != null ? touchAt(stageDates[path[nextDated]]) : null,
    };
  });

  const nextStepDays = daysSince(nextStep, nowIso);
  const nextStepOverdue = nextStepDays != null && nextStepDays > 0;
  const nextColor = nextStepOverdue ? OVERDUE_RED : NEXT_BLUE;

  return (
    <Card className="mb-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-text-primary">Deal stage</h2>
            <InfoHint text="Every deal moves through these steps in order. A filled dot already happened and shows its date. An empty dot is still ahead. The number between two dots is how many days the deal sat on the first one." />
          </div>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            How far this deal has got, how long each step held it, and what&apos;s
            booked next
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-light px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary">
          <CalendarDays size={13} strokeWidth={2} />
          Today is {formatDate(nowIso)}
        </span>
      </div>

      <div data-stage-rail>
        {/* Labels. NOTHING VERTICAL: there used to be a coloured rule down each
            column's left edge tying the label to the rail, and it read as a
            stray tick that missed its own dot by half a dot's width (Anir, Jul
            28: "the vertical lines aren't even aligned with the dot"). The
            label group now simply starts on its dot's centre line, and the
            horizontal rail is the only line in this block. Bottom-aligned so
            every column's last line sits level above the rail. */}
        <div className="flex items-stretch">
          {rungs.map((n) => (
            <div
              key={n.stage}
              className="flex min-w-0 flex-col justify-end gap-1 pb-2 pr-3"
              style={{ width: `${n.width}%`, paddingLeft: DOT_CENTRE }}
            >
              <span
                className="inline-flex w-fit max-w-full items-start gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-snug"
                style={chipStyle(n)}
              >
                <n.Icon size={12} strokeWidth={2.1} className="mt-[2px] shrink-0" />
                <span className="min-w-0 break-normal">{n.stage}</span>
              </span>
              <span
                className={cn(
                  "break-normal text-[12px] font-semibold leading-snug tnum",
                  n.state === "todo" || n.dateLine === "Not logged"
                    ? "text-text-tertiary"
                    : "text-text-primary"
                )}
              >
                {n.dateLine}
              </span>
              {/* Reserved height keeps every column's baseline level even when a
                  step has nothing to say underneath it. */}
              <span className="min-h-[15px] break-normal text-[10.5px] leading-snug text-text-tertiary">
                {n.subLine}
              </span>
            </div>
          ))}
        </div>

        {/* The rail itself: a dot at each step, and the run to the next step
            painted in that step's own colour. Edge to edge, no inset. */}
        <div className="flex h-3.5 w-full items-center">
          {rungs.map((n) => (
            <div key={n.stage} className="flex h-full items-center" style={{ width: `${n.width}%` }}>
              <Dot rung={n} />
              <Run rung={n} />
            </div>
          ))}
        </div>

        {/* How long each step held the deal. Nothing under a step that has no
            date, because an undated step has no measurable stay. */}
        <div className="mt-1.5 flex items-start">
          {rungs.map((n) => (
            <div
              key={n.stage}
              className="min-w-0 pr-3 text-[11.5px] leading-snug"
              style={{ width: `${n.width}%`, paddingLeft: DOT_CENTRE }}
            >
              {n.days != null ? (
                <StayLabel rung={n} />
              ) : (
                <span className="block min-h-[15px]" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The booked next step, on its own line under a divider — a calendar item
          is not a pipeline stage, so it is not on the rail. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border-light pt-3.5 text-[12.5px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold"
          style={{ background: tint(nextColor, 8), color: nextColor }}
        >
          <CalendarClock size={13} strokeWidth={2.1} />
          {nextStepOverdue ? "Follow-up overdue" : "Next step"}
        </span>
        {nextStep == null ? (
          <span className="text-text-secondary">Nothing booked yet.</span>
        ) : (
          <>
            <span className="font-semibold text-text-primary tnum">
              {formatDate(nextStep)}
            </span>
            <span className="text-text-secondary">
              {nextStepOverdue
                ? `${daysLabel(nextStepDays ?? 0)} overdue`
                : whenLabel(nextStepDays)}
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/** The duration of one stay, and the drill-down behind it: the real logged
 *  touches that opened and closed it. The hover never restates the label. */
function StayLabel({ rung }: { rung: Rung }) {
  const days = rung.days ?? 0;
  return (
    <HoverCard
      side="bottom"
      width={320}
      delayMs={0}
      content={<StayHover rung={rung} />}
      clearAncestor="[data-stage-rail]"
      className="block w-fit max-w-full cursor-pointer"
    >
      <span className="block break-normal font-semibold text-text-secondary tnum">
        {days === 0 ? "same day" : daysLabel(days)}
        {rung.running && (
          <span className="font-normal text-text-tertiary"> so far</span>
        )}
      </span>
    </HoverCard>
  );
}

function StayHover({ rung }: { rung: Rung }) {
  const StageIcon = rung.Icon;
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border-light pb-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: tint(rung.color, 10), color: rung.color }}
        >
          <StageIcon size={15} strokeWidth={2} />
        </span>
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-text-primary">
          What moved it through {rung.stage}
        </p>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {rung.enteredBy ? (
          <TouchRow interaction={rung.enteredBy} lead="In:" />
        ) : (
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">In:</span> the deal
            was created on {formatDate(rung.enteredAt)}, no touch was needed to
            put it here.
          </p>
        )}
        {rung.leftBy ? (
          <TouchRow interaction={rung.leftBy} lead="Out:" />
        ) : (
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">Out:</span> nothing
            has moved it on yet, this stay is still counting.
          </p>
        )}
      </div>
    </div>
  );
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
            style={{ background: tint(m.color, 10), color: m.color }}
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

function chipStyle(n: Rung): React.CSSProperties {
  if (n.state === "current") {
    return {
      background: n.color,
      color: "#FFFFFF",
      border: `1px solid ${n.color}`,
      boxShadow: `0 0 0 3px ${tint(n.color, 13)}`,
    };
  }
  if (n.state === "done") {
    return {
      background: tint(n.color, 8),
      color: n.color,
      border: `1px solid ${tint(n.color, 30)}`,
    };
  }
  // Steps still ahead stay colour-coded (never gray) but read as "not yet"
  // through a dashed outline and an empty fill.
  return {
    background: "transparent",
    color: n.color,
    border: `1px dashed ${tint(n.color, 50)}`,
  };
}

/** The run from this step's dot to the next step's. Solid in the step's own
 *  colour once the deal has walked it; dashed and quiet for the part of the
 *  funnel still ahead. */
function Run({ rung }: { rung: Rung }) {
  return (
    <span
      aria-hidden
      className="h-[3px] min-w-[8px] flex-1 rounded-full"
      style={
        rung.state === "todo"
          ? {
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--border) 0 5px, transparent 5px 11px)",
            }
          : { background: rung.color }
      }
    />
  );
}

/** Every dot rides in the same fixed-width box, so its centre lands on the same
 *  x its label group starts on however big the dot itself is. */
function Dot({ rung }: { rung: Rung }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{ width: DOT_BOX }}
    >
      {rung.state === "todo" ? (
        <span
          className="h-2.5 w-2.5 rounded-full border-2 bg-[var(--surface)]"
          style={{ borderColor: tint(rung.color, 50) }}
        />
      ) : (
        <span
          className={cn(
            "rounded-full",
            rung.state === "current" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
          )}
          style={{
            background: rung.color,
            boxShadow:
              rung.state === "current" ? `0 0 0 4px ${tint(rung.color, 15)}` : undefined,
          }}
        />
      )}
    </span>
  );
}
