import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SizeBadge, OutcomeBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/types";

export function CustomerCard({
  customer,
  contactCount,
  lastOutcome,
  lastSessionDate,
}: {
  customer: Customer;
  contactCount: number;
  lastOutcome?: string | null;
  lastSessionDate?: string | null;
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
        {lastOutcome && (
          <div className="mt-3">
            <OutcomeBadge outcome={lastOutcome} />
          </div>
        )}
      </Card>
    </Link>
  );
}
