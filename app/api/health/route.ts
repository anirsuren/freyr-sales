import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServiceStatus } from "@/lib/env";
import { getDataMode } from "@/lib/dataMode";
import { initializeLiveOfferings } from "@/lib/offerings";
import { verifyAccessControlStorage } from "@/lib/accessStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const dataMode = getDataMode();
  const authMode = process.env.AUTH_MODE;
  const cookieSecret = process.env.AUTH_COOKIE_SECRET;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  const authSecretsConfigured =
    !!cookieSecret &&
    cookieSecret.length >= 32 &&
    (!sessionSecret || sessionSecret.length >= 32);
  const durableStorageConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const identityProviderConfigured =
    authMode === "entra" ||
    authMode === "aws-alb" ||
    (authMode === "supabase" &&
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      authSecretsConfigured);
  const approvalRequired =
    authMode === "supabase" ||
    ((authMode === "entra" || authMode === "aws-alb") &&
      process.env.ACCESS_CONTROL_MODE === "approval");
  const approvalConfigured =
    !approvalRequired ||
    (durableStorageConfigured &&
      !!process.env.FREYR_WORKSPACE_ID &&
      authSecretsConfigured);
  const authenticationConfigured =
    identityProviderConfigured && approvalConfigured;

  if (process.env.NODE_ENV === "production" && !authenticationConfigured) {
    return NextResponse.json(
      {
        status: "unhealthy",
        version: process.env.APP_VERSION || process.env.WEBSITE_DEPLOYMENT_ID || "dev",
        authentication: "not_configured",
        dataMode,
        durationMs: Date.now() - started,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (dataMode === "live" && !durableStorageConfigured) {
    return NextResponse.json(
      {
        status: "unhealthy",
        version: process.env.APP_VERSION || process.env.WEBSITE_DEPLOYMENT_ID || "dev",
        database: "not_configured",
        authentication: authenticationConfigured ? "configured" : "development_bypass",
        dataMode,
        durableStorageConfigured: false,
        durationMs: Date.now() - started,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    if (approvalRequired) await verifyAccessControlStorage();
    await getDb().freyrKb.get();
    if (dataMode === "live") await initializeLiveOfferings();
    return NextResponse.json(
      {
        status: "healthy",
        version: process.env.APP_VERSION || process.env.WEBSITE_DEPLOYMENT_ID || "dev",
        uptimeSeconds: Math.round(process.uptime()),
        database: "reachable",
        authentication: authenticationConfigured ? "configured" : "development_bypass",
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
