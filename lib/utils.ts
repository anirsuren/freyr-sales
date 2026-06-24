import { format, parseISO, isValid } from "date-fns";

// Lightweight classnames joiner (avoids pulling in clsx/tailwind-merge).
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
    if (!isValid(d)) return "—";
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

// Human "time ago" for recency labels (e.g. "2h ago", "3d ago"). Falls back to
// an absolute date for anything older than ~4 weeks so it stays meaningful.
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
    if (!isValid(d)) return "—";
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
    return "—";
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    if (!isValid(d)) return "—";
    return format(d, "MMM d, yyyy • h:mm a");
  } catch {
    return "—";
  }
}

// Human label + design-token classes for each interaction outcome (Section 11).
export const OUTCOME_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  interested: {
    label: "Interested",
    bg: "rgba(52,199,89,0.12)",
    color: "#1A7A35",
  },
  not_interested: {
    label: "Not Interested",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
  },
  in_progress: {
    label: "In Progress",
    bg: "rgba(255,159,10,0.12)",
    color: "#7A4A00",
  },
  no_response: {
    label: "No Response",
    bg: "rgba(142,142,147,0.12)",
    color: "#4A4A4A",
  },
  meeting_booked: {
    label: "Meeting Booked",
    bg: "rgba(0,113,227,0.12)",
    color: "#0040A0",
  },
  ai_call_completed: {
    label: "AI Call Completed",
    bg: "rgba(0,113,227,0.12)",
    color: "#0040A0",
  },
  ai_call_failed: {
    label: "AI Call Failed",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
  },
};

export const SIZE_TIER_LABEL: Record<string, string> = {
  small: "Small",
  mid: "Mid-size",
  large: "Large",
};

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
