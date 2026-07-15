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
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { SizeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/ui/BackButton";
import { DonutChart, BarChart, VIZ } from "@/components/charts/Charts";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { getDb } from "@/lib/db";
import { isDialedVoiceCall, listVoiceQueue, mockCallTranscript, type VoiceOutcome } from "@/lib/voice";
import { personaFor } from "@/lib/voicePersonas";
import { formatPhone, formatDateTime, formatDate, cn } from "@/lib/utils";
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
  const storedCalls = (await listStoredVoiceConversations(100))
    .filter((call) => call.contact_id === id)
    .map(storedVoiceCall);
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
  // Oldest → newest so the talk-time bars read left-to-right in time.
  const talkBars = [...calls]
    .reverse()
    .filter((c) => c.duration_secs)
    .map((c) => ({
      label: formatDate(c.created_at).replace(/,.*$/, ""),
      value: c.duration_secs || 0,
      color: VIZ.blue,
      // Each bar is one call — name what it was about, how it landed, how long.
      tip: [
        {
          name: c.offering_name || "Call",
          sub: c.outcome ? OUTCOME_META[c.outcome].label : undefined,
          value: fmtLen(c.duration_secs || 0),
        },
      ],
    }));

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartInspector
            title={`How ${firstName}'s calls ended`}
            description={`Every finished call with ${firstName}, by outcome.`}
            records={callRecords}
            searchPlaceholder="Search calls..."
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
            <div className="flex-1 flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
                <DonutChart segments={outcomeSegments} size={120} thickness={12} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[24px] font-bold leading-none tnum text-text-primary">
                    {finished.length}
                  </span>
                  <span className="text-[10px] text-text-tertiary mt-0.5">calls</span>
                </div>
              </div>
              <div className="space-y-2 text-[13px]">
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
            title="Talk time per call"
            description="How long each conversation ran, oldest to newest."
            records={callRecords}
            searchPlaceholder="Search calls..."
            expandedChildren={talkBars.length > 0 ? <BarChart data={talkBars} height={390} format="duration" /> : null}
          >
            <div className="flex-1 flex items-end">
              {talkBars.length > 0 ? (
                <BarChart data={talkBars} height={150} format="duration" />
              ) : (
                <p className="text-[13px] text-text-secondary">No answered calls yet.</p>
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

      {/* Every conversation — click one to read the transcript */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          Conversations <span className="text-text-primary tnum">({calls.length})</span>
        </h2>
        {calls.length === 0 ? (
          <Card>
            <p className="text-[13px] text-text-secondary">
              No calls with {firstName} yet. Queue one from the Contacts page and
              it lands here with its transcript.
            </p>
          </Card>
        ) : (
          <div className="space-y-3 stagger">
            {calls.map((c) => {
              const persona = personaFor(c.category);
              const summary = mockCallTranscript(c, persona?.name || "The agent").summary;
              const meta = c.outcome ? OUTCOME_META[c.outcome] : null;
              return (
                <Link key={c.id} href={`/voice/c/${c.id}`} className="block group">
                  <Card className="hover:border-blue-subtle hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex items-start gap-3">
                      {persona && (
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white mt-0.5"
                          style={{ background: persona.color }}
                        >
                          <persona.icon size={17} strokeWidth={1.9} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary">
                            {c.offering_name || c.category}
                          </span>
                          {meta && (
                            <span
                              className={cn(
                                "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                                meta.chip
                              )}
                            >
                              {meta.label}
                            </span>
                          )}
                          <span className="text-[12px] text-text-tertiary tnum ml-auto whitespace-nowrap">
                            {formatDateTime(c.created_at)}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-text-tertiary mt-1 flex items-center gap-3">
                          {persona && <span>Handled by {persona.name}</span>}
                          <span className="tnum">
                            {c.duration_secs ? fmtLen(c.duration_secs) : "—"}
                          </span>
                        </p>
                        <p className="text-[13px] text-text-secondary mt-1.5 leading-relaxed line-clamp-2">
                          {summary}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        strokeWidth={1.6}
                        className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform shrink-0 mt-1"
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
