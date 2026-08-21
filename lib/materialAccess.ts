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
 * reads these files, but only a recorded owner of the specific offering — or
 * an admin of the app — may discover the material row or fetch its bytes.
 *
 * ADMINS WERE LOCKED OUT OF THEIR OWN APP (Saras, Aug 21: "currently, in the
 * sales materials being uploaded by offering owners, when they upload a file
 * only for AI training, even admins aren't able to see it. Let's change that
 * and make it visible to admins also"). The boundary was written as
 * owner-only, which is right for reps and wrong for the people accountable
 * for what the assistant is being trained on.
 *
 * The rule she stated, exactly: "only admins and the offering owner
 * themselves who uploaded it. If Eeswar uploads something within the Success
 * Stories folder, only Eeswar should be able to see it, and all admins of the
 * app should be able to see it. Nobody else." So: owner of THIS offering, or
 * admin. Not other owners, not managers, not reps.
 */
export function canViewOfferingMaterial(
  offering: Pick<Offering, "owners">,
  material: Pick<OfferingMaterial, "accessLevel">,
  memberId: string | null | undefined,
  isAppAdmin = false
): boolean {
  return (
    isSalesVisible(material) || isAppAdmin || isOfferingOwner(offering, memberId)
  );
}

/** Redact rows before an offering crosses a server response/client boundary. */
export function redactAgentOnlyMaterials<T extends Offering>(
  offering: T,
  memberId: string | null | undefined,
  /** App admins see every training file, by Saras's rule of Aug 21. */
  isAppAdmin = false
): T {
  if (isAppAdmin || isOfferingOwner(offering, memberId)) return offering;
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
  const admin = user.role === "admin";
  return offerings.map((offering) =>
    redactAgentOnlyMaterials(offering, user.memberId, admin)
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
        // The facts remain usable, but filenames/member paths and upload
        // timing are discoverable metadata. Remove them before retrieval, not
        // merely before rendering, so the model can never reconstruct them.
        archiveFilename: undefined,
        archiveMember: undefined,
        uploadedAt: undefined,
        ...(passage.sourceDateKind === "upload"
          ? { sourceDate: undefined, sourceDateKind: undefined }
          : {}),
        text:
          `Private training material for ${privateMaterial.offeringName}:\n` +
          fileContents,
      },
    ];
  });
}
