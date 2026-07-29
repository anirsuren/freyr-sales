import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { MaterialFormat } from "./offeringMaterials";
import { docsStorage, hasDocsStorage } from "./docsStorage";

/**
 * WHERE UPLOADED SALES MATERIALS LIVE.
 *
 * Owners upload the ACTUAL files: the decks, Word docs, Excel sheets and
 * videos that today sit in Eeswar's SharePoint folder — not links to them
 * (Wajeed, Jul 29: "I think it's going to be actual files"). The bytes go into
 * a Supabase Storage bucket, the same managed backend that already persists
 * the offering catalog, and the material row stores the file's public URL, so
 * every existing surface (the materials list, the format icons, the CSV
 * export, the agent's knowledge base) keeps working off `url` unchanged.
 *
 * When Freya.Docs lands (blocked on Kevin's tenant id, task #219), only this
 * module changes: upload() points at the Docs API and returns its URL, and
 * nothing above it needs to know.
 */

const BUCKET = "offering-materials";
/**
 * THE CAP APPLIES ONLY TO THE FALLBACK PATH.
 *
 * With Freya.Docs configured the browser PUTs straight to S3 and there is NO
 * size limit at all (see the upload-url + complete routes) — a full recorded
 * demo uploads like a one-pager. This constant governs the other path, where
 * the file is posted THROUGH this server and therefore has to sit in its
 * memory; a limit there is what stops one upload from taking the process down.
 */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Is a real file store configured in this environment? */
export async function hasMaterialStorage(): Promise<boolean> {
  return (await hasDocsStorage()) || storageClient() !== null;
}

/** What kind of material a filename is, by its extension. Keeps the four-tile
 *  format language: video / presentation / document / other. */
export function formatFromFilename(name: string): MaterialFormat {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "presentation";
  if (["doc", "docx", "pdf", "txt", "rtf", "md", "odt"].includes(ext))
    return "document";
  return "other";
}

let bucketReady: Promise<void> | null = null;
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = storageClient();
      if (!client) return;
      // Public: materials are sales collateral meant to be opened from the
      // list; anything genuinely internal is flagged by accessLevel in the
      // app, not hidden at the CDN. createBucket 409s when it exists — fine.
      const { error } = await client.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_UPLOAD_BYTES,
      });
      if (error && !/already exists/i.test(error.message)) {
        bucketReady = null;
        throw new Error(`Could not prepare the materials bucket: ${error.message}`);
      }
    })();
  }
  await bucketReady;
}

/** Store the file, return where it now lives. Throws with a plain-English
 *  message the dialog can show verbatim. */
export async function uploadMaterialFile(
  offeringId: string,
  file: File,
  uploadedBy?: string
): Promise<{
  url: string;
  kind: MaterialFormat;
  filename: string;
  docsPath?: string;
}> {
  // FREYA.DOCS FIRST. Sameer's docs-storage API is where Freyr wants sales
  // material to live (call of Jul 29), so when it is configured it wins and
  // the file lands in FreyaFusion's S3 under our own namespace. Everything
  // else here is the fallback for environments without those credentials, so
  // an unconfigured box still works instead of blocking an owner's upload.
  if (await hasDocsStorage()) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${offeringId}/${Date.now()}-${safeName}`;
    const contentType = file.type || "application/octet-stream";
    try {
      const { uploadUrl, uploadHeaders } = await docsStorage.requestUpload(
        path,
        contentType,
        {
          offeringId,
          ...(uploadedBy ? { uploadedBy } : {}),
        }
      );
      // Rule 2: replay EVERY signed header verbatim or S3 answers 403.
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: uploadHeaders,
        // The File IS a Blob: handing it straight to fetch streams the bytes
        // to S3 instead of materialising a 90MB deck in this process.
        body: file,
      });
      if (!put.ok) throw new Error(`S3 upload failed: ${put.status}`);
      // Rule 3: without complete(), the object stays pending and the path is
      // unusable until aborted.
      await docsStorage.completeUpload(path);
      return {
        // Downloads go through our own route, which mints a fresh signed URL
        // per click: a stored presign would expire and rot in the record.
        url: `/api/offerings/${offeringId}/materials/download?path=${encodeURIComponent(path)}`,
        kind: formatFromFilename(file.name),
        filename: file.name,
        docsPath: path,
      };
    } catch (e) {
      // A half-finished upload leaves the path pending (409004 on retry), so
      // clear it before falling back or the same file can never be re-sent.
      await docsStorage.abortUpload(path).catch(() => undefined);
      throw new Error(
        `Freya.Docs upload failed: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  const client = storageClient();
  if (!client)
    throw new Error(
      "File uploads need the live workspace storage, which is not configured here. Paste a link instead."
    );
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(
      `That file is ${Math.round(file.size / 1024 / 1024)}MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
    );
  if (file.size === 0) throw new Error("That file is empty.");

  await ensureBucket();

  // Keep the human-readable name in the path, sanitised, and prefix with time
  // so re-uploading a corrected deck never overwrites the one already cited.
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${offeringId}/${Date.now()}-${safe}`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    kind: formatFromFilename(file.name),
    filename: file.name,
  };
}
