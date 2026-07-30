import "server-only";

import JSZip, { type JSZipObject } from "jszip";
import { docsStorage } from "@/lib/docsStorage";

/**
 * Archives are opened inside the ECS task, so both the compressed container
 * and the file we inflate need hard limits. The preview route already uses a
 * 25 MB ceiling; keeping the same limit here means opening a ZIP cannot consume
 * more memory than opening a deck or workbook.
 */
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 200;

export class MaterialArchiveError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

type SizedZipObject = JSZipObject & {
  _data?: { uncompressedSize?: number };
};

export type MaterialArchiveEntry = {
  name: string;
  size: number;
};

async function downloadArchive(path: string): Promise<Buffer> {
  const { presignUrl } = await docsStorage.getDownloadUrl(path);
  const upstream = await fetch(presignUrl);
  if (!upstream.ok)
    throw new MaterialArchiveError("Could not read that archive", 502);

  const declared = Number(upstream.headers.get("content-length") || 0);
  if (declared > MAX_ARCHIVE_BYTES)
    throw new MaterialArchiveError(
      "This archive is too large to open in the browser. Download it instead.",
      413
    );

  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (buffer.byteLength > MAX_ARCHIVE_BYTES)
    throw new MaterialArchiveError(
      "This archive is too large to open in the browser. Download it instead.",
      413
    );
  return buffer;
}

async function loadArchive(path: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(await downloadArchive(path));
  } catch (error) {
    if (error instanceof MaterialArchiveError) throw error;
    throw new MaterialArchiveError("That ZIP archive could not be opened", 422);
  }
}

export async function listMaterialArchive(
  path: string
): Promise<MaterialArchiveEntry[]> {
  const zip = await loadArchive(path);
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .slice(0, MAX_ARCHIVE_ENTRIES)
    .map((entry) => ({
      name: entry.name,
      size: Number((entry as SizedZipObject)._data?.uncompressedSize || 0),
    }));
}

export async function readMaterialArchiveMember(
  path: string,
  member: string
): Promise<{ bytes: Uint8Array; name: string }> {
  if (!member || member.includes("\0"))
    throw new MaterialArchiveError("Which file inside the archive?", 400);

  const zip = await loadArchive(path);
  const entry = zip.file(member) as SizedZipObject | null;
  if (!entry || entry.dir)
    throw new MaterialArchiveError(
      "That file is not inside this archive",
      404
    );

  const declared = Number(entry._data?.uncompressedSize || 0);
  if (declared > MAX_ARCHIVE_BYTES)
    throw new MaterialArchiveError(
      "That file is too large to open in the browser. Download the archive instead.",
      413
    );

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of entry.nodeStream("nodebuffer")) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_ARCHIVE_BYTES)
      throw new MaterialArchiveError(
        "That file is too large to open in the browser. Download the archive instead.",
        413
      );
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks, total);
  return { bytes, name: entry.name };
}
