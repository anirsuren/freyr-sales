import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { agentModuleAccess } from "@/lib/agentWorkspace";
import { memberTimeZone } from "@/lib/memberTimeZone";
import { localDay } from "@/lib/agentActionsShared";
import { remindersFor } from "@/lib/agentReminders";
import { armReminderPush } from "@/lib/agentReminderPush";

export const dynamic = "force-dynamic";

/**
 * WHAT IS COMING UP FOR ME, for whoever is signed in: overdue, today, tomorrow,
 * this week. The agent dock reads it to raise a reminder without being asked;
 * the chat reads the same engine, so the nudge and the answer never disagree.
 *
 * Read-only, and only the person's own records in modules they can open.
 */
export async function GET(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  if (!(await canOpenModule("/agent"))) return NextResponse.json({ error: "Not available on this account." }, { status: 403 });

  // Every dock asks this on load, so the reminder clock re-arms on the first
  // page anyone opens after a restart.
  armReminderPush();
  const [modules, timeZone] = await Promise.all([agentModuleAccess(), memberTimeZone(actor.userId)]);
  const horizon = Number(new URL(req.url).searchParams.get("days") || 7);
  const reminders = await remindersFor({
    person: actor.name,
    timeZone,
    horizonDays: Number.isFinite(horizon) ? horizon : 7,
    scope: { workspaceId: actor.workspaceId, userId: actor.userId },
    access: {
      meetings: modules.meetings,
      solutioning: modules.solutioning,
      contracts: modules.contracts,
      opportunities: modules.opportunities,
      customers: modules.customers,
    },
  });
  return NextResponse.json({
    person: actor.name,
    timeZone,
    today: localDay(new Date(), timeZone).ymd,
    reminders,
  });
}
