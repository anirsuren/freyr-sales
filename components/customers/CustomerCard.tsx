import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { SizeBadge, OutcomeBadge, Badge } from "@/components/ui/Badge";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/types";
import type { AccountHealth } from "@/lib/health";

export function CustomerCard({
  customer,
  contactCount,
  contacts,
  lastOutcome,
  lastSessionDate,
  health,
}: {
  customer: Customer;
  contactCount: number;
  contacts?: { id: string; name: string }[];
  lastOutcome?: string | null;
  lastSessionDate?: string | null;
  health?: AccountHealth;
}) {
  return (
    // Stretched-link pattern: the company name opens the account (its ::after
    // overlay covers the whole card), while each contact is its OWN link lifted
    // above it (Suren: "click on the customer contact here, and they can also be
    // multiple"). No nested anchors.
    <Card className="relative group hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-card transition-all duration-150 h-full active:scale-[0.98] active:shadow-none active:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <CompanyLogo
          name={customer.company_name}
          className="w-10 h-10 text-[13px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/customers/${customer.id}`}
              aria-label={`Open ${customer.company_name}`}
              className="min-w-0 text-[16px] font-semibold text-text-primary truncate rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-2 focus-visible:ring-blue-primary group-hover:text-blue-primary transition-colors"
            >
              {customer.company_name}
            </Link>
            <SizeBadge tier={customer.size_tier} />
          </div>
          <p className="text-[13px] text-text-secondary mt-0.5">
            {customer.industry || "—"}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px] text-text-tertiary">
        {contacts && contacts.length > 0 ? (
          contacts.length === 1 ? (
            <Link
              href={`/contacts/${contacts[0].id}`}
              className="relative z-10 flex items-center gap-2 min-w-0 group/ct"
            >
              <Avatar
                name={contacts[0].name}
                className="w-7 h-7 text-[10px] shrink-0"
                tooltip={contacts[0].name}
              />
              <span className="truncate text-text-secondary group-hover/ct:text-blue-primary transition-colors">
                {contacts[0].name}
              </span>
            </Link>
          ) : (
            <span className="relative z-10 flex items-center min-w-0">
              <span className="flex -space-x-2 shrink-0">
                {contacts.slice(0, 4).map((ct) => (
                  <Link
                    key={ct.id}
                    href={`/contacts/${ct.id}`}
                    aria-label={`Open ${ct.name}`}
                    className="rounded-full hover:z-10 hover:-translate-y-0.5 transition-transform"
                  >
                    <Avatar
                      name={ct.name}
                      className="w-7 h-7 text-[10px] ring-2 ring-white"
                      tooltip={ct.name}
                    />
                  </Link>
                ))}
              </span>
              <span className="ml-2 text-[12px] font-medium text-text-tertiary">
                {contactCount > 4 ? `+${contactCount - 4} more` : `${contactCount} contacts`}
              </span>
            </span>
          )
        ) : (
          <span>No contacts yet</span>
        )}
        {lastSessionDate && (
          <span className="shrink-0">Last session {formatDate(lastSessionDate)}</span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {health && <HealthBadge health={health} />}
        {lastOutcome ? (
          <OutcomeBadge outcome={lastOutcome} />
        ) : (
          <Badge
            label="No outcome yet"
            bg="rgba(142,142,147,0.12)"
            color="#6E6E73"
          />
        )}
      </div>
    </Card>
  );
}
