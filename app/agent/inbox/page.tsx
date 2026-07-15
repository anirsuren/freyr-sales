import {
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentActions } from "@/components/agent/AgentActions";
import { AutopilotPanel } from "@/components/agent/AutopilotPanel";
import { InboxBulkActions } from "@/components/agent/InboxBulkActions";
import { ReworkActions } from "@/components/agent/ReworkActions";
import { nextBestActions, DRAFTABLE, focusActions } from "@/lib/agent";

export const metadata = { title: "Agent Inbox" };
export const dynamic = "force-dynamic";

export default async function AgentInboxPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);
  const lenses = [
    prefs?.focus_industry || null,
    prefs?.only_mine ? "My accounts" : null,
  ].filter(Boolean);
  const lensLabel = lenses.join(" · ");
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
  );
  const needsApproval = actions.filter((a) => !DRAFTABLE.includes(a.kind));
  const canHandle = actions.filter((a) => DRAFTABLE.includes(a.kind));
  const approveCount = needsApproval.filter((a) => a.kind === "approve").length;
  const sendCount = needsApproval.filter((a) => a.kind === "send").length;

  // Pitches the rep sent back for changes — they come back here as tracked
  // rework, with the reason, so a decline isn't a dead end (#67).
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const reworks = sessions
    .filter((s) => s.review_status === "changes_requested")
    .map((s) => ({
      id: s.id,
      company: custById[s.customer_id]?.company_name || "An account",
      note: s.review_note || "",
      reviewer: s.reviewer || null,
    }));

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="To-do"
          subtitle="What's waiting on you — pitches to approve, work the agent sent back, and accounts it can draft outreach for."
        />
        {lensLabel && (
          <span className="inline-flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-blue-primary bg-blue-light rounded-full px-2.5 py-1">
            <Sparkles size={13} strokeWidth={1.9} />
            Lens: {lensLabel} — everything else is hidden
          </span>
        )}
      </div>

      {/* Needs your approval — the human gate */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <ShieldCheck size={17} strokeWidth={1.8} className="text-warning" />
            Needs your approval
          </h2>
          <span className="text-[12px] text-text-secondary tnum">
            {needsApproval.length} item{needsApproval.length === 1 ? "" : "s"}
          </span>
        </div>
        {needsApproval.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting on you"
            description="No pitches in compliance review and nothing approved-but-unsent. You're clear."
          />
        ) : (
          <>
            <InboxBulkActions approveCount={approveCount} sendCount={sendCount} />
            <AgentActions actions={needsApproval} />
          </>
        )}
      </div>

      {/* Sent back for changes — declined pitches come back as tracked rework */}
      {reworks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
              <RotateCcw size={17} strokeWidth={1.8} className="text-error" />
              Sent back for changes
            </h2>
            <span className="text-[12px] text-text-secondary tnum">
              {reworks.length} item{reworks.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-2.5">
            {reworks.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-error/12 text-error">
                    <RotateCcw size={17} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-text-primary truncate">
                      Rework the pitch for {r.company}
                    </p>
                    {r.note && (
                      <p className="text-[12px] text-text-secondary mt-0.5">
                        <span className="font-semibold text-text-primary">
                          Reason:
                        </span>{" "}
                        {r.note}
                      </p>
                    )}
                    {r.reviewer && (
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        Sent back by {r.reviewer}
                      </p>
                    )}
                  </div>
                  <ReworkActions sessionId={r.id} company={r.company} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Agent will handle — the autopilot lane */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={17} strokeWidth={1.8} className="text-blue-primary" />
            Agent will handle
          </h2>
          <span className="text-[12px] text-text-secondary tnum">
            {canHandle.length} item{canHandle.length === 1 ? "" : "s"}
          </span>
        </div>
        {canHandle.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Nothing the agent can auto-draft right now.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <AutopilotPanel />
            </div>
            <AgentActions actions={canHandle} />
          </>
        )}
      </div>
    </div>
  );
}
