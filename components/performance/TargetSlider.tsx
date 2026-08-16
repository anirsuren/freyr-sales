"use client";

import { cn } from "@/lib/utils";
import {
  fmtAmount,
  parseAmountInput,
  type GoalUnit,
} from "@/lib/performanceShared";

/**
 * A TARGET YOU CAN DRAG, OR TYPE (Anir, Aug 16: "There should be an option to
 * drag it. For example, if I have the goal target as 100 million, I should be
 * able to drag it from 1 to 100 million... Also, if I want to say 12.5
 * million, that's gonna be hard to get, so I should be able to do that").
 *
 * Dragging is for the shape of the number — "about a third of the goal" — and
 * the box is for the exact one. They are the same value, so either updates the
 * other, and the slider is simply absent when the parent goal has no target to
 * measure a share against.
 *
 * The step is a thousandth of the goal, so a $100M goal moves in $100K
 * increments and a 120-count goal moves in whole units — fine enough to land
 * near anything, and the box is there for the rest.
 */
export function TargetSlider({
  value,
  onChange,
  unit,
  max,
  label,
  optional = true,
  placeholder,
}: {
  /** Raw text, as typed. Kept as text so a half-written number is never eaten. */
  value: string;
  onChange: (next: string) => void;
  unit: GoalUnit;
  /** The parent goal's target. 0 or less hides the slider. */
  max: number;
  label: string;
  optional?: boolean;
  placeholder?: string;
}) {
  const parsed = parseAmountInput(value);
  const amount = parsed ?? 0;
  const pct = max > 0 ? Math.min(100, (amount / max) * 100) : 0;
  const step = max > 0 ? Math.max(1, Math.round(max / 1000)) : 1;
  const over = max > 0 && amount > max;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label className="text-[12px] font-semibold text-text-primary">
          {label}{" "}
          {optional && <span className="text-text-tertiary">(optional)</span>}
        </label>
        {max > 0 && (
          <span className="ml-auto text-[10.5px] text-text-tertiary tnum">
            {amount > 0 ? `${Math.round(pct)}% of ` : "goal target "}
            {fmtAmount(unit, max)}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        {max > 0 && (
          <span className="relative flex min-w-0 flex-1 items-center">
            {/* The filled track, drawn under the thumb so the colour is the
                app's blue rather than the browser's. */}
            <span className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-[color:var(--border-light)]">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-75",
                  over ? "bg-[color:#C2410C]" : "bg-blue-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
            <input
              type="range"
              min={0}
              max={max}
              step={step}
              value={Math.min(amount, max)}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${label} — drag to set`}
              className="freyr-range relative z-[1] h-4 w-full cursor-pointer appearance-none bg-transparent"
            />
          </span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder ?? (unit === "currency" ? "e.g. 900k" : "e.g. 120")}
          aria-label={`${label} — type an exact figure`}
          className={cn(
            "h-[38px] rounded-lg border bg-white px-3 text-[13.5px] outline-none tnum focus:border-blue-primary",
            max > 0 ? "w-[132px] shrink-0" : "w-full",
            over ? "border-[color:#C2410C]" : "border-border-light"
          )}
        />
      </div>

      {value.trim() !== "" &&
        (parsed === null ? (
          <p className="mt-1 text-[10.5px] text-error">
            {unit === "currency" ? "Numbers only, e.g. 900k" : "Numbers only, e.g. 120"}
          </p>
        ) : (
          <p
            className={cn(
              "mt-1 text-[10.5px] tnum",
              over ? "text-[color:#C2410C]" : "text-text-tertiary"
            )}
          >
            = {fmtAmount(unit, parsed)}
            {over ? ` · ${fmtAmount(unit, amount - max)} above the goal` : ""}
          </p>
        ))}
    </div>
  );
}
