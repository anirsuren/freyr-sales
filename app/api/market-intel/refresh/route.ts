import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runMarketIntelRefresh } from "@/lib/marketIntelRefresh";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * Ops hatch for the self-refreshing feed: admins can force a run or refresh a
 * specific company without waiting for the staleness window. Normal operation
 * never needs this — visits schedule refreshes on their own.
 */
export async function POST(req: NextRequest) {
  if (!(await canManageOfferings())) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const options = {
    force: body?.force === true,
    onlyCompanyIds: Array.isArray(body?.only)
      ? body.only.map(String)
      : undefined,
  };
  // `wait: true` runs inline and returns the summary — only sensible for a
  // short `only` list; a full run takes longer than a request should live.
  if (body?.wait === true) {
    const summary = await runMarketIntelRefresh(options);
    return NextResponse.json(summary);
  }
  after(() =>
    runMarketIntelRefresh(options).catch((error) =>
      console.error("[market-intel] forced refresh failed:", error)
    )
  );
  return NextResponse.json({ started: true });
}
