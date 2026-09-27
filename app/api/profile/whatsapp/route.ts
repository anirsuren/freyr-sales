import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { canSendWhatsApp, displayPhone, waMeLink, whatsappConfig } from "@/lib/whatsapp";
import {
  clearWhatsAppLink,
  readWhatsAppLinkState,
  startWhatsAppLink,
} from "@/lib/whatsappLink";

export const dynamic = "force-dynamic";

/** The signed-in member's own WhatsApp link: see it, start it, drop it. */

async function status(scope: NonNullable<Awaited<ReturnType<typeof verifiedRequestMemberScope>>>) {
  const config = whatsappConfig();
  const { link, pending } = await readWhatsAppLinkState(scope);
  return {
    configured: !!config,
    canSend: canSendWhatsApp(config),
    businessNumber: config?.businessNumber ? displayPhone(config.businessNumber) : "",
    link: link ? { number: displayPhone(link.number), linkedAt: link.linkedAt, name: link.name } : null,
    pending: pending
      ? { code: pending.code, expires: pending.expires, waMe: config?.businessNumber ? waMeLink(config.businessNumber, pending.code) : null }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  try {
    return NextResponse.json(await status(scope));
  } catch {
    return NextResponse.json({ error: "WhatsApp settings are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  if (!whatsappConfig()) return NextResponse.json({ error: "WhatsApp is not set up for this workspace yet." }, { status: 503 });
  try {
    await startWhatsAppLink(scope);
    return NextResponse.json(await status(scope));
  } catch {
    return NextResponse.json({ error: "Could not start the link. Try again." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  try {
    await clearWhatsAppLink(scope);
    return NextResponse.json(await status(scope));
  } catch {
    return NextResponse.json({ error: "Could not disconnect. Try again." }, { status: 503 });
  }
}
