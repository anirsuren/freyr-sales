import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  PhoneCall,
  SearchX,
  Timer,
  MessageSquareText,
  Phone,
  ExternalLink,
  CalendarClock,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/ui/BackButton";
import { CallAnalytics } from "@/components/voice/CallAnalytics";
import { getConversation } from "@/lib/elevenlabs";
import { syncConversations } from "@/lib/voiceSync";
import {
  voiceStatus,
  findQueueCall,
  mockCallTranscript,
  type VoiceOutcome,
} from "@/lib/voice";
import { personaFor } from "@/lib/voicePersonas";
import { getDb } from "@/lib/db";
import { formatDateTime, formatPhone, cn } from "@/lib/utils";

export const metadata = { title: "Call transcript" };
export const dynamic = "force-dynamic";

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

const OUTCOME_META: Record<VoiceOutcome, { label: string; chip: string }> = {
  interested: { label: "Interested", chip: "text-success bg-success/10" },
  follow_up: { label: "Follow-up", chip: "text-blue-primary bg-blue-light" },
  no_answer: { label: "No answer", chip: "text-warning bg-warning/10" },
  declined: { label: "Declined", chip: "text-error bg-error/10" },
};

type Turn = { role: "agent" | "user"; message: string; time?: number };
type CallVM = {
  title: string;
  status: "done" | "failed" | "in-progress";
  duration: number;
  startedISO?: string;
  summary?: string;
  turns: Turn[];
  personaName?: string;
  personaColor?: string;
  contactName?: string;
  contactId?: string;
  contactTitle?: string;
  linkedin?: string | null;
  company?: string;
  phone?: string;
  outcome?: VoiceOutcome;
  offering?: string;
};

export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const convo = await getConversation(params.id);
  const status = voiceStatus();
  let vm: CallVM | null = null;

  if (convo) {
    const category =
      Object.entries(status.agents).find(([, id]) => id === convo.agent_id)?.[0] ||
      "Voice agent";
    const persona = personaFor(category);
    const matches = await syncConversations([
      {
        conversation_id: convo.conversation_id,
        agent_id: convo.agent_id,
        status: convo.status,
      },
    ]);
    const match = matches[convo.conversation_id];
    const convoContact = match?.contactId
      ? await getDb().contacts.get(match.contactId).catch(() => null)
      : null;
    vm = {
      title: `${category} call`,
      status:
        convo.status === "done" ? "done" : convo.status === "failed" ? "failed" : "in-progress",
      duration: convo.metadata?.call_duration_secs || 0,
      startedISO: convo.metadata?.start_time_unix_secs
        ? new Date(convo.metadata.start_time_unix_secs * 1000).toISOString()
        : undefined,
      summary: convo.analysis?.transcript_summary || undefined,
      turns: (convo.transcript || [])
        .filter((t) => t.message)
        .map((t) => ({
          role: t.role === "agent" ? "agent" : "user",
          message: t.message as string,
          time: typeof t.time_in_call_secs === "number" ? t.time_in_call_secs : undefined,
        })),
      personaName: persona?.name,
      personaColor: persona?.color,
      contactName: match?.contactName,
      contactId: match?.contactId,
      contactTitle: convoContact?.job_title || undefined,
      linkedin: convoContact?.linkedin_url || null,
      company: match?.company,
      offering: category,
    };
  } else {
    const call = findQueueCall(params.id);
    if (call) {
      const persona = personaFor(call.category);
      const { summary, turns } = mockCallTranscript(call, persona?.name || "The agent");
      const db = getDb();
      const contact = await db.contacts.get(call.contact_id).catch(() => null);
      vm = {
        title: `${call.category} call`,
        status: "done",
        duration: call.duration_secs || 0,
        startedISO: call.created_at,
        summary,
        turns,
        personaName: persona?.name,
        personaColor: persona?.color,
        contactName: call.contact_name,
        contactId: call.contact_id,
        contactTitle: contact?.job_title || undefined,
        linkedin: contact?.linkedin_url || null,
        company: call.company,
        phone: call.phone || contact?.phone || undefined,
        outcome: call.outcome || undefined,
        offering: call.offering_name || call.category,
      };
    }
  }

  if (!vm) {
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

  const outcome = vm.outcome ? OUTCOME_META[vm.outcome] : null;
  // Readable speaker labels for the transcript — the agent persona vs. the
  // contact's first name (Suren: "improve the transcript").
  const agentLabel = vm.personaName || "Voice agent";
  const contactFirst = (vm.contactName || "Contact")
    .replace(/^Dr\.\s*/i, "")
    .split(/\s+/)[0];

  const detailRows = [
    { icon: Timer, label: "Duration", value: fmtLen(vm.duration) },
    { icon: MessageSquareText, label: "Turns", value: String(vm.turns.length) },
    ...(vm.startedISO
      ? [{ icon: CalendarClock, label: "When", value: formatDateTime(vm.startedISO) }]
      : []),
    ...(vm.phone ? [{ icon: Phone, label: "Number", value: formatPhone(vm.phone) }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* router.back() so it returns to wherever you came from — the agent's page
          (Maya) when you drilled in from there, not always the main list (Suren). */}
      <BackButton fallback="/voice" label="Back" />

      {/* Two columns so the width is actually used — transcript + a details rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Transcript */}
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Transcript
            </h2>
            {vm.status !== "done" && (
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                  vm.status === "failed"
                    ? "text-error bg-error/10"
                    : "text-blue-primary bg-blue-light"
                )}
              >
                {vm.status === "failed" ? "Failed" : "In progress"}
              </span>
            )}
          </div>
          {/* Speaker legend — names the two voices so the bubbles read like a
              real call recording, not anonymous left/right blobs. */}
          <div className="flex items-center gap-4 mb-4 text-[11.5px] text-text-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: vm.personaColor || "#0071E3" }}
              />
              {agentLabel} <span className="text-text-tertiary/70">· AI agent</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-primary" />
              {contactFirst}
            </span>
          </div>
          {vm.turns.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              No words captured yet — transcripts appear a moment after the call ends.
            </p>
          ) : (
            <div className="space-y-3.5">
              {vm.turns.map((t, i) => (
                <div
                  key={i}
                  className={cn("flex gap-2.5", t.role === "agent" ? "" : "flex-row-reverse")}
                >
                  <span
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      t.role === "agent"
                        ? "text-white"
                        : "bg-surface text-text-secondary border border-border-light"
                    )}
                    style={t.role === "agent" ? { background: vm.personaColor || "#0071E3" } : undefined}
                  >
                    {t.role === "agent" ? (
                      <Bot size={14} strokeWidth={1.9} />
                    ) : (
                      <PhoneCall size={13} strokeWidth={1.9} />
                    )}
                  </span>
                  <div className={cn("max-w-[80%] min-w-0", t.role === "agent" ? "" : "text-right")}>
                    {/* Speaker name + timestamp on one line above the bubble */}
                    <p
                      className={cn(
                        "flex items-baseline gap-2 mb-1 text-[11.5px]",
                        t.role === "agent" ? "" : "flex-row-reverse"
                      )}
                    >
                      <span className="font-semibold text-text-primary">
                        {t.role === "agent" ? agentLabel : contactFirst}
                      </span>
                      {typeof t.time === "number" && (
                        <span className="text-text-tertiary tnum">{fmtLen(t.time)}</span>
                      )}
                    </p>
                    <div
                      className={cn(
                        "inline-block rounded-xl px-3.5 py-2.5 text-left",
                        t.role === "agent"
                          ? "bg-surface text-text-primary"
                          : "bg-blue-primary text-white"
                      )}
                    >
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">
                        {t.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Details rail */}
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Who was on the call */}
          <Card>
            <div className="flex items-center gap-3">
              {vm.contactName && <Avatar name={vm.contactName} className="w-12 h-12 text-[15px]" />}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
                  <span className="truncate">{vm.contactName || vm.title}</span>
                  {vm.linkedin && (
                    <span className="shrink-0">
                      <LinkedInLink url={vm.linkedin} size={14} />
                    </span>
                  )}
                </p>
                {vm.contactTitle && (
                  <p className="text-[12px] text-text-tertiary truncate">{vm.contactTitle}</p>
                )}
                {vm.company && (
                  <p className="text-[12.5px] text-text-secondary truncate flex items-center gap-1.5">
                    <CompanyLogo name={vm.company} className="w-4 h-4 text-[7px]" />
                    {vm.company}
                  </p>
                )}
              </div>
            </div>
            {outcome && (
              <span
                className={cn(
                  "inline-flex mt-3 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                  outcome.chip
                )}
              >
                {outcome.label}
              </span>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {vm.contactId && (
                <Link
                  href={`/voice/contact/${vm.contactId}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary hover:underline"
                >
                  <ExternalLink size={14} strokeWidth={1.9} />
                  All of{" "}
                  {(vm.contactName || "their")
                    .replace(/^Dr\.\s*/i, "")
                    .split(/\s+/)[0]}
                  &apos;s calls
                </Link>
              )}
              {vm.contactId && (
                <Link
                  href={`/contacts/${vm.contactId}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary"
                >
                  <ExternalLink size={14} strokeWidth={1.8} />
                  Full contact profile
                </Link>
              )}
            </div>
          </Card>

          {/* Call details */}
          <Card>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-3">
              Call details
            </h3>
            <div className="space-y-2.5">
              {vm.personaName && (
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-text-tertiary">Handled by</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: vm.personaColor || "#0071E3" }}
                    />
                    {vm.personaName}
                  </span>
                </div>
              )}
              {vm.offering && (
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-text-tertiary">About</span>
                  <span className="font-medium text-text-primary text-right">{vm.offering}</span>
                </div>
              )}
              {detailRows.map((r) => {
                const RIcon = r.icon;
                return (
                  <div key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="inline-flex items-center gap-1.5 text-text-tertiary">
                      <RIcon size={13} strokeWidth={1.8} />
                      {r.label}
                    </span>
                    <span className="font-medium text-text-primary tnum text-right">{r.value}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* What happened */}
          {vm.summary && (
            <Card className="bg-blue-light/40 border-blue-subtle">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
                What happened
              </h3>
              <p className="text-[13px] text-text-primary leading-relaxed">{vm.summary}</p>
            </Card>
          )}
        </div>
      </div>

      {/* In-depth call analysis below the transcript (Suren): sentiment arc +
          heat-map, talk ratio, objections, and a timeline. */}
      {vm.turns.length > 0 && (
        <CallAnalytics
          turns={vm.turns}
          outcome={vm.outcome ?? null}
          agentLabel={agentLabel}
          contactFirst={contactFirst}
          personaColor={vm.personaColor || undefined}
        />
      )}
    </div>
  );
}
