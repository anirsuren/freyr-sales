// Date maths for the deal detail page. Suren, on the deal stage tracker: "it
// doesn't show me where today is. Today is July 26th, for example. It said there
// was a meeting booked on July 23rd, but it doesn't show me where today is
// relative. That's a problem." Everything a rep reads about timing on that page
// comes from here so the wording can never disagree between the timeline and the
// snapshot cards.
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { OUTCOME_TO_STAGE, type Stage } from "@/lib/pipeline";
import type { Interaction } from "@/lib/types";

/** Whole CALENDAR days between a timestamp and now — positive for the past,
 *  negative for anything scheduled ahead. Calendar days, not 24-hour blocks, so
 *  a meeting logged late last night reads "yesterday" rather than "0 days". */
export function daysSince(
  value: string | null | undefined,
  nowIso: string
): number | null {
  if (!value) return null;
  const then = parseISO(value);
  const now = parseISO(nowIso);
  if (!isValid(then) || !isValid(now)) return null;
  return differenceInCalendarDays(now, then);
}

/** Plain English for a point in time: "today", "3 days ago", "in 7 days". */
export function whenLabel(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  if (days > 0) return `${days} days ago`;
  return `in ${Math.abs(days)} days`;
}

/** Plain English for a duration: "1 day", "3 days". */
export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** When a deal last CHANGED stage. Walk its logged activity oldest → newest and
 *  keep the moment the stage actually moved; the session's created_at only ever
 *  starts the Prospect clock. This is the honest start of "time in this stage" —
 *  a deal's last touch and its stage change are not the same event. */
export function stageEnteredAt(
  createdAt: string,
  interactions: Interaction[]
): string {
  let current: Stage = "Prospect";
  let at = createdAt;
  const oldestFirst = [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const it of oldestFirst) {
    const next = OUTCOME_TO_STAGE[it.outcome];
    if (next && next !== current) {
      current = next;
      at = it.created_at;
    }
  }
  return at;
}

/** Median (not mean) so one deal that has been parked for months can't drag the
 *  "typical" comparison into fiction. */
export function medianDays(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
