/**
 * A TIMESTAMP AT EXACTLY MIDNIGHT UTC IS A DATE SOMEBODY TYPED.
 *
 * 76 of the 104 deals in the live workspace carry `createdAt`
 * "2026-08-16T00:00:00.000Z" — a date imported from a spreadsheet that was
 * given a synthetic midnight on the way in. Rendered as an instant, every one
 * of them reads a day early for anybody west of UTC: the New York office sees
 * "Aug 15" on a deal created on the 16th. Suren, five and a half hours ahead,
 * sees the right day, which is exactly why it survived.
 *
 * A real event never lands on 00:00:00.000 — the odds are about one in 86
 * million per day, and every timestamp this app writes comes from
 * `new Date().toISOString()`. So an exact UTC midnight means "no clock was
 * ever recorded", and the honest thing is to show the calendar date it was
 * stored with rather than shift it into the reader's timezone.
 *
 * This module imports nothing, so both the formatter in lib/utils and the one
 * in lib/performanceShared can read the same rule.
 */

/** A bare `yyyy-mm-dd`, or an ISO instant at exactly midnight UTC. */
export function isDateOnly(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) || /T00:00:00(\.000)?Z$/.test(raw);
}

/** The calendar date such a value was stored with, as `yyyy-mm-dd`. */
export function calendarDate(raw: string): string {
  return raw.slice(0, 10);
}
