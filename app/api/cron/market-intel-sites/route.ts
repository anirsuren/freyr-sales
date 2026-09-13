import { NextRequest, NextResponse } from "next/server";
import { runSiteUpdatesRefresh } from "@/lib/marketIntelRefresh";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Shared daily website batch. Safe to call repeatedly: companies already
 * collected in the 06:00 UTC cycle are skipped. Saves after each company. */
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
