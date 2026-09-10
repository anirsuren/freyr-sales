import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { lookupAllowed } from "@/lib/placeLookup";
import { LOOKUP_SESSION_RE } from "@/lib/placeLookupShared";

/**
 * Anyone signed in to the workspace may look up a company or an address: the
 * answers are public facts. A verified session is still required, so these
 * routes are not an open door onto the Google bill.
 */
export async function lookupGuard(
  request: NextRequest
): Promise<{ session: string | null } | NextResponse> {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  }
  if (!lookupAllowed(scope.userId)) {
    return NextResponse.json(
      { error: "Too many lookups in a minute. Try again shortly." },
      { status: 429 }
    );
  }
  const session = request.nextUrl.searchParams.get("session") ?? "";
  return { session: LOOKUP_SESSION_RE.test(session) ? session : null };
}

export function lookupJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
