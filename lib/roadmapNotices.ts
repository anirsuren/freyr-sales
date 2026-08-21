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
import { listOfferings, listFdlComponents } from "./offerings";
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
  /**
   * COMPONENTS ARE WHERE ROADMAPS ACTUALLY MOVE (found Aug 20: the
   * offering-level roadmap has had no editor since the tab was replaced, so a
   * bell that only watched offerings would have stayed silent forever while
   * people edited component versions all day).
   *
   * No access gate here, deliberately: nothing redacts a component's planned
   * releases today — the component page shows them to everyone who can open
   * it — so the notification says exactly what the page already says. If that
   * ever gets gated, this must follow it the same day.
   */
  for (const component of listFdlComponents()) {
    const versions = component.roadmap_versions ?? [];
    if (!versions.length) continue;
    out.push({
      offeringId: component.id,
      offeringName: component.name,
      href: `/components/${component.id}`,
      versions: versions.map((v) => ({
        version: v.version,
        savedAt: v.savedAt,
        savedBy: v.savedBy,
        /* The stated reason rides along with the lines it explains — a bell
           row that says a date moved and not why sends the reader to the page
           to find out, which is the trip the reason exists to save. */
        changes: v.reason ? [...v.changes, `Why: ${v.reason}`] : v.changes,
      })),
    });
  }
  return out;
}
