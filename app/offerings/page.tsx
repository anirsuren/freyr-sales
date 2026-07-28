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
  type OfferingCommerce,
  type OfferingTrendTip,
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
import { getDb } from "@/lib/db";
import {
  reportForOffering,
  REVENUE_TYPES,
  REVENUE_TYPE_META,
  type OfferingReport,
} from "@/lib/revenue";
import { formatMoney } from "@/lib/pipeline";
import { ImportExcel } from "@/components/offerings/ImportExcel";
import { OfferingsManageMenu } from "@/components/offerings/OfferingsManageMenu";
import { NewOfferingButton } from "@/components/offerings/NewOfferingButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offerings" };

// ---------------------------------------------------------------- trend
// The revenue build behind an offering's hover chart. Honest numbers only
// (standing rule): the time axis comes from the revenue lines' REAL
// `start_date` field (yyyy-mm-dd, lib/types.ts) — each point is the
// cumulative annual book through that month. When any line carries no date,
// a month axis would misstate the totals, so the fallback is the other true
// story: cumulative revenue account by account ("how the book built").
// Nothing here is interpolated or invented.

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} '${y.slice(2)}`;
}

function monthBefore(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function buildTrend(r: OfferingReport): OfferingCommerce["trend"] {
  if (r.totalRevenue <= 0) return { points: [], labels: [], hint: "", tips: [] };

  // Flatten every revenue line, keeping its booking month (from start_date)
  // and a tooltip row (charts' TipItem shape) naming who booked what.
  type Entry = { month: string | null; amount: number; tip: OfferingTrendTip };
  const entries: Entry[] = [];
  for (const c of r.customers) {
    for (const l of c.lines) {
      const amount = Number(l.amount) || 0;
      if (amount <= 0) continue;
      const month =
        l.start_date && /^\d{4}-\d{2}/.test(l.start_date)
          ? l.start_date.slice(0, 7)
          : null;
      entries.push({
        month,
        amount,
        tip: {
          name: c.name,
          logo: c.name,
          value: formatMoney(amount),
          sub: l.description || REVENUE_TYPE_META[l.revenue_type].label,
        },
      });
    }
  }

  const allDated = entries.length > 0 && entries.every((e) => e.month != null);
  if (allDated) {
    const months = Array.from(
      new Set(entries.map((e) => e.month as string))
    ).sort();
    // Keep it a sparkline: at most the last 7 booked months. The leading
    // point is still a true cumulative — everything booked through the month
    // before the window (a genuine $0 when the window starts at the first
    // booking; nothing existed before the earliest real start_date).
    const shown = months.slice(-7);
    const baseMonth =
      months.length > shown.length
        ? months[months.length - shown.length - 1]
        : monthBefore(shown[0]);
    const axis = [baseMonth, ...shown];
    const points: number[] = [];
    const labels: string[] = [];
    const tips: OfferingTrendTip[][] = [];
    for (const mo of axis) {
      // yyyy-mm compares lexicographically — cumulative through this month.
      points.push(
        entries.reduce(
          (s, e) => ((e.month as string) <= mo ? s + e.amount : s),
          0
        )
      );
      labels.push(monthLabel(mo));
      tips.push(
        entries.filter((e) => e.month === mo).map((e) => e.tip)
      );
    }
    return { points, labels, hint: `since ${monthLabel(months[0])}`, tips };
  }

  // No usable dates on every line — the honest alternative: how the book
  // built account by account (report order: largest first).
  const rows = r.customers.filter((c) => c.revenue > 0);
  let running = 0;
  return {
    points: rows.map((c) => (running += c.revenue)),
    labels: rows.map((c) => c.name),
    hint: "how the book built",
    tips: rows.map((c) => [
      { name: c.name, logo: c.name, value: formatMoney(c.revenue) },
    ]),
  };
}

// ------------------------------------------------------------ revenue mix
// The offering's money split by CONTRACT TYPE (annual / project / service /
// license). It's the honest second cut for the hover panel's bar chart when
// nobody licenses seats — a different question ("what kind of revenue is
// this?") rather than a re-plot of the pie's revenue-per-customer. Straight
// from the same revenue lines; nothing derived or invented.
function revenueByType(r: OfferingReport): OfferingCommerce["revenueByType"] {
  const totals: Record<string, number> = {};
  for (const c of r.customers) {
    for (const l of c.lines) {
      const amount = Number(l.amount) || 0;
      if (amount <= 0) continue;
      totals[l.revenue_type] = (totals[l.revenue_type] ?? 0) + amount;
    }
  }
  return REVENUE_TYPES.filter((t) => (totals[t] ?? 0) > 0).map((t) => ({
    label: REVENUE_TYPE_META[t].short,
    value: totals[t],
  }));
}

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

export default async function OfferingsPage() {
  const offerings = listOfferings().map(hydrateOffering) as HydratedOffering[];
  const customerTypes = listCustomerTypes();
  const markets = listMarkets();
  const offeringTypes = listOfferingTypes();
  const offeringCategories = listOfferingCategories();
  const role = await getRole();
  const canEdit = role === "admin" || role === "editor";

  // Commercial reality per offering — revenue, seats, and WHO is using it —
  // so the card hover is a mini-dashboard like the Customers page, not just a
  // pop-out (Anir: "I care about all the information. Look at the customers
  // page."). Aggregated server-side from the same revenue lines the offering
  // Reports tab uses; only compact plain data crosses to the client.
  const allCustomers = await getDb().customers.list();
  const commerce: Record<string, OfferingCommerce> = Object.fromEntries(
    offerings.map((o) => {
      const r = reportForOffering(allCustomers, o.id);
      return [
        o.id,
        {
          totalRevenue: r.totalRevenue,
          totalLicenses: r.totalLicenses,
          customerCount: r.customerCount,
          // Seats travel with each account so the hover panel can plot
          // "licensed seats per customer" beside the revenue pie — same
          // accounts, second dimension.
          customers: [...r.customers]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3)
            .map((c) => ({
              id: c.id,
              name: c.name,
              revenue: c.revenue,
              licenses: c.licenses,
            })),
          revenueByType: revenueByType(r),
          // The revenue build over time (real start_date months) powering the
          // hover line chart + the grid Trend column. Plain arrays only.
          trend: buildTrend(r),
        },
      ];
    })
  );

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
      {/* No "Viewing as" switcher in the header: it was a demo stand-in from
          before real logins existed — with real accounts, whoever has a role
          has that role (Anir, Jul 25). The downgrade-only preview plumbing
          stays server-side if an admin tool ever wants it. */}
      <PageHeader
        title="Offerings"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <OfferingsManageMenu />
            {canEdit && <ImportExcel />}
            {canEdit && (
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
          commerce={commerce}
        />
      </Suspense>
    </div>
  );
}
