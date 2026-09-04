import {
  ClipboardCheck,
  Flame,
  Sparkles,
  CalendarClock,
  PhoneCall,
  Fingerprint,
  Target,
  Map,
  Bell,
  ClipboardList,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { SETUP_META } from "@/components/notifications/NotificationRow";
import type { NotificationType, SetupMark } from "@/lib/notifications";
import { tint } from "@/lib/tint";

const ICON: Record<NotificationType, typeof Bell> = {
  review: ClipboardCheck,
  rotting: Flame,
  signal: Sparkles,
  followup: CalendarClock,
  voice: PhoneCall,
  security: Fingerprint,
  performance: Target,
  roadmap: Map,
  /* The Solutioning module's own glyph, so an alert about a submission looks
     like the room it came from. */
  solutioning: ClipboardList,
};

// The badge says what kind of alert it is; the mark underneath says who it is
// about. Colour carries the same meaning it does everywhere else — red is
// trouble, green is a win, blue is something waiting on you.
const BADGE: Record<NotificationType, string> = {
  review: "bg-blue-primary text-white",
  rotting: "bg-error text-white",
  signal: "bg-success text-white",
  followup: "bg-blue-primary text-white",
  voice: "bg-success text-white",
  // Identity purple — the same token ownership uses everywhere else.
  security: "bg-[color:#6D28D9] text-white",
  // A goal needs you — the same blue every "waiting on you" state uses.
  performance: "bg-blue-primary text-white",
  /* Identity purple, like ownership and the No-schedule chip: a roadmap change
     is news about a thing, not a verdict, so it must not wear a status hue. */
  roadmap: "bg-[color:#A855F7] text-white",
  /* Waiting on you, like every other "this needs you" state. */
  solutioning: "bg-blue-primary text-white",
};

/**
 * Entity imagery for a notification: the account's logo with the person's
 * headshot tucked in front of it, and a small badge for the alert type. A
 * generic calendar icon told a rep nothing — the logo tells them which account
 * this is before they read a word (Anir, Jul 25: "make sure that there are
 * logos and images and stuff like the company logo").
 *
 * Sized at 32px, not 36px: at the old size the square logo plus its overlapping
 * headshot outweighed the two lines of text beside it and the row read as a
 * picture with a caption (Suren, Jul 27: "the notifications are really weird").
 * One mark, one small badge, text leads.
 */
export function NotificationMark({
  type,
  mark,
  company,
  person,
  className,
}: {
  type: NotificationType;
  /** Set on the account-setup rows so each draws its own glyph and colour
   *  rather than all three inheriting the fingerprint from `security`. */
  mark?: SetupMark;
  company?: string;
  person?: string;
  className?: string;
}) {
  const setup = mark ? SETUP_META[mark] : undefined;
  const Icon = setup?.icon || ICON[type] || Bell;
  const badge = (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 w-[13px] h-[13px] rounded-full flex items-center justify-center ring-2 ring-[color:var(--white)]",
        BADGE[type] || "bg-blue-primary text-white"
      )}
    >
      <Icon size={8} strokeWidth={2.4} />
    </span>
  );

  // Nothing to identify (a system-level alert): keep the typed icon, but give
  // it the same footprint so rows never jump.
  if (!company && !person) {
    return (
      <span
        className={cn(
          "relative w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0",
          setup ? undefined : "bg-blue-light text-blue-primary",
          className
        )}
        style={
          setup
            ? { backgroundColor: tint(setup.color, 9), color: setup.color }
            : undefined
        }
      >
        <Icon size={16} strokeWidth={2} />
      </span>
    );
  }

  if (company) {
    return (
      <span className={cn("relative shrink-0 w-8 h-8", className)}>
        <CompanyLogo name={company} className="w-8 h-8 rounded-lg text-[11px]" />
        {person ? (
          <Avatar
            name={person}
            className="absolute -bottom-1 -right-1 w-[15px] h-[15px] text-[6.5px] ring-2 ring-[color:var(--white)]"
          />
        ) : (
          badge
        )}
      </span>
    );
  }

  /**
   * A FACE ONCE, NOT TWICE (Anir, Aug 23: "I don't need to see the person's
   * profile picture on the left because you're already seeing it below. I
   * need to see the full icon there instead").
   *
   * With no account to name, this drew the person's headshot with a 13px type
   * badge clipped onto its corner — and the row underneath already names that
   * person, with their face, in full. So the left mark spent its whole
   * footprint repeating the line below it and shrank the one thing it could
   * usefully say (which KIND of alert this is) down to eight pixels. The type
   * icon takes the whole mark instead, at the same size as every other row's,
   * in its own colour.
   */
  return (
    <span
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
        BADGE[type] || "bg-blue-primary text-white",
        className
      )}
    >
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}
