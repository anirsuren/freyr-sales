import { Suspense } from "react";
import Link from "next/link";
import {
  Package,
  CheckCircle2,
  Layers,
  Users,
  type LucideIcon,
} from "lucide-react";
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
  listOfferingTypes,
  listOfferingCategories,
  hydrateOffering,
} from "@/lib/offerings";
import { getRole } from "@/lib/role";
import { RoleSwitcher } from "@/components/offerings/RoleSwitcher";
import { ImportExcel } from "@/components/offerings/ImportExcel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offerings" };

function Stat({
  label,
  value,
  sub,
  subHref,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  subHref?: string;
  href?: string;
  icon?: LucideIcon;
}) {
  const body = (
    <>
      {Icon && (
        <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3 transition-colors group-hover:bg-blue-primary group-hover:text-white">
          <Icon size={16} strokeWidth={1.9} />
        </span>
      )}
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
    <Link href={href} className="block group">
      <Card className="p-4 h-full transition-all duration-200 hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
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
  const offeringTypes = listOfferingTypes();
  const offeringCategories = listOfferingCategories();
  const role = getRole();
  const admin = role === "admin";

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
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RoleSwitcher current={role} />
            <Link
              href="/offerings/offering-categories"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              Offering categories
            </Link>
            <Link
              href="/offerings/offering-types"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              Offering types
            </Link>
            <Link
              href="/offerings/customer-types"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              Customer types
            </Link>
            {admin && <ImportExcel />}
            {admin && (
              <Link
                href="/offerings/new"
                className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-5 py-2.5 bg-blue-primary text-white hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
              >
                + New offering
              </Link>
            )}
          </div>
        }
      />

      {/* Repository at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat
          label="Offerings"
          value={offerings.length}
          href="/offerings"
          icon={Package}
        />
        <Stat
          label="Fully detailed"
          value={mapped}
          sub={toMap > 0 ? `${toMap} awaiting details` : "all detailed"}
          subHref={toMap > 0 ? "/offerings?status=unmapped" : undefined}
          icon={CheckCircle2}
        />
        <Stat
          label="Categories"
          value={offeringCategories.length}
          href="/offerings/offering-categories"
          icon={Layers}
        />
        <Stat
          label="Customer types"
          value={customerTypes.length}
          href="/offerings/customer-types"
          icon={Users}
        />
      </div>

      <Suspense fallback={null}>
        <OfferingsBrowser
          offerings={offerings}
          customerTypes={customerTypes}
          markets={markets}
          offeringTypes={offeringTypes}
          offeringCategories={offeringCategories}
        />
      </Suspense>
    </div>
  );
}
