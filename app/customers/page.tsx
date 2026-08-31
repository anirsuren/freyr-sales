import { CustomersScreen } from "./customersScreen";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

/**
 * ACCOUNTS IS /customers ITSELF, not /customers/customers — and it is where a
 * bare visit lands (Anir, Aug 30: "when I go to customers make sure I land up
 * on the customers page not targets").
 */
export default async function CustomersPage() {
  return <CustomersScreen tab="customers" />;
}
