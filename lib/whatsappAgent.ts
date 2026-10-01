import "server-only";
import { createClient } from "@supabase/supabase-js";
import { APP_SESSION_COOKIE, signAppSession } from "@/lib/appSession";
import { ACCESS_COOKIE, normalizeWorkspaceRole, signAccessGrant } from "@/lib/accessControl";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";
import { downloadWhatsAppMedia } from "@/lib/whatsapp";
import { transcribeVoiceNote, voiceNoteConfigured } from "@/lib/voiceNote";
import { readAgentFileFromBytes } from "@/lib/agentFiles";
import { readFileForAgent } from "@/lib/agentFileReader";
import type { StoredMessage } from "@/lib/agentConversationStore";
import {
  appendAgentExchange,
  latestChannelConversation,
} from "@/lib/agentConversationStore";
import { claimWhatsAppCode, memberForWhatsAppNumber } from "@/lib/whatsappLink";
import {
  chunkWhatsAppText,
  linkCodeIn,
  markWhatsAppRead,
  sendWhatsAppMedia,
  sendWhatsAppText,
  toWhatsAppText,
  uploadWhatsAppMedia,
  type InboundMessage,
  type OutboundMediaKind,
  type WhatsAppConfig,
} from "@/lib/whatsapp";
import { chartSpecsIn, renderChartPng } from "@/lib/whatsappChart";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * A TEXT BECOMES A QUESTION TO THE AGENT, AS THE PERSON WHO SENT IT.
 *
 * The agent already has one door, /api/agent/converse, and everything behind
 * it (permissions, tools, real-mode read-only, provider fallback) is keyed to
 * the signed-in person's cookies. Rather than a second agent for WhatsApp,
 * this signs the same two cookies the sign-in route signs for the member the
 * phone belongs to and knocks on the same door over loopback. The reply is
 * sent back to the phone and written into that member's Agent history as a
 * conversation tagged "whatsapp", so it shows up on the Agent page.
 */

/** A text within six hours continues the same thread; later starts a new one. */
const CONTINUE_WITHIN_MS = 6 * 60 * 60_000;
/** How long the bridge waits for the agent, and when it tells the person the answer is still coming. */
const CONVERSE_TIMEOUT_MS = 240_000;
const SLOW_NOTICE_MS = 60_000;
const HISTORY_TURNS = 20;
/** Wrong codes from an UNLINKED number: this many inside an hour and the number is ignored for the rest of that hour. Five guesses an hour against a six-digit code that lives fifteen minutes is nothing. */
const CODE_FAILS_LIMIT = 5;
const CODE_LOCK_MS = 60 * 60_000;
/** Unknown numbers get the how-to-link reply at most this often. */
const UNLINKED_REPLY_COOLDOWN_MS = 10 * 60_000;
const SEEN_LIMIT = 2_000;

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_WA_SEEN__: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_WA_UNLINKED__: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_WA_CODE_FAILS__: Map<string, { count: number; first: number }> | undefined;
}

/** Meta retries a delivery it did not get a 200 for; the same text must not be answered twice. */
export function alreadyHandled(messageId: string): boolean {
  const seen = (globalThis.__FREYR_WA_SEEN__ ??= new Map());
  if (seen.has(messageId)) return true;
  seen.set(messageId, Date.now());
  if (seen.size > SEEN_LIMIT) {
    const oldest = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, seen.size - SEEN_LIMIT);
    for (const [id] of oldest) seen.delete(id);
  }
  return false;
}

type CodeFailures = { count: number; first: number };
function codeFailures(number: string): CodeFailures {
  const map = (globalThis.__FREYR_WA_CODE_FAILS__ ??= new Map<string, CodeFailures>());
  const entry = map.get(number);
  if (!entry || Date.now() - entry.first > CODE_LOCK_MS) {
    const fresh = { count: 0, first: Date.now() };
    map.set(number, fresh);
    return fresh;
  }
  return entry;
}
function codeLocked(number: string): boolean {
  return codeFailures(number).count >= CODE_FAILS_LIMIT;
}
function noteCodeFailure(number: string): number {
  const entry = codeFailures(number);
  entry.count += 1;
  return entry.count;
}
function clearCodeFailures(number: string): void {
  globalThis.__FREYR_WA_CODE_FAILS__?.delete(number);
}

function unlinkedReplyDue(number: string): boolean {
  const replied = (globalThis.__FREYR_WA_UNLINKED__ ??= new Map());
  const last = replied.get(number) ?? 0;
  if (Date.now() - last < UNLINKED_REPLY_COOLDOWN_MS) return false;
  replied.set(number, Date.now());
  return true;
}

type AppUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  app_role: string | null;
  workspace_id: string | null;
  provider_subject: string | null;
  active: boolean | null;
};

async function appUser(userId: string): Promise<AppUserRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db
    .from("app_users")
    .select("id,email,display_name,app_role,workspace_id,provider_subject,active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppUserRow | null) ?? null;
}

/**
 * The same two cookies the sign-in route signs, for THIS member only. Subject
 * and email come from one app_users row, never mixed (the Aug 20 rule).
 */
async function cookiesFor(user: AppUserRow, scope: WorkspaceMemberScope): Promise<string> {
  const subject = user.provider_subject as string;
  const name = user.display_name || user.email || "Freyr member";
  const [session, grant] = await Promise.all([
    signAppSession({ id: subject, name, email: user.email, roles: [] }),
    signAccessGrant({
      sub: subject,
      userId: user.id,
      email: user.email,
      displayName: name,
      role: normalizeWorkspaceRole(user.app_role) ?? "bd_member",
      workspaceId: scope.workspaceId,
    }),
  ]);
  /* REAL MODE, ALWAYS (Anir, Sep 27: "it should just be real mode"). A phone
     has no Mock switch: the data-view cookie is pinned to live here so the
     agent answers from the real workspace whatever this server's default is. */
  return `${APP_SESSION_COOKIE}=${session}; ${ACCESS_COOKIE}=${grant}; ${DATA_MODE_COOKIE}=live`;
}

type ConverseReply = {
  ok?: boolean;
  reply?: string;
  suggestions?: string[];
  entityContext?: string[];
  pendingAction?: {
    id: string;
    action: string;
    summary: string;
    status: "proposed" | "done" | "cancelled" | "failed" | "expired";
    result?: string;
    link?: string;
  } | null;
  error?: string;
};

export type InboundOptions = {
  config: WhatsAppConfig;
  /** Where this very server answers, e.g. http://127.0.0.1:8080. */
  internalOrigin: string;
  /** Where a phone can open the app, for the links in a reply. */
  publicOrigin: string;
  fetchImpl?: typeof fetch;
};

async function reply(to: string, text: string, options: InboundOptions): Promise<boolean> {
  let delivered = true;
  for (const chunk of chunkWhatsAppText(text)) {
    const sent = await sendWhatsAppText(to, chunk, options.config, options.fetchImpl);
    if (!sent.ok) {
      delivered = false;
      console.error("[whatsapp] send failed", { to, error: sent.error });
      break;
    }
  }
  return delivered;
}

/**
 * NOT JUST TEXT (Anir, Sep 28: "so it can actually not just text but send
 * stuff. if Silvia can do it on iMessage i think our thing can do it on
 * WhatsApp"). Two kinds of "stuff" ride behind the text reply:
 *
 * CHARTS. The agent already answers with ```chart blocks the web draws and
 * toWhatsAppText strips. Those same specs are rendered to PNG here and sent
 * as images, so the phone sees the picture, not a sentence about one.
 *
 * FILES. When the person asked for a document and the reply linked sales
 * materials, the bytes go into the chat as real WhatsApp documents. The
 * fetch knocks on the app's own offering + download routes with this
 * member's cookies, so material access rules hold exactly as on the web.
 * More than three links is a listing, not a fetch, and sends nothing.
 */
const CHART_LIMIT = 2;
const ATTACH_LIMIT = 3;
const IMAGE_CAP = 5 * 1024 * 1024;
const VIDEO_CAP = 16 * 1024 * 1024;
const DOC_CAP = 60 * 1024 * 1024;

/**
 * ASKED FOR, OR PROMISED (Anir, Sep 29).
 *
 * This used to demand a send VERB plus a file NOUN, so "can u send that one
 * here", right after the agent named a deck, matched nothing and no file went
 * out. In a thread the thing being asked for is usually a pronoun, so the verb
 * alone is the right read of the question.
 *
 * The agent's own sentence counts too. Now that it knows it can attach, it
 * answers "I am sending both presentations over to you now" to a plain "are
 * there any slides" — a promise with no send verb in the question. Delivering
 * on what it just said is the whole point; a reply that merely mentions a
 * material still sends nothing.
 */
function wantsFileIn(userText: string, replyMarkdown: string): boolean {
  const asked = /\b(send|sent|share|attach|forward|give|gimme|get|download|drop|pull up|upload)\b/i.test(userText);
  const promised =
    /\b(sending|i'?ll send|i am sending|attaching|attached|here (it|they) (is|are)|on its way|coming over)\b/i.test(
      replyMarkdown
    );
  return asked || promised;
}

type ReplyMaterialLink = { offeringId: string; materialId: string; label: string };

function materialLinksIn(markdown: string): ReplyMaterialLink[] {
  const seen = new Set<string>();
  const links: ReplyMaterialLink[] = [];
  for (const match of String(markdown ?? "").matchAll(
    /\[([^\]\n]+)\]\(\/offerings\/([^)?\s]+)\?[^)\s]*material=([A-Za-z0-9._~%-]+)[^)\s]*\)/g
  )) {
    const key = `${match[2]}::${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      label: match[1].trim(),
      offeringId: decodeURIComponent(match[2]),
      materialId: decodeURIComponent(match[3]),
    });
  }
  return links;
}

type VisibleMaterial = { id: string; label?: string; docsPath?: string };

async function sendReplyAttachments(args: {
  to: string;
  replyMarkdown: string;
  userText: string;
  cookies: string;
  options: InboundOptions;
}): Promise<void> {
  const { to, replyMarkdown, userText, cookies, options } = args;
  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = options.internalOrigin.replace(/\/+$/, "");

  for (const spec of chartSpecsIn(replyMarkdown).slice(0, CHART_LIMIT)) {
    const png = await renderChartPng(spec);
    if (!png) continue;
    const uploaded = await uploadWhatsAppMedia(png, "image/png", "chart.png", options.config, fetchImpl);
    if (uploaded.skipped) continue;
    if (!uploaded.ok || !uploaded.mediaId) {
      console.error("[whatsapp] chart upload failed", { error: uploaded.error });
      continue;
    }
    const sent = await sendWhatsAppMedia(to, "image", uploaded.mediaId, options.config, { caption: spec.title }, fetchImpl);
    if (!sent.ok) console.error("[whatsapp] chart send failed", { error: sent.error });
    else console.log("[whatsapp] chart sent", { to: `...${to.slice(-4)}`, type: spec.type, title: spec.title });
  }

  if (!wantsFileIn(userText, replyMarkdown)) return;
  const links = materialLinksIn(replyMarkdown);
  if (links.length === 0 || links.length > ATTACH_LIMIT) return;

  const offerings = new Map<string, VisibleMaterial[] | null>();
  for (const link of links) {
    try {
      let materials = offerings.get(link.offeringId);
      if (materials === undefined) {
        const response = await fetchImpl(`${origin}/api/offerings/${encodeURIComponent(link.offeringId)}`, {
          headers: { Cookie: cookies },
          signal: AbortSignal.timeout(20_000),
        });
        const data = response.ok
          ? ((await response.json().catch(() => null)) as { offering?: { materials?: VisibleMaterial[] } } | null)
          : null;
        materials = data?.offering?.materials ?? null;
        offerings.set(link.offeringId, materials);
      }
      /* Only a material this member can SEE resolves: the offering route has
         already redacted agent-only files for them. */
      const material = materials?.find((m) => m.id === link.materialId);
      if (!material?.docsPath) continue;

      const download = await fetchImpl(
        `${origin}/api/offerings/${encodeURIComponent(link.offeringId)}/materials/download?path=${encodeURIComponent(material.docsPath)}`,
        { headers: { Cookie: cookies }, signal: AbortSignal.timeout(120_000) }
      );
      if (!download.ok) {
        console.warn("[whatsapp] material download refused", { material: link.materialId, status: download.status });
        continue;
      }
      const bytes = Buffer.from(await download.arrayBuffer());
      const mime = (download.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
      const label = (material.label || link.label || "Document").trim();
      const ext = (material.docsPath.match(/\.([A-Za-z0-9]{1,8})(?:$|\?)/)?.[1] || "").toLowerCase();
      const base = label.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Document";
      const filename = ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;

      let kind: OutboundMediaKind = "document";
      if (/^image\/(png|jpe?g)$/.test(mime) && bytes.byteLength <= IMAGE_CAP) kind = "image";
      else if (mime === "video/mp4" && bytes.byteLength <= VIDEO_CAP) kind = "video";
      else if (bytes.byteLength > DOC_CAP) {
        console.warn("[whatsapp] material too large to send", { material: link.materialId, bytes: bytes.byteLength });
        continue;
      }

      const uploaded = await uploadWhatsAppMedia(bytes, mime, filename, options.config, fetchImpl);
      if (uploaded.skipped) continue;
      if (!uploaded.ok || !uploaded.mediaId) {
        console.error("[whatsapp] material upload failed", { material: link.materialId, error: uploaded.error });
        continue;
      }
      const sent = await sendWhatsAppMedia(
        to,
        kind,
        uploaded.mediaId,
        options.config,
        kind === "document" ? { filename, caption: label } : { caption: label },
        fetchImpl
      );
      if (!sent.ok) console.error("[whatsapp] material send failed", { material: link.materialId, error: sent.error });
      else console.log("[whatsapp] material sent", { to: `...${to.slice(-4)}`, kind, filename, bytes: bytes.byteLength });
    } catch (error) {
      console.error("[whatsapp] attachment failed", { material: link.materialId, error: error instanceof Error ? error.message : error });
    }
  }
}

const HOW_TO_LINK =
  "This number isn't connected to a Freyr account yet. In Freyr, open Settings, then Integrations, then WhatsApp, and text the six-digit code shown there.";

/** A name for a file that arrives without one (photos, videos and recordings never carry a file name). */
const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
};

export async function handleInboundWhatsApp(message: InboundMessage, options: InboundOptions): Promise<void> {
  const { config } = options;
  // Another number on the same Meta app is somebody else's traffic.
  if (config.phoneNumberId && message.phoneNumberId && message.phoneNumberId !== config.phoneNumberId) return;
  // A reaction is a nod, not a message: every thumbs-up on a reply was answered "I can read text and voice notes here" (Sep 30).
  // A sticker is the same kind of nod (Sep 30).
  if (message.type === "reaction" || message.type === "sticker") return;

  const member = await memberForWhatsAppNumber(message.from);
  /* A SIX-DIGIT CODE IS A CLAIM, LINKED OR NOT (Anir, Sep 27: "my other test
     accounts... it'll be the same phone number... it'll just know it's the
     code that's connected to the account"). One phone, several accounts: the
     newest code decides who the phone speaks as, and claimWhatsAppCode drops
     the older link itself. A linked person whose six digits match no pending
     code is just typing a number (an amount, say), so that goes to the agent. */
  const code = linkCodeIn(message.text);
  if (code) {
    // A locked-out number is ignored outright: no reply, nothing to probe with.
    if (!member && codeLocked(message.from)) return;
    const claimed = await claimWhatsAppCode(code, message.from, message.name);
    if (claimed === "expired") {
      await reply(message.from, "That code has expired. Get a new one from Settings, then Integrations, then WhatsApp in Freyr.", options);
      return;
    }
    if (claimed) {
      clearCodeFailures(message.from);
      const user = await appUser(claimed.scope.userId);
      const who = user?.display_name || user?.email || "you";
      await reply(
        message.from,
        `${member ? "Switched to" : "Connected as"} ${who}. Ask your Freyr agent about your accounts, deals, offerings or market news. It works for you, with your access.`,
        options
      );
      return;
    }
    if (!member) {
      if (noteCodeFailure(message.from) >= CODE_FAILS_LIMIT) {
        await reply(message.from, "Too many wrong codes from this phone. Try again in an hour with a fresh code from Settings, then Integrations, then WhatsApp in Freyr.", options);
        return;
      }
      await reply(message.from, "That code doesn't match anything. Check Settings, then Integrations, then WhatsApp in Freyr and text the code shown there.", options);
      return;
    }
  }
  if (!member) {
    if (unlinkedReplyDue(message.from)) await reply(message.from, HOW_TO_LINK, options);
    return;
  }

  /* A VOICE NOTE IS A QUESTION TOO (Anir, Sep 27). Meta hands over the file
     by id; it is transcribed and then treated exactly like typed text, and the
     reply opens with what was heard so a mis-hearing is obvious. */
  let incomingText = message.text;
  let heard: string | null = null;
  /* A VOICE NOTE IS A QUESTION; ANY OTHER FILE IS SOMETHING TO READ (Anir,
     Sep 30: "same for WhatsApp... should be able to read it from there"). A
     voice note recorded in WhatsApp is heard and answered as typed text; a
     photo, document, video or forwarded recording is read by the agent's file
     reader and answered in the thread. */
  const isVoiceNote = message.type === "audio" && !!message.mediaId && message.voice !== false;
  if (isVoiceNote) {
    const media = await downloadWhatsAppMedia(message.mediaId, config, options.fetchImpl);
    let said = "";
    if (media && voiceNoteConfigured()) {
      const speech = await transcribeVoiceNote(media.bytes, media.mimeType, options.fetchImpl);
      if (speech.ok) said = speech.text;
      else console.warn("[whatsapp] voice note not transcribed by Whisper", { from: `...${message.from.slice(-4)}`, reason: speech.reason });
    }
    // Whisper out of credit or refusing: the agent's own reader hears it instead.
    if (!said && media) {
      const reading = await readFileForAgent({ bytes: media.bytes, name: "voice-note.ogg", mime: media.mimeType }).catch(() => null);
      said = (reading?.text ?? "").replace(/^\[[0-9:]+\]\s*(?:Speaker \d+:\s*)?/gm, "").replace(/\s*\n\s*/g, " ").trim();
    }
    if (!said) {
      await reply(message.from, media ? "I couldn't make out that voice note. Try again, or type it." : "I couldn't download that voice note. Try sending it again.", options);
      return;
    }
    heard = said;
    incomingText = said;
  }
  const fileMedia = !isVoiceNote && !!message.mediaId && ["image", "video", "document", "audio"].includes(message.type)
    ? { mediaId: message.mediaId, mime: message.mimeType, filename: message.filename }
    : null;
  if (fileMedia && !incomingText) incomingText = message.caption ?? "";
  if (!incomingText && !fileMedia) {
    await reply(message.from, "I can read text, voice notes, photos, documents and recordings here, but not that kind of message.", options);
    return;
  }

  const user = await appUser(member.scope.userId);
  if (!user || user.active === false) {
    await reply(message.from, "Your Freyr account isn't active, so I can't answer here.", options);
    return;
  }
  /* "?" on a phone got the web app's keyboard shortcuts ("Enter: open the
     search bar") because "?" opens that list in the browser (Sep 30). On
     WhatsApp it means "what can I ask you?". */
  // "What can you do?" still goes to the agent, which answers with their exact access.
  if (/^(?:\?+|help|menu)$/i.test(incomingText.trim())) {
    await reply(
      message.from,
      "I'm your Freyr agent. Ask me things like:\n• What's due for me tomorrow?\n• Brief me\n• Remind me Friday at 3pm to send the Pfizer deck\n• Log a call with Jane at Pfizer: she's interested\n\nI answer with your own access, and I always ask YES or NO before I change anything.",
      options,
    );
    return;
  }
  if (!user.provider_subject) {
    await reply(message.from, "Sign in to Freyr on the web once, then text me again.", options);
    return;
  }

  void markWhatsAppRead(message.id, config, options.fetchImpl);
  /* ONE LINE PER INBOUND, so a "did my text arrive?" can be answered from
     the container log without exposing the number (Sep 27). */
  console.log("[whatsapp] inbound", { from: `...${message.from.slice(-4)}`, member: user.display_name ?? member.scope.userId, chars: incomingText.length, voice: !!heard });

  const latest = await latestChannelConversation(member.scope, "whatsapp");
  const continues = !!latest && Date.now() - latest.updated < CONTINUE_WITHIN_MS;
  const conversationId = continues && latest
    ? latest.id
    : `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const history = continues && latest
    ? latest.messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }))
    : [];

  const fetchImpl = options.fetchImpl ?? fetch;
  let attachments: NonNullable<StoredMessage["attachments"]> = [];
  if (fileMedia) {
    const media = await downloadWhatsAppMedia(fileMedia.mediaId, config, options.fetchImpl);
    if (!media) {
      await reply(message.from, "I couldn't download that file from WhatsApp. Try sending it again.", options);
      return;
    }
    const mime = media.mimeType || fileMedia.mime;
    const ext = EXT_FOR_MIME[mime.split(";")[0].trim()] ?? (message.type === "image" ? "jpg" : message.type === "video" ? "mp4" : message.type === "audio" ? "ogg" : "bin");
    const name = fileMedia.filename || `whatsapp-${message.type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    // A recording or a big file takes a minute or two to read; say so first so the phone does not sit silent.
    if (message.type === "video" || message.type === "audio" || media.bytes.length > 3 * 1024 * 1024) {
      await reply(message.from, `Got ${fileMedia.filename ? `"${fileMedia.filename}"` : `your ${message.type === "video" ? "video" : message.type === "audio" ? "recording" : "file"}`}. Reading it now, I'll answer in a moment.`, options);
    }
    const record = await readAgentFileFromBytes(member.scope, { bytes: media.bytes, name, mime, conversationId, source: "whatsapp" });
    attachments = [{ fileId: record.fileId, name: record.name, ...(record.kind ? { kind: record.kind } : {}), bytes: record.bytes }];
    if (!incomingText.trim()) incomingText = "What is in this file? Give me the key points.";
  }
  const memberCookies = await cookiesFor(user, member.scope);
  let answer: ConverseReply | null = null;
  let timedOut = false;
  /* A slow model turn is not a failure. After a minute the person hears that
     the answer is still coming, and the bridge waits up to four minutes before
     it gives up: the 90 seconds it used to allow was shorter than a tool-heavy
     turn on a slow day, and an answer that lands after the abort is lost for
     good, since only this bridge sends and stores it. */
  const slowNotice = setTimeout(() => {
    void reply(message.from, "Still on it. This one is taking a moment.", options);
  }, SLOW_NOTICE_MS);
  try {
    const response = await fetchImpl(`${options.internalOrigin.replace(/\/+$/, "")}/api/agent/converse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: memberCookies,
      },
      body: JSON.stringify({ message: incomingText, history, path: "/agent", channel: "whatsapp", conversationId, ...(attachments.length ? { attachments: attachments.map((a) => a.fileId) } : {}) }),
      signal: AbortSignal.timeout(CONVERSE_TIMEOUT_MS),
    });
    answer = (await response.json().catch(() => null)) as ConverseReply | null;
    if (!response.ok) {
      console.error("[whatsapp] converse failed", { status: response.status, error: answer?.error });
      /* A 403 is the app's permission answer, not a hiccup: relay it instead of
         asking them to try again in a minute (a solutioning member's account,
         for one, does not open the agent at all). */
      if (response.status === 403) {
        await reply(message.from, typeof answer?.error === "string" && answer.error ? answer.error : "Not available on this account.", options);
        return;
      }
      answer = null;
    }
  } catch (error) {
    timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[whatsapp] converse unreachable", error);
  } finally {
    clearTimeout(slowNotice);
  }

  if (!answer?.ok || !answer.reply) {
    await reply(
      message.from,
      timedOut ? "I ran out of time on that one. Ask again, or break it into smaller steps." : "I couldn't answer that just now. Try again in a minute.",
      options
    );
    return;
  }

  const delivered = await reply(message.from, `${heard ? `Heard: "${heard}"\n\n` : ""}${toWhatsAppText(answer.reply, options.publicOrigin)}`, options);
  console.log("[whatsapp] replied", { to: `...${message.from.slice(-4)}`, member: user.display_name ?? member.scope.userId, delivered, chars: answer.reply.length });
  if (!delivered) return;
  await appendAgentExchange(member.scope, {
    conversationId,
    channel: "whatsapp",
    userText: incomingText,
    agentText: answer.reply,
    ...(attachments.length ? { attachments } : {}),
    suggestions: Array.isArray(answer.suggestions) ? answer.suggestions : [],
    entityContext: Array.isArray(answer.entityContext) ? answer.entityContext : [],
    ...(answer.pendingAction ? { pendingAction: answer.pendingAction } : {}),
  });
  /* After the text, the stuff: chart images and requested files. A failure
     here never takes back the reply that already landed. */
  try {
    await sendReplyAttachments({
      to: message.from,
      replyMarkdown: answer.reply,
      userText: incomingText,
      cookies: memberCookies,
      options,
    });
  } catch (error) {
    console.error("[whatsapp] attachments failed", error instanceof Error ? error.message : error);
  }
}
