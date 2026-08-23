import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { DEFAULT_LOCAL_USER_IDENTITY } from "@/lib/userIdentity";

/**
 * YOUR OWN PROFILE PICTURE, UPLOADED.
 *
 * The only way to replace the initials circle used to be pasting a LinkedIn
 * URL and letting enrichment pull the photo down, which means handing over a
 * LinkedIn account to change an avatar (Anir, Jul 29: "just let me fucking
 * change my profile picture... I don't want to link my LinkedIn"). LinkedIn
 * still works and is still offered; it is simply no longer the only door.
 *
 * STORAGE. The obvious home, `agent_prefs.linkedin_photo`, does not exist: its
 * migration was written but never applied to the live database, which is also
 * why the LinkedIn photo never actually appeared. Rather than block a profile
 * picture on a schema change nobody can run from here, the image goes in
 * `offering_catalog_state` under `profile-photo:<user>` — the same
 * service-role-only table that already holds the document-storage credentials.
 * One row per person, no migration, works in production today.
 */

export const dynamic = "force-dynamic";

// Roughly 1.5MB of base64: a generous 256px avatar, far below the body limit.
// The browser downsizes before sending; this is the backstop.
const MAX_CHARS = 1_500_000;

function validPhoto(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > MAX_CHARS) return false;
  // Inline image data only: never a remote URL the app would fetch on render.
  return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function rowId(userId: string) {
  return `profile-photo:${userId}`;
}

/**
 * Mock mode keeps its demo records under `local-anir-suren`, but a profile
 * picture is an account preference, not demo data. The durable upload already
 * lives under the real app_users id, so resolving that id here keeps the same
 * picture visible when a local reviewer switches between Real and In progress
 * modes. Production scopes are already account-backed and pass through.
 */
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

async function durableProfileUserId(
  userId: string,
  db: NonNullable<Awaited<ReturnType<typeof serviceClient>>>
): Promise<string> {
  if (userId !== DEFAULT_LOCAL_USER_IDENTITY.id) return userId;
  const localEmail = DEFAULT_LOCAL_USER_IDENTITY.email;
  if (!localEmail) return userId;
  const { data } = await db
    .from("app_users")
    .select("id")
    .eq("email", localEmail.toLowerCase())
    .eq("active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? userId;
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  const db = await serviceClient();
  if (!scope || !db) return NextResponse.json({ ok: true, photo: null });
  const userId = await durableProfileUserId(scope.userId, db);
  const { data } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(userId))
    .maybeSingle();
  const photo = (data?.catalog as { photo?: string } | null)?.photo ?? null;
  return NextResponse.json({ ok: true, photo });
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
  if (!validPhoto(body?.photo)) {
    return NextResponse.json(
      { error: "Send a PNG, JPEG, WEBP or GIF image under 1MB." },
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
  const userId = await durableProfileUserId(scope.userId, db);
  const { error } = await db
    .from("offering_catalog_state")
    .upsert(
      { id: rowId(userId), catalog: { photo: body.photo } },
      { onConflict: "id" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, photo: body.photo });
}

/** Back to initials. */
export async function DELETE(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const db = await serviceClient();
  if (db) {
    const userId = await durableProfileUserId(scope.userId, db);
    await db
      .from("offering_catalog_state")
      .upsert({ id: rowId(userId), catalog: {} }, { onConflict: "id" });
  }
  return NextResponse.json({ ok: true, photo: null });
}
