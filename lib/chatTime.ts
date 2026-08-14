import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";

/**
 * WHEN WAS THIS SAID, AND WHEN WAS THIS CHAT FROM.
 *
 * Every agent message has carried a `ts` since the chat was built and no
 * screen ever showed it, so a thread list read as an undated pile of "New
 * chat" rows (Anir, Aug 14: "i want dates because idk when this chat was from
 * or when the messages were sent").
 *
 * Three labels, each answering a different question:
 *
 *   clockTime   - "10:32 AM"       under a single bubble
 *   dayLabel    - "Today"          the divider between one day and the next
 *   bucketLabel - "Previous 7 days" the sidebar heading a thread files under
 *
 * All three take epoch milliseconds, because that is what the chat already
 * stores. `lib/utils.ts` has the ISO-string equivalents for everything else.
 *
 * These are relative to the moment they render, so they belong in client
 * components only. The agent chat qualifies: its history lives in
 * localStorage and never renders on the server, so there is nothing for a
 * server-rendered timestamp to disagree with.
 */

/** "10:32 AM". The time under one message. */
export function clockTime(ts: number): string {
  return format(new Date(ts), "h:mm a");
}

/**
 * The divider between days: "Today", "Yesterday", "Wednesday" inside the last
 * week, then a full date. Naming the weekday is the useful bit at that range,
 * since "3d ago" makes you count backwards to place it.
 */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const days = Math.abs(differenceInCalendarDays(new Date(), d));
  if (days < 7) return format(d, "EEEE");
  return format(d, "MMM d, yyyy");
}

/** Do two timestamps fall on the same calendar day? Drives the dividers. */
export function sameDay(a: number, b: number): boolean {
  return differenceInCalendarDays(new Date(a), new Date(b)) === 0;
}

/** The sidebar heading a thread belongs under. */
export function bucketLabel(ts: number): string {
  const d = new Date(ts);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const days = Math.abs(differenceInCalendarDays(new Date(), d));
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return format(d, "MMMM yyyy");
}

/**
 * Split threads into labelled, ordered buckets. Preserves the order it is
 * given (the chat sorts newest-first) so a bucket never reshuffles a list
 * that was already sorted.
 */
export function bucketByDay<T>(
  items: T[],
  at: (item: T) => number
): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = bucketLabel(at(item));
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}

/** "Today at 10:32 AM" for one-line summaries such as a hover title. */
export function dayAndTime(ts: number): string {
  return `${dayLabel(ts)} at ${clockTime(ts)}`;
}

/**
 * The stamp on a thread row in the list. Deliberately NOT dayLabel: the row
 * already sits under a "Today" / "Yesterday" heading, so repeating the word
 * says nothing. A time for today and a date for everything else is the part
 * the heading does not already give you.
 */
export function listStamp(ts: number): string {
  const d = new Date(ts);
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d");
}
