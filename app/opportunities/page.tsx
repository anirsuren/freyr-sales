import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings } from "@/lib/offerings";
import { listOfferingTypes } from "@/lib/offerings";
import { readPerformance } from "@/lib/performance";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import { OpportunitiesBrowser } from "@/components/opportunities/OpportunitiesBrowser";

export const metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

/**
 * OPPORTUNITIES — the pipeline as records, not a spreadsheet.
 *
 * Suren, Aug 16: "we need to have a module called opportunity... and then you
 * should take some of these columns and put it. Remember we had an offering
 * and then activity to offering — now all I want to do is that offering,
 * opportunity and then activity, you need to connect all three."
 */
export default async function OpportunitiesPage() {
  await requireModuleAccess("/opportunities");
  const [{ opportunities }, offerings, perf, me] = await Promise.all([
    readOpportunities(),
    listOfferings(),
    readPerformance(),
    getCurrentUser(),
  ]);
  const db = getDb();
  const customers = await db.customers.list();

  return (
    <OpportunitiesBrowser
      opportunities={opportunities}
      // The type rides along so an offering wears the SAME colour here as on
      // its own card (Anir, Aug 16: "the offering has to have the color, the
      // icon, etc., to make sure it's completely accurate").
      offerings={offerings.map((o) => ({
        id: o.id,
        name: o.offering_name,
        type: o.offering_type,
      }))}
      offeringTypes={listOfferingTypes().map((t) => ({ name: t.name }))}
      customers={customers.map((c) => ({ id: c.id, name: c.company_name }))}
      goals={perf.goals.map((g) => ({
        id: g.id,
        name: g.name,
        year: g.year,
        type: g.type,
      }))}
      meName={me.name}
      canEdit={isManagerOrAdmin(me.role)}
      live={getDataMode() === "live"}
    />
  );
}
