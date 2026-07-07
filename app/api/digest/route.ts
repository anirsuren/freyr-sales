import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";
import { hasTelegram } from "@/lib/env";

export const dynamic = "force-dynamic";

// Sends the weekly dashboard digest through the configured channel.
// Email delivery (SMTP) is pending; when a Telegram bot is configured the
// digest is delivered there, otherwise we report that no channel is wired.
export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text || "").slice(0, 3500);
  } catch {}
  if (!text) {
    return NextResponse.json({ ok: false, error: "Empty digest" }, { status: 400 });
  }

  if (!hasTelegram()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      channel: "none",
      message:
        "No delivery channel configured. Add TELEGRAM_BOT_TOKEN (or SMTP) to receive digests.",
    });
  }

  const res = await sendTelegram(text);
  if (res.ok) {
    return NextResponse.json({ ok: true, channel: "telegram" });
  }
  return NextResponse.json(
    { ok: false, channel: "telegram", error: res.error || "send failed" },
    { status: 502 }
  );
}
