import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SizeBadge, OutcomeBadge, Badge } from "@/components/ui/Badge";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/types";
import type { AccountHealth } from "@/lib/health";

export function CustomerCard({
  customer,
  contactCount,
  lastOutcome,
  lastSessionDate,
  health,
}: {
  customer: Customer;
  contactCount: number;
  lastOutcome?: string | null;
  lastSessionDate?: string | null;
  health?: AccountHealth;
}) {
  return (
    <Link href={`/customers/${customer.id}`} className="block">
      <Card className="hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-card transition-all duration-200 h-full">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[17px] font-semibold text-text-primary">
            {customer.company_name}
          </span>
          <SizeBadge tier={customer.size_tier} />
        </div>
        <p className="text-[13px] text-text-secondary mb-4">
          {customer.industry || "—"}
        </p>
        <div className="flex items-center justify-between text-[13px] text-text-tertiary">
          <span>
            {contactCount} contact{contactCount === 1 ? "" : "s"}
          </span>
          {lastSessionDate && <span>Last session {formatDate(lastSessionDate)}</span>}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {/* Health leads — it's the primary filter/sort, so surface it on the
              card too (was only in the table view). */}
          {health && <HealthBadge health={health} />}
          {lastOutcome ? (
            <OutcomeBadge outcome={lastOutcome} />
          ) : (
            // No logged outcome yet — show a neutral chip so the card still
            // reads as complete instead of leaving an empty gap.
            <Badge
              label="No outcome yet"
              bg="rgba(142,142,147,0.12)"
              color="#6E6E73"
            />
          )}
        </div>
      </Card>
    </Link>
  );
}
