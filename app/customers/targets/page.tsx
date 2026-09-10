import { redirect } from "next/navigation";
import { getDataMode } from "@/lib/dataMode";
import { CustomersScreen } from "../customersScreen";

export const metadata = { title: "Targets · Customers" };
export const dynamic = "force-dynamic";

/** Same static-beats-dynamic note as ../groups/page.tsx. */
export default async function CustomerTargetsPage() {
  /* Off the Customers page in real mode (Manoj, Sep 10); an old link lands on
     the accounts instead of a tab that is no longer drawn. */
  if (getDataMode() === "live") redirect("/customers");
  return <CustomersScreen tab="targets" />;
}
