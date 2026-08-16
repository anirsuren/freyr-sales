import { format, parseISO, isValid } from "date-fns";
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

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
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
    color: "#1A7A35",
    icon: ThumbsUp,
  },
  not_interested: {
    label: "Not Interested",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
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
    color: "#6D28D9",
    icon: CircleSlash,
  },
  meeting_booked: {
    label: "Meeting Booked",
    bg: "rgba(0,113,227,0.12)",
    color: "#0040A0",
    icon: CalendarCheck,
  },
  ai_call_completed: {
    label: "AI Call Completed",
    bg: "rgba(0,113,227,0.12)",
    color: "#0040A0",
    icon: PhoneCall,
  },
  ai_call_failed: {
    label: "AI Call Failed",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
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
    color: "#0040A0",
    icon: CalendarClock,
  },
  no_answer: {
    // Burnt orange — the app-wide caution token (--warning). NEVER the banned
    // yellow band (#F59E0B / #EAB308 / #CA8A04 / #D97706).
    label: "No answer",
    bg: "rgba(194,65,12,0.12)",
    color: "#C2410C",
    icon: PhoneMissed,
  },
  declined: {
    label: "Declined",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
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
