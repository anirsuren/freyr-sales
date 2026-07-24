import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";
import {
  DEFAULT_LOCAL_USER_IDENTITY,
  GENERIC_USER_IDENTITY,
} from "@/lib/userIdentity";
import type { ReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTION_TO_STATUS: Record<string, ReviewStatus> = {
  submit: "in_review",
  approve: "approved",
  request_changes: "changes_requested",
};

// Compliance approval workflow (V2 #7): move a pitch through
// draft -> in_review -> approved / changes_requested, recording the reviewer
// and an optional note. Gates the "Send to CRM" action client-side.
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
  const status = ACTION_TO_STATUS[String(body.action)];
  if (!status) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const reviewer =
    status === "in_review" ? null : actorName;
  const updated = await db.pitchSessions.update((await params).id, {
    review_status: status,
    reviewer,
    review_note: body.note ? String(body.note).slice(0, 1000) : null,
    reviewed_at: status === "in_review" ? null : new Date().toISOString(),
  });

  const customer = await db.customers.get(session.customer_id);
  const verb =
    status === "in_review"
      ? "submitted for compliance review"
      : status === "approved"
      ? "approved"
      : "sent back for changes";
  notifyTelegram(
    `📋 <b>Pitch ${verb}</b>\n${customer?.company_name || "Account"}`
  );

  return NextResponse.json({ ok: true, session: updated });
}
