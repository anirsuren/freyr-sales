import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { patchMemberProfileExtras, readRawMemberProfile } from "@/lib/memberProfile";
import { readWhatsAppLinkState } from "@/lib/whatsappLink";
import { whatsappConfig } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return json({ error: "Verified workspace access required." }, 403);
  try {
    const profile = await readRawMemberProfile(scope);
    const { link } = await readWhatsAppLinkState(scope);
    const skipped = profile.whatsappOnboardingSkippedVersion === 1;
    // Done once the phone is linked or the pop-up was closed; nothing to ask when the workspace has no WhatsApp number.
    const available = !!whatsappConfig()?.businessNumber;
    return json({ resolved: skipped || !!link || !available, skipped });
  } catch {
    return json({ error: "Could not load your setup. Please retry." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return json({ error: "Verified workspace access required." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Enter a valid setup choice." }, 400); }
  try {
    if (body?.action !== "skip") return json({ error: "Choose Skip for now to continue without connecting." }, 400);
    await patchMemberProfileExtras(scope, {
      whatsappOnboardingSkippedVersion: 1,
      whatsappOnboardingSkippedAt: new Date().toISOString(),
      whatsappPending: undefined,
    });
    return json({ resolved: true, skipped: true });
  } catch {
    return json({ error: "Could not save your choice. Please retry." }, 503);
  }
}
