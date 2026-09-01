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
 * Configured by env (DOCS_*) or, when those are absent, by a row in the
 * workspace database — see docsConfig() below for why both. When neither has
 * it, `hasDocsStorage()` is false and callers fall back to the workspace's own
 * storage, so an unconfigured environment degrades, never breaks.
 */

/**
 * WHERE THE CREDENTIALS COME FROM.
 *
 * Environment first — that is how a developer runs it, and how prod will run
 * it once the values sit on the task definition. But the app must not be dead
 * in production merely because nobody has edited an ECS task definition yet,
 * so it falls back to a row in the workspace database it already trusts for
 * everything else.
 *
 * That row is readable only with the service-role key, which is exactly the
 * credential the container already holds; it is no more exposed there than as
 * plaintext env, and unlike env it can be rotated without a deploy.
 */
type DocsConfig = {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  moduleId: string;
  bucket: string;
};

const CONFIG_ROW = "docs-storage-config";

function configFromEnv(): DocsConfig | null {
  const e = process.env;
  if (
    !e.DOCS_API_BASE_URL ||
    !e.DOCS_TOKEN_URL ||
    !e.DOCS_CLIENT_ID ||
    !e.DOCS_CLIENT_SECRET ||
    !e.DOCS_SCOPE
  )
    return null;
  return {
    baseUrl: e.DOCS_API_BASE_URL,
    tokenUrl: e.DOCS_TOKEN_URL,
    clientId: e.DOCS_CLIENT_ID,
    clientSecret: e.DOCS_CLIENT_SECRET,
    scope: e.DOCS_SCOPE,
    moduleId: e.DOCS_MODULE_ID || "freyrsales",
    bucket: e.DOCS_BUCKET || "freyrsales",
  };
}

/**
 * WHERE THIS ENVIRONMENT'S FILES GO, WHEN THE CREDENTIALS ARE SHARED.
 *
 * Anir, Sep 1: "dev and production both have the same doc storage, which is
 * wrong."
 *
 * He is right, and the reason is structural. dev and prod are two ECS accounts
 * in front of ONE Supabase project, so they read one `docs-storage-config` row
 * and therefore one namespace: every dev test upload has been landing in the
 * production `freyrsales/freyrsales` store.
 *
 * The env path above already beats that row — but only ALL AT ONCE. It needs
 * five credential vars before it returns anything, so pointing dev at a
 * different bucket meant copying the client id, secret, token URL and scope
 * onto the dev task definition too: four secrets duplicated to change one
 * word, and two places to rotate them.
 *
 * These two override the namespace on top of WHICHEVER source supplied the
 * credentials. Set DOCS_BUCKET (and/or DOCS_MODULE_ID) on the dev task
 * definition alone and dev writes somewhere else, with prod untouched and no
 * secret copied anywhere.
 *
 * INERT UNTIL SOMEBODY SETS THEM. With neither var present this returns the
 * config exactly as it arrived, so nothing changes in any environment today.
 */
function withNamespaceOverride(cfg: DocsConfig): DocsConfig {
  const e = process.env;
  if (!e.DOCS_BUCKET && !e.DOCS_MODULE_ID) return cfg;
  return {
    ...cfg,
    moduleId: e.DOCS_MODULE_ID || cfg.moduleId,
    bucket: e.DOCS_BUCKET || cfg.bucket,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_DOCS_CONFIG__: DocsConfig | null | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_DOCS_CONFIG_LOAD__: Promise<DocsConfig | null> | undefined;
}

function isDocsConfig(v: unknown): v is DocsConfig {
  const c = v as Partial<DocsConfig> | null;
  return Boolean(
    c && c.baseUrl && c.tokenUrl && c.clientId && c.clientSecret && c.scope
  );
}

async function docsConfig(): Promise<DocsConfig | null> {
  const fromEnv = configFromEnv();
  if (fromEnv) return fromEnv;
  if (globalThis.__FREYR_DOCS_CONFIG__ !== undefined)
    return globalThis.__FREYR_DOCS_CONFIG__;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return null;
  if (!globalThis.__FREYR_DOCS_CONFIG_LOAD__) {
    globalThis.__FREYR_DOCS_CONFIG_LOAD__ = (async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { data } = await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
          .from("offering_catalog_state")
          .select("catalog")
          .eq("id", CONFIG_ROW)
          .maybeSingle();
        const cfg = isDocsConfig(data?.catalog)
          ? withNamespaceOverride({
              ...(data.catalog as DocsConfig),
              moduleId: (data.catalog as DocsConfig).moduleId || "freyrsales",
              bucket: (data.catalog as DocsConfig).bucket || "freyrsales",
            })
          : null;
        if (cfg) globalThis.__FREYR_DOCS_CONFIG__ = cfg;
        else globalThis.__FREYR_DOCS_CONFIG_LOAD__ = undefined;
        return cfg;
      } catch {
        // Do NOT cache a failed read: a blip at boot would otherwise disable
        // document storage for the life of the container.
        globalThis.__FREYR_DOCS_CONFIG_LOAD__ = undefined;
        return null;
      }
    })();
  }
  return globalThis.__FREYR_DOCS_CONFIG_LOAD__;
}

/** Configured in THIS environment, from either source. Async because the
 *  database fallback is a read; the answer is cached for the process. */
export async function hasDocsStorage(): Promise<boolean> {
  return (await docsConfig()) !== null;
}

// ---------- token (cached, refreshed at 80% of its 60-minute life) ----------
let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const cfg = await docsConfig();
  if (!cfg) throw new Error("Freya.Docs is not configured");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: cfg.scope,
  });
  const res = await fetch(cfg.tokenUrl, {
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
  const cfg = await docsConfig();
  if (!cfg) throw new Error("Freya.Docs is not configured");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST", // every Docs endpoint is POST, even reads
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    cached = null; // expired, next call re-mints
    throw new Error("Docs API unauthorized");
  }
  const json = await res.json();
  if (json.code !== 200) throw new DocsApiError(json.code, json.msg);
  return json.data as T;
}

async function loc(path: string) {
  const cfg = await docsConfig();
  return { moduleId: cfg?.moduleId || "freyrsales", bucket: cfg?.bucket || "freyrsales", path };
}

export const docsStorage = {
  requestUpload: (
    path: string,
    contentType: string,
    metadata?: Record<string, string>
  ) =>
    loc(path).then((l) =>
      callDocs<{
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
        expiresAt: number;
      }>("/system/api/v1/objects/upload-url", { ...l, contentType, metadata })
    ),

  completeUpload: (path: string) =>
    loc(path).then((l) =>
      callDocs<{ fileName: string; metadata: Record<string, string> }>(
        "/system/api/v1/objects/complete",
        l
      )
    ),

  getDownloadUrl: (path: string) =>
    loc(path).then((l) =>
      callDocs<{ fileName: string; presignUrl: string }>(
        "/system/api/v1/objects/download",
        l
      )
    ),

  abortUpload: (path: string) =>
    loc(path).then((l) => callDocs("/system/api/v1/objects/abort", l)),
};
