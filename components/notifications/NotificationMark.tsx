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
        "absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full flex items-center justify-center ring-2 ring-white",
        BADGE[type] || "bg-blue-primary text-white"
      )}
    >
      <Icon size={9} strokeWidth={2.4} />
    </span>
  );

  // Nothing to identify (a system-level alert): keep the typed icon, but give
  // it the same footprint so rows never jump.
  if (!company && !person) {
    return (
      <span
        className={cn(
          "relative w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0",
          className
        )}
      >
        <Icon size={17} strokeWidth={1.7} />
      </span>
    );
  }

  if (company) {
    return (
      <span className={cn("relative shrink-0 w-9 h-9", className)}>
        <CompanyLogo name={company} className="w-9 h-9 rounded-lg text-[12px]" />
        {person ? (
          <Avatar
            name={person}
            className="absolute -bottom-1 -right-1 w-[17px] h-[17px] text-[7px] ring-2 ring-white"
          />
        ) : (
          badge
        )}
      </span>
    );
  }

  return (
    <span className={cn("relative shrink-0 w-9 h-9", className)}>
      <Avatar name={person!} className="w-9 h-9 text-[12px]" />
      {badge}
    </span>
  );
}
