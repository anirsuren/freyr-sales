/**
 * WHAT THE BELL IS ALLOWED TO SAY ABOUT A ROADMAP CHANGE.
 *
 * Everyone hears that a roadmap moved — that is the whole point of the request
 * ("people should get notified if there are any changes to the roadmap"). What
 * they hear DEPENDS on what they may see: the unreleased next version is
 * restricted (Sudhir: "anything beyond the current release in the hands of
 * sales is not good"), and a notification is exactly the kind of side door
 * that leaks it. So a reader without that access gets the fact and not the
 * particulars.
 */
import { listOfferings } from "./offerings";
import { canViewNextCustomerVersion } from "./roadmapAccess";
import type { RoadmapChangeInput } from "./notifications";

export async function roadmapChangesForReader(): Promise<RoadmapChangeInput[]> {
  const out: RoadmapChangeInput[] = [];
  for (const offering of listOfferings()) {
    const versions = offering.roadmap_versions ?? [];
    if (!versions.length) continue;
    const maySeeNext = await canViewNextCustomerVersion(offering);
    out.push({
      offeringId: offering.id,
      offeringName: offering.offering_name,
      versions: versions.map((v) => ({
        version: v.version,
        savedAt: v.savedAt,
        savedBy: v.savedBy,
        /* The lines name versions by their customer-facing label, and an
           unreleased one is exactly what a rep may not know about yet. Without
           access the change is announced without its particulars rather than
           filtered line by line — a filter that keeps "V4 moved to June" while
           dropping its sibling would still have said V4 exists. */
        changes: maySeeNext ? v.changes : ["The roadmap was updated"],
      })),
    });
  }
  return out;
}
