"use client";

import { withCommas } from "@/lib/currency";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";
import { cn } from "@/lib/utils";

/**
 * EVERY TYPED AMOUNT IN THE APP LOOKS THE SAME (Anir, Sep 7, on the deal
 * edit page's Estimated TCV reading a bare 90000 while the schedule under it
 * read $90,000: "didn't I say somewhere I need commas on every single
 * number... whatever you have in the table below, I need the same thing, and
 * this applies everywhere").
 *
 * The currency symbol sits inside the field on the left and the digits carry
 * thousands separators as you type. What goes back to the caller is always
 * BARE DIGITS — expandMoneyShorthand strips the separators, and understands
 * the shorthand people actually type (1.5m, 250k), so a stored value is never
 * a string with commas in it.
 */
export function MoneyInput({
  value,
  onChange,
  ariaLabel,
  placeholder = "Not set",
  symbol = "$",
  integer = true,
  readOnly = false,
  disabled = false,
  title,
  className,
  onBlur,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
  symbol?: string;
  /** Money is whole units nearly everywhere; a rate or a fraction sets this false. */
  integer?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <span className="relative flex w-full items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 text-[13px] font-semibold text-text-tertiary"
      >
        {symbol}
      </span>
      <input
        value={withCommas(value)}
        onChange={(e) => onChange(expandMoneyShorthand(e.target.value, { integer }))}
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        title={title}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cn(
          "h-[38px] w-full rounded-lg border border-border-light bg-white pl-7 pr-3 text-[13px] font-semibold tnum text-text-primary outline-none transition-colors placeholder:font-normal placeholder:text-text-tertiary focus:border-blue-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-tertiary",
          className
        )}
      />
    </span>
  );
}
