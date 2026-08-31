import { Suspense } from "react";
import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { canAccessModule } from "@/lib/moduleAccess";
import { PageHeader } from "@/components/layout/PageHeader";
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
import {
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import { canManageOfferings, getRole } from "@/lib/role";
import { moduleCreateRefusal } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import {
  reportForOffering,
  REVENUE_TYPES,
  REVENUE_TYPE_META,
  type OfferingReport,
} from "@/lib/revenue";
import { formatMoney } from "@/lib/pipeline";
import { ImportExcel } from "@/components/offerings/ImportExcel";
import { OfferingsGlossaryBar } from "@/components/offerings/OfferingsGlossaryBar";
import { NewOfferingButton } from "@/components/offerings/NewOfferingButton";
import { redactOfferingsForCurrentUser } from "@/lib/materialAccess";

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


export default async function OfferingsPage() {
  const people = await listAssignablePeople();
  // The browser receives these records as props, so server-side redaction is
  // required even though the visible card only shows material counts. Real
  // mode also strips spreadsheet-only POCs and orphan owners before any data
  // reaches the client: only active account-backed people may render there.
  const offerings = (await redactOfferingsForCurrentUser(
    listOfferings()
      .map((offering) => redactUnverifiedOfferingPeople(offering, people))
      .map(hydrateOffering)
  )) as unknown as HydratedOffering[];
  const customerTypes = listCustomerTypes();
  const markets = listMarkets();
  const offeringTypes = listOfferingTypes();
  const offeringCategories = listOfferingCategories();
  const me = await getCurrentUser();
  const role = await getRole();
  /**
   * SHOW THE BUTTON ONLY WHEN THE SAVE WOULD LAND.
   *
   * This asked "are you an admin or an owner". The API asks the privilege
   * table first (app/api/offerings/route.ts: moduleCreateRefusal), and the
   * table's Offerings row gives a BD Owner *view*. So a BD Owner was handed
   * "New offering" and "Import" and got 403 "You can look at this, but not
   * change it" on submit, while a BO Owner — whose row says create, and whose
   * whole job this is — was shown neither (proven both ways, Aug 30, signing
   * in as each).
   *
   * Both of the API's gates, in the API's order, so the control is on screen
   * exactly when it works. This changes nothing about who MAY write; it stops
   * the page promising something the server refuses.
   */
  const canEdit =
    !(await moduleCreateRefusal("/offerings")) && (await canManageOfferings());
  /* The heat map reads across every customer and every deal, so it follows the
     report page's own gate rather than the offering-edit one. */
  const canSeeHeatMap = canAccessModule("/reports", role);

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

  // "FULLY DETAILED" MEANS ITS SALES MATERIAL IS IN (Saras, change request 12).
  // It used to count an offering as detailed if it had a customer type OR a
  // market OR a file, so 27 of 29 read as done when nothing had been uploaded
  // at all — "these numbers can mislead the end users, since technically 0

  return (
    <div>
      {/* No "Viewing as" switcher in the header: it was a demo stand-in from
          before real logins existed, with real accounts, whoever has a role
          has that role (Anir, Jul 25). The downgrade-only preview plumbing
          stays server-side if an admin tool ever wants it. */}
      <PageHeader
        title="Offerings"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <OfferingsGlossaryBar
              offeringTypes={offeringTypes.length}
              offeringCategories={offeringCategories.length}
              customerTypes={customerTypes.length}
            />
            {/* THE HEAT MAP LIVES IN OFFERINGS NOW (Suren, Aug 25: "this is
                the kind of report that I want to see… this report should show
                up in the offerings. Against all the offerings, against all the
                opportunities, I should be able to take a view — show the dollar
                value, or all activities, or only which are in pilot, which are
                under contract, which are on delivery").

                The report itself already exists and already does every one of
                those views; what it did not have was a door here, so an
                offering owner had to know to look under Reports. Managers and
                admins only, the same as the report page. */}
            {canSeeHeatMap && (
              <Link
                href="/reports/customer-offering-heat-map"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <Grid3x3 size={13} strokeWidth={2.2} />
                Coverage heat map
              </Link>
            )}
            {canEdit && (
              <span
                aria-hidden="true"
                className="mx-1 hidden h-5 w-px bg-border-light sm:block"
              />
            )}
            {canEdit && <ImportExcel />}
            {canEdit && (
              <NewOfferingButton
                people={people}
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


      <Suspense fallback={null}>
        <OfferingsBrowser
          offerings={offerings}
          customerTypes={customerTypes}
          markets={markets}
          offeringTypes={offeringTypes}
          offeringCategories={offeringCategories}
          commerce={commerce}
          realMode={getDataMode() === "live"}
          /* So the list can mark the offerings YOU own (Anir, Aug 21: "I
             just added myself as an owner to Freya.Submit... it's not giving
             me any indication that I own this, that's a problem"). */
          meMemberId={me.memberId}
          newOfferingAction={
            canEdit ? (
              <NewOfferingButton
                people={people}
                customerTypes={customerTypes}
                markets={markets}
                existingTypes={Array.from(
                  new Set(offeringTypes.map((t) => t.name))
                )}
                offeringCategories={offeringCategories}
              />
            ) : undefined
          }
        />
      </Suspense>
    </div>
  );
}
