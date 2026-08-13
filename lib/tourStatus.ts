import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  verifyAccessGrant,
} from "@/lib/accessControl";
import { getOnboardingState } from "@/lib/onboardingStore";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";

/**
 * Has the signed-in person still not taken the guided walkthrough? (Anir,
 * Aug 13: "if anyone has not taken the tour, it has to show up in
 * notifications".)
 *
 * "Taken" means finished. Someone who skipped it, or who is halfway through and
 * closed the tab, still has not seen the app explained — so the nudge stays
 * until they reach the end, and then removes itself.
 *
 * Answers false whenever the question does not apply — no session, no workspace
 * grant, store unavailable — for the same reason as the Touch ID check next
 * door: a database hiccup must never invent a to-do.
 */
export async function currentUserNeedsTour(
  request: NextRequest
): Promise<boolean> {
  try {
    const principal = await authenticatedRequestPrincipal(request);
    if (!principal) return false;
    const grant = await verifyAccessGrant(
      request.cookies.get(ACCESS_COOKIE)?.value
    );
    if (!grant || grant.sub !== principal.id) return false;
    const { state } = await getOnboardingState({
      subject: principal.id,
      workspaceId: grant.workspaceId,
      userId: grant.userId,
      role: grant.role,
    });
    return state.status !== "completed";
  } catch {
    return false;
  }
}
