import type { AuthenticatedUser } from "./auth";
import { isAllowedAuthEmail } from "./authEmailPolicy";

export const APP_SESSION_COOKIE = "freyr_session";
export const APP_SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AppSession = AuthenticatedUser & { exp: number };

const encoder = new TextEncoder();

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET || process.env.AUTH_COOKIE_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET or AUTH_COOKIE_SECRET must be at least 32 characters."
    );
  }
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signAppSession(user: AuthenticatedUser): Promise<string> {
  const payload: AppSession = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + APP_SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(encodedPayload)
  );
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyAppSession(token?: string | null): Promise<AppSession | null> {
  if (!token) return null;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      base64UrlDecode(encodedSignature).buffer as ArrayBuffer,
      encoder.encode(encodedPayload)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload))
    ) as AppSession;
    if (
      typeof payload.id !== "string" ||
      !payload.id ||
      typeof payload.name !== "string" ||
      !payload.name ||
      (payload.email !== null && typeof payload.email !== "string") ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === "string") ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      (process.env.AUTH_MODE === "supabase" &&
        !isAllowedAuthEmail(payload.email))
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requestUsesHttps(request: {
  headers: Headers;
  nextUrl: { protocol: string };
}): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
    request.nextUrl.protocol === "https:"
  );
}
