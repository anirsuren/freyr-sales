import { Mail, Phone } from "lucide-react";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { cn } from "@/lib/utils";

/**
 * EVERY WAY TO REACH ONE PERSON, AS A ROW OF FLOATING CHIPS.
 *
 * The offering cards set the standard for this app: a coloured, icon-carrying
 * chip that you can pick out without reading it (Anir, Jul 29, pointing at the
 * Related-offerings tiles: "you see how it's like floating tags"). The people
 * rows were the opposite — hairline-outlined chips in gray text, and a generic
 * speech bubble next to the WORD "Teams" when the real logo already existed in
 * this folder. His fix, verbatim: "you don't have the Teams logo. You don't
 * need to say Teams, just have the logo, and then have the LinkedIn logo, the
 * phone number, etc."
 *
 * So: a channel that HAS a brand mark is the mark alone, on a tint of its own
 * brand colour. Email and phone carry the actual value, because the value is
 * the useful part. Nothing here is gray, and nothing borrows red, green or
 * amber — those mean something in this app.
 */

// Brand and channel accents. Blue-family only, kept clear of status hues.
const EMAIL = "#2563EB"; // blue
const PHONE = "#7C3AED"; // violet
const TEAMS = "#5059C9"; // Microsoft Teams purple
const LINKEDIN = "#0A66C2"; // LinkedIn blue

function Chip({
  accent,
  title,
  className,
  children,
}: {
  accent: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      // 1A ≈ 10% alpha — the same tint AttributeTag uses, so a chip reads the
      // same way in both themes without a second set of dark-mode classes.
      style={{ color: accent, background: `${accent}1A` }}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold",
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

export function ContactChips({
  email,
  phone,
  linkedin,
  /** Teams reachability. Internal colleagues have it; client contacts do not. */
  teams,
  className,
}: {
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  teams?: boolean;
  className?: string;
}) {
  if (!email && !phone && !linkedin && !teams) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {email && (
        <Chip accent={EMAIL} title={email}>
          <Mail size={11} strokeWidth={2.4} className="shrink-0" />
          {/* One line, always. It used to break-all across three (Anir: "on one
              line, it has to be on one line"); the full address is in the
              tooltip and on the person's own card. */}
          <span className="truncate">{email}</span>
        </Chip>
      )}
      {phone && (
        <Chip accent={PHONE} title={`Call ${phone}`}>
          <Phone size={11} strokeWidth={2.4} className="shrink-0" />
          {phone}
        </Chip>
      )}
      {teams && (
        <Chip accent={TEAMS} title="Reachable on Microsoft Teams">
          <TeamsIcon size={13} />
          <span className="sr-only">Microsoft Teams</span>
        </Chip>
      )}
      {linkedin && (
        <Chip accent={LINKEDIN} title="Has a LinkedIn profile">
          <LinkedInIcon size={12} />
          <span className="sr-only">LinkedIn</span>
        </Chip>
      )}
    </span>
  );
}
