import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  readMarketIntelBookmarks,
  readMarketIntelFollowers,
  setMarketIntelBookmark,
  setMarketIntelBookmarks,
  setMarketIntelStar,
} from "@/lib/marketIntelBookmarks";
import { resumeCompanyIfStale } from "@/lib/marketIntelRefresh";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";

export const dynamic = "force-dynamic";

/**
 * MY OWN LIST, AND NOBODY ELSE'S. The scope comes from the verified session,
 * never from the body.
 *
 * Ticking a company is how a person builds their Market Intel page (Anir,
 * Sep 10), so anyone who can open the module may tick, untick and star. It is
 * also what keeps a company collected: the first tick on a company nobody had
 * starts it again, and taking off the last tick stops it. Adding a company
 * that is NOT in the catalogue yet is a different thing, costs a scrape, and
 * still goes through the tracking route with its own privilege and limit.
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
    return NextResponse.json({
      companyIds: bookmarks.companyIds,
      starredIds: bookmarks.starredIds,
    });
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
    star?: unknown;
    ids?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Say which company." }, { status: 400 });

  const batch = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && !!v.trim())
    : null;
  const single = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  if (!batch?.length && !single) {
    return NextResponse.json({ error: "Say which company." }, { status: 400 });
  }

  try {
    const [tracking, followers] = await Promise.all([
      /* Fresh, not the minute-old copy: a company added a moment ago (on this
         server or another) must count as known, or its first tick would not
         start it collecting. One small row read per click. */
      readMarketIntelTracking({ fresh: true }).catch(() => null),
      readMarketIntelFollowers().catch(() => ({}) as Record<string, string[]>),
    ]);
    const known = new Set((tracking?.companies ?? []).map((c) => c.id));
    /* Read who has what BEFORE the write, so the tick being made is not what
       makes the company look active. */
    const hadNobody = (id: string) => (followers[id] ?? []).length === 0;
    const othersHaveIt = (id: string) => (followers[id] ?? []).some((u) => u !== scope.userId);

    if (batch?.length) {
      const ids = batch.filter((id) => known.has(id));
      const on = body.on !== false;
      const waking = on ? ids.filter(hadNobody) : [];
      const bookmarks = await setMarketIntelBookmarks(scope, ids, on);
      /* Whatever nobody had is pulled now if its data has gone stale. */
      for (const id of waking) after(() => resumeCompanyIfStale(id));
      return NextResponse.json({
        ok: true,
        companyIds: bookmarks.companyIds,
        starredIds: bookmarks.starredIds,
        resumed: waking.length,
      });
    }

    const id = single as string;
    /* A STAR IS NOT THE LIST, but starring puts it on the list too, because a
       favourite you cannot see would be pointless. */
    if (typeof body.star === "boolean") {
      const wake = body.star && hadNobody(id) && known.has(id);
      const bookmarks = await setMarketIntelStar(scope, id, body.star);
      if (wake) after(() => resumeCompanyIfStale(id));
      return NextResponse.json({
        ok: true,
        companyIds: bookmarks.companyIds,
        starredIds: bookmarks.starredIds,
        resumed: wake,
      });
    }

    const on = body.on === true;
    const wake = on && hadNobody(id) && known.has(id);
    /* Taking off the LAST tick stops the collection (Anir, Sep 10: "if I
       remove something and no one has it, it just stops doing it"); the
       answer says so, so the screen can too. */
    const stopped = !on && known.has(id) && !othersHaveIt(id);
    const bookmarks = await setMarketIntelBookmark(scope, id, on);
    if (wake) after(() => resumeCompanyIfStale(id));
    return NextResponse.json({
      ok: true,
      companyIds: bookmarks.companyIds,
      starredIds: bookmarks.starredIds,
      resumed: wake,
      stopped,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your list." },
      { status: 503 }
    );
  }
}
