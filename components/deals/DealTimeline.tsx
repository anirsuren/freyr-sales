import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY, stageKey } from "@/lib/glossary";
import {
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_ICON,
  type Stage,
} from "@/lib/pipeline";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { daysLabel, daysSince, whenLabel } from "./dealTime";

/* ---------------------------------------------------------------------------
   ONE AXIS, AND IT IS THE FUNNEL.

   The old rail read Prospect → Engaged → Today → Next step → Qualified →
   Meeting Booked. A date marker and a calendar item were sitting in the line as
   if they were pipeline stages, and the stages the deal hadn't reached yet came
   AFTER them. Nobody could say what the axis was.

   Now the rail is the funnel and nothing else, always in funnel order. Time
   lives on its own line underneath, visually separate, because time is not a
   stage. Stage colours and glyphs come from lib/pipeline so a stage can never
   look like two different things on two different screens.
--------------------------------------------------------------------------- */

const OVERDUE_RED = "#FF3B30"; // = --error, and only for an overdue follow-up
const NEXT_BLUE = "#0071E3"; // = --blue-primary

type State = "done" | "current" | "todo";

type Rung = {
  stage: Stage;
  Icon: LucideIcon;
  color: string;
  state: State;
  dateLine: string;
  subLine: string;
  hint: string;
};

export function DealTimeline({
  stage,
  stageDates,
  nextStep,
  nowIso,
}: {
  stage: Stage;
  stageDates: Record<string, string | undefined>;
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

  const rungs: Rung[] = path.map((s, i) => {
    const date = stageDates[s];
    const days = daysSince(date, nowIso);
    const reached = i <= currentIdx;
    const state: State = i === currentIdx ? "current" : reached ? "done" : "todo";
    const def = GLOSSARY[stageKey(s)]?.def ?? "";
    return {
      stage: s,
      Icon: STAGE_ICON[s],
      color: STAGE_COLOR[s],
      state,
      // Two short rows per column and nothing else — a sentence here would leave
      // the rail ragged. The full story is in the hover.
      dateLine: date ? formatDate(date) : reached ? "Not logged" : "Not yet",
      subLine: date ? whenLabel(days) : reached ? "skipped" : "",
      hint: date
        ? `${def} Logged ${formatDateTime(date)}.`
        : reached
          ? `${def} Nothing was logged at this step — the deal moved straight past it.`
          : `${def} This deal hasn't got here yet.`,
    };
  });

  const lastIdx = rungs.length - 1;
  const nextStepDays = daysSince(nextStep, nowIso);
  const nextStepOverdue = nextStepDays != null && nextStepDays > 0;
  const nextColor = nextStepOverdue ? OVERDUE_RED : NEXT_BLUE;

  return (
    <Card className="mb-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-text-primary">Deal stage</h2>
            <InfoHint text="The four steps every deal walks, in order. Filled steps already happened and show the date; outlined steps are still ahead." />
          </div>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            How far this deal has got, and what&apos;s booked next
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-light px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary">
          <CalendarDays size={13} strokeWidth={2} />
          Today is {formatDate(nowIso)}
        </span>
      </div>

      {/* Equal 1fr columns: the rail always spans the full card width, and the
          connectors flex, so the tracker can never scroll sideways. */}
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: `repeat(${rungs.length}, minmax(0, 1fr))` }}
      >
        {rungs.map((n, i) => (
          <div key={n.stage} className="flex min-w-0 flex-col items-center">
            <div className="flex h-8 items-center justify-center">
              <Tooltip label={n.hint} side="top">
                <span
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none"
                  style={chipStyle(n)}
                >
                  <n.Icon size={12} strokeWidth={2.1} />
                  {n.stage}
                </span>
              </Tooltip>
            </div>

            {/* The walked path is drawn in the colours of the stages it walked
                through; everything past the deal's current position is a quiet
                dashed line, because it hasn't happened. */}
            <div className="flex h-7 w-full items-center">
              <Rail show={i > 0} color={n.color} filled={i <= currentIdx} />
              <Dot rung={n} />
              <Rail show={i < lastIdx} color={n.color} filled={i < currentIdx} />
            </div>

            <div className="mt-1 flex flex-col items-center px-1 text-center">
              <span
                className={cn(
                  "text-[11.5px] font-semibold tnum",
                  n.state === "todo" || !stageDates[n.stage]
                    ? "text-text-tertiary"
                    : "text-text-primary"
                )}
              >
                {n.dateLine}
              </span>
              {/* Reserved height keeps every column's baseline level even when a
                  step has nothing to say underneath it. */}
              <span className="min-h-[15px] text-[10.5px] leading-snug text-text-tertiary">
                {n.subLine}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Time, on its own line, under a divider — it is not a stage, so it is
          not on the rail. This one line replaces the three-sentence paragraph
          that used to restate the graphic above it. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border-light pt-3.5 text-[12.5px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold"
          style={{ background: `${nextColor}14`, color: nextColor }}
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

function chipStyle(n: Rung): React.CSSProperties {
  if (n.state === "current") {
    return {
      background: n.color,
      color: "#FFFFFF",
      border: `1px solid ${n.color}`,
      boxShadow: `0 0 0 3px ${n.color}22`,
    };
  }
  if (n.state === "done") {
    return {
      background: `${n.color}14`,
      color: n.color,
      border: `1px solid ${n.color}4D`,
    };
  }
  // Steps still ahead stay colour-coded (never gray) but read as "not yet"
  // through a dashed outline and an empty fill.
  return {
    background: "transparent",
    color: n.color,
    border: `1px dashed ${n.color}80`,
  };
}

/** Half a connector. Solid in the stage's own colour once the deal has walked
 *  it; dashed and quiet for the part of the funnel still ahead. */
function Rail({
  show,
  color,
  filled,
}: {
  show: boolean;
  color: string;
  filled: boolean;
}) {
  if (!show) return <span aria-hidden className="h-[3px] min-w-[8px] flex-1" />;
  return (
    <span
      aria-hidden
      className="h-[3px] min-w-[8px] flex-1 rounded-full"
      style={
        filled
          ? { background: color }
          : {
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--border) 0 5px, transparent 5px 11px)",
            }
      }
    />
  );
}

function Dot({ rung }: { rung: Rung }) {
  if (rung.state === "todo") {
    return (
      <span
        aria-hidden
        className="mx-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-white"
        style={{ borderColor: `${rung.color}80` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mx-1 shrink-0 rounded-full",
        rung.state === "current" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
      )}
      style={{
        background: rung.color,
        boxShadow: rung.state === "current" ? `0 0 0 4px ${rung.color}26` : undefined,
      }}
    />
  );
}
