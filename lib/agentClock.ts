/**
 * WALL-CLOCK TIME ON A PERSON'S OWN CALENDAR. A reminder is "Friday 9:00" in
 * the zone of the person who set it; the server needs the instant that is to
 * send it at that minute, and "in 2 hours" needs the reverse (Anir, Oct 1: "It
 * has to give a reminder at a time. That's when it texts you").
 */

function safeZone(zone?: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone || "UTC" });
    return zone || "UTC";
  } catch {
    return "UTC";
  }
}

function partsIn(instant: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** The instant at which it is `day` `time` (YYYY-MM-DD, HH:MM) in `zone`, daylight saving included. */
export function zonedInstant(day: string, time: string, zone?: string): number {
  const tz = safeZone(zone);
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (t: number) => {
    const p = partsIn(t, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

/** The day and minute an instant falls on in `zone`. */
export function localDayTime(instant: number, zone?: string): { day: string; time: string } {
  const p = partsIn(instant, safeZone(zone));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { day: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

const COUNT: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twenty: 20, thirty: 30 };

/**
 * "in 2 hours", "in 45 minutes", "in an hour", "in half an hour": that moment,
 * rounded up to the next minute. Null when the words name no such moment, or
 * one more than a week away (that is a day, said the long way round).
 */
export function relativeMoment(text: string, now = Date.now()): number | null {
  const m = /\bin\s+(half an?|an?|one|two|three|four|five|six|ten|twenty|thirty|\d{1,4})\s*(minutes?|mins?|hours?|hrs?)\b/i.exec(text);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const hours = /^h/i.test(m[2]);
  if (raw.startsWith("half") && !hours) return null;
  const amount = raw.startsWith("half") ? 0.5 : COUNT[raw] ?? Number(raw);
  const minutes = amount * (hours ? 60 : 1);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) return null;
  return Math.ceil((now + minutes * 60_000) / 60_000) * 60_000;
}
