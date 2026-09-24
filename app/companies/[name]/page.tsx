import { redirect } from "next/navigation";
import { requireServerMemberScope } from "@/lib/memberScope";
import { CompanyAccountRedirect } from "@/components/customers/CompanyAccountRedirect";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ name: string }> }) {
  await requireServerMemberScope();
  const name = (await params).name.trim();
  if (!name) redirect("/customers");
  return <CompanyAccountRedirect name={name} />;
}
