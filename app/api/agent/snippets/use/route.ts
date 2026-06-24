import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Snippet usage count (V9 #44) — bumped each time a snippet is inserted into a
// draft, so the library can surface what actually works.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getDb();
  const snippet = await db.draftSnippets.bumpUse(id);
  if (!snippet) {
    return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, uses: snippet.uses });
}
