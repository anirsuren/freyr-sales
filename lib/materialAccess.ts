import "server-only";

import { getCurrentUser } from "./currentUser";
import {
  isOfferingOwner,
  listOfferings,
  type Offering,
} from "./offerings";
import {
  isSalesVisible,
  type OfferingMaterial,
} from "./offeringMaterials";
import type { KnowledgePassage } from "./knowledgeBase";

/**
 * Agent-only is a visibility boundary, not an ingestion switch. The assistant
 * reads these files, but only a recorded owner of the specific offering may
 * discover the material row or fetch its bytes.
 */
export function canViewOfferingMaterial(
  offering: Pick<Offering, "owners">,
  material: Pick<OfferingMaterial, "accessLevel">,
  memberId: string | null | undefined
): boolean {
  return isSalesVisible(material) || isOfferingOwner(offering, memberId);
}

/** Redact rows before an offering crosses a server response/client boundary. */
export function redactAgentOnlyMaterials<T extends Offering>(
  offering: T,
  memberId: string | null | undefined
): T {
  if (isOfferingOwner(offering, memberId)) return offering;
  const materials = offering.materials.filter(isSalesVisible);
  return materials.length === offering.materials.length
    ? offering
    : { ...offering, materials };
}

/** Resolve identity once for list responses, then redact each record. */
export async function redactOfferingsForCurrentUser<T extends Offering>(
  offerings: T[]
): Promise<T[]> {
  const user = await getCurrentUser();
  return offerings.map((offering) =>
    redactAgentOnlyMaterials(offering, user.memberId)
  );
}

type PrivateTrainingMaterial = {
  offeringName: string;
  href: string;
};

/**
 * AI-training files still ground the assistant, but a non-owner must not learn
 * their row title, uploaded filename, or storage metadata through a citation.
 * Build that visibility boundary from the same catalogue/ownership records as
 * the materials UI and download routes.
 */
function privateTrainingMaterialsForMember(
  memberId: string | null | undefined
): Map<string, PrivateTrainingMaterial> {
  const hidden = new Map<string, PrivateTrainingMaterial>();
  for (const offering of listOfferings()) {
    if (isOfferingOwner(offering, memberId)) continue;
    for (const material of offering.materials || []) {
      if (isSalesVisible(material)) continue;
      hidden.set(material.id, {
        offeringName: offering.offering_name,
        href: `/offerings/${offering.id}`,
      });
    }
  }
  return hidden;
}

/**
 * Keep the words inside private training uploads available to the assistant,
 * while removing the discoverable material record and replacing file
 * attribution with a generic source. This function must run BEFORE search so
 * a hidden title cannot influence a result or be reconstructed from the
 * retrieval payload.
 */
export function secureKnowledgePassagesForMember(
  passages: KnowledgePassage[],
  memberId: string | null | undefined
): KnowledgePassage[] {
  const hidden = privateTrainingMaterialsForMember(memberId);
  if (!hidden.size) return passages;

  return passages.flatMap((passage) => {
    const materialId = passage.id.split("#", 1)[0];
    const privateMaterial = hidden.get(materialId);
    if (!privateMaterial) return [passage];

    // A material passage contains catalogue metadata only (label, URL, access
    // level), so it contributes no safe content for a non-owner.
    if (passage.kind === "material") return [];

    if (passage.kind !== "file") return [passage];
    const newline = passage.text.indexOf("\n");
    const fileContents = newline >= 0 ? passage.text.slice(newline + 1) : passage.text;
    return [
      {
        ...passage,
        title: "Private AI training material",
        href: privateMaterial.href,
        text:
          `Private training material for ${privateMaterial.offeringName}:\n` +
          fileContents,
      },
    ];
  });
}
