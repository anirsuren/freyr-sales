import Link from "next/link";
import { ArrowLeft, Bot, PhoneCall, SearchX, Timer, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getConversation } from "@/lib/elevenlabs";
import { syncConversations } from "@/lib/voiceSync";
import { voiceStatus } from "@/lib/voice";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Call transcript" };
export const dynamic = "force-dynamic";

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// One real conversation, word for word — what the agent said, what the
// prospect said, how it ended. Pulled live from ElevenLabs.
export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const convo = await getConversation(params.id);

  if (!convo) {
    return (
      <EmptyState
        icon={SearchX}
        title="Transcript not available"
        description="This conversation couldn't be loaded — it may still be processing, or the voice service isn't connected in this environment."
        className="py-24"
        action={
          <Link
            href="/voice"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to voice agents
          </Link>
        }
      />
    );
  }

  const status = voiceStatus();
  const category =
    Object.entries(status.agents).find(([, id]) => id === convo.agent_id)?.[0] ||
    "Voice agent";
  const duration = convo.metadata?.call_duration_secs || 0;
  const turns = (convo.transcript || []).filter((t) => t.message);

  // Who was on the line — matched by phone, and stored on their account's
  // timeline (the sync is idempotent, so revisiting never double-logs).
  const matches = await syncConversations([
    {
      conversation_id: convo.conversation_id,
      agent_id: convo.agent_id,
      status: convo.status,
    },
  ]);
  const match = matches[convo.conversation_id];

  return (
    <div className="max-w-[760px] space-y-6">
      <div>
        <Link
          href="/voice"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voice agents
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            {category} call
          </h1>
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
              convo.status === "done"
                ? "text-success bg-success/10"
                : convo.status === "failed"
                ? "text-error bg-error/10"
                : "text-blue-primary bg-blue-light"
            )}
          >
            {convo.status === "done"
              ? "Finished"
              : convo.status === "failed"
              ? "Failed"
              : "In progress"}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-[13px] text-text-secondary mt-1.5">
          <span className="inline-flex items-center gap-1">
            <Timer size={13} strokeWidth={1.8} />
            <span className="tnum">{fmtLen(duration)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareText size={13} strokeWidth={1.8} />
            <span className="tnum">{turns.length}</span> turns
          </span>
          {convo.metadata?.start_time_unix_secs && (
            <span className="tnum">
              {formatDateTime(
                new Date(convo.metadata.start_time_unix_secs * 1000).toISOString()
              )}
            </span>
          )}
          {match && (
            <Link
              href={`/contacts/${match.contactId}`}
              className="inline-flex items-center gap-1 font-medium text-blue-primary hover:underline"
            >
              with {match.contactName}
              {match.company ? ` (${match.company})` : ""}
            </Link>
          )}
        </p>
        {match && convo.status === "done" && (
          <p className="text-[12px] text-text-tertiary mt-1">
            Logged to {match.company || "the account"}&apos;s timeline
            automatically.
          </p>
        )}
      </div>

      {convo.analysis?.transcript_summary && (
        <Card className="bg-blue-light/40 border-blue-subtle">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
            What happened
          </h2>
          <p className="text-[13.5px] text-text-primary leading-relaxed">
            {convo.analysis.transcript_summary}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-4">
          Transcript
        </h2>
        {turns.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No words captured yet — transcripts appear a moment after the call
            ends.
          </p>
        ) : (
          <div className="space-y-3">
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2.5",
                  t.role === "agent" ? "" : "flex-row-reverse"
                )}
              >
                <span
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    t.role === "agent"
                      ? "bg-blue-primary text-white"
                      : "bg-surface text-text-secondary border border-border-light"
                  )}
                >
                  {t.role === "agent" ? (
                    <Bot size={14} strokeWidth={1.9} />
                  ) : (
                    <PhoneCall size={13} strokeWidth={1.9} />
                  )}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-3.5 py-2.5",
                    t.role === "agent"
                      ? "bg-surface text-text-primary"
                      : "bg-blue-primary text-white"
                  )}
                >
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">
                    {t.message}
                  </p>
                  {typeof t.time_in_call_secs === "number" && (
                    <p
                      className={cn(
                        "text-[10.5px] mt-1 tnum",
                        t.role === "agent"
                          ? "text-text-tertiary"
                          : "text-white/70"
                      )}
                    >
                      {fmtLen(t.time_in_call_secs)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
