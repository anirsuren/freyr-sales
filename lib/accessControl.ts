import type { AuthenticatedUser } from "./auth";
import { normalizeAuthEmail } from "./authEmailPolicy";

// Version the cookie whenever its identity semantics change. This release adds
// the canonical workspace display name, so accepting a pre-release grant could
// briefly resurrect the old hard-coded/profile-derived identity after deploy.
export const ACCESS_COOKIE = "freyr_access_v2";
// Keep authorization short-lived so a suspension or role change takes effect
// promptly. The longer login session remains valid and can obtain a fresh grant
// through /api/auth/resolve.
export const ACCESS_TTL_SECONDS = 15 * 60;

export type WorkspaceRole = "rep" | "manager" | "admin";

/** The stored names used to be "sales"/"editor". Rows, snapshots and cookies
 * minted before the Aug 13 rename still carry them; every ingress maps them
 * to the canonical names so nothing ever breaks on old data. */
export function normalizeWorkspaceRole(raw: unknown): WorkspaceRole | null {
  if (raw === "admin") return "admin";
  if (raw === "manager" || raw === "editor") return "manager";
  if (raw === "rep" || raw === "sales") return "rep";
  return null;
}
export type AccessGrant = {
  sub: string;
  userId: string;
  email: string | null;
  /** Canonical app_users display name. Provider profile metadata is mutable and
   * must not be the audit identity once workspace access has been approved. */
  displayName: string;
  role: WorkspaceRole;
  workspaceId: string;
  exp: number;
};

export function isApprovalGateEnabled(): boolean {
  // Supabase email/password sign-up is intentionally invite/approval-only.
  // Authentication proves who someone is; it must never grant workspace data
  // access by itself.
  if (process.env.AUTH_MODE === "supabase") return true;
  return (
    (process.env.AUTH_MODE === "entra" || process.env.AUTH_MODE === "aws-alb") &&
    process.env.ACCESS_CONTROL_MODE === "approval"
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signAccessGrant(
  grant: Omit<AccessGrant, "exp">,
  secret = process.env.AUTH_COOKIE_SECRET
): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_COOKIE_SECRET must be at least 32 characters.");
  }
  const payload: AccessGrant = {
    ...grant,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded))
  );
  return `${encoded}.${bytesToBase64Url(signature)}`;
}

export async function verifyAccessGrant(
  token: string | null | undefined,
  secret = process.env.AUTH_COOKIE_SECRET
): Promise<AccessGrant | null> {
  if (!token || !secret || secret.length < 32) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlToBytes(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(encoded)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    ) as AccessGrant;
    const configuredWorkspace = process.env.FREYR_WORKSPACE_ID;
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.workspaceId !== "string" ||
      !payload.workspaceId ||
      typeof payload.displayName !== "string" ||
      payload.displayName.trim().length < 2 ||
      payload.displayName.length > 120 ||
      !normalizeWorkspaceRole(payload.role) ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      (configuredWorkspace && payload.workspaceId !== configuredWorkspace)
    ) {
      return null;
    }
    // A grant minted before the rename says "sales"/"editor"; hand every
    // caller the canonical spelling.
    payload.role = normalizeWorkspaceRole(payload.role)!;
    return payload;
  } catch {
    return null;
  }
}

export function providerForAuthMode(): "entra" | "aws-alb" | "supabase" {
  if (process.env.AUTH_MODE === "supabase") return "supabase";
  return process.env.AUTH_MODE === "aws-alb" ? "aws-alb" : "entra";
}

export function normalizedEmail(value: string | null | undefined): string | null {
  return normalizeAuthEmail(value);
}

export function isBootstrapOwner(user: AuthenticatedUser): boolean {
  const email = normalizedEmail(user.email);
  if (!email) return false;
  return (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}
