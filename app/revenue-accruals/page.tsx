import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * REVENUE ACCRUALS LIVES UNDER OPPORTUNITIES NOW (Manoj, Sep 10: "Move entire
 * Revenue Accruals to Opportunities. Under Opportunities, we need three tabs").
 *
 * Every old link lands on the matching tab with its search, its show filter
 * and its deal carried over. The path stays in lib/release.ts, because the
 * middleware sends an unreleased path to Offerings before this redirect could
 * run.
 */
export default async function RevenueAccrualsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const next = new URLSearchParams();
  const tab = one("tab");
  next.set("tab", tab === "deviation" || tab === "deviations" ? "deviations" : "accrual");
  for (const k of ["q", "show", "deal"]) {
    const v = one(k);
    if (v) next.set(k, v);
  }
  redirect(`/opportunities?${next.toString()}`);
}
