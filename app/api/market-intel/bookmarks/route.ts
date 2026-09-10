import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  readMarketIntelBookmarks,
  setMarketIntelBookmark,
} from "@/lib/marketIntelBookmarks";

export const dynamic = "force-dynamic";

/**
 * MY OWN COMPANY LIST, AND NOBODY ELSE'S. The scope comes from the verified
 * session, never from the body. Following a company is free (it is scraped
 * once for the whole workspace), so this needs no module write privilege:
 * anyone who can open Market Intel can keep a list of what they watch.
 */
function denied() {
  return NextResponse.json(
    { error: "Verified workspace access required." },
    { status: 403 }
  );
}

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return denied();
  try {
    const bookmarks = await readMarketIntelBookmarks(scope);
    return NextResponse.json({ companyIds: bookmarks.companyIds });
  } catch {
    return NextResponse.json(
      { error: "Your list is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return denied();
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    on?: unknown;
  } | null;
  if (!body || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Say which company." }, { status: 400 });
  }
  try {
    const bookmarks = await setMarketIntelBookmark(scope, body.id, body.on === true);
    return NextResponse.json({ ok: true, companyIds: bookmarks.companyIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your list." },
      { status: 503 }
    );
  }
}
