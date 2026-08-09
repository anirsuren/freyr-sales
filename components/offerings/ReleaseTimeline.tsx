"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * THE RELEASE TIMELINE — where today sits against the last, current and next
 * release. It lived on the offering Overview until Aug 7, when Anir moved it
 * to the Roadmap tab ("put the timeline on the roadmap tab for now, and bring
 * back the availability section on the main offering page"): Overview answers
 * "can I sell this and which version", the Roadmap tab answers "what shipped
 * when".
 */
import type { OfferingRelease } from "@/lib/offerings";

const TIMELINE_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

function parseTimelineDate(value?: string | null): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const parsed = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monthYear = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s./-]+(?:'?(\d{2})|(20\d{2}))\b/i
  );
  if (!monthYear) return null;

  const month = TIMELINE_MONTHS.findIndex((candidate) =>
    monthYear[1].toLowerCase().startsWith(candidate)
  );
  const year = monthYear[3]
    ? Number(monthYear[3])
    : 2000 + Number(monthYear[2]);
  if (month < 0 || !Number.isFinite(year)) return null;
  return new Date(Date.UTC(year, month, 1));
}

function formatTimelineDate(date: Date | null): string {
  if (!date) return "Date not recorded";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * TODAY IS AN EXACT DAY, NOT A MONTH.
 *
 * Release dates are recorded as month-and-year, so they format that way —
 * but stamping the same shape on the Today marker printed "Aug 2026" for a
 * date the reader knows is the 6th (Anir, Aug 6: "you can't say Aug 2026,
 * that's not the date").
 */
function formatExactDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** True when the recorded text actually named a DAY, not just a month. Show
 *  the day whenever it is known; never invent one when it is not. */
function hasDayPrecision(value?: string | null): boolean {
  if (!value) return false;
  return /\b20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/.test(value);
}

type TimelineMilestone = {
  eyebrow: string;
  title: string;
  detail: string;
  date: Date | null;
  /** The source text named a day, so the day may be shown. */
  exact?: boolean;
  tone: "past" | "current" | "next";
};

export function ReleaseTimeline({
  availability,
  currentVersion,
  currentReleaseDate,
  nextVersion,
  nextExpected,
  fallbackNext,
  releases,
}: {
  availability: string;
  currentVersion: string | null;
  currentReleaseDate: string | null;
  nextVersion: string;
  nextExpected: string;
  fallbackNext?: { label: string; body: string };
  releases?: OfferingRelease[];
}) {
  const [open, setOpen] = useState(true);
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const datedReleased = (releases || [])
    .filter((release) => release.status === "released")
    .map((release) => ({ release, date: parseTimelineDate(release.date) }))
    .filter((entry): entry is { release: OfferingRelease; date: Date } => !!entry.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const datedNext = (releases || [])
    .filter((release) => release.status === "next")
    .map((release) => ({ release, date: parseTimelineDate(release.date) }))
    .filter((entry): entry is { release: OfferingRelease; date: Date } => !!entry.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  const latestReleased = datedReleased.at(-1);
  const previousReleased = datedReleased.at(-2);
  const parsedCurrentDate =
    latestReleased?.date || parseTimelineDate(currentReleaseDate);
  const parsedNextDate =
    datedNext?.date ||
    parseTimelineDate(nextExpected) ||
    parseTimelineDate(availability);
  const availabilityIsFuture = !!(
    parsedNextDate && parsedNextDate.getTime() > todayUtc.getTime()
  );
  const availableNow = /available\s+now|currently\s+available/i.test(availability);

  const previous: TimelineMilestone = previousReleased
    ? {
        eyebrow: "Previous release",
        title: previousReleased.release.version,
        detail: formatTimelineDate(previousReleased.date),
        date: previousReleased.date,
        exact: hasDayPrecision(previousReleased.release.date),
        tone: "past",
      }
    : {
        eyebrow: "Previous release",
        title: "Not recorded",
        detail: "No earlier dated release is on file",
        date: null,
        tone: "past",
      };

  const current: TimelineMilestone = latestReleased || currentVersion
    ? {
        eyebrow: "Current release",
        title: latestReleased?.release.version || currentVersion || "Current release",
        // A date still ahead of us is a plan, not a history (Anir, Aug 9:
        // "it isn't even September yet, it says September 1").
        detail: parsedCurrentDate
          ? parsedCurrentDate > new Date()
            ? `Due ${formatTimelineDate(parsedCurrentDate)}`
            : `Live since ${formatTimelineDate(parsedCurrentDate)}`
          : availableNow
            ? "Available now · release date not recorded"
            : "Release date not recorded",
        date: parsedCurrentDate,
        exact: hasDayPrecision(latestReleased?.release.date || currentReleaseDate),
        tone: "current",
      }
    : {
        eyebrow: "Where we are now",
        title: availabilityIsFuture
          ? "In preparation"
          : availableNow
            ? "Available now"
            : availability || "Status not recorded",
        detail: "Today",
        date: todayUtc,
        tone: "current",
      };

  const nextTitle =
    datedNext?.release.version ||
    nextVersion ||
    (availabilityIsFuture ? "Available" : fallbackNext?.body) ||
    "Not scheduled";
  const next: TimelineMilestone = {
    eyebrow: availabilityIsFuture && !nextVersion ? "Next availability" : "Next release",
    title: nextTitle,
    detail: parsedNextDate
      ? `${parsedNextDate.getTime() < todayUtc.getTime() ? "Planned" : "Expected"} ${formatTimelineDate(parsedNextDate)}`
      : fallbackNext?.label
        ? `${fallbackNext.label} · date not recorded`
        : "No future date is on file",
    date: parsedNextDate,
    exact: hasDayPrecision(datedNext?.release.date || nextExpected || availability),
    tone: "next",
  };

  const milestones = [previous, current, next];
  const datedPoints = [...milestones.map((milestone) => milestone.date), todayUtc]
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime());
  const domainStart = datedPoints[0] || todayUtc;
  const domainEnd = datedPoints.at(-1) || todayUtc;
  const domainSpan = Math.max(domainEnd.getTime() - domainStart.getTime(), 1);
  const positionFor = (date: Date) =>
    Math.min(
      97,
      Math.max(3, ((date.getTime() - domainStart.getTime()) / domainSpan) * 94 + 3)
    );
  /**
   * FOUR FACTS, ONE AXIS: today, and the three release dates around it.
   *
   * The releases sit at fixed thirds so each one lines up with its own card
   * underneath — proportional placement stacked them on the left edge
   * whenever dates were thin and the strip read as broken (Anir, Aug 6).
   * TODAY is the one marker that moves: it slides inside whichever gap it
   * actually falls into, interpolated between the two real dates bounding
   * it, so "where we are" is truthful without distorting the rest.
   */
  /**
   * Stops sit at the CENTRE of each card below, and the cards are sized
   * 26/48/26 so those centres land at 13/50/87 — near the edges, using the
   * rail instead of leaving dead stubs at both ends (Anir, Aug 6: "the
   * point could be closer to the edge… you're wasting space").
   */
  const stops = [13, 50, 87];
  const fractionBetween = (from: Date, to: Date, at: Date) => {
    const span = to.getTime() - from.getTime();
    if (span <= 0) return 0.5;
    return Math.min(1, Math.max(0, (at.getTime() - from.getTime()) / span));
  };
  const dPrev = previous.date;
  const dCur = current.date;
  const dNext = next.date;
  let todayStop: number;
  if (dCur && todayUtc.getTime() < dCur.getTime()) {
    todayStop = dPrev
      ? stops[0] + fractionBetween(dPrev, dCur, todayUtc) * (stops[1] - stops[0])
      : (stops[0] + stops[1]) / 2;
  } else if (dNext && todayUtc.getTime() < dNext.getTime()) {
    todayStop = dCur
      ? stops[1] + fractionBetween(dCur, dNext, todayUtc) * (stops[2] - stops[1])
      : (stops[1] + stops[2]) / 2;
  } else if (dNext) {
    todayStop = Math.min(96, stops[2] + 7);
  } else {
    todayStop = (stops[1] + stops[2]) / 2;
  }

  /** "3 months ago" / "in 2 months" / "this month" — the human distance. */
  const monthsAway = (date: Date | null) => {
    if (!date) return null;
    const months =
      (todayUtc.getUTCFullYear() - date.getUTCFullYear()) * 12 +
      (todayUtc.getUTCMonth() - date.getUTCMonth());
    if (months === 0) return "this month";
    const n = Math.abs(months);
    const unit = n === 1 ? "month" : "months";
    return months > 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
  };

  // Identity by time, not by status vocabulary: shipped past is slate, the
  // live release is green, what is coming is blue — the same three colours
  // the roadmap editor uses, so both screens read as one language.
  const TONE = {
    past: { dot: "#8E98A8", text: "text-[#5A6472]", panel: "bg-white" },
    current: { dot: "#20B15A", text: "text-[#137A3C]", panel: "bg-[rgba(32,177,90,0.06)]" },
    next: { dot: "#0071E3", text: "text-blue-primary", panel: "bg-blue-light/25" },
  } as const;

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border-light bg-surface shadow-sm">
      {/* Today's date lives in the header, top right — one statement of
          "now", not a badge floating over the rail (Anir, Aug 6). */}
      {/* The header band is the toggle, and it wears the same emphasis as the
          section cards below it so all six read as one stack (Freyr, Aug 7). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="flex cursor-pointer select-none items-center justify-between gap-3 border-b border-blue-subtle/60 bg-blue-light/60 px-5 py-3 transition-colors hover:bg-blue-light"
      >
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-blue-primary">
          Release timeline
        </p>
        <span className="shrink-0 rounded-full bg-blue-light px-2.5 py-1 text-[10.5px] font-semibold text-blue-primary">
          Today · {formatExactDate(todayUtc)}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
          className={`shrink-0 text-blue-primary transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </div>
      {open && (

      <div className="overflow-x-auto px-5 pb-5 pt-4">
        <div className="min-w-[600px]">
          {/* A quiet "today" tick above the rail — the date itself is in the
              header, so this only has to say WHERE now falls. */}
          <div className="relative h-4">
            <div
              className="absolute -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] text-blue-primary"
              style={{ left: `${todayStop}%` }}
            >
              Today
            </div>
          </div>

          <div
            className="relative h-8"
            role="img"
            aria-label={`Release timeline: ${milestones
              .map((m) => `${m.eyebrow} ${m.title}`)
              .join(", ")}. Today is ${formatExactDate(todayUtc)}.`}
          >
            {/* Solid slate-to-green through what shipped, dashed blue into
                what has not happened yet. */}
            <div className="absolute left-0 right-0 top-[13px] h-[3px] rounded-full bg-border-light" />
            <div
              className="absolute top-[13px] h-[3px] rounded-full"
              style={{
                left: `${stops[0]}%`,
                width: `${stops[1] - stops[0]}%`,
                backgroundImage: `linear-gradient(90deg, ${TONE.past.dot}, ${TONE.current.dot})`,
              }}
            />
            <div
              className="absolute top-[13px] h-0 border-t-[3px] border-dashed"
              style={{
                left: `${stops[1]}%`,
                width: `${stops[2] - stops[1]}%`,
                borderColor: TONE.next.dot,
                opacity: 0.5,
              }}
            />

            {/* The today needle, drawn under the dots so it never covers one. */}
            <div
              className="absolute top-0 h-8 w-[2px] -translate-x-1/2 rounded-full bg-blue-primary"
              style={{ left: `${todayStop}%` }}
              aria-hidden="true"
            />

            {milestones.map((milestone, index) => {
              const tone = TONE[milestone.tone];
              const dated = !!milestone.date;
              return (
                <div
                  key={`${milestone.eyebrow}-${milestone.title}`}
                  className="absolute top-[5px] -translate-x-1/2"
                  style={{ left: `${stops[index]}%` }}
                  title={`${milestone.eyebrow}: ${milestone.title}${
                    dated ? ` · ${formatTimelineDate(milestone.date)}` : ""
                  }`}
                >
                  <span
                    className="block h-[19px] w-[19px] rounded-full border-[4px] border-white"
                    style={{
                      backgroundColor: dated ? tone.dot : "#FFFFFF",
                      boxShadow: `0 0 0 2px ${dated ? tone.dot : `${tone.dot}66`}, 0 2px 6px rgba(15,23,42,0.18)`,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* 26 / 48 / 26 puts each label's centre exactly under its dot at
              13 / 50 / 87. No panels, no borders — just a tight centred
              stack, because the fat cards dwarfed the timeline itself. */}
          <div className="mt-2 grid grid-cols-[26fr_48fr_26fr]">
            {milestones.map((milestone) => {
              const tone = TONE[milestone.tone];
              const away = monthsAway(milestone.date);
              return (
                <div key={milestone.eyebrow} className="min-w-0 px-2 text-center">
                  <p
                    className={`text-[9px] font-bold uppercase tracking-[0.09em] ${tone.text}`}
                  >
                    {milestone.eyebrow}
                  </p>
                  {/* The DATE is the headline — that is the question being
                      asked (Anir: "when was it released"). */}
                  <p className="mt-1 text-[13.5px] font-bold leading-tight tracking-[-0.01em] text-text-primary tnum">
                    {milestone.date
                      ? milestone.exact
                        ? formatExactDate(milestone.date)
                        : formatTimelineDate(milestone.date)
                      : "No date yet"}
                  </p>
                  <p className="mt-0.5 break-words text-[11px] leading-snug text-text-secondary">
                    <span className="font-semibold">{milestone.title}</span>
                    {away ? <span className="text-text-tertiary"> · {away}</span> : null}
                  </p>
                  {!milestone.date && (
                    <p className="mt-0.5 text-[10px] leading-snug text-text-tertiary">
                      {milestone.detail}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
