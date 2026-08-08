"use client";

import { useRouter } from "next/navigation";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import type { OfferingMaterial } from "@/lib/offeringMaterials";

export function StandaloneMaterialViewer({
  offeringId,
  offeringName,
  material,
  embed = false,
}: {
  offeringId: string;
  offeringName: string;
  material: OfferingMaterial;
  /** Bare-document mode for the hover peek — see MaterialViewer. */
  embed?: boolean;
}) {
  const router = useRouter();
  const backUrl = `/offerings/${offeringId}?tab=materials&mv=files`;

  return (
    <MaterialViewer
      standalone
      embed={embed}
      offeringId={offeringId}
      offeringName={offeringName}
      material={material}
      path={material.docsPath!}
      label={material.label}
      downloadUrl={material.url}
      openInNewTabUrl={`/offerings/${offeringId}/materials/${encodeURIComponent(material.id)}`}
      onClose={() => router.push(backUrl)}
    />
  );
}
