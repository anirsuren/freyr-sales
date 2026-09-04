import { NextRequest, NextResponse } from "next/server";
import { accessHistoryFor, readAccessHistory } from "@/lib/accessHistory";
import { getCurrentUser } from "@/lib/currentUser";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

/**
 * WHO CHANGED SOMEBODY'S ACCESS, AND WHEN (Anir, Sep 4: "I want to see all
 * their past history... who assigned what role to them").
 *
 * ADMINS ONLY. The trail names who granted what to whom — reading it is
 * reading the shape of the whole permission system, which is the same
 * information the Admin page itself is gated on.
 */
export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    return NextResponse.json(
      { error: "Only an admin can read the access history." },
      { status: 403 }
    );
  }
  const subject = request.nextUrl.searchParams.get("subject");
  const events = subject
    ? await accessHistoryFor(subject)
    : (await readAccessHistory()).events;
  return NextResponse.json({ events });
}
