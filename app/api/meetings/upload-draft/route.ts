import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { uploadMaterialFile } from "@/lib/materialStorage";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

/**
 * A FILE FOR A MEETING THAT DOES NOT EXIST YET.
 *
 * Anir, Aug 31: "All of them need attachments."
 *
 * /api/meetings/upload attaches to a meeting BY ID, which is right once the
 * meeting is there but useless while you are still filling in the form that
 * makes it — and the brief you want to attach is the one in your hand before
 * the meeting is booked, not after. So this is the same two-step contracts
 * and solutioning use: store the bytes, hand back a `docsPath`, and let the
 * create carry that path onto the record it makes.
 *
 * A path nobody attaches is never read — every download resolves through the
 * document ON a record, so an abandoned form leaves bytes with no door.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  /* Attaching a file to a meeting is a write on Meetings, so it asks exactly
     the question the rest of the module asks — no softer, no harder. */
  const refusal = await moduleWriteRefusal("/meetings");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile("meetings/drafts", file, me.name);
    return NextResponse.json({
      ok: true,
      docsPath: stored.docsPath,
      fileName: stored.filename,
      kind: stored.kind,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
