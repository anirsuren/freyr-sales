import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

/**
 * EVERYONE'S UPLOADED PROFILE PICTURE, FOR EVERYONE SIGNED IN.
 *
 * /api/profile/photo returns only your own upload, which meant a picture you
 * set was visible to you alone — every teammate still saw your initials
 * (Anir, Aug 8, browsing as Suren: "Why does my profile picture not show
 * up?"). This returns the whole team's uploads keyed by lowercased display
 * name, so an Avatar can draw a colleague's real uploaded face on any page.
 * Member-verified like the single-photo route: profile pictures are workspace
 * content, not public assets.
 */

export const dynamic = "force-dynamic";

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
  if (!scope || !db) return NextResponse.json({ ok: true, photos: {} });
  const { data: rows } = await db
    .from("offering_catalog_state")
    .select("id, catalog")
    .like("id", "profile-photo:%");
  if (!rows?.length) return NextResponse.json({ ok: true, photos: {} });
  const ids = rows.map((row) => (row.id as string).slice("profile-photo:".length));
  const { data: users } = await db
    .from("app_users")
    .select("id, display_name")
    .in("id", ids);
  const nameById = new Map(
    (users ?? []).map((u) => [u.id as string, u.display_name as string])
  );
  const photos: Record<string, string> = {};
  for (const row of rows) {
    const userId = (row.id as string).slice("profile-photo:".length);
    const name = nameById.get(userId);
    const photo = (row.catalog as { photo?: string } | null)?.photo;
    if (name && typeof photo === "string" && photo.startsWith("data:image/")) {
      photos[name.trim().toLowerCase()] = photo;
    }
  }
  return NextResponse.json(
    { ok: true, photos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
