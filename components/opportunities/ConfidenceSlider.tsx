"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * THE CONFIDENCE BAR, SHARED.
 *
 * Suren, Sep 1, on the Edit deal screen: "here he had a nice little slider, I
 * don't know why he went to 10 percent 20 percent — why can't you have a
 * slider here." He was remembering this control, which the Opportunities list
 * has had since Aug 17. The edit screen shipped with a plain number box, so
 * the same field looked like two different fields depending on where you met
 * it.
 *
 * Lifted out of OpportunitiesBrowser unchanged so both screens draw the one
 * control rather than a copy each.
 */
export function snapConfidence(raw: number): number {
  const n = Math.max(0, Math.min(100, raw));
  if (n <= 95) return Math.round(n / 5) * 5;
  /* 96, 97 round back to 95; 98 and 99 land on 99; 100 stays 100. */
  if (n >= 99.5) return 100;
  return n >= 97.5 ? 99 : 95;
}

export function ConfidenceSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Dragging is CONTINUOUS and the stored number snaps to 5s; typing is exact
  // (Anir, Aug 17: "the bar moves smoothly but the numbers go every 5 but i
  // can still enter in 72"). `drag` holds the thumb's true position while the
  // pointer is down so the bar glides instead of chunking through 5% steps.
  const [drag, setDrag] = useState<number | null>(null);
  const n = value === "" ? null : Number(value);
  const committed =
    n === null || Number.isNaN(n) ? null : Math.max(0, Math.min(100, n));
  const pct = drag ?? committed ?? 0;
  /**
   * BLUE. NOT A RED-TO-GREEN SWEEP.
   *
   * This bar used to run red through amber to green, hue tracking the value.
   * Anir, Sep 1, looking at it on a deal: "I don't like the colors. Just make
   * them all blue."
   *
   * Which is the decision he already made for this exact figure once before,
   * Aug 17, and it is recorded a few files away in OpportunitySummary: "the
   * first cut coloured confidence red/amber/green and a young pipeline became a
   * page of red. Red means horrible, and 25% confidence is not horrible, it is
   * early." Of the deals carrying a confidence, most sit at 10-25%, so the
   * sweep painted the healthy majority of the pipeline as a wall of alarm.
   *
   * Red, amber and green are also reserved in this app: they mean status, and
   * nothing else may borrow them. A confidence figure is a measure, not a
   * verdict. The summary card beside this one has been blue since August, so
   * this also stops one number reading as two different colours on two screens.
   */
  const active = !(committed === null && drag === null);
  const color = active ? "var(--ink-bright-blue)" : "#8E98A8";
  const dragging = drag !== null;
  return (
    /* STACKED, NOT SIDE-BY-SIDE (Anir, Aug 18: "it would look so much better
       if the textbox was underneath… make it look premium"): the track gets
       the whole width, and the number sits under its right end as a bare
       bold figure in the same colour — still typeable, still exact. */
    <div className="space-y-1">
      <span
        className="relative flex h-5 min-w-0 items-center"
        style={{ ["--range-color" as string]: color }}
      >
        <span className="pointer-events-none absolute inset-x-0 h-[6px] overflow-hidden rounded-full bg-[color:var(--border-light)]">
          <span
            className={cn(
              "block h-full rounded-full transition-[filter] duration-200",
              dragging && "brightness-110"
            )}
            style={{
              width: `${pct}%`,
              /* One hue, lighter at the start so the bar still has depth and a
                 direction to travel in. It is the same blue at both ends, not
                 two colours meeting in the middle. */
              background: `linear-gradient(90deg, #5AA9F2, ${color})`,
              boxShadow: dragging ? `0 0 10px ${tint(color, 40)}` : undefined,
            }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => {
            const raw = Number(e.target.value);
            setDrag(raw);
            onChange(String(snapConfidence(raw)));
          }}
          onPointerUp={() => setDrag(null)}
          onBlur={() => setDrag(null)}
          aria-label="Confidence. Drag to set"
          className="freyr-range relative z-[1] h-5 w-full cursor-pointer appearance-none bg-transparent"
        />
      </span>
      {/* The figure RIDES THE DOT (Suren, Aug 18: "the number should be under
          the dot always") — anchored at the thumb's percent and clamped so it
          never slides off the ends. Translate and scale are both Tailwind
          transforms so the drag pop still composes with the centering. */}
      <div className="relative h-[26px]">
        {/* THE FIGURE IS A CHIP, NOT LOOSE DIGITS (Anir, Aug 28: "even at
            30%, it looks weird, something's wrong"). A bold number and a
            small grey % floating alone under the bar, at whatever percent
            the thumb happens to sit, read as strays: three rows, three
            different alignments. In a tinted chip carrying the bar's own
            colour it reads as the thumb's own label, which is what it is,
            and it is still typeable. */}
        <div
          className={cn(
            "absolute top-0 flex -translate-x-1/2 items-center gap-0.5 rounded-full border px-2 py-[1px] transition-transform duration-150",
            dragging && "scale-110"
          )}
          style={{
            left: `clamp(34px, ${pct}%, calc(100% - 34px))`,
            background: active ? tint(color, 8) : "var(--surface)",
            borderColor: active ? tint(color, 25) : "var(--border-light)",
          }}
        >
          <input
            value={value}
            onChange={(e) => {
              // Confidence is 0–100, full stop (Anir: "this shouldn't be
              // allowed" at 145%). Anything typed past the ends snaps to them.
              const text = e.target.value;
              const typed = Number(text);
              onChange(
                text.trim() !== "" && Number.isFinite(typed)
                  ? String(Math.max(0, Math.min(100, typed)))
                  : text
              );
            }}
            inputMode="numeric"
            placeholder="25"
            aria-label="Confidence. Type an exact figure"
            className="w-[30px] border-0 bg-transparent p-0 text-center text-[14.5px] font-bold tnum outline-none placeholder:text-text-tertiary"
            style={{ color }}
          />
          <span className="text-[10.5px] font-semibold" style={{ color: active ? color : undefined }}>
            %
          </span>
        </div>
      </div>
    </div>
  );
}
