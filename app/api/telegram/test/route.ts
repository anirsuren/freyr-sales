import { NextResponse } from "next/server";
import { sendTelegram, getBotInfo } from "@/lib/telegram";
import { hasTelegram } from "@/lib/env";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function GET() {
  const bot = await getBotInfo();
  return NextResponse.json({ configured: hasTelegram(), bot });
}

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access is required to test the workspace notification channel." },
      { status: 403 }
    );
  }
  const result = await sendTelegram(
    "✅ <b>Freyr Sales Intelligence</b> is connected. You'll get alerts here for new sessions and logged outcomes."
  );
  return NextResponse.json(result);
}
