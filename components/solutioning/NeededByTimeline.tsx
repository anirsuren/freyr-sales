"use client";

import { useEffect, useRef, useState } from "react";
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

  /**
   * WHERE "NEEDED BY" ACTUALLY FITS (Anir, Sep 6, after three wrong answers:
   * "they have to be actually where it is... you're not stopping until you
   * figure out how to do this").
   *
   * The caption belongs centred under its flag, on the same line as
   * Requested. The only real constraint is that it must not run into the
   * Requested caption or off the card — and every attempt to express that
   * constraint as a guessed number (a percentage threshold, a 190px clamp)
   * has been wrong on some card width, because the words' width in pixels is
   * a fact of the rendered page, not something to estimate.
   *
   * So it is measured. After paint, read the container's width, the
   * Requested caption's real right edge and this caption's real width, and
   * centre it on the flag pushed right ONLY as far as those measurements
   * demand. Re-measured on resize. The first server paint centres it on the
   * flag directly, which is correct everywhere except the few pixels the
   * effect then fixes.
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const reqRef = useRef<HTMLSpanElement | null>(null);
  const needRef = useRef<HTMLSpanElement | null>(null);
  const [needLeftPx, setNeedLeftPx] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      const req = reqRef.current;
      const need = needRef.current;
      if (!box || !req || !need) return;
      const W = box.clientWidth;
      if (!W || !Number.isFinite(asked) || !Number.isFinite(due)) return;
      /* Same window arithmetic as the render, self-contained so the effect
         can live up here with the other hooks. */
      const today = now ?? due;
      const lo = Math.min(asked, due, today);
      const hi = Math.max(asked, due, today);
      const flagX = ((due - lo) / Math.max(hi - lo, DAY)) * W;
      const halfNeed = need.offsetWidth / 2;
      /* Requested starts at -11px in this box's coordinates (the rail's own
         overhang), so its right edge is its width minus that. 16px of air
         between the two captions. */
      const minCentre = -11 + req.offsetWidth + 16 + halfNeed;
      const maxCentre = W + 11 - halfNeed;
      setNeedLeftPx(Math.min(Math.max(flagX, minCentre), maxCentre));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [asked, due, now]);
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
        <div ref={boxRef} className="absolute inset-x-[11px] top-0 h-full">
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

        {/* REQUESTED FLUSH LEFT, NEEDED BY ON THE LINE BELOW, UNDER ITS OWN
            FLAG (Anir, Sep 6: "the requested text should be all the way to the
            left, and then the needed by should be right under, centered. It
            can obviously fit").

            The history of this small block: both captions used to hang inward
            from their own dots, which collides as soon as the dots are close.
            I stacked them on two lines with a guessed threshold, which still
            overlapped; then pinned both to the ends on one line, which cannot
            collide but puts the deadline as far from its flag as the card
            allows. This is his layout, and it is the one that actually says
            what the chart means: the request is the start of the rail, so its
            label sits at the start; the deadline is somewhere along it, so its
            label sits under the flag that marks it.

            The deadline caption is centred on its marker and CLAMPED to the
            rail, so a request due today — flag hard right — keeps its date on
            the card instead of hanging off the edge. */}
        {/* OUT TO THE CARD'S EDGE, not the rail's plotting inset (Anir,
            Sep 6, drawing an R on the screenshot: "this is where REQUESTED
            should start... that's going to free up so much more space").

            Everything on this rail is plotted inside an 11px inset — one
            marker radius — so a dot at 0% keeps its whole circle on the card.
            The caption inherited that inset AND `left-0`, which is the dot's
            CENTRE, so the words started half a marker in from where the line
            visibly begins. The track itself already reaches back out over the
            inset with -left-[11px]; the caption does the same now, so it
            starts where the rail starts. */}
        <span
          ref={reqRef}
          className="absolute -left-[11px] whitespace-nowrap"
          style={{ top: RAIL_TOP + 18 }}
        >
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
            Requested
          </span>
          <span className="block text-[11.5px] font-semibold tnum text-text-primary">
            {label(asked)}
          </span>
        </span>

        {/* SAME LINE (Anir, Sep 6: "they have to be in the same fucking
            line"). Needed by stays centred under its flag, one row with
            Requested. The clamp is CSS, not a guessed threshold: never left of
            190px — which clears the widest Requested date plus half this
            caption — and never past the right edge. A flag near the left
            pushes its words right just enough to clear; everywhere else they
            sit dead under it. */}
        <span
          ref={needRef}
          className="absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
          style={{
            /* Server paint: dead under the flag. After mount the measured
               value replaces it, moving only when the real text demands. */
            left:
              needLeftPx !== null
                ? `${needLeftPx}px`
                : `${((due - from) / span) * 100}%`,
            top: RAIL_TOP + 18,
          }}
        >
          <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
            Needed by
          </span>
          <span className="block text-[11.5px] font-semibold tnum text-text-primary">
            {label(due)}
          </span>
        </span>

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
