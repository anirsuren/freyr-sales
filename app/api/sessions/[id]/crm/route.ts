import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { getDataMode } from "@/lib/dataMode";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";
import {
  DEFAULT_LOCAL_USER_IDENTITY,
  GENERIC_USER_IDENTITY,
} from "@/lib/userIdentity";

export const dynamic = "force-dynamic";

const TARGETS: Record<string, string> = {
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  sequence: "Outreach sequence",
};

// "Send to CRM" / "Push to sequence": logs the push as an interaction so it
// shows on the timeline. Live CRM sync is pending; this records the intent.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const principal = await authenticatedRequestPrincipal(req);
  const actorName =
    principal?.name.trim() ||
    (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE
      ? DEFAULT_LOCAL_USER_IDENTITY.name
      : GENERIC_USER_IDENTITY.name);
  const body = await req.json().catch(() => ({}));
  const targetKey = String(body.target || "hubspot");
  const target = TARGETS[targetKey] || "CRM";

  if (getDataMode() === "live") {
    return NextResponse.json(
      { error: `${target} delivery is not configured. Nothing was pushed.` },
      { status: 503 }
    );
  }

  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await db.interactions.create({
    pitch_session_id: (await params).id,
    customer_id: session.customer_id,
    contact_id: session.contact_id,
    outcome: "in_progress",
    notes: `Pushed to ${target} from the pitch workspace`,
    follow_up_date: null,
    logged_by: actorName,
  });

  const customer = await db.customers.get(session.customer_id);
  notifyTelegram(
    `🔗 <b>Pushed to ${target}</b>\n${customer?.company_name || "Account"}`
  );

  return NextResponse.json({ ok: true, target });
}
