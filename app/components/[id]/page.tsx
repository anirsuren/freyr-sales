import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  getFdlComponent,
  initializeLiveOfferings,
  listOfferings,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { FdlComponentDetail } from "@/components/fdl/FdlComponentDetail";

export const dynamic = "force-dynamic";

export default async function FdlComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await initializeLiveOfferings().catch(() => undefined);
  const { id } = await params;
  const component = getFdlComponent(id);
  if (!component) notFound();
  const homes = listOfferings()
    .filter((offering) => offering.component_ids?.includes(id))
    .map((offering) => ({ id: offering.id, name: offering.offering_name }));
  const canEdit = await canManageOfferings();

  // WHO RUNS THIS COMPONENT, AND ON WHICH VERSION (Suren, Aug 8: "if I go to
  // the component and click on this version, I want to see all the customers
  // in version 1… it's the same record, but I want to see it here").
  const all = await getDb().customers.list();
  const customers = all.map((customer) => {
    const link = (customer.digital_components || []).find(
      (item) => item.component_id === id
    );
    return {
      id: customer.id,
      name: customer.company_name,
      releaseId: link?.release_id ?? null,
      nextReleaseId: link?.next_release_id ?? null,
      connected: !!link,
    };
  });

  return (
    <div className="px-6 py-6">
      <FdlComponentDetail
        component={component}
        homes={homes}
        canEdit={canEdit}
        customers={customers}
      />
    </div>
  );
}
