import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings } from "@/lib/offerings";
import { listOfferingTypes } from "@/lib/offerings";
import { readPerformance } from "@/lib/performance";
import { readActivityMaster } from "@/lib/activityMaster";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";

import { visiblePeople } from "@/lib/performanceShared";
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
  const [{ opportunities }, offerings, perf, me, master] = await Promise.all([
    readOpportunities(),
    listOfferings(),
    readPerformance(),
    getCurrentUser(),
    readActivityMaster(),
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
      // The stage vocabulary (Suren, Aug 17 call: "this opportunity, this
      // customer, and this is the activity at which this particular
      // opportunity is — that's where the activity master comes along").
      masterActivities={master.activities.map((a) => ({
        id: a.id,
        label: a.label,
        color: a.color,
      }))}
      rates={perf.rates ?? {}}
      people={visiblePeople(perf, me.name, me.role)}
      meName={me.name}
      /**
       * A REP KEEPS THEIR OWN PIPELINE (Anir, Aug 19: "yes open it"). Opening
       * the module read-only would have been half a door: a rep could watch
       * their deals and change nothing about them. The server already decides
       * this per deal — update and remove demand the owner or a manager — so
       * the button being here does not widen what anyone may actually do,
       * it just stops hiding it from the person whose deal it is.
       */
      canEdit
      live={getDataMode() === "live"}
    />
  );
}
