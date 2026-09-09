import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { getCurrentUser } from "@/lib/currentUser";
import {
  contentTypeForFilename,
  formatFromFilename,
  hasMaterialStorage,
  materialExistsInStore,
  mirrorMaterialToDocsInBackground,
  removeMaterialFromStore,
} from "@/lib/materialStorage";
import { isReadableFile } from "@/lib/fileText";
import { indexStoredMaterialInBackground } from "@/lib/materialIndexing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * FINISH A DIRECT UPLOAD INTO SUPABASE.
 *
 * The browser has PUT the bytes into the workspace bucket itself. This route
 * confirms the object is really there, answers, and only then starts the two
 * background jobs: reading the file for the assistant, and the side copy into
 * Freya.Docs (Anir, Sep 9: "the Freya Docs is just a side thing"). Neither
 * can fail the upload, because the upload is already done.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(offering)))
    return NextResponse.json(
      { error: "Ask a workspace admin to assign you as an owner before uploading materials" },
      { status: 403 }
    );
  if (!(await hasMaterialStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    path?: string;
    filename?: string;
    /** Whether the browser's PUT failed — then we clean up instead. */
    failed?: boolean;
  };
  const path = (body.path || "").trim();
  const filename = (body.filename || "").trim() || "file";
  // Same rule as the download route: the path must belong to THIS offering.
  if (!path || !path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );

  // A failed browser upload may have left a partial object behind.
  if (body.failed) {
    await removeMaterialFromStore(path);
    return NextResponse.json({ ok: true, aborted: true });
  }

  // THE OBJECT MUST BE THERE. A record pointing at nothing is exactly the
  // "listed here but its file is missing" failure the download route has to
  // explain to people, so refuse to say "done" until storage says so.
  let present = false;
  for (const waitMs of [0, 400, 1200]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    if (await materialExistsInStore(path)) {
      present = true;
      break;
    }
  }
  if (!present)
    return NextResponse.json(
      { error: "The upload did not land in storage. Try again." },
      { status: 502 }
    );

  const me = await getCurrentUser().catch(() => null);
  // Second job, behind the response: read it for the assistant.
  indexStoredMaterialInBackground({ offeringId: id, path, filename });
  // Third job, behind the response: the enterprise archive copy.
  mirrorMaterialToDocsInBackground(
    path,
    contentTypeForFilename(filename),
    me?.email || me?.name || undefined
  );

  return NextResponse.json({
    ok: true,
    // The format CAN hold text. Whether words came out is settled in the
    // background now, so this response is purely about storage.
    supported: isReadableFile(filename),
    failed: false,
    indexing: true,
    // Downloads go through our own route, which mints a fresh signed URL per
    // click — a stored presign would expire and rot in the record.
    url: `/api/offerings/${id}/materials/download?path=${encodeURIComponent(path)}`,
    docsPath: path,
    kind: formatFromFilename(filename),
    filename,
  });
}
