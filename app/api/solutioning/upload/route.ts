import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { uploadMaterialFile } from "@/lib/materialStorage";
import { readSolutioning } from "@/lib/solutioning";
import {
  canWriteSolutioning,
  solutioningNamespace,
} from "@/lib/solutioningDocAccess";

/**
 * PUT A REAL FILE ON A SOLUTIONING REQUEST.
 *
 * A document used to be a name and a link. Anir, Aug 26: "if the customer
 * documents are the sales material... copy all that shit." So it goes into the
 * same Freya.Docs storage a sales material does, under its own namespace, and
 * comes back with a `docsPath` the viewer can render.
 *
 * The upload stores the bytes; the caller then adds the document with
 * `op: "add-doc"` carrying that path. Two steps on purpose — the same shape
 * the materials dialog uses, so a failed save never leaves a half-made record.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await canWriteSolutioning()))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const requestId = new URL(req.url).searchParams.get("requestId") ?? "";
  if (!requestId)
    return NextResponse.json({ error: "Which request?" }, { status: 400 });

  /* The request must exist before anything is stored, so a typo cannot leave
     an orphan file in the bucket that nothing will ever point at. */
  const state = await readSolutioning();
  if (!state.requests.some((r) => r.id === requestId))
    return NextResponse.json({ error: "That request is gone." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile(
      solutioningNamespace(requestId),
      file,
      me.name
    );
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
