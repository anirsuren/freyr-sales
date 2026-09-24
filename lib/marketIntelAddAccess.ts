import "server-only";
import { getCurrentUser } from "./currentUser";
import { viewerAccessMap } from "./viewerAccess";
import { canAccessModuleWith, canWriteModuleWith } from "./moduleAccess";

/** BD members with module access may add companies, subject to their quota. */
export async function marketIntelAddRefusal(): Promise<string | null> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith("/market-intel", user.role, access)) return "Not available on this account.";
  if (user.role === "bd_member" || canWriteModuleWith("/market-intel", user.role, access)) return null;
  return "You can look at this, but not add companies.";
}

/** BD members with Market Intel access may add or stop tracking people here. */
export async function marketIntelPeopleRefusal(): Promise<string | null> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith("/market-intel", user.role, access)) return "Not available on this account.";
  if (user.role === "bd_member" || canWriteModuleWith("/market-intel", user.role, access)) return null;
  return "You can look at tracked people, but not change them.";
}
