import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import {
  OfferingsBrowser,
  type HydratedOffering,
} from "@/components/offerings/OfferingsBrowser";
import {
  listOfferings,
  listCustomerTypes,
  listMarkets,
  hydrateOffering,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offerings" };

function Stat({
  label,
  value,
  sub,
  subHref,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  subHref?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </p>
      <p className="text-[24px] font-bold text-text-primary leading-none mt-1.5 tnum">
        <CountUp value={value} unit="count" />
      </p>
      {sub &&
        (subHref ? (
          <Link
            href={subHref}
            className="inline-block text-[11px] font-medium text-blue-primary hover:underline mt-1"
          >
            {sub} →
          </Link>
        ) : (
          <p className="text-[11px] text-text-tertiary mt-1">{sub}</p>
        ))}
    </>
  );
  return href ? (
    <Link href={href} className="block">
      <Card className="p-4 h-full transition-colors hover:border-blue-subtle">
        {body}
      </Card>
    </Link>
  ) : (
    <Card className="p-4 h-full">{body}</Card>
  );
}

export default function OfferingsPage() {
  const offerings = listOfferings().map(hydrateOffering) as HydratedOffering[];
  const customerTypes = listCustomerTypes();
  const markets = listMarkets();

  // Repository completeness — useful as Suren rolls this out and has the data entered.
  const mapped = offerings.filter(
    (o) =>
      o.customerTypes.length > 0 ||
      o.markets.length > 0 ||
      o.materials.length > 0
  ).length;
  const toMap = offerings.length - mapped;

  return (
    <div>
      <PageHeader
        title="Offerings"
        subtitle="Freyr's offering repository — what we sell, who it's for, the markets it's available in, and the sales materials behind each one."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/offerings/customer-types"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              Customer types
            </Link>
            <Link
              href="/offerings/new"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-5 py-2.5 bg-blue-primary text-white hover:bg-blue-hover transition-colors"
            >
              + New offering
            </Link>
          </div>
        }
      />

      {/* Repository at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Offerings" value={offerings.length} href="/offerings" />
        <Stat
          label="Mapped"
          value={mapped}
          sub={toMap > 0 ? `${toMap} still to map` : "all mapped"}
          subHref={toMap > 0 ? "/offerings?status=unmapped" : undefined}
        />
        <Stat
          label="Customer types"
          value={customerTypes.length}
          href="/offerings/customer-types"
        />
        <Stat
          label="Markets"
          value={markets.length}
          href="/offerings/customer-types#markets"
        />
      </div>

      <Suspense fallback={null}>
        <OfferingsBrowser
          offerings={offerings}
          customerTypes={customerTypes}
          markets={markets}
        />
      </Suspense>
    </div>
  );
}
