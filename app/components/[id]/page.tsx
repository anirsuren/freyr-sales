import { notFound } from "next/navigation";
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
  return (
    <div className="px-6 py-6">
      <FdlComponentDetail component={component} homes={homes} canEdit={canEdit} />
    </div>
  );
}
