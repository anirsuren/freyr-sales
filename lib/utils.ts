import { format, parseISO, isValid } from "date-fns";
import { calendarDate, isDateOnly } from "./dateOnly";
import type { LucideIcon } from "lucide-react";
import {
  ThumbsUp,
  ThumbsDown,
  Timer,
  CircleSlash,
  CalendarCheck,
  CalendarClock,
  PhoneCall,
  PhoneMissed,
} from "lucide-react";

// Lightweight classnames joiner (avoids pulling in clsx/tailwind-merge).
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * "1 deal", not "1 deals".
 *
 * The codebase already does this inline in a few places
 * (`c.schedule.length === 1 ? "month" : "months"`), and everywhere it does not,
 * a count of one reads as a typo — an offering with a single opportunity says
 * "1 deals" on its own tab today. Pass the plural only when it is irregular.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    /* An imported date wearing a synthetic midnight must not be shifted into
       the reader's timezone — see lib/dateOnly. Parsing the calendar part on
       its own gives local midnight, which formats as the day it was stored. */
    const d =
      typeof value === "string"
        ? parseISO(isDateOnly(value) ? calendarDate(value) : value)
        : value;
    if (!isValid(d)) return "-";
    return format(d, "MMM d, yyyy");
  } catch {
    return "-";
  }
}

// Just the clock part, for tables that stack the time under the date instead of
// spending a whole extra column's width on "Jul 24, 2026 • 9:01 AM".
export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  try {
    /* NO CLOCK MEANS NO TIME, not midnight translated into the reader's
       timezone. Every mock session is stored as "2027-03-06T00:00:00.000Z" —
       a calendar day given a synthetic midnight — and this printed "7:00 PM"
       for all of them, which is 7pm on the FIFTH in New York. So each row read
       "Mar 6, 2027" over a time from the day before, identical on every row
       because it was never a time at all. stampedAt already says the rule:
       "a bare yyyy-mm-dd carries no clock, so saying one would be inventing
       it". The caller renders this as its own line, so an empty string simply
       leaves the line out. */
    if (typeof value === "string" && isDateOnly(value)) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    if (!isValid(d)) return "";
    return format(d, "h:mm a");
  } catch {
    return "";
  }
}

// Human "time ago" for recency labels (e.g. "2h ago", "3d ago"). Falls back to
// an absolute date for anything older than ~4 weeks so it stays meaningful.
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
    if (!isValid(d)) return "-";
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 28) return `${days}d ago`;
    return formatDate(value);
  } catch {
    return "-";
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    /* A DATE WITH NO CLOCK GETS NO CLOCK, on 54 screens. This is the same
       synthetic midnight that formatDate and formatTime already handle, and
       here it went wrong twice over: "2026-08-16T00:00:00.000Z" — the shape 76
       of the live deals carry — rendered as "Aug 15, 2026 • 8:00 PM", both the
       day before AND a time nobody recorded. Falling back to formatDate gives
       the stored day and says nothing about a time that does not exist. */
    if (isDateOnly(value)) return formatDate(value);
    const d = parseISO(value);
    if (!isValid(d)) return "-";
    return format(d, "MMM d, yyyy • h:mm a");
  } catch {
    return "-";
  }
}

// "+15072487204" → "+1 507-248-7204" — dashes make numbers readable (Anir).
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

// Human label + design-token classes for each interaction outcome (Section 11).
export const OUTCOME_META: Record<
  string,
  { label: string; bg: string; color: string; icon: LucideIcon }
> = {
  interested: {
    label: "Interested",
    bg: "rgba(52,199,89,0.12)",
    color: "var(--ink-green)",
    icon: ThumbsUp,
  },
  not_interested: {
    label: "Not Interested",
    bg: "rgba(255,59,48,0.12)",
    color: "var(--ink-red)",
    icon: ThumbsDown,
  },
  in_progress: {
    // In Progress IS yellow — "it only makes sense" (Anir, Jul 27). What he
    // struck out was never yellow itself: it was the MUSTARD band
    // (#F59E0B/#EAB308/#CA8A04/#D97706) and, worse, the #705600 brown text sat
    // on top of it. Yellow cannot be a text colour on a light chip, which is
    // exactly how that brown got there — so the yellow moves to the FILL and
    // the text goes near-black. Reads unmistakably yellow, ~13:1 contrast, and
    // no brown anywhere near it.
    label: "In Progress",
    bg: "rgba(255,204,0,0.38)",
    color: "#1D1D1F",
    icon: Timer,
  },
  no_response: {
    // Was #4A4A4A on a gray wash — gray-on-gray, which is banned for anything
    // categorical. Violet matches the soft violet this outcome already wears as
    // a chart fill, so the chip and the segment finally agree.
    label: "No Response",
    bg: "rgba(124,58,237,0.12)",
    color: "var(--ink-violet)",
    icon: CircleSlash,
  },
  meeting_booked: {
    label: "Meeting Booked",
    bg: "rgba(0,113,227,0.12)",
    color: "var(--ink-blue)",
    icon: CalendarCheck,
  },
  ai_call_completed: {
    label: "AI Call Completed",
    bg: "rgba(0,113,227,0.12)",
    color: "var(--ink-blue)",
    icon: PhoneCall,
  },
  ai_call_failed: {
    label: "AI Call Failed",
    bg: "rgba(255,59,48,0.12)",
    color: "var(--ink-red)",
    icon: PhoneMissed,
  },
  // How a VOICE call ended (lib/voice VoiceOutcome). These lived only as local
  // maps inside the voice pages, so <OutcomeBadge> painted "Follow-up" /
  // "No answer" / "Declined" the same fallback gray with no icon — Suren, Jul
  // 27: "the outcome should be color-coded properly". Same labels the voice
  // tables already use, so the two never disagree.
  follow_up: {
    label: "Follow-up",
    bg: "rgba(0,113,227,0.12)",
    color: "var(--ink-blue)",
    icon: CalendarClock,
  },
  no_answer: {
    // Burnt orange — the app-wide caution token (--warning). NEVER the banned
    // yellow band (#F59E0B / #EAB308 / #CA8A04 / #D97706).
    label: "No answer",
    bg: "rgba(194,65,12,0.12)",
    color: "var(--ink-orange)",
    icon: PhoneMissed,
  },
  declined: {
    label: "Declined",
    bg: "rgba(255,59,48,0.12)",
    color: "var(--ink-red)",
    icon: ThumbsDown,
  },
};

// Bright, saturated fills for OUTCOME donut/pie segments. OUTCOME_META.color is
// deliberately DARK (it's badge *text* on a light chip, needs contrast) — reusing
// it as a chart fill looked dim + muddy (Suren: "why is that pie chart so dim…
// don't use that brown for In Progress"). Chart fills get their own vivid
// palette. "That yellow, never use that yellow" was about the MUSTARD band and
// the brown text on it — not about yellow as a hue, so In Progress keeps a
// bright, clean yellow fill here.
export const OUTCOME_CHART_COLOR: Record<string, string> = {
  interested: "#34C759", // bright green
  meeting_booked: "#0A84FF", // bright blue
  in_progress: "#FFCC00", // bright yellow, the mustard band stays banned
  not_interested: "#FF453A", // bright red
  no_response: "#AF9BF5", // soft violet (never gray)
  ai_call_completed: "#0A84FF",
  ai_call_failed: "#FF453A",
};

export const SIZE_TIER_LABEL: Record<string, string> = {
  small: "Small",
  mid: "Mid-size",
  large: "Large",
};

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * THE FLOATING-PANEL SHADOW.
 *
 * Anything that floats above the page (the account menu, the notifications
 * bell, the agent dock) uses this one string, so they cannot drift apart
 * again. Two layers: a wide soft one that lifts the panel off the page, and a
 * tight one that draws the bottom edge. Plus a hairline ring, because on a
 * white page a border alone left no visible edge at all (Anir, Aug 13: "I
 * can't properly see where it ends").
 */
export const POPOVER_SURFACE =
  "border border-border-light ring-1 ring-black/[0.03] " +
  "shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35),0_4px_16px_-8px_rgba(15,23,42,0.2)]";

/**
 * Make a value safe to drop inside a `new RegExp(...)` template.
 *
 * Names reach regexes all over this app — a company's first word, a contact's
 * surname — and those names come from imports and enrichment, not from a
 * fixed list. "Bayer( Group" builds /\bbayer(\b/ and throws; "Astra+Zeneca"
 * builds a quantifier and matches the wrong accounts. Escape first.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A DATE WITH NO TIME IS A CALENDAR DATE, NOT AN INSTANT.
 *
 * Anir, Sep 3, having typed 09/28/2026 and been shown "27 Sept 2026": "I said
 * it's the 28th and when I press save it says the 27th."
 *
 * `Date.parse("2026-09-28")` is UTC midnight — that is the ECMAScript spec for
 * a date-ONLY string, and it differs from how the same parser treats
 * "2026-09-28T00:00". Render that instant anywhere behind UTC and it is still
 * the previous evening, so the date reads a day early for everyone in the
 * Americas and correct for everyone in Europe. An expected signing date has no
 * time and no timezone: it is a square on a calendar, and it must survive
 * being displayed.
 *
 * So a bare YYYY-MM-DD is built as LOCAL midnight and never converted.
 * Anything carrying a time is left alone and parsed normally, because that
 * genuinely is an instant.
 */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  /**
   * THE DATE PART, WHOEVER IS LOOKING.
   *
   * This took the plain YYYY-MM-DD case and let everything else fall through
   * to `Date.parse`, which turns a full timestamp into an INSTANT — and an
   * instant renders as a different calendar day either side of midnight. The
   * deal page is server-rendered, so "Added" came out as one day on the server
   * (UTC) and another in a Los Angeles browser, and React threw a hydration
   * mismatch and re-rendered the tree. Found in the loop: the error appeared
   * on that page in US Pacific and vanished in UTC.
   *
   * A day in a sentence — added on, expected to sign — is a calendar square,
   * not a moment. Taking the leading date off the string makes it the same
   * square for everybody, and kills the mismatch at its source.
   */
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

/** "28 Sept 2026" — a date in a sentence, never a day early. */
export function formatDayLabel(
  value: string | null | undefined,
  locale = "en-GB"
): string {
  const d = parseCalendarDate(value);
  if (!d) return value ?? "-";
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * "Abhinaya Veeramally" → "Abhinaya V." (Anir, Sep 3: "for the sake of space
 * just show first name and then initial for last name").
 *
 * The roster cards were truncating mid-surname — "Abhinaya Veera..." — which
 * spends the width AND loses the name. A first name with an initial is shorter
 * than the truncation was, and it is a name a person recognises rather than a
 * word ending in an ellipsis.
 *
 * A single name is left exactly as it is: "Cher." would be an initial for a
 * surname that does not exist. Middle names are dropped rather than initialled,
 * because "Anir K. S." reads as a formal byline, not as somebody on a list.
 */
export function shortName(full: string | null | undefined): string {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const first = parts[0];
  const last = parts[parts.length - 1];
  /* A surname already down to an initial keeps its existing shape. */
  return /^[A-Za-z]\.?$/.test(last)
    ? `${first} ${last.replace(/\.?$/, ".")}`
    : `${first} ${last[0].toUpperCase()}.`;
}
