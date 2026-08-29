import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import { uploadMaterialFile } from "@/lib/materialStorage";
import { readMeetings } from "@/lib/meetings";
import { canOpenModule } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A FILE ON A MEETING — what was presented, or anything handed over.
 *
 * Suren, Aug 28: "whatever that was presented, they provide that presented
 * details." Same two-step shape the solutioning and materials uploads use:
 * this stores the bytes and returns a docsPath, and the caller then adds the
 * document with `op: "add-doc"`. A failed save never leaves a half-made row.
 */
export async function POST(req: NextRequest) {
  if (!(await canOpenModule("/meetings")))
    return NextResponse.json({ error: "Not available on this account." }, { status: 403 });

  const meetingId = new URL(req.url).searchParams.get("meetingId") ?? "";
  if (!meetingId)
    return NextResponse.json({ error: "Which meeting?" }, { status: 400 });

  /* The meeting must exist before anything is stored, so a typo cannot leave
     an orphan file in the bucket that nothing will ever point at. */
  const state = await readMeetings();
  if (!state.meetings.some((m) => m.id === meetingId))
    return NextResponse.json({ error: "That meeting is gone." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile(`meetings/${meetingId}`, file, me.name);
    return NextResponse.json({
      ok: true,
      docsPath: stored.docsPath,
      fileName: stored.filename,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That file did not upload." },
      { status: 500 }
    );
  }
}
