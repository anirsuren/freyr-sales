"use client";

import { useTimeZone } from "@/components/auth/CurrentUserProvider";
import { formatAbsolute } from "@/lib/timeZone";
import { timeAgo } from "@/lib/utils";

/**
 * "39m ago" to read, the exact time to hover.
 *
 * A relative stamp is the right thing at a glance and useless the moment you
 * need to act on it — you cannot tell a colleague "it landed thirty minutes
 * ago" and have that mean anything an hour later (Anir, Jul 30: "I need to see
 * the exact time. I can't just say 30 minutes... when I hover over that, I
 * should see the exact time in whatever time zone I'm in").
 *
 * A <time> element with a title, so the exact value is available to a hover, to
 * a screen reader, and to anything parsing the page — and `dateTime` stays the
 * unambiguous UTC instant no matter which zone it is displayed in.
 */
export function TimeAgo({
  value,
  className,
  /** Rendered before the relative text, e.g. "· ". */
  prefix,
}: {
  value: string | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const { timeZone } = useTimeZone();
  if (!value) return null;
  const exact = formatAbsolute(value, timeZone);
  return (
    <time
      dateTime={value}
      title={exact}
      // `help` rather than `default`: the cursor is what says "there is more
      // here", since a tooltip nobody knows about is a tooltip nobody opens.
      className={`cursor-help ${className || ""}`}
    >
      {prefix}
      {timeAgo(value)}
    </time>
  );
}
