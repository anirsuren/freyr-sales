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

/* Vertical geometry in one place, the way the FDL timeline keeps it: the
   today band sits above the rail, the dots straddle it, the captions hang
   below. Changing the rail moves everything that references it. */
const RAIL_TOP = 30;

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

  /* THE FILL IS PROGRESS, NOT STATUS (Anir, Aug 30: "I don't know why you're
     using that weird orange-brown color"). It was the status hue at 32% alpha,
     and amber at a third strength over a grey rail is mud — the exact colour
     he pulled out. Elapsed time is the same fact the person-progress lanes
     draw, so it takes the same blue, at the same strength. The status colour
     keeps the two places it means something: the words on the right, and the
     flag at the deadline. */
  const ELAPSED = "rgba(0,113,227,0.55)";

  const tone = done
    ? { hue: "#0071E3", text: "text-blue-primary" }
    : overdue
      ? { hue: "#DC2626", text: "text-[color:#DC2626]" }
      : soon
        ? { hue: "#D97706", text: "text-[color:#D97706]" }
        : { hue: "#16A34A", text: "text-[color:#16A34A]" };

  /* Today sitting on a marker at either end of the rail: the flag hugs that
     edge rather than centring past it. */
  const atStart = Math.abs(today - Math.min(asked, due)) < DAY / 2;
  const atEnd = !atStart && Math.abs(today - Math.max(asked, due)) < DAY / 2;

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

      {/* THE TODAY FLAG GETS ITS OWN BAND ABOVE THE RAIL.
          Anir asked to "visually see today", and the first cut hid it whenever
          it landed on one of the two dots — which is the common case, because
          most requests are looked at on the day they are raised. It was hidden
          because a flag at the dot's own height collided with it.

          Giving the flag 22px of clear air above the rail means it never
          collides with anything, so it never has to be suppressed: today is on
          this chart on every request, including the ones where today IS the
          day it was asked for. */}
      {/* THE MARKERS SIT ON TOP OF THE RAIL (Anir, Aug 30: "make sure the
          icons at the ends are on top of the bar").

          Everything is PLOTTED inside an 11px inset — one marker radius — so a
          dot at 0% or 100% stays inside the card instead of hanging half off
          it. But the rail itself reaches back out over that inset, so the bar
          runs the full width and the two circles are laid over it rather than
          bookending it. They carry a white ring, which is what makes them read
          as on top rather than as a break in the line. */}
      <div className="relative mt-3 h-[64px]">
        <div className="absolute inset-x-[11px] top-0 h-full">
        <div
          className="absolute -left-[11px] -right-[11px] h-[6px] rounded-full bg-border-light"
          style={{ top: RAIL_TOP }}
        />
        {/* HOW MUCH OF THE RUN IS GONE. Drawn from the request to today (or to
            the deadline once it is past, so an overdue bar does not run off
            the end of its own rail). */}
        <div
          className="absolute h-[6px] rounded-full transition-[width] duration-500"
          style={{
            top: RAIL_TOP,
            /* Reaches out under the first marker the same 11px the track
               does, so the elapsed run starts beneath its own icon rather
               than beside it. Only the left edge moves; the right end still
               lands exactly on today. */
            left: `calc(${at(Math.min(asked, due))} - 11px)`,
            width: `calc(${((Math.min(Math.max(today, asked), Math.max(due, asked)) - Math.min(asked, due)) / span) * 100}% + 11px)`,
            background: ELAPSED,
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

        {/* TODAY. The one mark here that is not a plan, so it is always drawn.
            It hugs whichever end it sits at, for the same reason the captions
            do: centred on a marker at 0% or 100%, half the pill would hang
            outside the card. */}
        <div
          className={cn(
            "pointer-events-none absolute z-20 flex flex-col items-center",
            atStart ? "items-start" : atEnd ? "items-end" : "-translate-x-1/2"
          )}
          style={{
            left: atStart ? 0 : atEnd ? undefined : at(today),
            right: atEnd ? 0 : undefined,
            top: 0,
          }}
        >
          <span className="block whitespace-nowrap rounded-full bg-blue-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-white">
            Today
          </span>
          {/* No glow: it smeared into the rail underneath and was half of why
              this read as smudged rather than drawn. */}
          <span
            className={cn("block w-px bg-blue-primary/70", atStart && "ml-[11px]", atEnd && "mr-[11px]")}
            style={{ height: RAIL_TOP - 17 }}
          />
        </div>
        </div>
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
        style={{ top: RAIL_TOP - 8, background: `${hue}1F`, color: hue }}
      >
        <Icon size={12} strokeWidth={2.4} />
      </span>
      {/* THE CAPTION HANGS INWARD FROM ITS MARKER (found in the browser,
          Aug 28: the rail's two markers sit at the very ends of a 340px card,
          and centring each caption on its marker pushed half of both outside
          the card — the left one read "QUESTED / 1 28, 2026" and the right one
          lost its year).

          So neither caption is centred: the first one's LEFT edge starts at
          its marker and reads rightward, the last one's RIGHT edge ends at its
          marker and reads leftward. Both stay inside the rail they describe,
          at any card width. */}
      <span
        className={cn("absolute whitespace-nowrap", side === "left" ? "left-0" : "right-0")}
        style={{ top: RAIL_TOP + 18 }}
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
