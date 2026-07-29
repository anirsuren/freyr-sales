import "server-only";

/**
 * FREYA.DOCS STORAGE CLIENT — Sameer's docs-storage API, integration guide
 * of Jul 28 (docs-storage-integration-guide.md). Sales-material files live in
 * FreyaFusion's S3 under our private `freyrsales/freyrsales` namespace; the
 * bytes NEVER pass through this server. We mint signed URLs, the browser
 * talks to S3 directly.
 *
 * The guide's three rules, all honoured here:
 *  1. HTTP 200 is not success — `body.code === 200` is. Never `res.ok`.
 *  2. Replay EVERY `uploadHeaders` entry on the S3 PUT (they're signed).
 *     That's the browser's job; we pass the object through untouched.
 *  3. Upload is two phases: upload-url → PUT → complete. A path stuck
 *     `pending` blocks reuse (409004) until `abort` clears it.
 *
 * Configured entirely by env (DOCS_*). When unset, `hasDocsStorage()` is
 * false and callers fall back to the workspace's own storage, so an
 * unconfigured environment degrades, never breaks.
 */

const BASE = () => process.env.DOCS_API_BASE_URL || "";
const MODULE_ID = () => process.env.DOCS_MODULE_ID || "freyrsales";
const BUCKET = () => process.env.DOCS_BUCKET || "freyrsales";

export function hasDocsStorage(): boolean {
  return Boolean(
    process.env.DOCS_API_BASE_URL &&
      process.env.DOCS_TOKEN_URL &&
      process.env.DOCS_CLIENT_ID &&
      process.env.DOCS_CLIENT_SECRET &&
      process.env.DOCS_SCOPE
  );
}

// ---------- token (cached, refreshed at 80% of its 60-minute life) ----------
let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.DOCS_CLIENT_ID!,
    client_secret: process.env.DOCS_CLIENT_SECRET!,
    scope: process.env.DOCS_SCOPE!,
  });
  const res = await fetch(process.env.DOCS_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Docs token request failed: ${res.status}`);
  const json = await res.json();
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 * 0.8,
  };
  return cached.token;
}

export class DocsApiError extends Error {
  constructor(
    public code: number,
    msg: string
  ) {
    super(`Docs API ${code}: ${msg}`);
  }
}

// ---------- generic call (Rule 1 lives here) ----------
async function callDocs<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST", // every Docs endpoint is POST, even reads
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    cached = null; // expired — next call re-mints
    throw new Error("Docs API unauthorized");
  }
  const json = await res.json();
  if (json.code !== 200) throw new DocsApiError(json.code, json.msg);
  return json.data as T;
}

const loc = (path: string) => ({ moduleId: MODULE_ID(), bucket: BUCKET(), path });

export const docsStorage = {
  requestUpload: (
    path: string,
    contentType: string,
    metadata?: Record<string, string>
  ) =>
    callDocs<{
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
      expiresAt: number;
    }>("/system/api/v1/objects/upload-url", { ...loc(path), contentType, metadata }),

  completeUpload: (path: string) =>
    callDocs<{ fileName: string; metadata: Record<string, string> }>(
      "/system/api/v1/objects/complete",
      loc(path)
    ),

  getDownloadUrl: (path: string) =>
    callDocs<{ fileName: string; presignUrl: string }>(
      "/system/api/v1/objects/download",
      loc(path)
    ),

  abortUpload: (path: string) => callDocs("/system/api/v1/objects/abort", loc(path)),
};
