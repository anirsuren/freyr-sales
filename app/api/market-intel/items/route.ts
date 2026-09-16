import { getDataMode } from "@/lib/dataMode";
import { hideMockIntelStories } from "@/lib/marketIntelTracking";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { removeFeedStoryItems } from "@/lib/marketIntelFeed";

export const dynamic = "force-dynamic";

/** Admin moderation for a bad story. URLs are tombstoned by the feed writer,
 * so the next LinkedIn, news or website refresh cannot restore them. */
export async function DELETE(req: NextRequest) {
  if (!(await verifiedRequestMemberScope(req))) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const refusal = await moduleWriteRefusal("/market-intel");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only an admin can remove intelligence stories." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const companyId = String(body.companyId ?? "").trim();
  const items = Array.isArray(body.items)
    ? body.items.map((item: unknown) => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          url: String(value.url ?? ""),
          ...(value.personId ? { personId: String(value.personId) } : {}),
        };
      })
    : [];
  if (!companyId || items.length === 0) {
    return NextResponse.json({ error: "Choose a story to remove." }, { status: 400 });
  }
  try {
    const removed = getDataMode() === "mock" ? await hideMockIntelStories(companyId, items.map((i: {url:string})=>i.url)) : await removeFeedStoryItems(companyId, items);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the story." },
      { status: 500 }
    );
  }
}
