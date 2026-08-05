import { notFound } from "next/navigation";
import { StandaloneMaterialViewer } from "@/components/offerings/StandaloneMaterialViewer";
import { getCurrentUser } from "@/lib/currentUser";
import { redactAgentOnlyMaterials } from "@/lib/materialAccess";
import { getOffering } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; materialId: string }>;
}) {
  const { id, materialId } = await params;
  const offering = getOffering(id);
  const material = offering?.materials.find((item) => item.id === materialId);
  return {
    title: material
      ? `${material.label} · ${offering!.offering_name}`
      : "Sales material",
  };
}

export default async function MaterialPage({
  params,
}: {
  params: Promise<{ id: string; materialId: string }>;
}) {
  const { id, materialId } = await params;
  const offering = getOffering(id);
  if (!offering) notFound();

  const currentUser = await getCurrentUser();
  const visibleOffering = redactAgentOnlyMaterials(offering, currentUser.memberId);
  const material = visibleOffering.materials.find(
    (item) => item.id === materialId && item.docsPath
  );
  if (!material) notFound();

  return (
    <StandaloneMaterialViewer
      offeringId={visibleOffering.id}
      offeringName={visibleOffering.offering_name}
      material={material}
    />
  );
}
