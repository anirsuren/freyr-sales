import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** An old per-deal accrual link opens that deal's plan on the Est. Accrual
 *  Revenue tab, which is where Revenue Accruals lives since Sep 10. */
export default async function AccrualPlanRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/opportunities?tab=accrual&deal=${encodeURIComponent(id)}`);
}
