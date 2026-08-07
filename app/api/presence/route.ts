import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessGrant } from "@/lib/accessControl";
import { touchMemberPresence } from "@/lib/accessStore";

/**
 * "I am still here." Posted by every open tab about once a minute (see
 * PresenceHeartbeat) so the Member directory and the Team page can say who is
 * actually online rather than printing "Active" on all eight rows.
 *
 * Writes nothing but a timestamp, and only ever for the caller's own account —
 * the member id comes from the signed access grant, never from the request
 * body, so no tab can mark anyone else present.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const grant = await verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value);
  if (!grant) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await touchMemberPresence(grant.workspaceId, grant.userId);
  } catch {
    // A dropped heartbeat is not worth an error in anyone's console; the dot
    // simply ages into Away until the next one lands.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
