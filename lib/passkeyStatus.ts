import { cookies, headers } from "next/headers";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import { credentialsForUser, relyingParty } from "@/lib/passkeys";

/**
 * Does the signed-in person still need to set up Touch ID? (Anir, Aug 12: "for
 * all users that don't have Touch ID set up... it should be in the
 * notifications, 'Set up Touch ID', until they do it.")
 *
 * Answers false whenever the question doesn't apply — no real auth session, or
 * a deployment that doesn't run passkeys — so the nudge never appears to
 * someone who has no way to act on it. Any lookup failure also answers false:
 * a database hiccup must not invent a security warning.
 */
export async function currentUserNeedsPasskey(): Promise<boolean> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const session = await verifyAppSession(
      cookieStore.get(APP_SESSION_COOKIE)?.value
    );
    if (!session) return false;
    const { rpID } = relyingParty(headerStore.get("host"));
    const creds = await credentialsForUser(session.id, rpID);
    return creds.length === 0;
  } catch {
    return false;
  }
}
