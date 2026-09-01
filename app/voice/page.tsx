import { requireModuleAccess } from "@/lib/moduleAccessServer";
import {
  PhoneCall,
  PhoneOff,
  Bot,
  ListChecks,
  BarChart3,
  Clock,
  Clock3,
  Timer,
  ThumbsUp,
  CalendarClock,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  AudioLines,
  Activity,
  CheckCircle2,
  XCircle,
  BotOff,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { voiceStatus, listVoiceQueue, isDialedVoiceCall, voiceCallStatusLabel, type VoiceOutcome, type VoiceCallStatus } from "@/lib/voice";
import { listConversations } from "@/lib/elevenlabs";
import { syncConversations } from "@/lib/voiceSync";
import { listOfferings } from "@/lib/offerings";
import { VOICE_PERSONAS, personaFor } from "@/lib/voicePersonas";
import { LineChart, BarChart, DonutChart, DonutLegend, Sparkline, VIZ, VIZ_SERIES } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { StatTile } from "@/components/ui/StatTile";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { getDb } from "@/lib/db";
import { formatDateTime, formatPhone, cn } from "@/lib/utils";
import { VoiceLifecyclePanel } from "@/components/voice/VoiceLifecyclePanel";
import { listStoredVoiceConversations, storedVoiceCall } from "@/lib/voiceEvents";

export const metadata = { title: "Voice agents" };
export const dynamic = "force-dynamic";

// Same dial-link helper the contacts grid and the team roster use, so a number
// behaves identically everywhere in the app.
function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// One place to define how each call outcome renders — donut, legend, table.
// Each outcome owns a colour AND an icon (Anir, Jul 26: "the status here is
// clearly not color-coded, and it doesn't have icons").
const OUTCOME_META: Record<
  VoiceOutcome,
  { label: string; color: string; chip: string; icon: LucideIcon }
> = {
  interested: { label: "Interested", color: "#34C759", chip: "text-success bg-success/10", icon: ThumbsUp },
  follow_up: { label: "Follow-up", color: "#0071E3", chip: "text-blue-primary bg-blue-light", icon: CalendarClock },
  // colour must track the `chip` beside it — both are now the burnt-orange
  // warning token, and donut legends render this colour as chip TEXT.
  no_answer: { label: "No answer", color: "#C2410C", chip: "text-warning bg-warning/10", icon: PhoneMissed },
};
const OUTCOME_ORDER: VoiceOutcome[] = ["interested", "follow_up", "no_answer"];

// Every queue state gets its own colour + icon too. The status pill used to be
// a dialed/not-dialed binary, so "Called", "Live call" and "Failed" all painted
// the same green — one glance told you nothing. Labels stay in
// voiceCallStatusLabel() so the wording is defined once.
const STATUS_META: Record<VoiceCallStatus, { chip: string; icon: LucideIcon }> = {
  called: { chip: "text-teal-700 bg-teal-50", icon: PhoneCall },
  initiated: { chip: "text-violet-700 bg-violet-50", icon: PhoneOutgoing },
  in_progress: { chip: "text-blue-primary bg-blue-light", icon: AudioLines },
  analyzing: { chip: "text-indigo-700 bg-indigo-50", icon: Activity },
  completed: { chip: "text-success bg-success/10", icon: CheckCircle2 },
  failed: { chip: "text-error bg-error/10", icon: XCircle },
  waiting_for_number: { chip: "text-warning bg-warning/10", icon: Clock3 },
  no_agent: { chip: "text-rose-700 bg-rose-50", icon: BotOff },
};

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// Voice command center (Anir's rep-lens audit): a rep who queues calls needs
// to SEE them — the agents, the queue, and the numbers — without digging.
// The analytics run on the seeded sample calls (Anir: "show mock data — I
// need to see how the graphs would look") and swap to live ElevenLabs stats
// the moment a phone number connects.
export default async function VoicePage() {
  await requireModuleAccess("/voice");
  const status = voiceStatus();
  const queue = listVoiceQueue();
  const storedCalls = (await listStoredVoiceConversations(100)).map(storedVoiceCall);
  const offerings = listOfferings();
  // Contacts → phone + photo for the call rows (Suren: "how do these contacts
  // not have phone numbers?" + "I need profile pictures here").
  const contactById = new Map(
    (await getDb().contacts.list()).map((c) => [c.id, c])
  );

  // REAL conversations from ElevenLabs (Anir, Jul 4: "I should be able to see
  // all the conversations, all the call statistics"). Live key + not mocked →
  // every actual call (inbound test calls included) lands here with a
  // transcript link. Mock/test env → skipped entirely.
  const categoryByAgent = Object.fromEntries(
    Object.entries(status.agents).map(([c, id]) => [id, c])
  );
  const live = status.wired && process.env.AGENT_FORCE_MOCK !== "1";
  // The ElevenLabs workspace hosts OTHER businesses' agents too — show only
  // calls handled by Freyr's six category agents.
  const realConvos = live
    ? (await listConversations(50)).filter((c) => categoryByAgent[c.agent_id])
    : [];
  // Tie calls to contacts by phone + store finished ones on the account
  // timeline (once). Returns conversation_id -> matched contact.
  const matches = realConvos.length ? await syncConversations(realConvos) : {};
  const doneConvos = realConvos.filter((c) => c.status === "done");
  const realAvg = doneConvos.length
    ? Math.round(
        doneConvos.reduce((s, c) => s + (c.call_duration_secs || 0), 0) /
          doneConvos.length
      )
    : 0;
  const realSuccess = doneConvos.filter(
    (c) => c.call_successful === "success"
  ).length;

  const categories = Object.entries(status.agents).map(([category, agentId]) => {
    const inCategory = offerings.filter(
      (o) => o.offering_category === category
    );
    return {
      category,
      agentId,
      count: inCategory.length,
      names: inCategory.slice(0, 3).map((o) => o.offering_name),
    };
  });

  const placed = queue.filter((q) => isDialedVoiceCall(q.status)).length;
  const waiting = queue.filter((q) => q.status === "waiting_for_number").length;

  // Analytics over finished calls — outcomes, connect rate, talk time.
  const analyticsBase = live && storedCalls.length > 0 ? storedCalls : queue;
  const finished = analyticsBase.filter(
    (q) => (q.status === "called" || q.status === "completed") && q.outcome
  );
  const callerName = (q: (typeof finished)[number]) =>
    contactById.get(q.contact_id)?.full_name || q.phone || "Unknown caller";
  const outcomeCounts = OUTCOME_ORDER.map((o) => ({
    outcome: o,
    n: finished.filter((q) => q.outcome === o).length,
  })).filter((x) => x.n > 0);
  const connected = finished.filter((q) => q.outcome !== "no_answer");
  const connectRate = finished.length
    ? Math.round((connected.length / finished.length) * 100)
    : 0;
  const avgLen = connected.length
    ? Math.round(
        connected.reduce((s, q) => s + (q.duration_secs || 0), 0) /
          connected.length
      )
    : 0;
  const interestedN = finished.filter((q) => q.outcome === "interested").length;
  // Calls grouped by offering category — the second donut in "How calls ended".
  const catCounts = Object.entries(
    finished.reduce((m, q) => {
      const k = q.category || "Other";
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {} as Record<string, number>)
  )
    .map(([category, n]) => ({ category, n }))
    .sort((a, b) => b.n - a.n);
  const outcomeChartSegments = outcomeCounts.map((outcome) => ({
    id: outcome.outcome,
    label: OUTCOME_META[outcome.outcome].label,
    value: outcome.n,
    color: OUTCOME_META[outcome.outcome].color,
    tip: finished
      .filter((call) => call.outcome === outcome.outcome)
      .map((call) => ({
        avatar: callerName(call),
        name: callerName(call),
        sub: call.company,
        value: OUTCOME_META[outcome.outcome].label,
      })),
  }));
  const categoryChartSegments = catCounts.map((category, index) => ({
    id: category.category,
    label: category.category,
    value: category.n,
    color: VIZ_SERIES[index % VIZ_SERIES.length],
    tip: finished
      .filter((call) => call.category === category.category)
      .map((call) => ({
        avatar: callerName(call),
        name: callerName(call),
        sub: call.company,
        value: call.outcome
          ? OUTCOME_META[call.outcome].label
          : undefined,
      })),
  }));
  // Who asked for a callback — the analytics card that's also a to-do list.
  const callbacks = finished.filter((q) => q.outcome === "follow_up");
  // Calling activity, day by day (queue + live calls over the last 14 days).
  const DAY = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const callsPerDay = Array.from({ length: 14 }, (_, i) => {
    const dayStart = today.getTime() - (13 - i) * DAY;
    const inQueue = queue.filter((q) => {
      const t = new Date(q.created_at).getTime();
      return t >= dayStart && t < dayStart + DAY;
    }).length;
    const inReal = realConvos.filter((c) => {
      if (!c.start_time_unix_secs) return false;
      const t = c.start_time_unix_secs * 1000;
      return t >= dayStart && t < dayStart + DAY;
    }).length;
    return inQueue + inReal;
  });
  const dayLabels = [13, 9, 5, 0].map((back) => {
    const d = new Date(today.getTime() - back * DAY);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  // One readable label per data point so the hover tooltip names the exact day.
  const dayPointLabels = callsPerDay.map((_, i) => {
    const d = new Date(today.getTime() - (13 - i) * DAY);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  });
  // Who was called each day — the actual people behind each plotted point
  // (queue calls + live conversations matched to a contact).
  const callsPerDayTips = Array.from({ length: 14 }, (_, i) => {
    const dayStart = today.getTime() - (13 - i) * DAY;
    const qTips = queue
      .filter((q) => {
        const t = new Date(q.created_at).getTime();
        return t >= dayStart && t < dayStart + DAY;
      })
      .map((q) => ({ avatar: q.contact_name, name: q.contact_name, sub: q.company }));
    const rTips = realConvos
      .filter((c) => {
        if (!c.start_time_unix_secs) return false;
        const t = c.start_time_unix_secs * 1000;
        return t >= dayStart && t < dayStart + DAY;
      })
      .map((c) => {
        const m = matches[c.conversation_id];
        const who = m?.contactName || c.agent_name || "Live call";
        return { avatar: who, name: who, sub: m?.company };
      });
    return [...qTips, ...rTips];
  });
  const teamMemberBars = VOICE_PERSONAS.map((persona) => ({
    id: persona.slug,
    label: persona.name,
    value: analyticsBase.filter(
      (call) => call.category === persona.category
    ).length,
    color: persona.color,
    tip: analyticsBase
      .filter((call) => call.category === persona.category)
      .map((call) => ({
        avatar: call.contact_name,
        name: call.contact_name,
        sub: call.company,
        value: call.outcome
          ? OUTCOME_META[call.outcome].label
          : undefined,
      })),
  }));

  const lineCount = Object.keys(status.numbers).length;
  // Same pill on every persona card — a live line and a line still waiting for
  // a number are different states, so each carries its own icon, not just a hue.
  const LineStatusIcon = status.phoneConnected ? PhoneCall : Clock3;
  const tiles = [
    {
      label: "The calling team",
      value: String(categories.length),
      sub: "agents ready",
      icon: Bot,
      warn: false,
    },
    {
      label: "Phone lines",
      value: status.phoneConnected ? String(lineCount || 1) : "Not connected",
      sub: status.phoneConnected ? "live: one per agent" : undefined,
      icon: status.phoneConnected ? PhoneCall : PhoneOff,
      warn: !status.phoneConnected,
    },
    {
      label: "Calls queued",
      value: String(waiting),
      sub: "waiting to dial",
      icon: ListChecks,
      warn: false,
    },
    {
      label: "Calls placed",
      value: String(placed + realConvos.length),
      sub: realConvos.length ? "incl. live calls" : "sample calls",
      icon: PhoneCall,
      warn: false,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voice agents"
        subtitle="One AI caller per offering category: queue calls from any contact or the Contacts list, and watch them here."
      />

      {/* At-a-glance numbers — separate cards, same as Forecast/Pipeline */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile
            key={t.label}
            icon={t.icon}
            label={t.label}
            value={t.value}
            sub={t.sub}
            warn={t.warn}
          />
        ))}
      </section>

      {!status.phoneConnected && (
        <p className="text-[13px] text-text-secondary bg-warning/10 border border-warning/20 rounded-lg px-4 py-3">
          <span className="font-semibold text-warning">One step from live:</span>{" "}
          the agents are built and queued calls are waiting, connect a phone
          number (Twilio → ElevenLabs) and everything below starts dialing.
          Nothing dials silently until then.
        </p>
      )}

      <VoiceLifecyclePanel />

      {/* The team — six personas, each with their own line. Click one for
          their conversations, transcripts and stats. */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          The calling team, one per offering category ({categories.length})
        </h2>
        {/* No `stagger` here — its residual transform traps the hover popover's
            z-index behind the row below it (Suren's blurb must float on top). */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {VOICE_PERSONAS.map((p) => {
            const cat = categories.find((c) => c.category === p.category);
            const line = status.numbers[p.category];
            const Icon = p.icon;
            // Per-persona performance for the hover blurb (Suren: "hover → a
            // little blurb… performance for the voice agents, charts/graphs").
            const pcalls = finished.filter((q) => q.category === p.category);
            const pConn = pcalls.filter((q) => (q.duration_secs || 0) > 0);
            const pInterested = pcalls.filter((q) => q.outcome === "interested").length;
            const pAvg = pConn.length
              ? Math.round(pConn.reduce((s, q) => s + (q.duration_secs || 0), 0) / pConn.length)
              : 0;
            const pConnRate = pcalls.length
              ? Math.round((pConn.length / pcalls.length) * 100)
              : 0;
            const callName = (q: (typeof pcalls)[number]) =>
              contactById.get(q.contact_id)?.full_name || q.phone || "Unknown caller";
            const pDayCalls = Array.from({ length: 14 }, (_, i) => {
              const dayStart = today.getTime() - (13 - i) * DAY;
              return pcalls.filter((q) => {
                const t = new Date(q.created_at).getTime();
                return t >= dayStart && t < dayStart + DAY;
              });
            });
            const pPerDay = pDayCalls.map((c) => c.length);
            // Who was called each day + what happened (Suren: every graph shows
            // the people and the outcome behind the number).
            const pPerDayTips = pDayCalls.map((c) =>
              c.map((q) => ({
                avatar: callName(q),
                name: callName(q),
                sub: q.company,
                value: q.outcome ? OUTCOME_META[q.outcome].label : q.offering_name,
              }))
            );
            // Outcome mix for a second graph in the hover (Suren: "make it bigger,
            // I need more graphs there — not just calls").
            const OUT_COLORS: Record<string, string> = {
              interested: "#34C759",
              follow_up: "#0071E3",
              no_answer: "#C2410C", // matches OUTCOME_META, donut legend rows are colour-on-tint text
            };
            const OUT_LABELS: Record<string, string> = {
              interested: "Interested",
              follow_up: "Follow-up",
              no_answer: "No answer",
            };
            const pOutcomes = ["interested", "follow_up", "no_answer"]
              .map((k) => ({
                label: OUT_LABELS[k],
                value: pcalls.filter((q) => q.outcome === k).length,
                color: OUT_COLORS[k],
                tip: pcalls
                  .filter((q) => q.outcome === k)
                  .map((q) => ({
                    avatar: callName(q),
                    name: callName(q),
                    sub: q.company,
                    value: OUT_LABELS[k],
                  })),
              }))
              .filter((s) => s.value > 0);
            const perfStats = (
              <div>
                {pcalls.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
                      {[
                        { label: "Calls", value: String(pcalls.length) },
                        { label: "Connect rate", value: `${pConnRate}%` },
                        { label: "Interested", value: String(pInterested) },
                        { label: "Avg length", value: fmtLen(pAvg) },
                      ].map((st) => (
                        <div key={st.label}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            {st.label}
                          </p>
                          <p className="text-[16px] font-bold tnum text-text-primary leading-tight">
                            {st.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {pOutcomes.length > 0 && (
                      <div className="mb-3 pt-3 border-t border-border-light">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                          How calls landed
                        </p>
                        <div className="flex items-center gap-3">
                          {/* Hover a slice → the exact people behind that
                              outcome (photo + company), portaled so it can't be
                              clipped. The legend still carries the totals. */}
                          <DonutChart
                            syncId={`voice-outcomes-${p.slug}`}
                            segments={pOutcomes}
                            size={82}
                            thickness={11}
                            centerLabel={String(pOutcomes.reduce((s, o) => s + o.value, 0))}
                            centerSub="calls"
                          />
                          <DonutLegend items={pOutcomes} syncId={`voice-outcomes-${p.slug}`} />
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
                      Calls · last 2 weeks
                    </p>
                    <Sparkline
                      points={pPerDay}
                      color={p.color}
                      height={40}
                      unit="calls"
                      label={`${p.name} activity`}
                      xLabels={pPerDay.map((_, index) =>
                        index === pPerDay.length - 1
                          ? "today"
                          : `${pPerDay.length - 1 - index}d ago`
                      )}
                      pointTips={pPerDayTips}
                    />
                  </>
                ) : (
                  <p className="text-[12.5px] text-text-secondary">
                    No calls yet, {p.name} is ready. Knows {cat?.count || 0}{" "}
                    offering{(cat?.count || 0) === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            );
            return (
              <HoverExpandCard
                key={p.slug}
                stretchSummary
                summary={
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{ background: p.color }}
                      >
                        <Icon size={19} strokeWidth={1.9} />
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                          status.phoneConnected
                            ? "text-success bg-success/10"
                            : "text-warning bg-warning/10"
                        )}
                      >
                        <LineStatusIcon size={10} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
                        {status.phoneConnected ? "Live" : "Ready: awaiting number"}
                      </span>
                    </div>
                    {/* Stretched nav link — the whole card opens the agent, and
                        the phone line below stays its own, separately clickable
                        link (the house pattern from the team roster). */}
                    <Link
                      href={`/voice/agents/${p.slug}`}
                      className="mt-3 block rounded-sm text-[16px] font-semibold text-text-primary outline-none transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-blue-primary"
                    >
                      {p.name}
                      <span className="text-[12px] font-medium text-text-tertiary">
                        {" "}
                        · {p.category}
                      </span>
                    </Link>
                    {/* Two-line floor: Nina's and Kai's taglines run one line
                        and Arjun's two, which used to leave the divider, the
                        phone row and the card bottom at different heights
                        across the row (Suren). Longer taglines still wrap,
                        nothing is clamped or truncated. */}
                    <p className="mb-3 mt-1 min-h-[41px] text-[12.5px] leading-relaxed text-text-secondary">
                      {p.tagline}
                    </p>
                    {/* mt-auto pins this row (and its divider) to the card's
                        bottom edge, so all six line up even if one tagline
                        ever runs three lines. */}
                    <p className="mt-auto flex items-center justify-between gap-2 border-t border-border-light pt-3 text-[12px]">
                      {line ? (
                        <a
                          href={tel(line.number)}
                          title={`Call ${formatPhone(line.number)}`}
                          className="relative z-10 inline-flex w-fit cursor-pointer items-center gap-1.5 font-medium text-text-secondary tnum transition-colors hover:text-blue-primary"
                        >
                          <Phone
                            size={12}
                            strokeWidth={1.9}
                            className="shrink-0 text-blue-primary"
                          />
                          {formatPhone(line.number)}
                        </a>
                      ) : (
                        <span className="text-text-tertiary">
                          {`Knows ${cat?.count || 0} offering${(cat?.count || 0) === 1 ? "" : "s"}`}
                        </span>
                      )}
                      <span className="font-semibold text-blue-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Hover for stats
                      </span>
                    </p>
                  </>
                }
                extra={perfStats}
              />
            );
          })}
        </div>
      </section>

      {/* LIVE conversations — straight from ElevenLabs, transcripts included.
          Always here when the stack is live, so past calls are never hidden. */}
      {live && (
        <section>
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
            <PhoneCall size={15} strokeWidth={1.9} className="text-success" />
            Live conversations
            <span className="text-text-primary tnum">({realConvos.length})</span>
          </h2>
          {realConvos.length === 0 && (
            <Card>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                No live calls yet, every conversation lands here the moment it
                happens, with its transcript one click away. Call any team
                member&apos;s line (or run the voice agent on contacts with
                phone numbers) and watch it appear.
              </p>
            </Card>
          )}
          {realConvos.length > 0 && (
          <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Real calls", value: String(realConvos.length) },
              { label: "Avg length", value: fmtLen(realAvg) },
              {
                label: "Went well",
                value: doneConvos.length
                  ? `${Math.round((realSuccess / doneConvos.length) * 100)}%`
                  : "-",
              },
              {
                label: "In progress",
                value: String(
                  realConvos.filter(
                    (c) => c.status === "in-progress" || c.status === "processing"
                  ).length
                ),
              },
            ].map((t) => (
              <Card key={t.label} className="py-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {t.label}
                </span>
                <span className="block text-[22px] font-bold leading-none tnum text-text-primary mt-2">
                  {t.value}
                </span>
              </Card>
            ))}
          </div>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-border-light">
                    {["Agent", "Contact", "Direction", "Status", "Length", "Started", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {realConvos.map((c) => {
                    const persona = personaFor(categoryByAgent[c.agent_id] || "");
                    return (
                    <tr key={c.conversation_id}>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-text-primary whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {persona && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: persona.color }}
                            />
                          )}
                          {persona
                            ? `${persona.name} · ${persona.category}`
                            : c.agent_name || "Agent"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] whitespace-nowrap">
                        {matches[c.conversation_id] ? (
                          <Link
                            href={`/contacts/${matches[c.conversation_id].contactId}`}
                            className="font-medium text-text-primary hover:text-blue-primary"
                          >
                            {matches[c.conversation_id].contactName}
                            {matches[c.conversation_id].company && (
                              <span className="text-text-tertiary font-normal">
                                {" "}
                                · {matches[c.conversation_id].company}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-[12.5px] text-text-tertiary">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary capitalize whitespace-nowrap">
                        {c.direction || "-"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {(() => {
                          // Three real states, three colours AND three icons —
                          // a colour-only pill made a failed call read the same
                          // as one still on the phone.
                          const sm =
                            c.status === "done"
                              ? { label: "Finished", chip: "text-success bg-success/10", icon: CheckCircle2 }
                              : c.status === "failed"
                                ? { label: "Failed", chip: "text-error bg-error/10", icon: XCircle }
                                : { label: "In progress", chip: "text-blue-primary bg-blue-light", icon: AudioLines };
                          const StatusIcon = sm.icon;
                          return (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                                sm.chip
                              )}
                            >
                              <StatusIcon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
                              {sm.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary tnum whitespace-nowrap">
                        {c.call_duration_secs ? fmtLen(c.call_duration_secs) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                        {c.start_time_unix_secs
                          ? formatDateTime(
                              new Date(c.start_time_unix_secs * 1000).toISOString()
                            )
                          : "-"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/voice/c/${c.conversation_id}`}
                          className="text-[12px] font-semibold text-blue-primary hover:underline"
                        >
                          Transcript →
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          </>
          )}
        </section>
      )}

      {/* Call queue */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          Call queue <span className="text-text-primary tnum">({queue.length})</span>
        </h2>
        {queue.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={PhoneCall}
              title="No calls queued yet"
              description="Open a contact and start an AI voice call to queue the first one. You can also tick several contacts on the Contacts page and send one agent down the whole list."
            />
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            {/* Cap to ~10 rows and scroll inside — 72 rows shouldn't push the
                whole page down (Suren). Sticky header stays put while you scroll. */}
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-light">
                    {["Contact", "Company", "About", "Status", "Outcome", "Length", "Queued", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 bg-surface px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {[...queue]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    )
                    .map((q) => {
                    const phone = q.phone || contactById.get(q.contact_id)?.phone;
                    // Clicking a contact opens their voice profile (who they are
                    // + every call + graphs), not straight into one transcript.
                    const href = `/voice/contact/${q.contact_id}`;
                    // Status paints from the STATUS ITSELF (not a was-it-dialed
                    // binary) and outcome from the OUTCOME — two columns, two
                    // meanings, each with its own colour + icon.
                    const statusMeta = STATUS_META[q.status];
                    const StatusIcon = statusMeta.icon;
                    const outcomeMeta = q.outcome ? OUTCOME_META[q.outcome] : null;
                    const OutcomeIcon = outcomeMeta?.icon;
                    return (
                    <tr
                      key={q.id}
                      className="group border-l-[3px] border-l-transparent transition-[background-color,border-color,box-shadow] duration-200 hover:border-l-blue-primary hover:bg-blue-light/20 hover:shadow-[0_7px_20px_rgba(10,115,232,0.08)]"
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link href={href} className="flex items-center gap-2.5">
                          <Avatar
                            name={q.contact_name}
                            className="h-8 w-8 shrink-0 text-[11px] transition-[transform,box-shadow] duration-200 group-hover:scale-110 group-hover:shadow-[0_4px_12px_rgba(10,115,232,0.22)]"
                          />
                          <span className="min-w-0 transition-transform duration-200 group-hover:translate-x-0.5">
                            <span className="block truncate text-[13px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
                              {q.contact_name}
                            </span>
                            {phone && (
                              <span className="block text-[11.5px] text-text-tertiary tnum">
                                {formatPhone(phone)}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-secondary whitespace-nowrap transition-colors duration-200 group-hover:text-text-primary">
                        {q.company ? (
                          <span className="flex items-center gap-2.5">
                            <CompanyLogo
                              name={q.company}
                              className="h-7 w-7 rounded-lg text-[7px] transition-transform duration-200 group-hover:scale-105"
                            />
                            <span>{q.company}</span>
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-secondary transition-colors duration-200 group-hover:text-text-primary">
                        {q.offering_name}
                        {q.offering_name !== q.category && (
                          <span className="text-text-tertiary">
                            {" "}
                            · {q.category}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5 transition-[transform,box-shadow] duration-200 group-hover:-translate-y-px group-hover:scale-[1.04] group-hover:shadow-sm",
                            statusMeta.chip
                          )}
                        >
                          <StatusIcon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
                          {voiceCallStatusLabel(q.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {outcomeMeta && OutcomeIcon ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5 transition-[transform,box-shadow] duration-200 group-hover:-translate-y-px group-hover:scale-[1.04] group-hover:shadow-sm",
                              outcomeMeta.chip
                            )}
                          >
                            <OutcomeIcon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
                            {outcomeMeta.label}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-text-tertiary">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary tnum whitespace-nowrap transition-colors duration-200 group-hover:font-semibold group-hover:text-blue-primary">
                        {q.duration_secs ? fmtLen(q.duration_secs) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap transition-colors duration-200 group-hover:text-text-secondary">
                        {formatDateTime(q.created_at)}
                      </td>
                      <td className="w-10 px-2 py-3.5 text-right">
                        <Link
                          href={href}
                          aria-label={`Open ${q.contact_name}'s call history`}
                          className="inline-flex h-7 w-7 -translate-x-1 items-center justify-center rounded-md text-blue-primary opacity-0 transition-[opacity,transform,background-color] duration-200 group-hover:translate-x-0 group-hover:opacity-100 hover:bg-blue-light focus:translate-x-0 focus:opacity-100"
                        >
                          <ArrowRight size={15} strokeWidth={2} />
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Call analytics — outcomes donut + connect rate + talk time */}
      <section>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          <BarChart3 size={15} strokeWidth={1.9} className="text-blue-primary" />
          Call analytics
        </h2>
        {finished.length === 0 ? (
          <Card>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Conversation stats, durations, outcomes, interest signals and
              transcripts, appear here automatically once calls start going
              out. ElevenLabs records every conversation, so nothing extra to
              set up.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* One even row — three cards, same height (Anir: symmetry). */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_.9fr_.95fr] gap-4">
              <Card className="flex flex-col transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_14px_34px_rgba(10,115,232,0.11)]">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Call breakdown
                  </h3>
                  <div className="flex flex-wrap justify-end gap-2">
                    <ExpandedChartModal
                      title="Calls by outcome"
                      subtitle="How finished calls ended."
                      triggerLabel="Outcomes"
                      chart={{
                        kind: "donut",
                        segments: outcomeChartSegments,
                        centerLabel: String(finished.length),
                        centerSub: "calls",
                        format: "number",
                      }}
                    />
                    <ExpandedChartModal
                      title="Calls by category"
                      subtitle="What the finished calls were about."
                      triggerLabel="Categories"
                      chart={{
                        kind: "donut",
                        segments: categoryChartSegments,
                        centerLabel: String(catCounts.length),
                        centerSub: "topics",
                        format: "number",
                      }}
                    />
                  </div>
                </div>
                <p className="text-[12px] text-text-tertiary mb-3">
                  How calls ended, and what they were about. Hover for details.
                </p>
                <div className="flex-1 grid grid-cols-2 items-start gap-4 content-start">
                  <div className="flex flex-col items-center">
                    <DonutChart
                      segments={outcomeChartSegments}
                      size={124}
                      thickness={14}
                      centerLabel={String(finished.length)}
                      centerSub="calls"
                    />
                    <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      By outcome
                    </p>
                    <ul className="mt-3 w-full space-y-1.5">
                      {outcomeCounts
                        .filter((o) => o.n > 0)
                        .map((o) => (
                          <li
                            key={o.outcome}
                            className="-mx-1 grid grid-cols-[8px_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded px-1 text-[12px] transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-surface"
                          >
                            <span
                              className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full"
                              style={{ background: OUTCOME_META[o.outcome].color }}
                            />
                            <span className="min-w-0 leading-[1.35] text-text-secondary">
                              {OUTCOME_META[o.outcome].label}
                            </span>
                            <span className="tnum text-right font-semibold leading-[1.35] text-text-primary">
                              {o.n}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div className="flex flex-col items-center">
                    <DonutChart
                      segments={categoryChartSegments}
                      size={124}
                      thickness={14}
                      centerLabel={String(catCounts.length)}
                      centerSub="topics"
                    />
                    <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      By category
                    </p>
                    <ul className="mt-3 w-full space-y-1.5">
                      {catCounts.map((c, i) => (
                          <li
                            key={c.category}
                            className="-mx-1 grid grid-cols-[8px_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded px-1 text-[12px] transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-surface"
                          >
                            <span
                              className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full"
                              style={{ background: VIZ_SERIES[i % VIZ_SERIES.length] }}
                            />
                            <span className="min-w-0 leading-[1.35] text-text-secondary">
                              {c.category}
                            </span>
                            <span className="tnum text-right font-semibold leading-[1.35] text-text-primary">
                              {c.n}
                            </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_14px_34px_rgba(10,115,232,0.11)]">
                <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                  Call quality
                </h3>
                <p className="text-[12px] text-text-tertiary mb-3">
                  How the conversations are going.
                </p>
                <div className="flex-1 grid grid-cols-2 gap-x-5 content-between py-1">
                  {[
                    { icon: Phone, label: "Total calls", value: String(finished.length) },
                    { icon: PhoneIncoming, label: "Connected", value: String(connected.length) },
                    { icon: PhoneCall, label: "Connect rate", value: `${connectRate}%` },
                    { icon: Timer, label: "Avg length", value: fmtLen(avgLen) },
                    { icon: ThumbsUp, label: "Interested", value: String(interestedN) },
                    { icon: Clock, label: "Follow-ups", value: String(finished.filter((q) => q.outcome === "follow_up").length) },
                    { icon: PhoneMissed, label: "No answer", value: String(finished.filter((q) => q.outcome === "no_answer").length) },
                  ].map((st) => {
                    const StIcon = st.icon;
                    return (
                      <div key={st.label} className="group/stat -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-blue-light/35">
                        <span className="w-9 h-9 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/stat:scale-110">
                          <StIcon size={16} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            {st.label}
                          </span>
                          <span className="block text-[19px] font-bold leading-tight tnum text-text-primary">
                            {st.value}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="flex flex-col transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_14px_34px_rgba(10,115,232,0.11)]">
                <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                  Callbacks to make
                </h3>
                <p className="text-[12px] text-text-tertiary mb-3">
                  They asked to be called back, don&apos;t leave them waiting.
                </p>
                {callbacks.length === 0 ? (
                  <p className="flex-1 flex items-center text-[13px] text-text-secondary">
                    None owed, every follow-up is handled.
                  </p>
                ) : (
                  // `max-h-[300px]` was fighting `flex-1`: the cap won, so the
                  // list stopped 300px in while the card still had room and a
                  // whole further row visibly fitted underneath (Anir, Jul 27:
                  // "literally another one could fit there"). min-h-0 lets the
                  // flex child actually shrink, so the list now fills whatever
                  // height the card has and only then scrolls.
                  <ul className="min-h-0 flex-1 divide-y divide-border-light overflow-y-auto -mr-2 pr-2">
                    {callbacks.map((q) => (
                      <li key={q.id} className="group/callback -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-blue-light/30">
                        <Avatar name={q.contact_name} className="w-9 h-9 text-[12px] shrink-0 transition-[transform,box-shadow] duration-150 group-hover/callback:scale-105 group-hover/callback:shadow-sm" />
                        {/* Three lines, one fact each. The company used to be
                            `truncate`d next to the phone and came out as a
                            single letter, "S…", "C…", which is both the
                            banned ellipsis and a total loss of the information
                            (Anir: "the name is getting fucking cut off. The
                            number should probably be on the next line to help
                            the name stand out"). Nothing truncates now; long
                            names wrap. */}
                        <span className="min-w-0 flex-1">
                          <Link
                            href={`/contacts/${q.contact_id}`}
                            className="block text-[13px] font-semibold leading-snug text-text-primary transition-colors group-hover/callback:text-blue-primary"
                          >
                            {q.contact_name}
                          </Link>
                          <span className="mt-0.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-text-secondary">
                            <CompanyLogo name={q.company || "?"} className="mt-px w-3.5 h-3.5 text-[7px] shrink-0" />
                            <span className="min-w-0">{q.company || q.category}</span>
                          </span>
                          {q.phone && (
                            <a
                              href={`tel:${q.phone}`}
                              className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] leading-snug tnum text-text-secondary cursor-pointer hover:text-blue-primary transition-colors"
                            >
                              <Phone size={12} strokeWidth={1.9} className="shrink-0 text-blue-primary" />
                              {formatPhone(q.phone)}
                            </a>
                          )}
                        </span>
                        <a
                          href={q.phone ? `tel:${q.phone}` : undefined}
                          className="mt-0.5 shrink-0 cursor-pointer text-[11px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-2.5 py-1 transition-[background-color,color,transform] group-hover/callback:scale-[1.03] hover:bg-blue-primary hover:text-white"
                        >
                          Call back
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Row 2 — two even halves (Anir: side by side, symmetrical) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_14px_34px_rgba(10,115,232,0.11)]">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Calls by team member
                  </h3>
                  <ExpandedChartModal
                    title="Calls by team member"
                    subtitle="Finished and queued calling activity by voice agent."
                    chart={{
                      kind: "bar",
                      data: teamMemberBars,
                      unit: "calls",
                      format: "number",
                    }}
                  />
                </div>
                <p className="text-[12px] text-text-tertiary mb-4">
                  Each agent in their color.
                </p>
                <BarChart
                  data={teamMemberBars}
                  height={168}
                  unit="calls"
                />
              </Card>
              <Card className="transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_14px_34px_rgba(10,115,232,0.11)]">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Calls per day
                  </h3>
                  <ExpandedChartModal
                    title="Calls per day"
                    subtitle="Calling activity over the last two weeks."
                    chart={{
                      kind: "line",
                      series: [
                        {
                          id: "calls",
                          label: "Calls",
                          color: VIZ.blue,
                          points: callsPerDay,
                        },
                      ],
                      xLabels: dayLabels,
                      pointLabels: dayPointLabels,
                      pointTips: callsPerDayTips,
                      unit: "calls",
                      format: "number",
                    }}
                  />
                </div>
                <p className="text-[12px] text-text-tertiary mb-4">
                  Calling activity over the last two weeks.
                </p>
                <LineChart
                  series={[{ label: "Calls", color: VIZ.blue, points: callsPerDay }]}
                  xLabels={dayLabels}
                  pointLabels={dayPointLabels}
                  pointTips={callsPerDayTips}
                  unit="calls"
                  height={150}
                />
              </Card>
            </div>
            {!status.phoneConnected && (
              <p className="text-[11.5px] text-text-tertiary">
                Sample calls shown so you can see the shape, live ElevenLabs
                stats take over the moment the numbers connect.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
