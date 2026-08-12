import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./currentUser";
import { canAccessModule } from "./moduleAccess";

/**
 * THE DOOR, not the curtain. The sidebar hides manager-only modules from a
 * Sales Rep; this sends them home if they type the URL anyway (Freyr,
 * Aug 12). Every restricted page calls it before it reads any data.
 */
export async function requireModuleAccess(path: string): Promise<void> {
  const user = await getCurrentUser();
  if (!canAccessModule(path, user.role)) redirect("/offerings");
}
