"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { isDateOnly } from "@/lib/dateOnly";
import { cn, formatDate, formatTime } from "@/lib/utils";

/**
 * A DATE ON SCREEN KEEPS ITS TIME ONE HOVER AWAY (Anir, Sep 7, on the change
 * history's "Sep 7, 2026": "show me the time it was deviated as well. Maybe
 * when I hover over it... this applies everywhere. If you're just showing me
 * the date and you're not showing me the time, when I hover over the date,
 * at least you'll say this time on this date").
 *
 * Renders exactly what formatDate would (or whatever text is passed as
 * children, for the places that shorten or word the date their own way) and,
 * when the value carries a clock, wraps it so hovering says "3:42 PM on
 * Sep 7, 2026". A bare yyyy-mm-dd carries no clock (see lib/dateOnly), so it
 * renders plain: saying midnight would be inventing a time nobody recorded.
 */
export function DateText({
  value,
  children,
  className,
}: {
  value: string | Date | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  const iso = value instanceof Date ? value.toISOString() : value ?? null;
  const text = children ?? formatDate(iso);
  const time = iso && !isDateOnly(iso) ? formatTime(iso) : "";
  if (!time) return <>{text}</>;
  return (
    <Tooltip label={`${time} on ${formatDate(iso)}`}>
      <span className={cn("cursor-default", className)}>{text}</span>
    </Tooltip>
  );
}
