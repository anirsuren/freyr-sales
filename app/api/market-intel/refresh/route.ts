import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  checkMarketIntelConnections,
  refreshThoughtLeadershipNow,
  runMarketIntelLabeling,
  runMissingRundowns,
  runMarketIntelRefresh,
} from "@/lib/marketIntelRefresh";
import { migrateLegacyFeedRow } from "@/lib/marketIntelFeed";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
// A labelling pass over a whole backlog can take a few minutes.
export const maxDuration = 300;

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
  const body = (await req.json().catch(() => ({}))) ?? {};
  /* THE CLASSIFIER'S OWN HATCH: read every unread item now, up to a call
     budget, and report tokens so the cost is a number rather than a guess. */
  /* The one-time split of the legacy feed document into per-company rows.
     Idempotent; the readers also run it lazily, this just does it on purpose. */
  /* DO THE KEYS WORK, IS THE STORE HEALTHY: one cheap call per service. */
  if (body?.check === true) {
    return NextResponse.json({ health: await checkMarketIntelConnections() });
  }
  if (body?.migrate === true) {
    return NextResponse.json({ migrated: await migrateLegacyFeedRow() });
  }
  if (body?.classify === true) {
    const summary = await runMarketIntelLabeling({
      maxCalls: Number(body?.maxCalls) || 60,
      /* Read again what the Sep 10 signals labelled (Saras's Sep 11 list). Spends. */
      relabel: body?.relabel === true,
      only: Array.isArray(body?.only) ? body.only.map(String) : undefined,
    });
    return NextResponse.json(summary);
  }
  /* RUNDOWNS THAT ARE MISSING, written from what is already stored. */
  if (body?.digest === true) {
    return NextResponse.json(
      await runMissingRundowns({
        only: Array.isArray(body?.only) ? body.only.map(String) : undefined,
        maxCalls: Number(body?.maxCalls) || 10,
      })
    );
  }
  if (body?.thought === true) {
    try {
      return NextResponse.json(await refreshThoughtLeadershipNow());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not refresh." },
        { status: 500 }
      );
    }
  }
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
