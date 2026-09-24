import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { readMarketIntelBookmarks } from "@/lib/marketIntelBookmarks";
import { readFeedPeople } from "@/lib/marketIntelRead";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";

export const dynamic = "force-dynamic";

/** Load one followed person's posts only when their preview is opened. */
export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canOpenModule("/market-intel"))) {
    return NextResponse.json({ error: "Market Intel is not available on this account." }, { status: 403 });
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  const personId = request.nextUrl.searchParams.get("personId")?.trim() ?? "";
  if (!companyId || !personId) {
    return NextResponse.json({ error: "Choose a tracked person." }, { status: 400 });
  }

  try {
    const [tracking, bookmarks] = await Promise.all([
      readMarketIntelTracking(),
      readMarketIntelBookmarks(scope),
    ]);
    const person = tracking.people.find((item) => item.id === personId && item.companyId === companyId);
    const isOnMyPage = bookmarks.companyIds.includes(companyId);
    const isFollowed = !bookmarks.personIds || bookmarks.personIds.includes(personId);
    if (!person || !isOnMyPage || !isFollowed) {
      return NextResponse.json({ error: "This person is not on your tracked list." }, { status: 404 });
    }

    const feed = (await readFeedPeople([personId]))[personId];
    const cutoff = Date.now() - 90 * 86_400_000;
    const collected = (feed?.posts ?? [])
      .filter((post) => !post.date || !Number.isFinite(Date.parse(post.date)) || Date.parse(post.date) > cutoff)
      .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
    const seen = new Set<string>();
    const posts = collected
      .filter((post) => {
        let key = `${post.date ?? ""}:${post.text.trim()}`;
        try {
          const url = new URL(post.url);
          key = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
        } catch { /* Text and date still identify an unlinked post. */ }
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ url, text, date, reactions, comments, reposts }) => ({ url, text, date, reactions, comments, reposts }));
    return NextResponse.json({ posts, collectedCount: collected.length, pending: !feed }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load this person's posts." }, { status: 503 });
  }
}
