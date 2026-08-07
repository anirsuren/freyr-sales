import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { credentialsForEmail, issueChallenge, relyingParty } from "@/lib/passkeys";

/**
 * STEP 1 OF SIGN-IN. Public by necessity — you are not signed in yet.
 *
 * It deliberately reveals NOTHING about whether an address has a passkey: an
 * unknown email gets the same shaped response as a known one, so this cannot
 * be used to enumerate accounts. With no email at all the browser offers
 * whatever discoverable passkey it holds for this site.
 */
export async function POST(request: NextRequest) {
  const { rpID } = relyingParty(request.headers.get("host"));
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email || "").trim();
  } catch {
    // No body is fine: fall through to a discoverable-credential prompt.
  }

  const creds = email ? await credentialsForEmail(email) : [];
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({ id: c.id })),
  });

  await issueChallenge({
    challenge: options.challenge,
    kind: "login",
    email: email || undefined,
  });
  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
