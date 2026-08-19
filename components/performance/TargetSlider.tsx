"use client";

import { cn } from "@/lib/utils";
import { BASE_CURRENCY, currencyMeta } from "@/lib/currency";
import {
  fmtAmount,
  parseAmountInput,
  type GoalUnit,
} from "@/lib/performanceShared";

/**
 * A TARGET YOU CAN DRAG, OR TYPE — drawn against everything already promised.
 *
 * Two rounds of feedback shaped this. First (Aug 16): "There should be an
 * option to drag it… if I want to say 12.5 million, that's gonna be hard to
 * get, so I should be able to do that" — so the lane and the box are the same
 * value and either updates the other. Then (Aug 17): "it has to be full… it
 * should take into account all the other people and all the other groups…
 * very visual and appealing, just like your timeline" — the old version was a
 * 40px stub squeezed beside the input, and it treated the goal as if nobody
 * else had a share of it.
 *
 * So the lane runs the full width, and it is an ALLOCATION bar: the slate
 * segment is what is already promised to other groups and people, the blue
 * segment is the share being set right now, and the empty track is what
 * nobody has claimed yet. Dragging past what is left is allowed — a warning,
 * never a wall, same rule as overlapping group members — and the overrun
 * turns amber and says by how much.
 */

export type Allocation = { label: string; amount: number };

export function TargetSlider({
  value,
  onChange,
  unit,
  max,
  label,
  optional = true,
  placeholder,
  allocations = [],
}: {
  /** Raw text, as typed. Kept as text so a half-written number is never eaten. */
  value: string;
  onChange: (next: string) => void;
  unit: GoalUnit;
  /** The parent goal's target. 0 or less hides the lane. */
  max: number;
  label: string;
  optional?: boolean;
  placeholder?: string;
  /** What the goal has already promised elsewhere — other groups, other
   *  people. The caller excludes whoever is being edited right now. */
  allocations?: Allocation[];
}) {
  const parsed = parseAmountInput(value);
  const amount = parsed ?? 0;
  const taken = allocations.reduce((s, a) => s + (a.amount || 0), 0);
  const free = Math.max(0, max - taken);
  const over = max > 0 && taken + amount > max;
  const overBy = Math.max(0, taken + amount - max);
  const symbol = unit === "currency" ? currencyMeta(BASE_CURRENCY).symbol : null;

  const pct = (n: number) => (max > 0 ? Math.min(100, (n / max) * 100) : 0);
  const step = max > 0 ? Math.max(1, Math.round(max / 1000)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label className="text-[12px] font-semibold text-text-primary">
          {label}{" "}
          {optional && <span className="text-text-tertiary">(optional)</span>}
        </label>
        {max > 0 && amount > 0 && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold tnum",
              over
                ? "bg-[rgba(194,65,12,0.10)] text-[color:#C2410C]"
                : "bg-[rgba(0,113,227,0.10)] text-[color:#0058B0]"
            )}
          >
            {fmtAmount(unit, amount)} · {Math.round(pct(amount))}% of the goal
          </span>
        )}
      </div>

      {max > 0 && (
        <div className="mt-2">
          {/* The lane. Full width, like every timeline in the app: slate is
              spoken for, blue is this share, the pale track is unclaimed. */}
          <span className="relative flex h-4 w-full items-center">
            <span className="pointer-events-none absolute inset-x-0 h-2.5 overflow-hidden rounded-full bg-[color:var(--border-light)]">
              <span
                className="absolute inset-y-0 left-0 rounded-l-full bg-[color:#64748B] opacity-70"
                style={{ width: `${pct(taken)}%` }}
              />
              <span
                className={cn(
                  "absolute inset-y-0 transition-[width] duration-75",
                  over ? "bg-[color:#C2410C]" : "bg-blue-primary"
                )}
                style={{
                  left: `${pct(taken)}%`,
                  width: `${Math.max(0, pct(Math.min(taken + amount, max)) - pct(taken))}%`,
                }}
              />
            </span>
            {/* The thumb rides the END of the blue segment. It used to carry
                the bare share (3% along the lane) while the blue fill drew
                after everything promised (93% along) — the circle and its own
                color were in different places (Anir, Aug 19: "this circle is
                not showing shit"). Dragging still sets only this share; the
                promised stretch acts as the floor. */}
            <input
              type="range"
              min={0}
              max={max}
              step={step}
              value={Math.min(taken + amount, max)}
              onChange={(e) =>
                onChange(String(Math.max(0, Number(e.target.value) - taken)))
              }
              aria-label={`${label}. Drag to set`}
              className="freyr-range relative z-[1] h-4 w-full cursor-pointer appearance-none bg-transparent"
            />
          </span>

          {/* The scale, said in plain words at the lane's own ends. */}
          <div className="mt-1 flex items-baseline justify-between text-[10.5px] text-text-tertiary tnum">
            <span>{fmtAmount(unit, 0)}</span>
            {taken > 0 && (
              <span>
                {fmtAmount(unit, taken)} already promised to{" "}
                {allocations.length}{" "}
                {allocations.length === 1 ? "other" : "others"} ·{" "}
                {fmtAmount(unit, free)} unclaimed
              </span>
            )}
            <span className="font-semibold text-text-secondary">
              {fmtAmount(unit, max)} goal
            </span>
          </div>
        </div>
      )}

      <div className={cn("flex items-center gap-2.5", max > 0 ? "mt-2" : "mt-1.5")}>
        <span className="relative flex-1">
          {symbol && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-text-tertiary">
              {symbol}
            </span>
          )}
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            placeholder={placeholder ?? (unit === "currency" ? "e.g. 900k" : "e.g. 120")}
            aria-label={`${label}. Type an exact figure`}
            className={cn(
              "h-[38px] w-full rounded-lg border bg-white pr-3 text-[13.5px] outline-none tnum focus:border-blue-primary",
              symbol ? "pl-7" : "px-3",
              over ? "border-[color:#C2410C]" : "border-border-light"
            )}
          />
        </span>
        {value.trim() !== "" && (
          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-[11px] tnum",
              parsed === null
                ? "text-error"
                : over
                  ? "text-[color:#C2410C]"
                  : "text-text-tertiary"
            )}
          >
            {parsed === null
              ? unit === "currency"
                ? "Numbers only, e.g. 900k"
                : "Numbers only, e.g. 120"
              : `= ${fmtAmount(unit, parsed)}`}
          </span>
        )}
      </div>

      {/* ALWAYS in the layout, only sometimes visible — appearing and
          vanishing used to bump the whole form up and down mid-scroll
          (Anir, Aug 19: "don't bump it up like that"). */}
      {max > 0 && (
        <p
          className={cn(
            "mt-1.5 min-h-[16px] text-[11px] font-medium text-[color:#C2410C]",
            !over && "invisible"
          )}
        >
          {over
            ? `This takes what's promised ${fmtAmount(unit, overBy)} past the goal. Allowed, targets can be ambitious, but worth knowing.`
            : " "}
        </p>
      )}
    </div>
  );
}
