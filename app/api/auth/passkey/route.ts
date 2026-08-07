import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appSession";
import { credentialsForUser, deleteCredential, relyingParty } from "@/lib/passkeys";

/** The passkeys on your own account: list them, remove one. */
export async function GET(request: NextRequest) {
  const session = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value
  );
  if (!session) return NextResponse.json({ passkeys: [] }, { status: 401 });
  const { rpID } = relyingParty(request.headers.get("host"));
  const creds = await credentialsForUser(session.id, rpID);
  return NextResponse.json(
    {
      passkeys: creds.map((c) => ({
        id: c.id,
        label: c.device_label,
        createdAt: c.created_at,
        lastUsedAt: c.last_used_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: NextRequest) {
  const session = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value
  );
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which passkey?" }, { status: 400 });
  // Scoped to the signed-in user, so nobody can delete somebody else's key.
  await deleteCredential(id, session.id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
