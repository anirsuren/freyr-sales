"use client";

import { useEffect, useState } from "react";
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

/**
 * THE CALENDAR DAY A TIMESTAMP NAMES, THE SAME FOR EVERYBODY.
 *
 * `midnight(new Date(requestedAt))` reads the LOCAL year, month and day of an
 * instant, so a request made at 22:30 UTC is the 28th in London and the 28th
 * on the server but the 27th in California. The rail then drew a different
 * first date depending on who was looking, and because this page is
 * server-rendered React threw a hydration mismatch and rebuilt the tree.
 *
 * Found in the loop: the solutioning detail failed in US Pacific and passed in
 * UTC, which is the signature of exactly this and not of the local-clock class
 * fixed elsewhere. Taking the date part off the string makes the request's own
 * day a fixed square.
 */
function askedDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return midnight(new Date(iso));
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
  const asked = askedDay(requestedAt);
  const due = midnight(new Date(`${neededBy}T00:00:00`));
  /**
   * TODAY ARRIVES AFTER THE PAGE DOES.
   *
   * This whole rail is built around the reader's today — the marker's
   * position, the countdown, the tone — and a server-rendered today can always
   * disagree with the browser's by a day across a timezone. No parsing fixes
   * that: the two clocks genuinely differ, and `suppressHydrationWarning` is
   * no use because it only covers one level and the varying text is several
   * deep.
   *
   * So the first paint (server, and the client's hydrating pass) uses the
   * request's own due date as a fixed anchor, and the real today lands one
   * effect later. Server and client render identically, then the rail corrects
   * itself in the same frame the browser was going to paint anyway.
   */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(midnight(new Date())), []);
  const today = now ?? due;
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
    ? { hue: "var(--ink-bright-blue)", text: "text-blue-primary" }
    : overdue
      ? { hue: "#DC2626", text: "text-[color:var(--status-red)]" }
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
      <div className="relative mt-3 h-[86px]">
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
        <Marker left={at(asked)} hue="var(--ink-bright-blue)" icon={Inbox} />

        {/* DUE — the other real date. */}
        <Marker left={at(due)} hue={tone.hue} icon={Flag} />

        {/* THE TWO CAPTIONS SIT AT THE TWO ENDS, ON ONE LINE.
            (Anir, Sep 6: "that's not good... you can definitely fit 'needed
            by' there.")

            They used to hang inward from their own dots, which collides the
            moment the dots are close — and stacking them onto two lines, my
            last answer, looked exactly as bad as he says. The width was never
            the problem: the card is hundreds of pixels wide and the two
            captions are under 90px each. It was the anchoring. Pinned to the
            ends of the rail instead, they cannot collide at any date spacing,
            they read the way a timeline reads — start on the left, deadline on
            the right — and the dots still carry which is which, in their own
            colours, with the elapsed bar running between them.

            The pair swaps sides if a request is somehow needed before it was
            asked for, so the labels always follow the rail's direction. */}
        {(
          [
            {
              key: "asked",
              title: "Requested",
              date: label(asked),
              edge: asked <= due ? "left" : "right",
            },
            {
              key: "due",
              title: "Needed by",
              date: label(due),
              edge: due >= asked ? "right" : "left",
            },
          ] as const
        ).map((c) => (
          <span
            key={c.key}
            className={cn(
              "absolute whitespace-nowrap",
              c.edge === "left" ? "left-0 text-left" : "right-0 text-right"
            )}
            style={{ top: RAIL_TOP + 18 }}
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
              {c.title}
            </span>
            <span className="block text-[11.5px] font-semibold tnum text-text-primary">
              {c.date}
            </span>
          </span>
        ))}

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
}: {
  left: string;
  hue: string;
  icon: typeof Inbox;
}) {
  return (
    <div className="absolute z-10" style={{ left, top: 0 }}>
      {/* SOLID, NOT A TINT (Anir, Sep 1: "the icons are transparent bro they
          cant be like that").

          The circle was a 12%-alpha wash of the hue with the icon drawn in the
          full hue on top — and the rail line runs THROUGH this spot, so the
          blue bar showed straight through the fill and muddied the glyph. It
          read as a half-erased icon rather than a marker.

          A solid disc with a white glyph, the way every other icon tile in the
          app is drawn, and the rail can no longer come through it. */}
      <span
        className="absolute grid h-[22px] w-[22px] -translate-x-1/2 place-items-center rounded-full ring-2 ring-white"
        style={{ top: RAIL_TOP - 8, background: hue, color: "#FFFFFF" }}
      >
        <Icon size={12} strokeWidth={2.4} />
      </span>
    </div>
  );
}
