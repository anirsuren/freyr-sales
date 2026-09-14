import { NextRequest, NextResponse } from "next/server";
import { runSiteUpdatesRefresh } from "@/lib/marketIntelRefresh";
import { canManageOfferings } from "@/lib/role";
import { marketIntelAutomaticCollectionEnabled } from "@/lib/marketIntelAutomation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily website batch. Safe to call repeatedly: a source collected within
 * the preceding 24 hours is skipped. Saves after each company. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const given =
    url.searchParams.get("key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorised = secret ? given === secret : false;

  const admin = await canManageOfferings();
  if (!authorised && !admin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  // A CRON_SECRET may be shared between environments. It cannot override the
  // dev kill switch. An authenticated admin can still run this manually.
  if (!marketIntelAutomaticCollectionEnabled() && !admin) {
    return NextResponse.json({
      ran: false,
      reason: "Automatic Market Intel collection is disabled in this environment.",
    });
  }

  const summary = await runSiteUpdatesRefresh({
    force: url.searchParams.get("force") === "1",
    ...(url.searchParams.get("only")
      ? { onlyCompanyIds: url.searchParams.get("only")!.split(",") }
      : {}),
    ...(url.searchParams.get("budget")
      ? { budgetMs: Number(url.searchParams.get("budget")) * 1000 }
      : {}),
  });
  return NextResponse.json(summary);
}
