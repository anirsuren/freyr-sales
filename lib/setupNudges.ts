import "server-only";

import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessGrant } from "@/lib/accessControl";
import { getCurrentUser } from "@/lib/currentUser";
import { getOnboardingState } from "@/lib/onboardingStore";
import { readWorkspaceMemberProfiles } from "@/lib/memberProfile";
import { currentUserNeedsPasskey } from "@/lib/passkeyStatus";

/**
 * THE THREE THINGS THAT ARE STILL MISSING FROM YOUR OWN ACCOUNT.
 *
 * Read from cookies rather than a NextRequest so the SAME answer serves the
 * bell panel (a route handler) and the notifications page (a server
 * component). They used to be computed in two places and they disagreed: the
 * panel showed the setup nudges, the page ran a different code path that never
 * asked about them, so "View all notifications" landed on a page that did not
 * contain the two rows you had just been looking at (Anir, Aug 13: "pressing
 * 'View all notifications' doesn't even work"). One function now, both callers.
 *
 * Every check answers false when the question does not apply or a lookup
 * fails. A database hiccup must never invent a to-do.
 */
export type SetupNudges = {
  needsTour: boolean;
  needsPasskey: boolean;
  needsTitle: boolean;
};

export const NO_SETUP_NUDGES: SetupNudges = {
  needsTour: false,
  needsPasskey: false,
  needsTitle: false,
};

async function needsTour(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user.memberId) return false;
    const cookieStore = await cookies();
    const grant = await verifyAccessGrant(
      cookieStore.get(ACCESS_COOKIE)?.value
    );
    if (!grant || grant.userId !== user.memberId) return false;
    const { state } = await getOnboardingState({
      subject: grant.sub,
      workspaceId: grant.workspaceId,
      userId: grant.userId,
      role: grant.role,
    });
    // Skipped or abandoned still counts as not taken: the point is whether the
    // app has been explained, not whether the dialog was dismissed.
    return state.status !== "completed";
  } catch {
    return false;
  }
}

/**
 * Has this person filled in their job title? Everywhere the team roster, a rep
 * profile or the settings header shows them, a blank title renders as the
 * placeholder "Title not set", which is a worse thing to show a colleague than
 * a one-line nudge to fix it (Anir, Aug 13: "their notification should be a
 * third notification for putting their title instead of saying 'title not
 * set'").
 */
async function needsTitle(): Promise<boolean> {
  try {
    const workspace = process.env.FREYR_WORKSPACE_ID;
    if (!workspace) return false;
    const user = await getCurrentUser();
    if (!user.memberId) return false;
    const profiles = await readWorkspaceMemberProfiles(workspace);
    return !profiles.get(user.memberId)?.title?.trim();
  } catch {
    return false;
  }
}

export async function currentUserSetupNudges(): Promise<SetupNudges> {
  const [tour, passkey, title] = await Promise.all([
    needsTour(),
    currentUserNeedsPasskey(),
    needsTitle(),
  ]);
  return { needsTour: tour, needsPasskey: passkey, needsTitle: title };
}
