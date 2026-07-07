import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { narrateDigest } from "@/lib/claude";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentGoalBar } from "@/components/agent/AgentGoalBar";
import { AgentRunHistory } from "@/components/agent/AgentRunHistory";
import { AgentDigest } from "@/components/agent/AgentDigest";
import { AutopilotScheduleBanner } from "@/components/agent/AutopilotScheduleBanner";
import { DigestScheduleBanner } from "@/components/agent/DigestScheduleBanner";
import {
  nextBestActions,
  buildDigest,
  focusActions,
  autopilotDue,
  cadenceDue,
} from "@/lib/agent";

export const metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

// The goal-driven workspace: set a goal, preview the plan, see what the agent
// did. Lives alongside the chat (the conversational front door at /agent).
export default async function AgentGoalsPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, runs, prefs] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.agentRuns.list(),
      db.agentPrefs.get(),
    ]);
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
  );
  const digest = buildDigest({ runs, actions });
  const narrated = await narrateDigest(digest);
  const digestForView = narrated ? { ...digest, didSummary: narrated } : digest;
  const scheduleDue = autopilotDue(
    prefs?.autopilot_cadence,
    prefs?.autopilot_last_run
  );
  const digestDue = cadenceDue(prefs?.digest_cadence, prefs?.digest_last_sent);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        subtitle="Hand the agent a goal and it lines up the work — research, drafts, next moves. You review and approve everything before anything goes out."
      />

      <AgentGoalBar />

      {scheduleDue && (
        <AutopilotScheduleBanner cadence={prefs?.autopilot_cadence || "daily"} />
      )}
      {digestDue && (
        <DigestScheduleBanner cadence={prefs?.digest_cadence || "daily"} />
      )}

      <AgentDigest digest={digestForView} source={narrated ? "claude" : "mock"} />

      <div className="-mt-2 flex items-center gap-4">
        <Link
          href="/agent/review"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
        >
          Weekly review
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
        <Link
          href="/agent/impact"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
        >
          Agent impact
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <Bot size={17} strokeWidth={1.8} className="text-blue-primary" />
            Recent activity
          </h2>
          <span className="text-[12px] text-text-secondary tnum">
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </span>
        </div>
        {runs.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Nothing yet — set a goal above, or open the{" "}
            <Link href="/agent/inbox" className="text-blue-primary hover:underline">
              To-do
            </Link>{" "}
            to approve and run the agent&apos;s queued work.
          </p>
        ) : (
          <AgentRunHistory runs={runs} />
        )}
      </div>
    </div>
  );
}
