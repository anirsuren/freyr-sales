import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import {
  RP_NAME,
  credentialsForUser,
  issueChallenge,
  relyingParty,
} from "@/lib/passkeys";

/**
 * STEP 1 OF ENROLMENT. You must already be signed in: a passkey is an extra
 * key to your own account, never a way to claim one.
 */
export async function POST(request: NextRequest) {
  const session = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value
  );
  if (!session || !session.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const { rpID } = relyingParty(request.headers.get("host"));
  const existing = await credentialsForUser(session.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: session.email,
    userDisplayName: session.name || session.email,
    attestationType: "none",
    // Already-enrolled keys are excluded so the browser says "you have one"
    // instead of silently making a duplicate.
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      // Touch ID / Face ID / Windows Hello — the platform authenticator.
      authenticatorAttachment: "platform",
    },
  });

  await issueChallenge({
    challenge: options.challenge,
    kind: "register",
    authUserId: session.id,
    email: session.email,
  });
  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
