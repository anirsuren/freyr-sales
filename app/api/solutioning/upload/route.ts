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

  const params = new URL(req.url).searchParams;
  const requestId = params.get("requestId") ?? "";

  /* THE FILE ARRIVES BEFORE THE REQUEST DOES (Suren, Aug 31: "I will get the
     RFP template... I should have the option to upload documents related to
     this request"). He is describing the NEW-request dialog, where nothing has
     an id yet, so a draft upload parks the bytes under their own namespace and
     hands back a docsPath. The create call then attaches that path to the
     request it just made.

     The access gate above already ran, and a path nobody ends up attaching is
     simply never read: every download resolves through the document ON a
     request, never through a raw path in a query string. */
  const draft = params.get("draft") === "1";

  if (!draft) {
    if (!requestId)
      return NextResponse.json({ error: "Which request?" }, { status: 400 });

    /* The request must exist before anything is stored, so a typo cannot leave
       an orphan file in the bucket that nothing will ever point at. */
    const state = await readSolutioning();
    if (!state.requests.some((r) => r.id === requestId))
      return NextResponse.json({ error: "That request is gone." }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile(
      solutioningNamespace(draft ? "drafts" : requestId),
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
