import {
  CalendarClock,
  ClipboardCheck,
  Flame,
  PhoneCall,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { NotificationMark } from "@/components/notifications/NotificationMark";
import { cn } from "@/lib/utils";
import type {
  AppNotification,
  NotificationType,
  NotificationUrgency,
} from "@/lib/notifications";

/**
 * One notification, drawn the same way in the bell panel and on the
 * notifications page.
 *
 * The old row led with the TYPE ("Follow-up due") in bold, so five follow-ups
 * read as five copies of the same alert with a run-on gray sentence underneath
 * (Suren, Jul 27: "they don't look good at all… just completely revamp it").
 * The hierarchy here is:
 *
 *   line 1 — WHO it's about (13px semibold) ............ how long (compact stamp)
 *   line 2 — [type chip: colour + icon] what's needed (12px secondary)
 *
 * The type is demoted to a small coloured chip (the standing rule: any status or
 * category is colour + icon, never plain text), so the thing that differs
 * between rows — the account — is the thing you read first.
 */

const TYPE_META: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  // Waiting on you.
  review: { icon: ClipboardCheck, color: "#0071E3" },
  // Trouble — burnt orange, the caution token (never amber/yellow).
  rotting: { icon: Flame, color: "#C2410C" },
  // A win.
  signal: { icon: Sparkles, color: "#16A34A" },
  // A commitment you made.
  followup: { icon: CalendarClock, color: "#7C3AED" },
  // A call.
  voice: { icon: PhoneCall, color: "#0891B2" },
};

/**
 * Chip text. Most titles are already short enough to be a chip and stay word
 * for word; only the long ones are shortened, so the wording a rep learned on
 * one surface is the wording they see on the other.
 */
const CHIP_LABEL: Record<string, string> = {
  "Pitch awaiting your approval": "Approval needed",
  "Voice call needs attention": "Call needs attention",
  "Call analysis is ready": "Call ready",
};

/** Late is late: an overdue promise turns red wherever it appears. */
const LATE_RED = "#B02020";
const TODAY_ORANGE = "#C2410C";

export function urgencyColor(urgency?: NotificationUrgency): string | null {
  if (urgency === "overdue") return LATE_RED;
  if (urgency === "today") return TODAY_ORANGE;
  return null;
}

function chipColor(n: AppNotification): string {
  if (n.type === "followup" && n.urgency === "overdue") return LATE_RED;
  return (TYPE_META[n.type] || TYPE_META.review).color;
}

/**
 * "Overdue · 3" — the sort order made visible, so a rep can see that the top of
 * the list is late work rather than having to trust it.
 */
export function NotificationGroupHeading({
  label,
  count,
  urgency,
  className,
}: {
  label: string;
  count: number;
  urgency?: NotificationUrgency;
  className?: string;
}) {
  const color = urgencyColor(urgency);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "text-[10.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap",
          color ? undefined : "text-blue-primary"
        )}
        style={color ? { color } : undefined}
      >
        {label}
      </span>
      <span className="text-[10.5px] font-semibold text-text-secondary tnum">
        {count}
      </span>
      {/* A border, not a background: `.dark .border-border-light` re-skins
          border colours, so the hairline follows the theme. */}
      <span
        className="h-0 flex-1 border-t border-border-light"
        aria-hidden="true"
      />
    </div>
  );
}

export function NotificationRow({
  notification: n,
  unread,
}: {
  notification: AppNotification;
  unread?: boolean;
}) {
  const meta = TYPE_META[n.type] || TYPE_META.review;
  const Icon = meta.icon;
  const color = chipColor(n);
  const label = CHIP_LABEL[n.title] || n.title;
  const stampColor = urgencyColor(n.urgency);

  return (
    <div className="flex items-start gap-3 min-w-0">
      {/* Every account and person keeps its mark — just sized so the imagery
          never outweighs the words it's labelling. */}
      <NotificationMark type={n.type} company={n.company} person={n.person} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 min-w-0">
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-text-primary leading-[1.35] break-words">
            {n.subject || n.title}
          </p>
          {n.stamp && (
            <span
              className={cn(
                "shrink-0 text-[11px] font-semibold tnum leading-[1.5] whitespace-nowrap",
                stampColor ? undefined : "text-text-secondary"
              )}
              style={stampColor ? { color: stampColor } : undefined}
            >
              {n.stamp}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span
            className="semantic-color-pill inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap"
            style={
              {
                "--semantic-color": color,
                "--semantic-bg": `${color}1A`,
              } as CSSProperties
            }
          >
            <Icon size={11} strokeWidth={2.4} aria-hidden="true" />
            {label}
          </span>
          <span className="min-w-0 text-[12px] text-text-secondary leading-snug break-words">
            {n.detail || n.body}
          </span>
        </div>
      </div>

      {/* Unread marker: present, but quieter than the words it sits beside. */}
      {unread && (
        <span
          role="img"
          aria-label="Unread"
          className="mt-[5px] w-1.5 h-1.5 rounded-full bg-blue-primary/70 shrink-0"
        />
      )}
    </div>
  );
}
