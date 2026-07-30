/**
 * EXACT TIMES, IN THE READER'S OWN ZONE.
 *
 * A list says "39m ago", which is the right thing to read at a glance and the
 * wrong thing to work from: "I need to see the exact time. I can't just say 30
 * minutes... when I hover over that, I should see the exact time in whatever
 * time zone I'm in" (Anir, Jul 30). So every relative timestamp carries the
 * absolute one underneath it.
 *
 * ALWAYS UP TO DATE, BY CONSTRUCTION. Nothing here stores an offset. A zone is
 * an IANA name ("Asia/Kolkata", "America/New_York") and Intl resolves the
 * offset for the specific INSTANT being formatted, so daylight saving, and any
 * government that redefines a zone in a future data update, are handled without
 * anyone editing this file. Storing "+05:30" is what makes a clock go wrong
 * twice a year; a zone name cannot.
 */

/** The zone this device is in, per the browser. Server-side: UTC. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Is this a zone name Intl actually knows? Guards a stored value that a later
 *  ICU update dropped, so a stale preference degrades to the device zone
 *  instead of throwing on every timestamp on the page. */
export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * "30 Jul 2026, 6:24 pm IST" — the whole answer in one line, including which
 * zone it is being said in, because a time without its zone is exactly the
 * ambiguity this is meant to remove.
 */
export function formatAbsolute(
  value: string | number | Date,
  zone: string
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tz = isValidTimeZone(zone) ? zone : detectTimeZone();
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: "short",
    })
      .format(date)
      .replace(/ /g, " ");
  } catch {
    return date.toISOString();
  }
}

/** What a zone is called right now, e.g. "IST" — used to label the picker so a
 *  person recognises their own zone without decoding an IANA path. */
export function zoneAbbreviation(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

/**
 * Zones offered in Settings. Deliberately a SHORT list of the places Freyr
 * actually works from rather than the full IANA set: 400-odd entries is a
 * scroll nobody reads, and "Auto" is the right answer for almost everyone.
 * Any zone already saved is shown even if it is not on this list.
 */
export const COMMON_TIME_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Zurich",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "UTC",
] as const;

/** "Asia/Kolkata" → "Asia / Kolkata · IST" */
export function describeZone(zone: string): string {
  const abbr = zoneAbbreviation(zone);
  const pretty = zone.replace(/_/g, " ").replace("/", " / ");
  return abbr ? `${pretty} · ${abbr}` : pretty;
}
