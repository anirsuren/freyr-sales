import { notFound, redirect } from "next/navigation";
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
  searchParams,
}: {
  params: Promise<{ id: string; materialId: string }>;
  searchParams: Promise<{ embed?: string; member?: string }>;
}) {
  const { id, materialId } = await params;
  const { embed, member } = await searchParams;
  const offering = getOffering(id);
  /* Miss -> the list / the parent, never a dead end (Anir, Sep 4). */
  if (!offering) redirect("/offerings");

  const currentUser = await getCurrentUser();
  const visibleOffering = redactAgentOnlyMaterials(
    offering,
    currentUser.memberId,
    currentUser.role === "admin"
  );
  const material = visibleOffering.materials.find(
    (item) => item.id === materialId && item.docsPath
  );
  if (!material) redirect(`/offerings/${offering.id}`);

  return (
    <StandaloneMaterialViewer
      offeringId={visibleOffering.id}
      offeringName={visibleOffering.offering_name}
      material={material}
      embed={embed === "1"}
      initialMember={typeof member === "string" && member ? member : null}
    />
  );
}
