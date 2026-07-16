import Link from "next/link";
import {
  ArrowLeft,
  SearchX,
  Phone,
  Mail,
  PhoneCall,
  Timer,
  ThumbsUp,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { SizeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/ui/BackButton";
import { AreaChart, DonutChart, VIZ } from "@/components/charts/Charts";
import { ChartInspector } from "@/components/charts/ChartInspector";
import {
  ContactConversations,
  type ContactConversationItem,
} from "@/components/voice/ContactConversations";
import { getDb } from "@/lib/db";
import { isDialedVoiceCall, listVoiceQueue, mockCallTranscript, type VoiceOutcome } from "@/lib/voice";
import { personaFor } from "@/lib/voicePersonas";
import { formatPhone, formatDateTime, formatDate } from "@/lib/utils";
import { listStoredVoiceConversations, storedVoiceCall } from "@/lib/voiceEvents";

export const metadata = { title: "Contact — voice" };
export const dynamic = "force-dynamic";

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

const OUTCOME_META: Record<VoiceOutcome, { label: string; color: string; chip: string }> = {
  interested: { label: "Interested", color: VIZ.green, chip: "text-success bg-success/10" },
  follow_up: { label: "Follow-up", color: VIZ.blue, chip: "text-blue-primary bg-blue-light" },
  no_answer: { label: "No answer", color: VIZ.amber, chip: "text-warning bg-warning/10" },
  declined: { label: "Declined", color: "#FF3B30", chip: "text-error bg-error/10" },
};
const OUTCOME_ORDER: VoiceOutcome[] = ["interested", "follow_up", "no_answer", "declined"];

// Everything a rep needs about ONE contact who was called: who they are, every
// conversation they've had, and how those calls are trending — the transcript
// is a click deeper (Suren: clicking a contact should NOT jump to a transcript).
export default async function VoiceContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const db = getDb();
  const contact = await db.contacts.get(id);
  if (!contact) {
    return (
      <EmptyState
        icon={SearchX}
        title="Contact not found"
        description="That contact isn't on file. Head back to the voice team."
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

  const customer = contact.customer_id
    ? await db.customers.get(contact.customer_id)
    : null;

  const queuedCalls = listVoiceQueue().filter((q) => q.contact_id === id);
  const storedRecords = (await listStoredVoiceConversations(100)).filter(
    (call) => call.contact_id === id
  );
  const storedRecordById = new Map(storedRecords.map((record) => [record.id, record]));
  const storedCalls = storedRecords.map(storedVoiceCall);
  const storedIds = new Set(
    storedCalls.flatMap((call) => [call.conversation_id, call.call_sid].filter(Boolean))
  );
  const calls = [
    ...storedCalls,
    ...queuedCalls.filter(
      (call) =>
        !storedIds.has(call.conversation_id || "") &&
        !storedIds.has(call.call_sid || "")
    ),
  ]
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  const finished = calls.filter((c) => c.outcome);
  const connected = finished.filter((c) => c.outcome !== "no_answer");
  const connectRate = finished.length
    ? Math.round((connected.length / finished.length) * 100)
    : 0;
  const avgLen = connected.length
    ? Math.round(
        connected.reduce((s, c) => s + (c.duration_secs || 0), 0) / connected.length
      )
    : 0;
  const interestedN = finished.filter((c) => c.outcome === "interested").length;
  const outcomeSegments = OUTCOME_ORDER.map((o) => ({
    label: OUTCOME_META[o].label,
    value: finished.filter((c) => c.outcome === o).length,
    color: OUTCOME_META[o].color,
    // Hover a slice → which calls landed there (offering + date).
    tip: finished
      .filter((c) => c.outcome === o)
      .map((c) => ({
        name: c.offering_name || "Call",
        sub: new Date(c.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: OUTCOME_META[o].label,
      })),
  })).filter((s) => s.value > 0);
  // A sales-useful progression: did each conversation move the buyer closer or
  // farther away? This replaces raw call length, which says little about deal
  // quality on its own.
  const engagementCalls = [...finished]
    .reverse()
    .map((call) => {
      const score = call.outcome === "interested" ? 100 : call.outcome === "follow_up" ? 72 : call.outcome === "no_answer" ? 28 : 8;
      const persona = personaFor(call.category);
      const summary = storedRecordById.get(call.id)?.summary || mockCallTranscript(call, persona?.name || "The agent").summary;
      return { call, score, summary };
    });
  const engagementTrend = engagementCalls.map(({ score }) => score);
  const engagementLabels = engagementCalls.map(({ call }) => formatDate(call.created_at).replace(/,.*$/, ""));
  const engagementTips = engagementCalls.map(({ call, summary }) => [{
    name: OUTCOME_META[call.outcome!].label,
    sub: summary,
    value: call.duration_secs ? fmtLen(call.duration_secs) : "Not connected",
  }]);

  const firstName =
    contact.full_name.replace(/^Dr\.\s*/i, "").split(/\s+/)[0] || "them";
  const about = contact.career_summary || contact.enrichment_summary || "";
  const phone = calls[0]?.phone || contact.phone;
  const hasAnalytics = finished.length > 0;
  const callRecords = calls.map((call) => ({
    id: call.id,
    label: call.offering_name || "Call",
    meta: `${call.outcome ? OUTCOME_META[call.outcome].label : "Queued"} · ${formatDateTime(call.created_at)}`,
    value: call.duration_secs ? fmtLen(call.duration_secs) : "—",
    href: isDialedVoiceCall(call.status) ? `/voice/c/${call.conversation_id || call.id}` : undefined,
  }));
  const conversationItems: ContactConversationItem[] = calls.map((call) => {
    const persona = personaFor(call.category);
    const mockTranscript = mockCallTranscript(call, persona?.name || "The agent");
    const storedRecord = storedRecordById.get(call.id);
    const transcript = storedRecord?.transcript?.length
      ? storedRecord.transcript
          .filter((turn) => Boolean(turn.message))
          .map((turn) => ({
            role: turn.role === "agent" ? ("agent" as const) : ("user" as const),
            speaker: turn.role === "agent" ? storedRecord.agent_name || persona?.name || "Agent" : contact.full_name,
            message: turn.message || "",
            time:
              typeof turn.time_in_call_secs === "number"
                ? fmtLen(Math.max(0, Math.round(turn.time_in_call_secs)))
                : undefined,
          }))
      : mockTranscript.turns.map((turn) => ({
          role: turn.role,
          speaker: turn.role === "agent" ? persona?.name || "Agent" : contact.full_name,
          message: turn.message,
        }));
    const outcome = call.outcome ? OUTCOME_META[call.outcome] : null;
    return {
      id: call.id,
      href: isDialedVoiceCall(call.status)
        ? `/voice/c/${call.conversation_id || call.id}`
        : undefined,
      contactName: contact.full_name,
      company: customer?.company_name || call.company,
      direction: storedRecord?.direction || "outbound",
      agentName: storedRecord?.agent_name || persona?.name,
      agentColor: persona?.color,
      outcomeLabel: outcome?.label,
      outcomeClassName: outcome?.chip,
      startedAt: formatDateTime(call.created_at),
      duration: call.duration_secs ? fmtLen(call.duration_secs) : "Not connected",
      summary: storedRecord?.summary || mockTranscript.summary,
      transcript,
    };
  });

  const kpis = [
    { label: "Calls", value: String(calls.length), sub: calls.length === 1 ? "conversation" : "conversations", icon: PhoneCall },
    { label: "Connect rate", value: `${connectRate}%`, sub: "of dials answered", icon: ThumbsUp },
    { label: "Avg length", value: fmtLen(avgLen), sub: "per answered call", icon: Timer },
    { label: "Interested", value: String(interestedN), sub: "positive signals", icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      {/* router.back() returns to the agent page you drilled in from, not the
          main list (Suren: full back-arrow audit on voice). */}
      <BackButton fallback="/voice" label="Back" />

      {/* Who they are */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar name={contact.full_name} className="w-16 h-16 text-[20px] shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary flex items-center gap-2">
              {contact.full_name}
              <LinkedInLink url={contact.linkedin_url} />
            </h1>
            {contact.job_title && (
              <p className="text-[14px] text-text-secondary mt-0.5">
                {contact.job_title}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[13px] text-text-secondary">
              {customer && (
                <Link
                  href={`/customers/${customer.id}`}
                  className="inline-flex items-center gap-1.5 hover:text-blue-primary transition-colors"
                >
                  <CompanyLogo name={customer.company_name} className="w-5 h-5 text-[8px]" />
                  <span className="font-medium">{customer.company_name}</span>
                  {customer.size_tier && <SizeBadge tier={customer.size_tier} />}
                </Link>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} strokeWidth={1.8} className="text-text-tertiary" />
                  <span className="tnum">{formatPhone(phone)}</span>
                </span>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-blue-primary transition-colors"
                >
                  <Mail size={13} strokeWidth={1.8} className="text-text-tertiary" />
                  {contact.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/contacts/${contact.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-border-light text-text-secondary hover:bg-surface transition-colors shrink-0"
        >
          <ExternalLink size={15} strokeWidth={1.8} />
          Full contact profile
        </Link>
      </div>

      {/* Numbers at a glance — one tight divided strip */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col divide-y sm:flex-row sm:divide-y-0 sm:divide-x divide-border-light">
          {kpis.map((t) => {
            const Ti = t.icon;
            return (
              <div key={t.label} className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-light text-blue-primary">
                  <Ti size={18} strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    {t.label}
                  </p>
                  <p className="text-[21px] font-bold tnum text-text-primary leading-tight">
                    {t.value}
                  </p>
                  <p className="text-[11.5px] text-text-tertiary leading-tight">{t.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Graphs — how this contact's calls are trending */}
      {hasAnalytics && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <ChartInspector
            title={`How ${firstName}'s calls ended`}
            description={`Every finished call with ${firstName}, by outcome.`}
            records={callRecords}
            showSearch={false}
            bodyClassName="pt-3"
            className="lg:col-span-5"
            expandedChildren={
              <div className="flex items-center justify-center gap-10 py-4">
                <DonutChart segments={outcomeSegments} size={280} thickness={28} />
                <div className="space-y-3 text-[14px]">
                  {outcomeSegments.map((segment) => (
                    <p key={segment.label} className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: segment.color }} />
                      <span className="min-w-[100px] text-text-secondary">{segment.label}</span>
                      <span className="font-bold text-text-primary tnum">{segment.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-[108px_1fr] items-center gap-4">
              <div className="relative shrink-0" style={{ width: 108, height: 108 }}>
                <DonutChart segments={outcomeSegments} size={108} thickness={11} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[24px] font-bold leading-none tnum text-text-primary">
                    {finished.length}
                  </span>
                  <span className="text-[10px] text-text-tertiary mt-0.5">calls</span>
                </div>
              </div>
              <div className="space-y-2 text-[12.5px]">
                {outcomeSegments.map((s) => (
                  <p key={s.label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-text-secondary">{s.label}</span>
                    <span className="font-semibold text-text-primary tnum">{s.value}</span>
                  </p>
                ))}
              </div>
            </div>
          </ChartInspector>

          <ChartInspector
            title="Buyer engagement trend"
            description="Whether each call moved this contact closer to a next step."
            records={callRecords}
            showSearch={false}
            bodyClassName="pt-3"
            className="lg:col-span-7"
            expandedChildren={engagementTrend.length > 0 ? <AreaChart data={engagementTrend} height={390} color={VIZ.blue} format="percent" yMax={100} xLabels={engagementLabels} pointTips={engagementTips} /> : null}
          >
            <div>
              {engagementTrend.length > 0 ? (
                <AreaChart data={engagementTrend} height={126} color={VIZ.blue} format="percent" yMax={100} xLabels={engagementLabels} pointTips={engagementTips} />
              ) : (
                <p className="flex h-[108px] items-center text-[13px] text-text-secondary">No finished calls to evaluate yet.</p>
              )}
            </div>
          </ChartInspector>
        </div>
      )}

      {/* What we know about them */}
      {about && (
        <Card>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
            About {firstName}
          </h2>
          <p className="text-[13.5px] text-text-primary leading-relaxed">{about}</p>
        </Card>
      )}

      <ContactConversations firstName={firstName} items={conversationItems} />
    </div>
  );
}
