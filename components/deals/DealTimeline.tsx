import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  MapPin,
  MessagesSquare,
  Radar,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY, stageKey } from "@/lib/glossary";
import { OPEN_STAGES, STAGE_COLOR, type Stage } from "@/lib/pipeline";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { daysLabel, daysSince, whenLabel } from "./dealTime";

// Every stage carries a colour AND an icon — a stage is a status chip, and a
// status chip is never plain type on a plain background (standing rule).
export const STAGE_ICON: Record<Stage, LucideIcon> = {
  Prospect: Radar,
  Engaged: MessagesSquare,
  Qualified: BadgeCheck,
  "Meeting Booked": CalendarCheck,
  "Closed Lost": XCircle,
};

const TODAY_BLUE = "#0071E3";
const OVERDUE_RED = "#FF3B30";

type Fill = "solid" | "soft" | "outline";

type Node = {
  key: string;
  label: string;
  Icon: LucideIcon;
  color: string;
  fill: Fill;
  /** Drives the marker shape on the rail. */
  kind: "stage" | "today" | "step";
  /** Bigger dot for the stage the deal is actually sitting on. */
  isCurrent?: boolean;
  dateLine: string;
  subLine: string;
  hint: string;
};

export function DealTimeline({
  stage,
  stageDates,
  stageStartedAt,
  nextStep,
  lastActivityAt,
  nowIso,
}: {
  stage: Stage;
  stageDates: Record<string, string | undefined>;
  /** When the deal entered the stage it's in now. */
  stageStartedAt: string;
  /** Scheduled follow-up date, if a rep booked one (yyyy-mm-dd). */
  nextStep: string | null;
  lastActivityAt: string | null;
  nowIso: string;
}) {
  const lost = stage === "Closed Lost";
  // A live deal is never shown ending on "Closed Lost". The stage vocabulary has
  // no Closed Won, so printing the loss step on an open deal made a healthy deal
  // look dead — we render the open path and only draw the loss when it's real.
  const path: Stage[] = lost ? [...OPEN_STAGES, "Closed Lost"] : [...OPEN_STAGES];
  const currentIdx = path.indexOf(stage);

  const nextStepDays = daysSince(nextStep, nowIso);
  const nextStepOverdue = nextStepDays != null && nextStepDays > 0;

  const nodes: Node[] = [];
  path.forEach((s, i) => {
    const date = stageDates[s];
    const days = daysSince(date, nowIso);
    const reached = i <= currentIdx;
    const isCurrent = i === currentIdx;
    const color = STAGE_COLOR[s];
    nodes.push({
      key: `stage-${s}`,
      label: s,
      Icon: STAGE_ICON[s],
      color,
      fill: isCurrent ? "solid" : reached ? "soft" : "outline",
      kind: "stage",
      isCurrent,
      // Short lines only — every column prints the same two rows, so long
      // sentences would leave the row ragged. The full story is in the hover.
      dateLine: date ? formatDate(date) : reached ? "Not logged" : "Not yet",
      subLine: date ? whenLabel(days) : reached ? "skipped" : "still ahead",
      hint: date
        ? `${GLOSSARY[stageKey(s)]?.def ?? ""} Logged ${formatDateTime(date)}.`
        : reached
          ? `${GLOSSARY[stageKey(s)]?.def ?? ""} Nothing was logged at this step — the deal moved straight past it.`
          : `${GLOSSARY[stageKey(s)]?.def ?? ""} This deal hasn't got here yet.`,
    });

    if (!isCurrent) return;

    // An overdue follow-up belongs BEFORE the today line; a booked one after it.
    // That is the whole point of the marker: you read the gap at a glance.
    if (nextStep && nextStepOverdue) nodes.push(stepNode(nextStep, nextStepDays));
    nodes.push({
      key: "today",
      label: "Today",
      Icon: MapPin,
      color: TODAY_BLUE,
      fill: "solid",
      kind: "today",
      dateLine: formatDate(nowIso),
      subLine: "you are here",
      hint: `Today is ${formatDate(nowIso)}. Everything to the left already happened; everything to the right hasn't.`,
    });
    if (nextStep && !nextStepOverdue) nodes.push(stepNode(nextStep, nextStepDays));
  });

  const todayIdx = nodes.findIndex((n) => n.kind === "today");
  const lastIdx = nodes.length - 1;

  // The one-line read under the rail, in Suren's words rather than CRM words.
  const enteredDays = daysSince(stageStartedAt, nowIso);
  const quietDays = daysSince(lastActivityAt, nowIso);
  const sentences: string[] = [
    lost
      ? `This deal was marked lost ${whenLabel(enteredDays) || "recently"}.`
      : `It reached ${stage} ${whenLabel(enteredDays) || "recently"} and has been sitting there ${
          enteredDays != null && enteredDays > 0 ? `for ${daysLabel(enteredDays)}` : "since today"
        }.`,
    quietDays == null
      ? "Nothing has been logged on it yet."
      : quietDays === 0
        ? "Something was logged on it today."
        : `Nothing has been logged for ${daysLabel(quietDays)}.`,
    nextStep == null
      ? "No next step is on the calendar."
      : nextStepOverdue
        ? `The follow-up set for ${formatDate(nextStep)} is ${daysLabel(nextStepDays ?? 0)} overdue.`
        : `The next step is booked for ${formatDate(nextStep)}, ${whenLabel(nextStepDays)}.`,
  ];

  return (
    <Card className="mb-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[13px] font-semibold text-text-primary">Deal stage</h2>
          <InfoHint text="Every step this deal has taken, left to right. Solid steps already happened and show the date they happened. Dashed steps haven't happened yet. The blue Today line shows exactly where we are on that path right now." />
          <span className="text-[12px] text-text-tertiary">
            — every step it has taken, and where today sits on that line
          </span>
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
        style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}
      >
        {nodes.map((n, i) => (
          <div key={n.key} className="flex min-w-0 flex-col items-center">
            <div className="flex h-8 items-center justify-center">
              <Tooltip label={n.hint} side="top">
                <span
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none"
                  style={chipStyle(n)}
                >
                  <n.Icon size={12} strokeWidth={2.1} />
                  {n.label}
                </span>
              </Tooltip>
            </div>

            <div className="flex h-7 w-full items-center">
              <Rail show={i > 0} filled={i <= todayIdx} />
              <Marker node={n} />
              <Rail show={i < lastIdx} filled={i < todayIdx} />
            </div>

            <div className="mt-1 flex flex-col items-center px-1 text-center">
              <span
                className={cn(
                  "text-[11.5px] font-semibold tnum",
                  n.fill === "outline" ? "text-text-tertiary" : "text-text-primary"
                )}
              >
                {n.dateLine}
              </span>
              <span className="text-[10.5px] leading-snug text-text-tertiary">
                {n.subLine}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 rounded-lg bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-text-secondary">
        {sentences.join(" ")}
      </p>
    </Card>
  );
}

function stepNode(nextStep: string, days: number | null): Node {
  const overdue = days != null && days > 0;
  return {
    key: "next-step",
    label: overdue ? "Follow-up overdue" : "Next step",
    Icon: CalendarClock,
    color: overdue ? OVERDUE_RED : TODAY_BLUE,
    fill: overdue ? "solid" : "outline",
    kind: "step",
    dateLine: formatDate(nextStep),
    subLine: whenLabel(days),
    hint: overdue
      ? `A follow-up was set for ${formatDate(nextStep)} and it hasn't happened. That was ${daysLabel(days ?? 0)} ago.`
      : `The follow-up on the calendar for this deal: ${formatDate(nextStep)}, ${whenLabel(days)}.`,
  };
}

function chipStyle(n: Node): React.CSSProperties {
  if (n.fill === "solid") {
    return {
      background: n.color,
      color: "#FFFFFF",
      border: `1px solid ${n.color}`,
      boxShadow: `0 0 0 3px ${n.color}22`,
    };
  }
  if (n.fill === "soft") {
    return {
      background: `${n.color}14`,
      color: n.color,
      border: `1px solid ${n.color}4D`,
    };
  }
  // Un-reached steps stay colour-coded (never gray) but read as "not yet"
  // through a dashed outline and an empty fill.
  return {
    background: "transparent",
    color: n.color,
    border: `1px dashed ${n.color}80`,
  };
}

/** Half a connector. Dashed once you're past today — the future isn't drawn as
 *  a solid line the deal has already walked. */
function Rail({ show, filled }: { show: boolean; filled: boolean }) {
  if (!show) return <span aria-hidden className="h-[3px] min-w-[8px] flex-1" />;
  return (
    <span
      aria-hidden
      className={cn("h-[3px] min-w-[8px] flex-1 rounded-full", filled && "bg-blue-primary")}
      style={
        filled
          ? undefined
          : {
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--border) 0 5px, transparent 5px 11px)",
            }
      }
    />
  );
}

function Marker({ node }: { node: Node }) {
  if (node.kind === "today") {
    return (
      <span
        aria-hidden
        className="mx-1 h-6 w-[3px] shrink-0 rounded-full"
        style={{ background: node.color, boxShadow: `0 0 0 3px ${node.color}1F` }}
      />
    );
  }
  if (node.kind === "step") {
    return (
      <span
        aria-hidden
        className="mx-1 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]"
        style={{ background: node.color }}
      />
    );
  }
  if (node.fill === "outline") {
    return (
      <span
        aria-hidden
        className="mx-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-white"
        style={{ borderColor: `${node.color}80` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mx-1 shrink-0 rounded-full",
        node.isCurrent ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
      )}
      style={{
        background: node.color,
        boxShadow: node.isCurrent ? `0 0 0 4px ${node.color}26` : undefined,
      }}
    />
  );
}
