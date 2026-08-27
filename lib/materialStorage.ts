import { formatFromFilename } from "./offeringMaterials";
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

const MATERIAL_UPLOAD_MIME: Record<string, string[]> = {
  mp4: ["video/mp4"], mov: ["video/quicktime"], webm: ["video/webm"], m4v: ["video/"],
  ppt: ["application/vnd.ms-powerpoint", "application/octet-stream"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
  key: ["application/", "application/octet-stream"],
  doc: ["application/msword", "application/octet-stream"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  pdf: ["application/pdf"], txt: ["text/plain"], rtf: ["application/rtf", "text/rtf"],
  xls: ["application/vnd.ms-excel", "application/octet-stream"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"], zip: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
};

/**
 * Pictures. Deliberately NOT part of MATERIAL_UPLOAD_MIME: a sales material is
 * a deck or a document, and widening that list would change what the materials
 * uploader accepts, which nobody asked for. Feature attachments opt in through
 * `allowImages` (Suren, Aug 9: "if they can add some document or an image").
 */
const IMAGE_UPLOAD_MIME: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  heic: ["image/heic", "image/heif", "application/octet-stream"],
  avif: ["image/avif"],
};

/** Validate the filename extension and browser-declared MIME together. */
export function validateMaterialUpload(
  filename: string,
  contentType: string,
  options?: { allowImages?: boolean }
): string | null {
  const cleanName = filename.trim();
  if (!cleanName || /[\0\r\n]/.test(cleanName)) return "Choose a valid file name.";
  const extension = (cleanName.split(".").pop() || "").toLowerCase();
  const allowed =
    MATERIAL_UPLOAD_MIME[extension] ??
    (options?.allowImages ? IMAGE_UPLOAD_MIME[extension] : undefined);
  if (!allowed) return `.${extension || "unknown"} files are not supported.`;
  const mime = (contentType || "application/octet-stream").toLowerCase().split(";", 1)[0].trim();
  if (!allowed.some((candidate) => candidate.endsWith("/") ? mime.startsWith(candidate) : mime === candidate))
    return `The file contents do not match the .${extension} extension.`;
  return null;
}

/** The extension's canonical MIME type, for dashboard previews of mirrored
 *  copies. Falls back to a generic stream. */
export function contentTypeForFilename(filename: string): string {
  const extension = (filename.split(".").pop() || "").toLowerCase();
  const allowed = MATERIAL_UPLOAD_MIME[extension];
  const first = allowed?.find((candidate) => !candidate.endsWith("/"));
  return first || "application/octet-stream";
}

/**
 * BEST-EFFORT MIRROR into the workspace's own Supabase bucket (Anir, Aug 12:
 * "store them in supabase storage as well... make sure everything's stored
 * there"). Freya.Docs stays the source of truth the app serves downloads
 * from; this copy exists so the team can SEE and hold their files in their
 * own dashboard. Same path as the docsPath, so the bucket reads 1:1 against
 * the catalog. Never throws — a mirror hiccup must not break an upload.
 */
export async function mirrorMaterialToSupabase(
  path: string,
  bytes: Buffer | Uint8Array,
  contentType?: string
): Promise<boolean> {
  try {
    const client = storageClient();
    if (!client) return false;
    await ensureBucket();
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

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
/* Moved to lib/offeringMaterials so a CLIENT component can call it: it is a
   pure filename check with no server dependency, and this file is server-only,
   so importing it from the browser pulled the whole storage layer along.
   Re-exported here because plenty of server callers already import it from
   this module. */
export { formatFromFilename };

let bucketReady: Promise<void> | null = null;
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = storageClient();
      if (!client) return;
      // Private by construction. Application-level access labels must also be
      // enforced at the object boundary; a copied CDN URL must never bypass
      // the material authorization route.
      //
      // NO per-bucket fileSizeLimit: asking for one above the project's
      // global upload cap makes createBucket AND updateBucket fail ("The
      // object exceeded the maximum allowed size"), which silently disabled
      // this store for the life of the process (found Aug 12 when the mirror
      // never landed). The project-wide cap applies on its own.
      const { error } = await client.storage.createBucket(BUCKET, {
        public: false,
      });
      if (error && !/already exists/i.test(error.message)) {
        bucketReady = null;
        throw new Error(`Could not prepare the materials bucket: ${error.message}`);
      }
      if (error && /already exists/i.test(error.message)) {
        const { error: updateError } = await client.storage.updateBucket(BUCKET, {
          public: false,
        });
        if (updateError) {
          bucketReady = null;
          throw new Error(`Could not secure the materials bucket: ${updateError.message}`);
        }
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
  uploadedBy?: string,
  options?: { allowImages?: boolean }
): Promise<{
  url: string;
  kind: MaterialFormat;
  filename: string;
  docsPath?: string;
}> {
  const validationError = validateMaterialUpload(file.name, file.type, options);
  if (validationError) throw new Error(validationError);
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
      // Mirror to the workspace's own Supabase bucket too — same contract as
      // the direct-upload path: best-effort, never blocks the upload.
      void file
        .arrayBuffer()
        .then((buf) =>
          mirrorMaterialToSupabase(path, Buffer.from(buf), contentType)
        )
        .catch(() => undefined);
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

  return {
    url: `/api/offerings/${offeringId}/materials/download?path=${encodeURIComponent(path)}`,
    kind: formatFromFilename(file.name),
    filename: file.name,
    docsPath: path,
  };
}

/** Mint a short-lived URL for a private fallback-storage object. */
export async function getFallbackMaterialDownloadUrl(path: string): Promise<string> {
  const client = storageClient();
  if (!client) throw new Error("Material storage is not configured here");
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl)
    throw new Error(error?.message || "Could not authorize that file");
  return data.signedUrl;
}
