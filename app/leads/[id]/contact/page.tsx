import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { LeadContactRedirect } from "@/components/leads/LeadContactRedirect";

export const dynamic = "force-dynamic";

export default async function LeadContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("/leads");
  await requireServerMemberScope();
  return <LeadContactRedirect leadId={(await params).id} />;
}
