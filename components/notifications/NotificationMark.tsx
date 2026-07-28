import {
  ClipboardCheck,
  Flame,
  Sparkles,
  CalendarClock,
  PhoneCall,
  Bell,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/lib/notifications";

const ICON: Record<NotificationType, typeof Bell> = {
  review: ClipboardCheck,
  rotting: Flame,
  signal: Sparkles,
  followup: CalendarClock,
  voice: PhoneCall,
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
  company,
  person,
  className,
}: {
  type: NotificationType;
  company?: string;
  person?: string;
  className?: string;
}) {
  const Icon = ICON[type] || Bell;
  const badge = (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 w-[13px] h-[13px] rounded-full flex items-center justify-center ring-2 ring-white",
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
          "relative w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0",
          className
        )}
      >
        <Icon size={15} strokeWidth={1.8} />
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
            className="absolute -bottom-1 -right-1 w-[15px] h-[15px] text-[6.5px] ring-2 ring-white"
          />
        ) : (
          badge
        )}
      </span>
    );
  }

  return (
    <span className={cn("relative shrink-0 w-8 h-8", className)}>
      <Avatar name={person!} className="w-8 h-8 text-[11px]" />
      {badge}
    </span>
  );
}
