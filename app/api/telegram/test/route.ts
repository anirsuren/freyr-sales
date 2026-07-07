import { NextResponse } from "next/server";
import { sendTelegram, getBotInfo } from "@/lib/telegram";
import { hasTelegram } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const bot = await getBotInfo();
  return NextResponse.json({ configured: hasTelegram(), bot });
}

export async function POST() {
  const result = await sendTelegram(
    "✅ <b>Freyr Sales Intelligence</b> is connected. You'll get alerts here for new sessions and logged outcomes."
  );
  return NextResponse.json(result);
}
