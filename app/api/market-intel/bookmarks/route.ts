import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  readMarketIntelBookmarks,
  readMarketIntelFollowers,
  setMarketIntelBookmark,
  setMarketIntelShowAll,
} from "@/lib/marketIntelBookmarks";
import { resumeCompanyIfStale } from "@/lib/marketIntelRefresh";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { isActiveCompany, readMarketIntelTracking } from "@/lib/marketIntelTracking";

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
    return NextResponse.json({ companyIds: bookmarks.companyIds, showAll: bookmarks.showAll });
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
    showAll?: unknown;
  } | null;
  /* THE BOX: show every company the team tracks on my page, or only mine. */
  if (body && typeof body.showAll === "boolean") {
    try {
      const bookmarks = await setMarketIntelShowAll(scope, body.showAll);
      return NextResponse.json({ ok: true, companyIds: bookmarks.companyIds, showAll: bookmarks.showAll });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not save." },
        { status: 503 }
      );
    }
  }
  if (!body || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Say which company." }, { status: 400 });
  }
  try {
    const [tracking, followers] = await Promise.all([
      readMarketIntelTracking().catch(() => null),
      readMarketIntelFollowers().catch(() => ({}) as Record<string, string[]>),
    ]);
    const company = tracking?.companies.find((c) => c.id === body.id);
    const id = body.id as string;
    /* Following a PAUSED company wakes it: it rejoins the rotation, and if
       its data is a day old it is pulled now. That costs money, so waking
       takes the module's write privilege (admin, BD); anyone may keep a list
       of companies that are already being collected. Read before the write
       so the follow being made is not what makes it look active. */
    let wake = false;
    if (body.on === true && company && !isActiveCompany(company, followers)) {
      if (await moduleWriteRefusal("/market-intel")) {
        return NextResponse.json(
          { error: `${company.name} is paused. An admin or a BD member can bring it back; ask them to track it.` },
          { status: 403 }
        );
      }
      wake = true;
    }
    /* Removing the LAST list it was on pauses it (Anir, Sep 10: "if I remove
       something and no one has it, it just stops doing it"); the answer says
       so, so the screen can too. */
    const othersHaveIt = (followers[id] ?? []).some((u) => u !== scope.userId);
    const paused = body.on !== true && !!company && !company.standing && !othersHaveIt;
    const bookmarks = await setMarketIntelBookmark(scope, id, body.on === true);
    if (wake) after(() => resumeCompanyIfStale(id));
    return NextResponse.json({ ok: true, companyIds: bookmarks.companyIds, resumed: wake, paused });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your list." },
      { status: 503 }
    );
  }
}
