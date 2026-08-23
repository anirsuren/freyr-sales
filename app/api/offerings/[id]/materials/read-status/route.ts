import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import {
  loadMaterialText,
  saveMaterialText,
  type MaterialTextEntry,
} from "@/lib/materialText";
import { docsStorage } from "@/lib/docsStorage";
import { isReadableFile } from "@/lib/fileText";
import { indexStoredMaterialInBackground } from "@/lib/materialIndexing";

/** Paths this process has already re-kicked, so a page of pollers cannot
 *  stampede the indexer. One kick per file per container is plenty. */
const kicked = new Set<string>();

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

  const body = ((await req.json().catch(() => ({}))) ?? {}) as { paths?: unknown };
  const paths = Array.isArray(body.paths)
    ? body.paths.map(String).filter((p) => p.startsWith(`${id}/`)).slice(0, 200)
    : [];
  if (!paths.length) return NextResponse.json({ status: {} });

  const index = await loadMaterialText().catch(() => ({}));
  const status: Record<
    string,
    { state: "reading" | "read" | "no-text"; words: number; bytes?: number }
  > = {};
  for (const path of paths) {
    const entry = (index as Record<string, MaterialTextEntry | undefined>)[path];
    const words = entry?.text ? entry.text.match(/\S+/g)?.length ?? 0 : 0;
    if (words > 0) {
      status[path] = { state: "read", words, bytes: entry?.bytes };
      /**
       * ENTRIES FROM BEFORE SIZES EXISTED (Anir, Aug 20: "I only see it on
       * the future ones. Can you add it to all the current ones?"). The text
       * is on file but the byte count is not. One HEAD against the stored
       * object fills it in for good; once per path per container, and a
       * failure just tries again in some future container.
       */
      if (entry && typeof entry.bytes !== "number" && !kicked.has(path)) {
        kicked.add(path);
        void (async () => {
          try {
            const { presignUrl } = await docsStorage.getDownloadUrl(path);
            const head = await fetch(presignUrl, { method: "HEAD" });
            const size = Number(head.headers.get("content-length") || 0);
            if (size > 0) await saveMaterialText(path, { ...entry, bytes: size });
          } catch {
            /* the row simply keeps showing no size */
          }
        })();
      }
    } else if (entry)
      // An entry with no text is the indexer's RECORDED verdict: it held the
      // bytes, ran extraction and transcription, and found nothing to read.
      status[path] = { state: "no-text", words: 0, bytes: entry.bytes };
    else if (!isReadableFile(path)) status[path] = { state: "no-text", words: 0 };
    else {
      /**
       * NO ENTRY AT ALL: the background read never finished — a container
       * that restarted mid-job, or a file from before indexing recorded
       * verdicts. This is the state Anir watched say "Freyr AI is reading
       * it…" forever (Aug 20). Being asked IS the cue to heal: kick the
       * indexer (it fetches the bytes back from storage itself) and keep
       * answering "reading" until it lands. Once per path per container.
       */
      if (!kicked.has(path)) {
        kicked.add(path);
        indexStoredMaterialInBackground({
          offeringId: id,
          path,
          filename: path.split("/").pop() || path,
        });
      }
      status[path] = { state: "reading", words: 0 };
    }
  }
  return NextResponse.json({ status });
}
