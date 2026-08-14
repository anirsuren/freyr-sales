import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { materialTextEntry, saveMaterialText } from "@/lib/materialText";
import { reconcileTranscripts } from "@/lib/videoTranscribe";

/**
 * MERGE A VIDEO'S MACHINE TRANSCRIPT WITH THE OWNER'S OWN.
 *
 * The pairing is known by the client and nowhere else: the owner picked that
 * transcript for that video, in that upload. Rather than have the server guess
 * from filenames or folders, the client says which is which once both files
 * are stored, and this endpoint does the merge and overwrites the video's text
 * with the reconciled version.
 *
 * Safe to call twice, and safe to call when either side is missing: it simply
 * reports that there was nothing to reconcile.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireModuleAccess("/offerings");
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    videoPath?: string;
    transcriptPath?: string;
  } | null;
  const videoPath = body?.videoPath?.trim();
  const transcriptPath = body?.transcriptPath?.trim();
  if (!videoPath || !transcriptPath)
    return NextResponse.json(
      { ok: false, error: "videoPath and transcriptPath are both required" },
      { status: 400 }
    );

  const [video, owner] = await Promise.all([
    materialTextEntry(videoPath).catch(() => null),
    materialTextEntry(transcriptPath).catch(() => null),
  ]);
  // The video is transcribed in the background and the owner's file is read
  // the same way, so either can still be in flight. Not an error: the words
  // are already stored separately and the assistant can read both.
  if (!video?.text || !owner?.text)
    return NextResponse.json({ ok: true, reconciled: false, reason: "not ready" });

  const merged = await reconcileTranscripts(video.text, owner.text);
  if (!merged)
    return NextResponse.json({ ok: true, reconciled: false, reason: "merge failed" });

  await saveMaterialText(videoPath, {
    offeringId: id,
    filename: video.filename,
    text: merged,
    extractedAt: new Date().toISOString(),
  });
  return NextResponse.json({
    ok: true,
    reconciled: true,
    words: merged.match(/\S+/g)?.length ?? 0,
  });
}
