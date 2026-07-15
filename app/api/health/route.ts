import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServiceStatus } from "@/lib/env";
import { getDataMode } from "@/lib/dataMode";
import { initializeLiveOfferings } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const dataMode = getDataMode();
  const durableStorageConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (dataMode === "live" && !durableStorageConfigured) {
    return NextResponse.json(
      {
        status: "unhealthy",
        version: process.env.APP_VERSION || process.env.WEBSITE_DEPLOYMENT_ID || "dev",
        database: "not_configured",
        dataMode,
        durableStorageConfigured: false,
        durationMs: Date.now() - started,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    await getDb().freyrKb.get();
    if (dataMode === "live") await initializeLiveOfferings();
    return NextResponse.json(
      {
        status: "healthy",
        version: process.env.APP_VERSION || process.env.WEBSITE_DEPLOYMENT_ID || "dev",
        uptimeSeconds: Math.round(process.uptime()),
        database: "reachable",
        dataMode,
        durableStorageConfigured,
        services: getServiceStatus(),
        durationMs: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "unreachable",
        durationMs: Date.now() - started,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
