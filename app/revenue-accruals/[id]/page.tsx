import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * THIS ROUTE IS A DOOR THAT NO LONGER LEADS ANYWHERE OF ITS OWN.
 *
 * It used to render AccrualPlanPage: one deal's accrual plan as a full page,
 * a second editor over the same data as the module's dialog.
 *
 * Suren, Sep 1, with that page and the dialog open beside each other: "I don't
 * want a different screen. It has to be consistent... this screen is
 * confusing, this screen is better" — pointing at the dialog. And on the deal
 * page: "that opportunity is going to have only one revenue approval... Create
 * revenue accrual, we should do it at this level only. It's NOT a revenue
 * accrual tab... I think the same screen from there, both the screens have to
 * be the same. It's just that same screen shows up here."
 *
 * So there is exactly one accrual screen now — components/accruals/
 * AccrualPlanDialog — and it is mounted in the two places a plan is written:
 * the Revenue accruals module, and the Revenue accruals tab on the deal's own
 * page, where it opens IN PLACE. Nobody planning revenue for a deal has to
 * leave that deal any more.
 *
 * Nothing in the app links here. This stays as a redirect rather than a 404
 * because bookmarks and old links exist, and the module is where the plans
 * are. components/accruals/AccrualPlanPage.tsx is left on disk, unrouted, so
 * the decision is one import away from being reversed.
 */
export default async function AccrualPlanRoute() {
  redirect("/revenue-accruals");
}
