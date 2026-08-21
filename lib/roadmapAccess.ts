import "server-only";

import { getCurrentUser } from "./currentUser";
import { getRole } from "./role";
import { isOfferingOwner, type Offering } from "./offerings";

/**
 * Who may see an offering's unreleased customer roadmap.
 *
 * The approved rule is: managers/admins, Offering Owners, and any explicitly
 * named exception configured by verified email. Ordinary sales reps only see
 * shipped versions. Email exceptions stay in deployment configuration rather
 * than mutable display names; `ROADMAP_NEXT_VIEWER_EMAILS` is a comma-separated
 * list for the fixed people Freyr approves outside the two privileged roles.
 */
export async function canViewNextCustomerVersion(
  offering: Pick<Offering, "owners">
): Promise<boolean> {
  const [role, user] = await Promise.all([getRole(), getCurrentUser()]);
  if (role === "admin" || role === "manager") return true;
  if (isOfferingOwner(offering, user.memberId)) return true;

  const approvedEmails = new Set(
    (process.env.ROADMAP_NEXT_VIEWER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
  return Boolean(user.email && approvedEmails.has(user.email.toLowerCase()));
}

/** Remove unreleased versions before an offering leaves a server boundary. */
export function hideNextCustomerVersions<
  T extends Pick<Offering, "releases" | "roadmap_details" | "roadmap_versions">
>(
  offering: T
): T {
  const stripNext = <D extends Offering["roadmap_details"]>(d: D): D =>
    d ? ({ ...d, nextExpectedLive: "", nextVersions: "", nextModules: [] } as D) : d;
  return {
    ...offering,
    releases: (offering.releases || []).filter(
      (release) => release.status === "released"
    ),
    roadmap_details: stripNext(offering.roadmap_details),
    /**
     * THE HISTORY IS A SIDE DOOR INTO THE SAME SECRET (found testing, Aug 20:
     * a rep's payload correctly hid the unreleased release from `releases` and
     * then handed them "Added V9-SECRET (2028-01-01)" plus the unannounced
     * feature text inside a stored version).
     *
     * Each version carries a whole snapshot of the roadmap as it stood, so it
     * needs exactly the redaction the live roadmap gets. The change lines go
     * too: they name versions by their customer-facing label, and no reliable
     * rule separates "V2.5 moved to June" from "Added V9". Same wording the
     * bell uses for the same reader, so the two never disagree.
     */
    roadmap_versions: offering.roadmap_versions?.map((v) => ({
      ...v,
      changes: ["The roadmap was updated"],
      releases: (v.releases || []).filter((r) => r.status === "released"),
      roadmap_details: stripNext(v.roadmap_details),
    })),
  };
}
