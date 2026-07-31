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
  if (role === "admin" || role === "editor") return true;
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
export function hideNextCustomerVersions<T extends Pick<Offering, "releases">>(
  offering: T
): T {
  return {
    ...offering,
    releases: (offering.releases || []).filter(
      (release) => release.status === "released"
    ),
  };
}
