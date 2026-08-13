import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { loadMaterialText } from "@/lib/materialText";
import { isReadableFile } from "@/lib/fileText";

export const dynamic = "force-dynamic";

/**
 * HAS FREYR AI READ THIS FILE YET?
 *
 * Anir, Aug 13: "How do I even know if the AI read it? How long does it take
 * for the AI to read it?" — fair, because reading now happens after the upload
 * answers, so the dialog genuinely cannot know. The material's own row asks
 * here instead, and says so where the file lives.
 *
 * Three honest answers, never collapsed into one:
 *  - reading  — the file is stored, indexing hasn't finished (or hasn't run)
 *  - read     — text is on file, with the word count
 *  - no-text  — a format with nothing to read (a video, a Keynote binary)
 *
 * Read-only, and only for members of this workspace.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json({ error: "Sign in first" }, { status: 403 });
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const paths = Array.isArray(body.paths)
    ? body.paths.map(String).filter((p) => p.startsWith(`${id}/`)).slice(0, 200)
    : [];
  if (!paths.length) return NextResponse.json({ status: {} });

  const index = await loadMaterialText().catch(() => ({}));
  const status: Record<string, { state: "reading" | "read" | "no-text"; words: number }> = {};
  for (const path of paths) {
    const entry = (index as Record<string, { text?: string } | undefined>)[path];
    const words = entry?.text ? entry.text.match(/\S+/g)?.length ?? 0 : 0;
    if (words > 0) status[path] = { state: "read", words };
    else if (!isReadableFile(path)) status[path] = { state: "no-text", words: 0 };
    else status[path] = { state: "reading", words: 0 };
  }
  return NextResponse.json({ status });
}
