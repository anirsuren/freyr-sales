// Telegram bot notifications. Follows the same env-detection pattern as the
// other integrations: no token → no-op. Token lives in TELEGRAM_BOT_TOKEN.
// The chat id auto-resolves from getUpdates once someone messages the bot
// (Telegram bots cannot initiate a chat), and is cached on globalThis.

import { hasTelegram } from "./env";

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_TG_CHAT__: string | null | undefined;
}

export interface TgResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  chatId?: string;
}

export async function resolveChatId(): Promise<string | null> {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  if (globalThis.__FREYR_TG_CHAT__) return globalThis.__FREYR_TG_CHAT__;
  try {
    const res = await fetch(API("getUpdates") + "?limit=10", {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const withChat = (data.result || [])
      .map((u: any) => u.message?.chat?.id ?? u.my_chat_member?.chat?.id)
      .filter(Boolean);
    const id = withChat.length ? String(withChat[withChat.length - 1]) : null;
    globalThis.__FREYR_TG_CHAT__ = id;
    return id;
  } catch {
    return null;
  }
}

export async function getBotInfo(): Promise<{ username: string } | null> {
  if (!hasTelegram()) return null;
  try {
    const res = await fetch(API("getMe"), { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data.ok ? { username: data.result.username } : null;
  } catch {
    return null;
  }
}

export async function sendTelegram(text: string): Promise<TgResult> {
  if (!hasTelegram()) return { ok: false, skipped: true };
  const chatId = await resolveChatId();
  if (!chatId)
    return {
      ok: false,
      error: "No chat yet — message the bot (/start) so it can reply.",
    };
  try {
    const res = await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || "send failed" };
    return { ok: true, chatId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "network error" };
  }
}

// Fire-and-forget: never blocks or throws into the caller's flow.
export function notifyTelegram(text: string): void {
  if (!hasTelegram()) return;
  sendTelegram(text).catch(() => {});
}
