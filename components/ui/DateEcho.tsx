import { cn } from "@/lib/utils";

/**
 * THE DATE, SPELLED OUT, UNDER THE BOX YOU TYPED IT IN.
 *
 * Anir, Aug 21: "for the date, it's different for Indians than Americans, so
 * you have to clearly show underneath what the date is. If someone says
 * 11/15/2026, you have to clearly say that that's November 15, 2026."
 *
 * A native <input type="date"> renders its segments in the BROWSER's locale,
 * so the same stored day reads 07/08/2026 as July 8 in Chicago and 7 August in
 * Hyderabad. Freyr is a global company; the two halves of it read the same
 * field two different ways and nothing on screen says which. Est. sign feeds
 * the forecast, so a transposed pair moves a deal a quarter.
 *
 * The month NAME cannot be misread in either convention, so this line ends the
 * ambiguity without asking anybody to configure anything.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DateEcho({
  value,
  className,
}: {
  /** yyyy-mm-dd, straight off the input. */
  value: string | null | undefined;
  className?: string;
}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return (
    <span
      className={cn(
        "mt-1 block text-[11px] leading-snug text-text-tertiary",
        className
      )}
    >
      {MONTHS[month - 1]} {day}, {year}
    </span>
  );
}
