import { Briefcase, Compass, Fingerprint, type LucideIcon } from "lucide-react";
import { NotificationMark } from "@/components/notifications/NotificationMark";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type {
  AppNotification,
  NotificationUrgency,
  SetupMark,
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

/**
 * The account-setup rows, each with its own icon and colour. All three used to
 * inherit the fingerprint from `security`, so the walkthrough row and the job
 * title row both advertised themselves as Touch ID (Anir, Aug 13: "I have no
 * idea why your account has a Touch ID icon, and why the block does have a
 * Touch ID icon. None of that makes any sense").
 */
export const SETUP_META: Record<SetupMark, { icon: LucideIcon; color: string }> = {
  // Finding your way around: the blue used for "something waiting on you".
  tour: { icon: Compass, color: "#0071E3" },
  // Sign-in, and the only row a fingerprint belongs on.
  passkey: { icon: Fingerprint, color: "#6D28D9" },
  // Who you are to the rest of the company.
  profile: { icon: Briefcase, color: "#0F766E" },
};

/** Late is late: an overdue promise turns red wherever it appears. */
const LATE_RED = "#B02020";
const TODAY_ORANGE = "#C2410C";

export function urgencyColor(urgency?: NotificationUrgency): string | null {
  if (urgency === "overdue") return LATE_RED;
  if (urgency === "today") return TODAY_ORANGE;
  return null;
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
  const heading = n.subject || n.title;
  const stampColor = urgencyColor(n.urgency);

  return (
    <div className="flex items-start gap-3 min-w-0">
      {/* Every account and person keeps its mark — just sized so the imagery
          never outweighs the words it's labelling. */}
      <NotificationMark
        type={n.type}
        mark={n.mark}
        company={n.company}
        person={n.person}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 min-w-0">
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-text-primary leading-[1.35] break-words">
            {heading}
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

        {/* THE PERSON, NOT A CATEGORY (Anir, Aug 20: "I need to see who sent
            it back in the notification. I don't like the tag you have where
            you say 'needs your fix' or where you say 'your profile.' It
            doesn't look good. I don't need that"). The chip named the KIND of
            alert, which the mark on the left already says in colour and icon —
            so it spent a whole line restating the row while the one fact that
            actually needed a name went unprinted. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {n.person && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-text-primary">
              <Avatar name={n.person} className="h-[18px] w-[18px] shrink-0 text-[8px]" />
              {n.person}
            </span>
          )}
          <span className="min-w-0 text-[12px] text-text-secondary leading-snug break-words">
            {n.detail || n.body}
          </span>
        </div>
        {/* The reason on its own line, quoted — not run into the sentence
            above it (Anir, Aug 20: "then underneath you put the reason"). */}
        {n.note && (
          <p className="mt-1 min-w-0 text-[12px] italic text-text-secondary leading-snug break-words">
            &ldquo;{n.note}&rdquo;
          </p>
        )}
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
