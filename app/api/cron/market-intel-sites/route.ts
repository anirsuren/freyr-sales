import { NextRequest, NextResponse } from "next/server";
import { runSiteUpdatesRefresh } from "@/lib/marketIntelRefresh";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE COMPANY-WEBSITE SCAN, TWICE A DAY.
 *
 * Anir, Aug 30: "until you have a good way of scanning those things every two
 * times a day, that's not considered done."
 *
 * Its own route because its own job: the pass used to sit at the back of the
 * main refresh, behind ~76 serial news calls, and never got run at all — every
 * company in the feed had `siteAt` unset. Nothing is upstream of this one.
 *
 * SAFE TO CALL OFTEN. Each company carries its own twelve-hour freshness stamp,
 * so an extra invocation costs nothing and simply reports everything as fresh.
 * Each run works the least-recently-scanned first inside a wall-clock budget
 * and writes after every company, so two runs a day cover the list between them
 * and an interrupted run keeps whatever it learned.
 *
 * AUTH: the same shape as the other cron routes — a shared secret for the
 * scheduler, or an admin session for a human pressing it.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const given =
    url.searchParams.get("key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorised = secret ? given === secret : false;

  if (!authorised && !(await canManageOfferings())) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
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
