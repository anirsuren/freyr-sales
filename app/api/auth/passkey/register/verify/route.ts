import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import { consumeChallenge, relyingParty, saveCredential } from "@/lib/passkeys";

/** STEP 2 OF ENROLMENT: check the attestation, then store the PUBLIC key. */
export async function POST(request: NextRequest) {
  const session = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value
  );
  if (!session || !session.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { response?: unknown; challenge?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.response || !body.challenge) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const issued = await consumeChallenge(body.challenge, "register");
  if (!issued || issued.authUserId !== session.id) {
    return NextResponse.json(
      { error: "That enrolment expired. Try again." },
      { status: 400 }
    );
  }

  const { rpID, origin } = relyingParty(request.headers.get("host"));
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: body.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not verify that passkey." },
      { status: 400 }
    );
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Could not verify that passkey." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  await saveCredential({
    id: credential.id,
    authUserId: session.id,
    email: session.email,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports,
    deviceLabel: (body.label || "This device").slice(0, 60),
    rpId: rpID,
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
