"use client";

import { CalendarClock, Flag, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THREE DATES ON ONE RAIL: asked, today, due.
 *
 * Anir, Aug 28: "for the needed by, I want the timeline, so I want to visually
 * see today, when the thing was requested, and when it is needed by. Just like
 * the FDL components timeline. Literally super similar but tweaked."
 *
 * "needed by 2026-08-31" is a fact you have to do arithmetic on. Whether that
 * is comfortable or alarming depends entirely on today and on how long the
 * request has already been sitting, and neither of those was on screen.
 *
 * The FDL timeline's language, scaled to one row: a rail, a dot per real date,
 * the today marker as the one line that is not a guess, dates set underneath.
 * The tweaks are all subtraction — there is no panning, no zooming and no axis,
 * because three points on a fixed span have nothing to explore. What is added
 * is the fill: the rail carries a coloured bar from the request to today, so
 * the elapsed stretch is a length rather than something to work out.
 *
 * The reserved tones do exactly what they mean here — amber inside a week of
 * the deadline, red past it — because this is a status, which is the one thing
 * those colours are for.
 */

const DAY = 86_400_000;

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function label(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NeededByTimeline({
  requestedAt,
  neededBy,
  done = false,
  className,
}: {
  /** ISO timestamp the request was raised. */
  requestedAt: string;
  /** ISO date it is due. */
  neededBy: string;
  /** A finished request is history: no alarm, no countdown. */
  done?: boolean;
  className?: string;
}) {
  const asked = midnight(new Date(requestedAt));
  const due = midnight(new Date(`${neededBy}T00:00:00`));
  const today = midnight(new Date());
  if (!Number.isFinite(asked) || !Number.isFinite(due)) return null;

  /* The window always holds all three, so today never falls off the end of a
     request that is a month overdue, and a request due tomorrow is not drawn
     on a rail three days wide. */
  const from = Math.min(asked, due, today);
  const to = Math.max(asked, due, today);
  const span = Math.max(to - from, DAY);
  const at = (ms: number) => `${((ms - from) / span) * 100}%`;

  const daysLeft = Math.round((due - today) / DAY);
  const overdue = !done && daysLeft < 0;
  const soon = !done && daysLeft >= 0 && daysLeft <= 7;

  const tone = done
    ? { hue: "#0071E3", text: "text-blue-primary" }
    : overdue
      ? { hue: "#DC2626", text: "text-[color:#DC2626]" }
      : soon
        ? { hue: "#D97706", text: "text-[color:#D97706]" }
        : { hue: "#16A34A", text: "text-[color:#16A34A]" };

  const remaining = done
    ? "Closed"
    : overdue
      ? `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "day" : "days"} overdue`
      : daysLeft === 0
        ? "Due today"
        : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          <CalendarClock size={13} strokeWidth={2.2} className="text-blue-primary" />
          Needed by
        </span>
        <span className={cn("text-[11.5px] font-bold", tone.text)}>{remaining}</span>
      </div>

      {/* The rail. 44px of height buys room for the today flag above it and the
          two dates below without either colliding with the line. */}
      <div className="relative mt-4 h-[42px]">
        <div
          className="absolute left-0 right-0 h-[6px] rounded-full bg-border-light"
          style={{ top: 8 }}
        />
        {/* HOW MUCH OF THE RUN IS GONE. Drawn from the request to today (or to
            the deadline once it is past, so an overdue bar does not run off
            the end of its own rail). */}
        <div
          className="absolute h-[6px] rounded-full transition-[width] duration-500"
          style={{
            top: 8,
            left: at(Math.min(asked, due)),
            width: `${((Math.min(Math.max(today, asked), Math.max(due, asked)) - Math.min(asked, due)) / span) * 100}%`,
            background: tone.hue,
            opacity: 0.32,
          }}
        />

        {/* ASKED — a real date, so it gets a dot. */}
        <Marker
          left={at(asked)}
          hue="#0071E3"
          icon={Inbox}
          title="Requested"
          date={label(asked)}
          side={asked <= due ? "left" : "right"}
        />

        {/* DUE — the other real date. */}
        <Marker
          left={at(due)}
          hue={tone.hue}
          icon={Flag}
          title="Needed by"
          date={label(due)}
          side={due >= asked ? "right" : "left"}
        />

        {/* TODAY. The one line here that is not a plan. Suppressed when it sits
            on top of one of the dots, where the flag would cover the date it
            is meant to clarify. */}
        {Math.abs(today - asked) > DAY / 2 && Math.abs(today - due) > DAY / 2 && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2"
            style={{ left: at(today), top: -6 }}
          >
            <span className="block whitespace-nowrap rounded-full bg-blue-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-white">
              Today
            </span>
            <span
              className="mx-auto block w-px bg-blue-primary/70"
              style={{ height: 12, boxShadow: "0 0 8px rgba(0,113,227,0.35)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Marker({
  left,
  hue,
  icon: Icon,
  title,
  date,
  side,
}: {
  left: string;
  hue: string;
  icon: typeof Inbox;
  title: string;
  date: string;
  /** Which way the caption hangs, so the two never overlap in the middle. */
  side: "left" | "right";
}) {
  return (
    <div className="absolute z-10" style={{ left, top: 0 }}>
      <span
        className="absolute grid h-[22px] w-[22px] -translate-x-1/2 place-items-center rounded-full ring-2 ring-white"
        style={{ top: 0, background: `${hue}1F`, color: hue }}
      >
        <Icon size={12} strokeWidth={2.4} />
      </span>
      <span
        className={cn(
          "absolute whitespace-nowrap",
          side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
        )}
        style={{ top: 26 }}
      >
        <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
          {title}
        </span>
        <span className="block text-[11.5px] font-semibold tnum text-text-primary">
          {date}
        </span>
      </span>
    </div>
  );
}
