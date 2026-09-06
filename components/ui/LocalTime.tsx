"use client";

import { formatDateTime } from "@/lib/utils";

/**
 * A DATE-AND-TIME THAT PRINTS ON THE READER'S CLOCK.
 *
 * Anir, Sep 6, seeing "1:23 PM" at 9:26 PM: "there's definitely a time zone
 * issue... it should always show whatever time the device is in. This applies
 * to literally everything in the app."
 *
 * Server components render once, on a UTC box, so every `formatDateTime(...)`
 * they inlined printed server time. This is the same string from the same
 * formatter — but as a client leaf it formats on the device, so the device's
 * zone is what shows. `suppressHydrationWarning` absorbs the one-time
 * server/browser difference at hydration (the browser's value wins, which is
 * the point). Date-only values are already timezone-proof in formatDateTime
 * (lib/dateOnly) and pass through unchanged.
 */
export function LocalTime({
  value,
  className,
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  return (
    <time dateTime={iso} suppressHydrationWarning className={className}>
      {formatDateTime(iso)}
    </time>
  );
}
