/**
 * WHEN SOMETHING HAPPENED, to the minute where we know it (Anir, Aug 15:
 * "having the time here would be nice... especially for the LinkedIn posts").
 *
 * The feed already stores full timestamps — a LinkedIn post carries
 * "2026-08-14T15:00:23.059Z" and a news item its published second — so the
 * time was there all along and only the formatter was dropping it.
 *
 * The time is shown ONLY when the stored value actually has one. A date-only
 * record ("2026-08-14") would otherwise render as "12:00 AM", which is not
 * midnight, it is us inventing a precision the source never gave us.
 */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const raw = String(iso);
  const hasTime = /\d{1,2}:\d{2}/.test(raw);

  // A BARE DATE IS A CALENDAR DATE, NOT AN INSTANT. `new Date("2026-08-14")`
  // parses as UTC midnight, so anywhere west of UTC it renders as the 13th —
  // the old formatter shifted every date-only record back a day for a US
  // reader. Building it from the parts keeps the day as written.
  const bare = !hasTime && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = bare
    ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!hasTime) return date;
  return `${date} · ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
