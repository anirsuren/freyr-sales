import { CustomersScreen } from "../customersScreen";

export const metadata = { title: "Customer groups · Customers" };
export const dynamic = "force-dynamic";

/**
 * A STATIC SEGMENT BESIDE /customers/[id] ON PURPOSE. Next resolves a static
 * segment before a dynamic sibling, so this wins over the customer-detail
 * route; customer ids are uuids, so "groups" can never be a real record.
 */
export default async function CustomerGroupsPage() {
  return <CustomersScreen tab="groups" />;
}
