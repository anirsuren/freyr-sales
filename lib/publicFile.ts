import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * READ A FILE THAT SHIPS WITH THE APP.
 *
 * Only for the sample documents mock hands over — real files live in
 * Freya.Docs and are read through a signed URL. The argument is the public
 * URL of the file ("/sample-documents/x.docx"), and it is resolved against
 * `public/` with every traversal component rejected, so nothing outside that
 * folder is reachable even if a caller passes something it should not.
 */
export async function readPublicFile(url: string): Promise<Buffer> {
  const rel = url.replace(/^\/+/, "");
  if (!rel || rel.includes("..") || path.isAbsolute(rel))
    throw new Error("Not a file this app ships.");

  const root = path.join(process.cwd(), "public");
  const full = path.join(root, rel);
  if (!full.startsWith(root + path.sep))
    throw new Error("Not a file this app ships.");

  return readFile(full);
}
