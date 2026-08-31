import { CustomersScreen } from "../customersScreen";

export const metadata = { title: "Targets · Customers" };
export const dynamic = "force-dynamic";

/** Same static-beats-dynamic note as ../groups/page.tsx. */
export default async function CustomerTargetsPage() {
  return <CustomersScreen tab="targets" />;
}
