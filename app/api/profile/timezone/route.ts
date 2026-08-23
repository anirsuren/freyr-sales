import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { isValidTimeZone } from "@/lib/timeZone";

/**
 * THE ZONE THIS PERSON READS TIMES IN.
 *
 * Stored per user, so it follows them to another machine, and stored as an
 * IANA NAME rather than an offset — the offset for any given instant is
 * resolved at format time, which is what keeps it right across daylight saving
 * and any future change to a zone's rules (Anir, Jul 30: "make sure that's
 * always up to date if there are any things that are changing").
 *
 * Empty string means AUTO: use whatever zone the device reports. That is the
 * default and, for most people, permanently correct — including when they fly
 * somewhere else.
 *
 * Same row-per-user shape as the profile photo, in the service-role-only
 * `offering_catalog_state` table, so this needs no migration.
 */

export const dynamic = "force-dynamic";

function rowId(userId: string) {
  return `user-timezone:${userId}`;
}

async function serviceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  const db = await serviceClient();
  if (!scope || !db) return NextResponse.json({ ok: true, timeZone: "" });
  const { data } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope.userId))
    .maybeSingle();
  const zone = (data?.catalog as { timeZone?: string } | null)?.timeZone ?? "";
  return NextResponse.json({ ok: true, timeZone: zone });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const zone = typeof body?.timeZone === "string" ? body.timeZone.trim() : "";
  // "" is a legitimate value: it means "go back to following this device".
  if (zone && !isValidTimeZone(zone)) {
    return NextResponse.json(
      { error: "That is not a time zone this browser recognises." },
      { status: 400 }
    );
  }
  const db = await serviceClient();
  if (!db) {
    return NextResponse.json(
      { error: "This workspace has no durable storage configured." },
      { status: 503 }
    );
  }
  const { error } = await db
    .from("offering_catalog_state")
    .upsert(
      { id: rowId(scope.userId), catalog: { timeZone: zone } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, timeZone: zone });
}
