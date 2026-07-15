import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { getDataMode } from "@/lib/dataMode";

export const dynamic = "force-dynamic";

const TARGETS: Record<string, string> = {
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  sequence: "Outreach sequence",
};

// "Send to CRM" / "Push to sequence": logs the push as an interaction so it
// shows on the timeline. Live CRM sync is pending; this records the intent.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    logged_by: "Suren Dheen",
  });

  const customer = await db.customers.get(session.customer_id);
  notifyTelegram(
    `🔗 <b>Pushed to ${target}</b>\n${customer?.company_name || "Account"}`
  );

  return NextResponse.json({ ok: true, target });
}
