import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync } from "node:fs";

/**
 * WHATSAPP, THE PERSONAL DOOR TO THE AGENT (Anir, Sep 26: "every user to
 * have a number that they can text ... it's like their own personal agent
 * ... it's connected to the agent ... that chat will show up in the agent").
 *
 * Meta's WhatsApp Cloud API. One business number for the workspace; every
 * member links their own phone to it from Settings, and from then on a text
 * from that phone reaches the agent AS that person, with that person's
 * permissions, and lands in that person's Agent history.
 *
 * This file is the wire format only: reading Meta's webhook payload, proving
 * it came from Meta, turning the agent's markdown into WhatsApp's formatting
 * and sending a reply. Nothing here knows who the agent is or what it said.
 */

export type WhatsAppConfig = {
  /** The string Meta echoes back during the one-time webhook handshake. */
  verifyToken: string;
  /** The Meta app secret; every webhook body is signed with it. */
  appSecret: string;
  /** A System User token with whatsapp_business_messaging. Empty = replies are logged, not sent. */
  accessToken: string;
  /** Meta's id for the business phone number (not the number itself). */
  phoneNumberId: string;
  /** The number people text, for display and wa.me links (E.164 like +15550100000). */
  businessNumber: string;
  graphVersion: string;
};

/** The webhook can run (verify + secret) as soon as this returns a value. */
export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim() || "";
  const appSecret = env.WHATSAPP_APP_SECRET?.trim() || "";
  if (!verifyToken || !appSecret) return null;
  return {
    verifyToken,
    appSecret,
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "",
    businessNumber: env.WHATSAPP_BUSINESS_NUMBER?.trim() || "",
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || "v22.0",
  };
}

/** Replies actually leave the building only with a token and a number id. */
export function canSendWhatsApp(config: WhatsAppConfig | null): boolean {
  return !!(config?.accessToken && config.phoneNumberId);
}

/** Meta signs the raw body: `X-Hub-Signature-256: sha256=<hex hmac>`. */
export function verifyWhatsAppSignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string
): boolean {
  if (!header || !appSecret) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

export function signWhatsAppBody(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

/** Digits only. Meta sends "15550100000"; people type "+1 (555) 010-0000". */
export function normalizePhone(value: string): string {
  return String(value ?? "").replace(/\D+/g, "");
}

export function displayPhone(digits: string): string {
  const d = normalizePhone(digits);
  return d ? `+${d}` : "";
}

export type InboundMessage = {
  id: string;
  /** Sender, digits only. */
  from: string;
  /** The sender's WhatsApp profile name, when Meta includes it. */
  name: string;
  timestamp: number;
  phoneNumberId: string;
  type: string;
  /** Empty for anything that is not a text message. */
  text: string;
};

/**
 * Every message in a webhook delivery. Delivery/read receipts (`statuses`)
 * are not messages and are left out; so is anything from a different
 * subscription field.
 */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const root = payload as { object?: unknown; entry?: unknown } | null;
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return out;
  for (const entry of root.entry as Array<{ changes?: unknown }>) {
    const changes = Array.isArray(entry?.changes) ? (entry.changes as Array<Record<string, unknown>>) : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const value = (change.value ?? {}) as Record<string, unknown>;
      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      const phoneNumberId = String(metadata.phone_number_id ?? "");
      const names = new Map<string, string>();
      for (const contact of Array.isArray(value.contacts) ? (value.contacts as Array<Record<string, unknown>>) : []) {
        const waId = contact?.wa_id;
        const profile = (contact?.profile ?? {}) as Record<string, unknown>;
        if (waId) names.set(normalizePhone(String(waId)), String(profile.name ?? "").slice(0, 120));
      }
      for (const message of Array.isArray(value.messages) ? (value.messages as Array<Record<string, unknown>>) : []) {
        if (!message?.id || !message?.from) continue;
        const from = normalizePhone(String(message.from));
        const type = String(message.type ?? "unknown");
        const text = (message.text ?? {}) as Record<string, unknown>;
        const seconds = Number(message.timestamp);
        out.push({
          id: String(message.id),
          from,
          name: names.get(from) ?? "",
          timestamp: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now(),
          phoneNumberId,
          type,
          text: type === "text" ? String(text.body ?? "").trim() : "",
        });
      }
    }
  }
  return out;
}

/** A six-digit link code, and nothing else, in the message. */
export function linkCodeIn(text: string): string | null {
  const match = /^\s*(\d{3})[\s-]?(\d{3})\s*$/.exec(text ?? "");
  return match ? `${match[1]}${match[2]}` : null;
}

function tableCells(line: string): string[] {
  const cells = line.trim().split("|").map((cell) => cell.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * A markdown table has nowhere to go on a phone. Each body row becomes one
 * bullet: the first column, then the rest as "Header value" pairs.
 */
function convertTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!TABLE_ROW.test(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && TABLE_ROW.test(lines[i])) block.push(lines[i++]);
    i--;
    const rows = block.filter((line) => !TABLE_SEPARATOR.test(line)).map(tableCells);
    if (rows.length === 0) continue;
    const [header, ...body] = rows;
    const dataRows = body.length ? body : [header];
    const headers = body.length ? header : header.map(() => "");
    for (const row of dataRows) {
      const [first, ...rest] = row;
      const pairs = rest
        .map((cell, index) => {
          const label = headers[index + 1];
          return cell ? (label ? `${label} ${cell}` : cell) : "";
        })
        .filter(Boolean);
      out.push(`• ${[first, pairs.join(", ")].filter(Boolean).join(": ")}`);
    }
  }
  return out.join("\n");
}

/** A private marker for "this span is bold", so bold and italic never collide. */
const BOLD = "";

/**
 * The agent writes for the web page: markdown with relative links. WhatsApp
 * wants *bold*, _italic_, ~strike~, plain URLs and no tables or headings.
 * Relative app links become absolute so they open from the phone.
 */
export function toWhatsAppText(markdown: string, publicOrigin: string): string {
  const origin = publicOrigin.replace(/\/+$/, "");
  let text = String(markdown ?? "")
    .replace(/<followups>[\s\S]*?<\/followups>/gi, "")
    // A chart is drawn by the web page; on a phone its JSON is noise.
    .replace(/```(?:chart|json)[\s\S]*?```/gi, "")
    .replace(/\r\n/g, "\n");
  text = convertTables(text);
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, "• ");
  text = text.replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, `${BOLD}$1${BOLD}`);
  text = text.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${BOLD}`).replace(/__(.+?)__/g, `${BOLD}$1${BOLD}`);
  text = text.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1_$2_");
  text = text.replace(/([^\n]*)/g, (_match, inner: string) => `*${inner.replace(/^\*+|\*+$/g, "")}*`);
  text = text.replace(/~~(.+?)~~/g, "~$1~");
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const target = url.startsWith("/") ? `${origin}${url}` : url;
    const clean = label.trim();
    return clean === url || clean === target ? target : `${clean} (${target})`;
  });
  text = text.replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "");
  text = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** WhatsApp caps a text at 4096 characters; split on paragraphs first. */
export function chunkWhatsAppText(text: string, max = 4000): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export type SendResult = { ok: boolean; skipped?: boolean; error?: string; messageId?: string };

function graphUrl(config: WhatsAppConfig): string {
  return `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  if (!canSendWhatsApp(config)) {
    // No token yet: the reply is visible in the server log (and in the local
    // trace file when AGENT_TOOL_LOG is set) so the whole path can be
    // exercised before Meta's side exists.
    console.info("[whatsapp] outbound (no access token, not sent)", { to: displayPhone(to), body });
    const trace = process.env.AGENT_TOOL_LOG;
    if (trace) {
      try {
        appendFileSync(trace, `${JSON.stringify({ at: new Date().toISOString(), tool: "whatsapp_outbound", input: { to: displayPhone(to) }, result: body.slice(0, 600) })}\n`);
      } catch {
        // Tracing never fails a reply.
      }
    }
    return { ok: true, skipped: true };
  }
  try {
    const response = await fetchImpl(graphUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      messages?: Array<{ id?: string }>;
    };
    if (!response.ok) return { ok: false, error: data.error?.message || `HTTP ${response.status}` };
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Blue ticks plus the "typing…" indicator while the agent works. Best effort. */
export async function markWhatsAppRead(
  messageId: string,
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!canSendWhatsApp(config)) return;
  await fetchImpl(graphUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/** One tap on the phone: opens the chat with the code already typed. */
export function waMeLink(businessNumber: string, code: string): string | null {
  const digits = normalizePhone(businessNumber);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(code)}` : null;
}
