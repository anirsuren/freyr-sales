import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import {
  consumeChallenge,
  credentialById,
  relyingParty,
  touchCredential,
  userForCredential,
} from "@/lib/passkeys";
import { establishSignedInSession } from "@/lib/signInSession";

/**
 * STEP 2 OF SIGN-IN. A verified assertion mints exactly the session a password
 * mints — same cookie, same workspace access grant — because both go through
 * establishSignedInSession.
 */
export async function POST(request: NextRequest) {
  let body: { response?: { id?: string }; challenge?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.response?.id || !body.challenge) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Single-use: consumed here whether or not the rest succeeds.
  const issued = await consumeChallenge(body.challenge, "login");
  if (!issued) {
    return NextResponse.json(
      { error: "That sign-in expired. Try again." },
      { status: 400 }
    );
  }

  const stored = await credentialById(body.response.id);
  if (!stored) {
    return NextResponse.json({ error: "Unrecognised passkey." }, { status: 401 });
  }

  const { rpID, origin } = relyingParty(request.headers.get("host"));
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: body.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
        counter: Number(stored.counter),
        transports: (stored.transports ??
          undefined) as Parameters<typeof verifyAuthenticationResponse>[0]["credential"]["transports"],
      },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "That passkey was not accepted." },
      { status: 401 }
    );
  }
  if (!verification.verified) {
    return NextResponse.json({ error: "That passkey was not accepted." }, { status: 401 });
  }

  const principal = await userForCredential(stored);
  if (!principal) {
    return NextResponse.json(
      { error: "That account is no longer active." },
      { status: 403 }
    );
  }

  // The signature counter is the replay defence: a cloned authenticator would
  // present a counter at or below the last one we saw.
  await touchCredential(stored.id, verification.authenticationInfo.newCounter);

  const result = await establishSignedInSession(request, principal);
  if ("error" in result) return result.error;
  return result.response;
}
