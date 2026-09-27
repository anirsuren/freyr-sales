import { NextRequest, NextResponse, after } from "next/server";
import { configuredAuthOrigin } from "@/lib/authOrigin";
import {
  parseInboundMessages,
  verifyWhatsAppSignature,
  whatsappConfig,
} from "@/lib/whatsapp";
import { alreadyHandled, handleInboundWhatsApp } from "@/lib/whatsappAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * META'S WEBHOOK FOR THE WORKSPACE'S WHATSAPP NUMBER.
 *
 * Exempt from the session check in middleware (PUBLIC_WEBHOOK_PATHS) because
 * Meta has no session; instead every POST body must carry Meta's HMAC over
 * the raw bytes, and the app secret is the only thing that can produce it.
 *
 * Meta wants its 200 fast and retries anything slower, so the answer is
 * produced after the response has gone out.
 */

/** The one-time handshake when the webhook URL is saved in the Meta app. */
export async function GET(request: NextRequest) {
  const config = whatsappConfig();
  if (!config) return NextResponse.json({ error: "WhatsApp is not configured." }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === config.verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const config = whatsappConfig();
  if (!config) return NextResponse.json({ error: "WhatsApp is not configured." }, { status: 503 });
  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const messages = parseInboundMessages(payload).filter((message) => !alreadyHandled(message.id));
  if (messages.length > 0) {
    const internalOrigin =
      process.env.WHATSAPP_INTERNAL_ORIGIN?.trim() || `http://127.0.0.1:${process.env.PORT || "3000"}`;
    const publicOrigin = configuredAuthOrigin() || request.nextUrl.origin;
    after(async () => {
      for (const message of messages) {
        try {
          await handleInboundWhatsApp(message, { config, internalOrigin, publicOrigin });
        } catch (error) {
          console.error("[whatsapp] failed to handle", message.id, error);
        }
      }
    });
  }
  return NextResponse.json({ ok: true, received: messages.length });
}
