import { formatFromFilename } from "./offeringMaterials";
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { MaterialFormat } from "./offeringMaterials";
import { docsStorage, hasDocsStorage } from "./docsStorage";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

/**
 * WHERE UPLOADED SALES MATERIALS LIVE.
 *
 * Owners upload the ACTUAL files: the decks, Word docs, Excel sheets and
 * videos that today sit in Eeswar's SharePoint folder — not links to them
 * (Wajeed, Jul 29: "I think it's going to be actual files").
 *
 * SUPABASE STORAGE IS THE MASTER COPY. Anir, Sep 9: "You upload it to
 * Supabase, and that's the main thing. The Freya Docs is just a side thing...
 * when you open it, you open it from Supabase, not Freya Docs." The browser
 * uploads straight into the workspace bucket (createMaterialUploadGrant), the
 * app serves every open and download from it (getMaterialServeUrl), and
 * Freya.Docs — FreyaFusion's enterprise archive — receives a copy afterwards
 * in the background (mirrorMaterialToDocs), streamed, never awaited, never
 * able to fail an upload or an open.
 *
 * History, so nobody reverses it by accident: the Jul 29 arrangement wrote
 * to Docs first and copied to Supabase second; Docs's bucket has no CORS
 * policy, so every browser upload fell back through the app server, and the
 * project's 50MB storage cap (raised to 5GB on Sep 9) meant no video ever
 * got the copy the app opens. Eight materials lost their bytes in Docs while
 * the Supabase copies sat intact. That is why the order is what it is.
 */

const BUCKET = "offering-materials";
/**
 * THE CAP APPLIES ONLY TO THE FALLBACK PATH.
 *
 * The browser PUTs straight into Supabase Storage and the only limit there is
 * the project's cap (MAX_DIRECT_UPLOAD_BYTES, 5GB) — a full recorded
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

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Is a real file store configured in this environment? Supabase decides:
 *  it is what the app serves from AND a required leg of every upload, so a
 *  Docs-only environment can neither store nor show a file any more. */
export async function hasMaterialStorage(): Promise<boolean> {
  return storageClient() !== null;
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
  /* SUPABASE IS THE MASTER STORE. Anir, Sep 9: "You upload it to Supabase,
     and that's the main thing. The Freya Docs is just a side thing... when
     you open it, you open it from Supabase, not Freya Docs."

     Until today this function wrote to Freya.Docs first and copied to
     Supabase afterwards, and the copy was capped by the project's 50MB
     global limit, so no video ever had a Supabase copy at all. The bytes
     land in the workspace's own bucket here, the app serves them from there
     (getMaterialServeUrl), and the Docs copy is written behind the response
     by mirrorMaterialToDocs, never awaited, never able to fail an upload. */
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
  // The enterprise archive copy, behind the response. Docs missing a file
  // must never cost the rep the upload (it is not what anyone opens).
  mirrorMaterialToDocsInBackground(path, file.type || "application/octet-stream", uploadedBy);

  return {
    url: `/api/offerings/${offeringId}/materials/download?path=${encodeURIComponent(path)}`,
    kind: formatFromFilename(file.name),
    filename: file.name,
    docsPath: path,
  };
}

/**
 * THE APP READS FROM SUPABASE. FREYA.DOCS IS WRITE-ONLY ARCHIVE.
 *
 * Anir, Sep 5: "You just store it in Fradox. That's just the backend thing
 * they want. Pretend you don't have it when it comes to the actual app."
 *
 * This reverses the Jul 29 arrangement where Docs was the source the app
 * served downloads from and the Supabase copy was a best-effort mirror. Eight
 * materials taught us why: their bytes vanished from Docs (both instances)
 * while the Supabase copies sat there intact, and every click answered
 * "Storage object not found". Uploads still push to Docs so the enterprise
 * repository stays complete — but nothing a reader clicks depends on it.
 */
export async function getMaterialServeUrl(path: string): Promise<string> {
  const client = storageClient();
  if (!client) throw new Error("Material storage is not configured here");
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60);
  if (data?.signedUrl) return data.signedUrl;
  /* NOT MIRRORED YET (or the mirror failed): the upload answered before the
     Supabase copy landed, so a click in the first seconds after an upload —
     or on a file whose mirror is still retrying — comes here. Docs has the
     bytes from the moment the upload returned, so serve those. */
  if (await hasDocsStorage()) {
    try {
      const { presignUrl } = await docsStorage.getDownloadUrl(path);
      if (presignUrl) return presignUrl;
    } catch {}
  }
  throw new Error(error?.message || "Could not authorize that file");
}

/** The old name, kept so existing imports keep compiling. Same URL. */
export async function getFallbackMaterialDownloadUrl(path: string): Promise<string> {
  return getMaterialServeUrl(path);
}

/** Does the app's own store hold this file? (Existence check via a 1s URL.) */
export async function materialExistsInStore(path: string): Promise<boolean> {
  const client = storageClient();
  if (!client) return false;
  const { data } = await client.storage.from(BUCKET).createSignedUrl(path, 1);
  return !!data?.signedUrl;
}


/* ------------------------------------------------------------------------
 * THE BROWSER'S DIRECT UPLOAD, AND THE DOCS SIDE COPY
 * ---------------------------------------------------------------------- */

/** Ceiling for a browser upload straight into Supabase Storage. The
 *  project's global cap was 50MB until Sep 9 (raised to 5GB through the
 *  management API), which is why the 150MB, 309MB and every other video
 *  never had a copy the app could open. Kept as a constant so the signing
 *  route can refuse a bigger file in words before a single byte moves. */
export const MAX_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * A ONE-SHOT SIGNED UPLOAD URL into the workspace bucket. The browser PUTs
 * the file body there directly: no app-server hop, no container memory, no
 * load-balancer clock, and Supabase's storage API answers CORS preflights for
 * any origin. The path is built by the caller (server side, never taken from
 * the client), so a grant can only ever land inside the right offering.
 */
export async function createMaterialUploadGrant(
  path: string,
  contentType: string
): Promise<{ uploadUrl: string; uploadHeaders: Record<string, string> }> {
  const client = storageClient();
  if (!client) throw new Error("Material storage is not configured here");
  await ensureBucket();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl)
    throw new Error(error?.message || "Could not start the upload");
  return {
    uploadUrl: data.signedUrl,
    uploadHeaders: {
      "content-type": contentType || "application/octet-stream",
      "x-upsert": "false",
      // The public anon key: already in every page of the app.
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    },
  };
}

/** Drop a half-finished or abandoned object. Best effort. */
export async function removeMaterialFromStore(path: string): Promise<void> {
  const client = storageClient();
  if (!client) return;
  await client.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined);
}

/** A streaming PUT with an explicit Content-Length: S3 refuses chunked
 *  transfer, and fetch() with a stream body would use exactly that. */
function putStream(
  url: string,
  headers: Record<string, string>,
  body: Readable
): Promise<number> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const make = target.protocol === "http:" ? httpRequest : httpsRequest;
    const req = make(target, { method: "PUT", headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode || 0));
    });
    req.on("error", reject);
    body.on("error", reject);
    body.pipe(req);
  });
}

/**
 * THE SIDE COPY INTO FREYA.DOCS, streamed from Supabase so a 1GB recording
 * never sits whole in this process. Runs after the upload has answered.
 * Returns false instead of throwing: the archive missing a copy is a log
 * line, never a rep's problem (Anir, Sep 9: "the Freya Docs is just a side
 * thing").
 */
export async function mirrorMaterialToDocs(
  path: string,
  contentType: string,
  uploadedBy?: string
): Promise<boolean> {
  if (!(await hasDocsStorage())) return false;
  const client = storageClient();
  if (!client) return false;
  let started = false;
  try {
    const { data } = await client.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (!data?.signedUrl) return false;
    const source = await fetch(data.signedUrl);
    if (!source.ok || !source.body) return false;
    const size = Number(source.headers.get("content-length") || 0);
    if (!size) return false;
    const offeringId = path.split("/")[0] || "";
    const { uploadUrl, uploadHeaders } = await docsStorage.requestUpload(
      path,
      contentType || "application/octet-stream",
      { offeringId, ...(uploadedBy ? { uploadedBy } : {}) }
    );
    started = true;
    const status = await putStream(
      uploadUrl,
      { ...uploadHeaders, "Content-Length": String(size) },
      Readable.fromWeb(source.body as unknown as NodeWebReadableStream)
    );
    if (status < 200 || status >= 300) throw new Error(`S3 answered ${status}`);
    await docsStorage.completeUpload(path);
    return true;
  } catch (e) {
    if (started) await docsStorage.abortUpload(path).catch(() => undefined);
    console.error(
      `[materials] Docs side copy failed for ${path}: ${e instanceof Error ? e.message : e}`
    );
    return false;
  }
}

/** Fire-and-forget: the container keeps running after the response. */
export function mirrorMaterialToDocsInBackground(
  path: string,
  contentType: string,
  uploadedBy?: string
): void {
  void mirrorMaterialToDocs(path, contentType, uploadedBy).catch(() => undefined);
}
