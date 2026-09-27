import "server-only";
import { createClient } from "@supabase/supabase-js";
import { APP_SESSION_COOKIE, signAppSession } from "@/lib/appSession";
import { ACCESS_COOKIE, normalizeWorkspaceRole, signAccessGrant } from "@/lib/accessControl";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";
import { downloadWhatsAppMedia } from "@/lib/whatsapp";
import { transcribeVoiceNote, voiceNoteConfigured } from "@/lib/voiceNote";
import {
  appendAgentExchange,
  latestChannelConversation,
} from "@/lib/agentConversationStore";
import { claimWhatsAppCode, memberForWhatsAppNumber } from "@/lib/whatsappLink";
import {
  chunkWhatsAppText,
  linkCodeIn,
  markWhatsAppRead,
  sendWhatsAppText,
  toWhatsAppText,
  type InboundMessage,
  type WhatsAppConfig,
} from "@/lib/whatsapp";
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

const HOW_TO_LINK =
  "This number isn't connected to a Freyr account yet. In Freyr, open Settings, then Integrations, then WhatsApp, and text the six-digit code shown there.";

export async function handleInboundWhatsApp(message: InboundMessage, options: InboundOptions): Promise<void> {
  const { config } = options;
  // Another number on the same Meta app is somebody else's traffic.
  if (config.phoneNumberId && message.phoneNumberId && message.phoneNumberId !== config.phoneNumberId) return;

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
  if (message.type === "audio" && message.mediaId) {
    if (!voiceNoteConfigured()) {
      await reply(message.from, "Voice notes aren't switched on here yet. Type your question.", options);
      return;
    }
    const media = await downloadWhatsAppMedia(message.mediaId, config, options.fetchImpl);
    const speech = media ? await transcribeVoiceNote(media.bytes, media.mimeType, options.fetchImpl) : null;
    if (!speech?.ok) {
      console.warn("[whatsapp] voice note not transcribed", { from: `...${message.from.slice(-4)}`, reason: media ? speech?.reason : "download failed" });
      await reply(message.from, "I couldn't make out that voice note. Try again, or type it.", options);
      return;
    }
    heard = speech.text;
    incomingText = speech.text;
  }
  if (!incomingText) {
    await reply(message.from, "I can read text and voice notes here. Type or record your question.", options);
    return;
  }

  const user = await appUser(member.scope.userId);
  if (!user || user.active === false) {
    await reply(message.from, "Your Freyr account isn't active, so I can't answer here.", options);
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
        Cookie: await cookiesFor(user, member.scope),
      },
      body: JSON.stringify({ message: incomingText, history, path: "/agent", channel: "whatsapp", conversationId }),
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
    suggestions: Array.isArray(answer.suggestions) ? answer.suggestions : [],
    entityContext: Array.isArray(answer.entityContext) ? answer.entityContext : [],
    ...(answer.pendingAction ? { pendingAction: answer.pendingAction } : {}),
  });
}
