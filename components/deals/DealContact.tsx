import Link from "next/link";
import {
  Award,
  Briefcase,
  FlaskConical,
  Mail,
  Phone,
  ShieldCheck,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatPhone } from "@/lib/utils";
import type { Contact } from "@/lib/types";

/* ---------------------------------------------------------------------------
   WHO YOU'RE SELLING TO.

   The header names the person, but naming them isn't the same as being able to
   ring them. This is the chip idiom off the team roster and the contact page —
   the ACTUAL number and the ACTUAL address, tappable, rather than an icon that
   hides them (Suren: "just actually put the fucking email address and the call
   number… you have it correctly on the teams page").

   It also gives the activity column a second block, so the two columns under
   the charts finish at roughly the same height instead of the right one ending
   halfway up a page of white.
--------------------------------------------------------------------------- */

// A role is a category, so it gets a colour AND an icon — never gray type.
const ROLE_MARKS: { test: RegExp; color: string; icon: LucideIcon }[] = [
  { test: /exec|chief|officer|president|founder|coo|ceo|cmo/i, color: "#7C3AED", icon: Briefcase },
  { test: /complian|audit|legal/i, color: "#0F766E", icon: ShieldCheck },
  { test: /quality|qa\b|cmc|manufactur/i, color: "#C2410C", icon: Award },
  { test: /clinical|medical|scientif|safety|pharmacovig/i, color: "#047857", icon: FlaskConical },
  { test: /regulat|affairs|strategy|submiss|intellig/i, color: "#0071E3", icon: Target },
];

function roleMark(role: string): { color: string; icon: LucideIcon } {
  return (
    ROLE_MARKS.find((r) => r.test.test(role)) ?? {
      color: "#0891B2",
      icon: UserRound,
    }
  );
}

export function DealContact({ contact }: { contact: Contact }) {
  const role = contact.role_bucket || "";
  const { color, icon: RoleIcon } = roleMark(role);
  const phone = contact.phone ? formatPhone(contact.phone) : null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-start gap-1.5">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Who you&apos;re selling to
          </h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            The person this deal runs through, and how to reach them
          </p>
        </div>
        <InfoHint text="The primary contact on this deal. Every touch in the history below was logged against them." />
      </div>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar
            name={contact.full_name}
            className="h-12 w-12 shrink-0 text-[15px]"
            tooltip={`${contact.full_name}${contact.job_title ? ` · ${contact.job_title}` : ""}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* Wraps rather than truncating — a person's name is never cut. */}
              <Link
                href={`/contacts/${contact.id}`}
                className="min-w-0 break-normal text-[15px] font-semibold leading-snug text-text-primary transition-colors hover:text-blue-primary hover:underline"
              >
                {contact.full_name}
              </Link>
              <LinkedInLink url={contact.linkedin_url} size={16} />
            </div>
            {contact.job_title && (
              <p className="mt-0.5 break-normal text-[12.5px] leading-snug text-text-secondary">
                {contact.job_title}
              </p>
            )}
            {role && (
              <span
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[11px] font-semibold leading-tight"
                style={{ background: `${color}14`, color }}
              >
                <span
                  className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: color }}
                >
                  <RoleIcon size={10} strokeWidth={2.3} />
                </span>
                {role}
              </span>
            )}
          </div>
        </div>

        {(phone || contact.email) && (
          <div className="mt-3.5 flex flex-wrap gap-2 border-t border-border-light pt-3.5">
            {phone && (
              <a
                href={`tel:${contact.phone?.replace(/[^\d+]/g, "")}`}
                title={`Call ${phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-text-secondary tnum transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <Phone size={13} strokeWidth={2} className="shrink-0" />
                {phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                title={`Email ${contact.email}`}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <Mail size={13} strokeWidth={2} className="shrink-0" />
                <span className="min-w-0 break-all">{contact.email}</span>
              </a>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
