import "server-only";
import { randomInt } from "node:crypto";
import {
  findMemberProfilesBy,
  patchMemberProfileExtras,
  readRawMemberProfile,
} from "@/lib/memberProfile";
import type { WorkspaceMemberScope } from "@/lib/types";
import { normalizePhone } from "@/lib/whatsapp";

/**
 * WHICH PHONE IS WHICH PERSON.
 *
 * The link lives on the member's profile row (member-profile:<ws>:<user>),
 * next to their title and font choice, so unlinking a person's account
 * removes it with everything else of theirs. Linking is proof of possession:
 * Settings shows a six-digit code, the person texts it from their phone, and
 * the number the text came from is the number that gets linked. Nobody types
 * a phone number anywhere.
 */

export type WhatsAppLink = { number: string; linkedAt: string; name: string };
export type WhatsAppPending = { code: string; expires: string };

export const LINK_CODE_TTL_MS = 15 * 60_000;

const NUMBER_PATH = "catalog->profile->whatsapp->>number";
const CODE_PATH = "catalog->profile->whatsappPending->>code";

function linkOf(raw: unknown): WhatsAppLink | null {
  const value = raw as Record<string, unknown> | null;
  const number = normalizePhone(String(value?.number ?? ""));
  if (!number) return null;
  return {
    number,
    linkedAt: typeof value?.linkedAt === "string" ? value.linkedAt : "",
    name: typeof value?.name === "string" ? value.name.slice(0, 120) : "",
  };
}

function pendingOf(raw: unknown): WhatsAppPending | null {
  const value = raw as Record<string, unknown> | null;
  const code = typeof value?.code === "string" && /^\d{6}$/.test(value.code) ? value.code : "";
  const expires = typeof value?.expires === "string" ? value.expires : "";
  if (!code || !expires || Date.parse(expires) <= Date.now()) return null;
  return { code, expires };
}

export async function readWhatsAppLinkState(
  scope: WorkspaceMemberScope
): Promise<{ link: WhatsAppLink | null; pending: WhatsAppPending | null }> {
  const raw = await readRawMemberProfile(scope);
  return { link: linkOf(raw.whatsapp), pending: pendingOf(raw.whatsappPending) };
}

/** A fresh code, unique across every pending link, good for fifteen minutes. */
export async function startWhatsAppLink(scope: WorkspaceMemberScope): Promise<WhatsAppPending> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const clash = await findMemberProfilesBy(CODE_PATH, code);
    if (clash.length > 0) continue;
    const pending: WhatsAppPending = {
      code,
      expires: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
    };
    await patchMemberProfileExtras(scope, { whatsappPending: pending });
    return pending;
  }
  throw new Error("Could not make a link code. Try again.");
}

export async function clearWhatsAppLink(scope: WorkspaceMemberScope): Promise<void> {
  await patchMemberProfileExtras(scope, { whatsapp: undefined, whatsappPending: undefined });
}

export async function memberForWhatsAppNumber(
  number: string
): Promise<{ scope: WorkspaceMemberScope; link: WhatsAppLink } | null> {
  const digits = normalizePhone(number);
  if (!digits) return null;
  const rows = await findMemberProfilesBy(NUMBER_PATH, digits);
  for (const row of rows) {
    const link = linkOf(row.profile.whatsapp);
    if (link) return { scope: row.scope, link };
  }
  return null;
}

/**
 * The text that carries a pending code links the phone it came from. A phone
 * belongs to one person, so the newest proof of possession wins and any older
 * link to the same number is dropped.
 */
export async function claimWhatsAppCode(
  code: string,
  number: string,
  name: string
): Promise<{ scope: WorkspaceMemberScope; link: WhatsAppLink } | "expired" | null> {
  const rows = await findMemberProfilesBy(CODE_PATH, code);
  const row = rows[0];
  if (!row) return null;
  const pending = row.profile.whatsappPending as { expires?: unknown } | undefined;
  const expires = typeof pending?.expires === "string" ? Date.parse(pending.expires) : NaN;
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    await patchMemberProfileExtras(row.scope, { whatsappPending: undefined });
    return "expired";
  }
  const digits = normalizePhone(number);
  if (!digits) return null;
  for (const other of await findMemberProfilesBy(NUMBER_PATH, digits)) {
    if (other.scope.userId === row.scope.userId && other.scope.workspaceId === row.scope.workspaceId) continue;
    await patchMemberProfileExtras(other.scope, { whatsapp: undefined });
  }
  const link: WhatsAppLink = {
    number: digits,
    linkedAt: new Date().toISOString(),
    name: String(name ?? "").slice(0, 120),
  };
  await patchMemberProfileExtras(row.scope, { whatsapp: link, whatsappPending: undefined });
  return { scope: row.scope, link };
}
