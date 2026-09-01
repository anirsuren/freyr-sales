import type { CSSProperties } from "react";
import {
  CircleCheck,
  PencilLine,
  TriangleAlert,
  UserPen,
  Bot,
  FileClock,
  type LucideIcon,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  AccrualStatus,
  DeviationOrigin,
} from "@/lib/revenueAccrualsShared";

/**
 * WHAT STATE AN ACCRUAL RECORD IS IN, IN ONE PILL.
 *
 * Suren designed this vocabulary out loud on the Sep 1 call, and the wording is
 * his, because the words ARE the requirement:
 *
 *   "one is filled one is non-filled... active and filled... then something
 *    becomes inactive. what does inactive mean? A record that the system
 *    creates but it's inactive, that means somebody has to go and fix it...
 *    this will only happen for filled records."
 *
 *   "nobody can make it inactive because people have to enter that information
 *    somehow. If they have not filled it, then it's non-filled."
 *
 *   "Every time you see an accrual record, the record has a version number and
 *    a status."
 *
 * TWO AXES, NOT ONE LADDER. The status says whether the record counts. The
 * origin says who made this version. They are independent, and the giveaway is
 * that a user-deviated record is still Active and Filled: deviating is not a
 * demotion, it is an edit with a paper trail. Conflating them would paint an
 * ordinary revision as a problem.
 *
 * Both types come from lib/revenueAccrualsShared.ts, which owns the model and
 * derives status rather than storing it. This file only decides how it LOOKS.
 *
 * WHY THESE COLOURS. Red, green and amber are reserved in this app: they carry
 * meaning and are never decoration. Here they ARE the meaning, so they earn it.
 *   · Active and Filled  green, the same pair as the HEALTHY badge, which is
 *     the green Suren picked himself on Jul 28 after rejecting the first one.
 *   · Inactive  burnt orange (#C2410C, the `warning` token), NOT the yellow he
 *     banned on Jul 27. Inactive is the only state asking a human for
 *     something, so it is the only one that runs warm.
 *   · Non Filled  indigo. An empty record is a to-do, not a failure. Colouring
 *     it red would cry wolf on every plan nobody has got to yet.
 *
 * DARK MODE goes through `.dark .accrual-status-chip` in globals.css rather
 * than Tailwind `dark:` variants. That is deliberate, not laziness:
 * tailwind.config.ts sets no `darkMode` key, so Tailwind 3.4 falls back to the
 * `media` strategy and `dark:` follows the OPERATING SYSTEM, while this app
 * toggles a `.dark` class from localStorage. The CSS-variable pattern below is
 * the one that actually follows the in-app toggle, and it is what
 * AvailabilityPill and HealthBadge already use.
 */

const STATUS_STYLE: Record<
  AccrualStatus,
  {
    bg: string;
    color: string;
    darkBg: string;
    darkColor: string;
    darkBorder: string;
    icon: LucideIcon;
    tip: string;
  }
> = {
  "Active and Filled": {
    bg: "rgba(34,197,94,0.14)",
    color: "#16A34A",
    darkBg: "rgba(34,197,94,0.18)",
    darkColor: "#4ADE80",
    darkBorder: "rgba(74,222,128,0.42)",
    icon: CircleCheck,
    tip: "The months are filled in and this is the version that counts. Reports read these figures.",
  },
  "Non Filled": {
    bg: "rgba(79,70,229,0.12)",
    color: "#4338CA",
    darkBg: "rgba(99,102,241,0.2)",
    darkColor: "#A5B4FC",
    darkBorder: "rgba(165,180,252,0.42)",
    icon: PencilLine,
    tip: "Nobody has entered the accrued revenue yet. Open it and put the months in.",
  },
  Inactive: {
    bg: "rgba(194,65,12,0.12)",
    color: "#C2410C",
    darkBg: "rgba(249,115,22,0.18)",
    darkColor: "#FDBA74",
    darkBorder: "rgba(253,186,116,0.42)",
    icon: TriangleAlert,
    tip: "The system opened this because the signing date passed. Somebody has to go in and fix it.",
  },
};

const ORIGIN_STYLE: Record<
  DeviationOrigin,
  {
    bg: string;
    color: string;
    darkBg: string;
    darkColor: string;
    darkBorder: string;
    icon: LucideIcon;
    label: string;
    tip: string;
  }
> = {
  original: {
    bg: "rgba(0,113,227,0.10)",
    color: "#0057B8",
    darkBg: "rgba(0,113,227,0.22)",
    darkColor: "#8FC2FF",
    darkBorder: "rgba(143,194,255,0.42)",
    icon: FileClock,
    label: "Original",
    tip: "The plan as it was first written. Nobody has deviated from it.",
  },
  user: {
    bg: "rgba(139,92,246,0.14)",
    color: "#6D28D9",
    darkBg: "rgba(139,92,246,0.2)",
    darkColor: "#C4B5FD",
    darkBorder: "rgba(196,181,253,0.42)",
    icon: UserPen,
    label: "User deviated",
    tip: "Somebody changed the months and gave a reason. The previous version is kept in the history.",
  },
  system: {
    bg: "rgba(13,148,136,0.14)",
    color: "#0F766E",
    darkBg: "rgba(20,184,166,0.2)",
    darkColor: "#5EEAD4",
    darkBorder: "rgba(94,234,212,0.42)",
    icon: Bot,
    label: "System deviated",
    tip: "The signing date passed without a contract, so the system opened a blank version. Its blankness is the reason.",
  },
};

function chipStyle(s: {
  bg: string;
  color: string;
  darkBg: string;
  darkColor: string;
  darkBorder: string;
}): CSSProperties {
  return {
    "--accrual-chip-bg": s.bg,
    "--accrual-chip-color": s.color,
    "--accrual-chip-bg-dark": s.darkBg,
    "--accrual-chip-color-dark": s.darkColor,
    "--accrual-chip-border-dark": s.darkBorder,
  } as CSSProperties;
}

/**
 * The status of an accrual record. Suren wanted the version number beside it
 * ("the record has a version number and a status"), so pass `version` and it
 * rides along on the same pill instead of floating loose next to it.
 */
export function AccrualStatusChip({
  status,
  version,
  size = "md",
}: {
  status: AccrualStatus;
  version?: number;
  size?: "sm" | "md";
}) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  const pad =
    size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]";
  return (
    <Tooltip label={s.tip}>
      <span
        className={`accrual-status-chip inline-flex items-center gap-1 font-semibold rounded-full cursor-pointer whitespace-nowrap ${pad}`}
        style={chipStyle(s)}
      >
        <Icon size={size === "sm" ? 10 : 12} strokeWidth={2.3} />
        {status}
        {version && version > 1 ? (
          <span className="opacity-70">{`v${version}`}</span>
        ) : null}
      </span>
    </Tooltip>
  );
}

/**
 * Who made this version. Deliberately a separate pill from the status, so a
 * history table can show "Active and Filled · User deviated" without either
 * word having to carry the other's meaning.
 *
 * Version 1 of an untouched plan renders nothing by default: labelling the
 * only version "Original" on every row is noise. Pass `showOriginal` for the
 * history table, where the first row genuinely wants naming.
 */
export function AccrualOriginChip({
  origin,
  showOriginal = false,
  size = "md",
}: {
  origin: DeviationOrigin;
  showOriginal?: boolean;
  size?: "sm" | "md";
}) {
  if (origin === "original" && !showOriginal) return null;
  const s = ORIGIN_STYLE[origin];
  const Icon = s.icon;
  const pad =
    size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]";
  return (
    <Tooltip label={s.tip}>
      <span
        className={`accrual-status-chip inline-flex items-center gap-1 font-semibold rounded-full cursor-pointer whitespace-nowrap ${pad}`}
        style={chipStyle(s)}
      >
        <Icon size={size === "sm" ? 10 : 12} strokeWidth={2.3} />
        {s.label}
      </span>
    </Tooltip>
  );
}
