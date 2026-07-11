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
import { OfferingsManageMenu } from "@/components/offerings/OfferingsManageMenu";
import { NewOfferingButton } from "@/components/offerings/NewOfferingButton";

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
  // Four DISTINCT cards, but compact — icon on the left, big number + label
  // beside it — so they're short (not tall boxes) without being crammed into
  // one divided strip (Suren: "why did you combine these, it looks like shit").
  const body = (
    <>
      {Icon && (
        <span className="w-11 h-11 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0 transition-colors group-hover:bg-blue-primary group-hover:text-white">
          <Icon size={20} strokeWidth={1.9} />
        </span>
      )}
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[26px] font-bold text-text-primary leading-none tnum tracking-[-0.01em]">
            <CountUp value={value} unit="count" />
          </span>
          {sub && subHref ? (
            <Link
              href={subHref}
              className="text-[11px] font-semibold text-warning hover:underline leading-none relative z-10"
            >
              {sub} →
            </Link>
          ) : sub ? (
            <span className="text-[11px] text-text-tertiary leading-none">
              {sub}
            </span>
          ) : null}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mt-1.5 truncate">
          {label}
        </p>
      </div>
    </>
  );
  const base = "p-4 h-full flex items-center gap-3.5 transition-all duration-150";
  return href ? (
    <Link href={href} className="block group h-full">
      <Card
        className={`${base} hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98] active:shadow-none active:translate-y-0`}
      >
        {body}
      </Card>
    </Link>
  ) : (
    <Card className={`${base} group hover:border-blue-subtle`}>{body}</Card>
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
            <OfferingsManageMenu />
            {admin && <ImportExcel />}
            {admin && (
              <NewOfferingButton
                customerTypes={customerTypes}
                markets={markets}
                existingTypes={Array.from(
                  new Set(offeringTypes.map((t) => t.name))
                )}
                offeringCategories={offeringCategories}
              />
            )}
          </div>
        }
      />

      {/* Repository at a glance — four distinct, compact cards */}
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
