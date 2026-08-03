import { NextResponse } from "next/server";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { extractFileContent, isReadableFile } from "@/lib/fileText";
import { materialTextEntry, saveMaterialText } from "@/lib/materialText";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REINDEX_BYTES = 25 * 1024 * 1024;

/**
 * Retry knowledge extraction for a file that was uploaded before its current
 * parser existed (notably the original proposal ZIPs). The original object in
 * Freya.Docs is never changed: this only refreshes the private text index the
 * assistant searches. Offering ownership is required just like an upload.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(offering)))
    return NextResponse.json(
      { error: "Only an offering owner can refresh its uploaded knowledge" },
      { status: 403 }
    );

  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  const path = body?.path?.trim();
  if (!path || !path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "Choose an uploaded file from this offering" },
      { status: 400 }
    );

  const material = offering.materials.find((item) => item.docsPath === path);
  if (!material)
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );
  if (!isReadableFile(path))
    return NextResponse.json(
      { error: "That file format does not contain searchable text" },
      { status: 422 }
    );
  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const cached = await materialTextEntry(path);
  if (cached?.text && cached.archiveMembers?.length) {
    return NextResponse.json({
      ok: true,
      cached: true,
      words: cached.text.match(/\S+/g)?.length ?? 0,
      archiveMembers: cached.archiveMembers.map((member) => member.path),
    });
  }

  try {
    const { fileName, presignUrl } = await docsStorage.getDownloadUrl(path);
    const upstream = await fetch(presignUrl);
    if (!upstream.ok)
      return NextResponse.json(
        { error: "Could not read that uploaded file" },
        { status: 502 }
      );

    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_REINDEX_BYTES)
      return NextResponse.json(
        { error: "That file is too large to refresh safely" },
        { status: 413 }
      );
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_REINDEX_BYTES)
      return NextResponse.json(
        { error: "That file is too large to refresh safely" },
        { status: 413 }
      );

    // The catalogue label is intentionally human-readable and often omits the
    // extension ("Galderma" rather than "Galderma.zip"). Extraction must use
    // the real object name or a ZIP would be mistaken for an unknown format.
    const filename = fileName || path.split("/").pop() || material.label || path;
    const extracted = extractFileContent(buffer, filename);
    if (!extracted.text)
      return NextResponse.json(
        {
          error:
            "No readable text was found inside that file. The original remains available to open and download.",
        },
        { status: 422 }
      );

    await saveMaterialText(path, {
      offeringId: id,
      filename,
      text: extracted.text,
      extractedAt: new Date().toISOString(),
      ...(extracted.contentDate ? { contentDate: extracted.contentDate } : {}),
      ...(extracted.archiveMembers?.length
        ? { archiveMembers: extracted.archiveMembers }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      words: extracted.text.match(/\S+/g)?.length ?? 0,
      archiveMembers: extracted.archiveMembers?.map((member) => member.path) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not refresh that file's knowledge",
      },
      { status: 500 }
    );
  }
}
