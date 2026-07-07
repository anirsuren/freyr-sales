import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Draft library (V9 #39). The rep's reusable outreach snippets — saved from the
// agent's drafts and dropped into future plays. Mock-first.
export async function GET() {
  const db = getDb();
  return NextResponse.json({ snippets: await db.draftSnippets.list() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || "").trim();
  const text = String(body.body || "").trim();
  if (!subject && !text) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }
  const title = String(body.title || subject || "Untitled snippet").slice(0, 80);
  const db = getDb();
  const snippet = await db.draftSnippets.create({
    title,
    subject: subject.slice(0, 200),
    body: text.slice(0, 4000),
    uses: 0,
  });
  return NextResponse.json({ ok: true, snippet });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, string> = {};
  if ("title" in body) patch.title = String(body.title).slice(0, 80);
  if ("subject" in body) patch.subject = String(body.subject).slice(0, 200);
  if ("body" in body) patch.body = String(body.body).slice(0, 4000);
  const db = getDb();
  const snippet = await db.draftSnippets.update(id, patch);
  if (!snippet) {
    return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, snippet });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getDb();
  const removed = await db.draftSnippets.remove(id);
  return NextResponse.json({ ok: removed });
}
