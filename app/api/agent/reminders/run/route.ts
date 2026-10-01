import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { runReminderPush, runTimedReminders, type ReminderSlot } from "@/lib/agentReminderPush";

export const dynamic = "force-dynamic";

/**
 * THE TEST DOOR FOR THE REMINDER PUSH. Admin only. Dry run unless the body
 * says `send: true`, and even then the once-per-slot log and WhatsApp's
 * 24-hour window still hold. `onlyMe: true` limits it to the caller.
 * `timed: true` runs the at-the-minute pass instead (reminders due now,
 * meetings starting within a quarter hour).
 */
export async function POST(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Only an admin can run the reminder push by hand." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { slot?: string; send?: boolean; onlyMe?: boolean; resend?: boolean; timed?: boolean };
  if (body.timed) {
    const timed = await runTimedReminders({ meetings: true, dryRun: body.send !== true, onlyUserId: body.onlyMe ? actor.userId : undefined });
    return NextResponse.json({ outcomes: timed });
  }
  const slot: ReminderSlot | undefined = body.slot === "morning" || body.slot === "evening" ? body.slot : undefined;
  const outcomes = await runReminderPush({
    slot,
    force: true,
    dryRun: body.send !== true,
    resend: body.resend === true,
    onlyUserId: body.onlyMe ? actor.userId : undefined,
  });
  return NextResponse.json({ outcomes });
}
