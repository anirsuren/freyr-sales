import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { uploadMaterialFile } from "@/lib/materialStorage";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

/**
 * PUT A REAL FILE ON A CONTRACT.
 *
 * Anir, Aug 31: "Why the fuck would it not take attachments? All of them need
 * attachments."
 *
 * The same shape solutioning uses: this stores the bytes and hands back a
 * `docsPath`, and the caller then saves the contract carrying that path. Two
 * steps on purpose — a failed save never leaves a half-made record, and the
 * file is already up by the time the form is submitted.
 *
 * THE FILE ARRIVES BEFORE THE CONTRACT DOES, which is the normal case: you
 * attach the signed PDF while creating the thing it belongs to. The bytes go
 * to their own namespace and the save points at them. A path nobody attaches
 * is never read: every download resolves through the document ON a record.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  /* Attaching a file to a contract is a write on the contract, so it asks the
     same question the rest of the module asks. */
  const refusal = await moduleWriteRefusal("/contracts");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile("contracts/drafts", file, me.name);
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
