import type { AuthenticatedUser } from "./auth";

export const ACCESS_COOKIE = "freyr_access";
export const ACCESS_TTL_SECONDS = 5 * 60;

export type WorkspaceRole = "sales" | "editor" | "admin";
export type AccessGrant = {
  sub: string;
  userId: string;
  email: string | null;
  role: WorkspaceRole;
  workspaceId: string;
  exp: number;
};

export function isApprovalGateEnabled(): boolean {
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
    if (!payload.sub || !payload.userId || !payload.workspaceId || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function providerForAuthMode(): "entra" | "aws-alb" {
  return process.env.AUTH_MODE === "aws-alb" ? "aws-alb" : "entra";
}

export function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
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
