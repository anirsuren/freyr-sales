import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import {
  ArrowLeft,
  PhoneCall,
  Timer,
  ThumbsUp,
  ListChecks,
  Package,
  SearchX,
  Clock3,
  BarChart3,
  ArrowRight,
  ThumbsDown,
  PhoneMissed,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DonutChart,
  DonutLegend,
  LineChart,
  Sparkline,
  VIZ,
  type TipItem,
} from "@/components/charts/Charts";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { ContactTalkTimePanel } from "@/components/voice/ContactTalkTimePanel";
import {
  CallQualityCard,
  type LengthBucket,
  type QualityMetric,
} from "@/components/voice/CallQualityCard";
import { OutcomeMixPanel, type OutcomeDay } from "@/components/voice/OutcomeMixPanel";
import { voiceStatus, listVoiceQueue, isDialedVoiceCall, voiceCallStatusLabel, type VoiceOutcome } from "@/lib/voice";
import { listConversations } from "@/lib/elevenlabs";
import { listOfferings } from "@/lib/offerings";
import { personaBySlug } from "@/lib/voicePersonas";
import { getDb } from "@/lib/db";
import { formatDate, formatDateTime, formatPhone, cn } from "@/lib/utils";
import { listStoredVoiceConversations, storedVoiceCall } from "@/lib/voiceEvents";

export const metadata = { title: "Voice agent" };
export const dynamic = "force-dynamic";

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// Each call outcome owns a colour AND an icon — the status column used to paint
// every dialed call the same green, so "declined" and "interested" looked
// identical (Anir, Jul 26: "the status here is clearly not color-coded, and it
// doesn't have icons").
const OUTCOME_META: Record<
  VoiceOutcome,
  { label: string; color: string; chip: string; icon: LucideIcon }
> = {
  interested: { label: "Interested", color: VIZ.green, chip: "text-success bg-success/10", icon: ThumbsUp },
  follow_up: { label: "Follow-up", color: VIZ.blue, chip: "text-blue-primary bg-blue-light", icon: CalendarClock },
  no_answer: { label: "No answer", color: VIZ.amber, chip: "text-warning bg-warning/10", icon: PhoneMissed },
};
const OUTCOME_ORDER: VoiceOutcome[] = ["interested", "follow_up", "no_answer"];

// One team member, one page (Anir, Jul 4): who they are, their number, every
// conversation they've had — with transcripts — and how their calls are going.
export default async function VoiceAgentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const persona = personaBySlug((await params).slug);
  if (!persona) {
    return (
      <EmptyState
        icon={SearchX}
        title="Agent not found"
        description="The link may be out of date. Head back to the voice team to find everyone."
        className="py-24"
        action={
          <SmartBack
            fallback="/voice"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to voice agents
          </SmartBack>
        }
      />
    );
  }

  const status = voiceStatus();
  const agentId = status.agents[persona.category];
  const line = status.numbers[persona.category];
  const queued = listVoiceQueue().filter((q) => q.category === persona.category);
  const stored = (await listStoredVoiceConversations(100))
    .filter((call) => call.agent_id === status.agents[persona.category])
    .map(storedVoiceCall);
  const storedIds = new Set(
    stored.flatMap((call) => [call.conversation_id, call.call_sid].filter(Boolean))
  );
  const queue = [
    ...stored,
    ...queued.filter(
      (call) =>
        !storedIds.has(call.conversation_id || "") &&
        !storedIds.has(call.call_sid || "")
    ),
  ];
  const offerings = listOfferings().filter(
    (o) => o.offering_category === persona.category
  );

  const live = status.wired && process.env.AGENT_FORCE_MOCK !== "1";
  const convos = live
    ? (await listConversations(50)).filter((c) => c.agent_id === agentId)
    : [];
  const done = convos.filter((c) => c.status === "done");
  const avg = done.length
    ? Math.round(
        done.reduce((s, c) => s + (c.call_duration_secs || 0), 0) / done.length
      )
    : 0;
  const success = done.filter((c) => c.call_successful === "success").length;

  const called = queue.filter((q) => isDialedVoiceCall(q.status));
  const waiting = queue.filter((q) => q.status === "waiting_for_number");
  const Icon = persona.icon;

  // Contacts → phone + photo for the call rows.
  const contactById = new Map(
    (await getDb().contacts.list()).map((c) => [c.id, c])
  );

  // Per-agent analytics (a sales manager should see how this rep performs).
  const finishedCalls = called.filter((q) => q.outcome);
  const outcomeSegments = OUTCOME_ORDER.map((o) => ({
    // The OUTCOME_META key travels with the slice so the legend can paint the
    // app's own colour + icon for it (never a gray category chip).
    key: o,
    label: OUTCOME_META[o].label,
    value: finishedCalls.filter((q) => q.outcome === o).length,
    color: OUTCOME_META[o].color,
    // Hover a slice → who those calls were with (photo + company).
    tip: finishedCalls
      .filter((q) => q.outcome === o)
      .map((q) => ({
        avatar: q.contact_name,
        name: q.contact_name,
        sub: q.company,
        value: OUTCOME_META[o].label,
      })),
  })).filter((s) => s.value > 0);
  const connectedCalls = finishedCalls.filter((q) => q.outcome !== "no_answer");
  const connectRate = finishedCalls.length
    ? Math.round((connectedCalls.length / finishedCalls.length) * 100)
    : 0;
  const talkAvg = connectedCalls.length
    ? Math.round(
        connectedCalls.reduce((s, q) => s + (q.duration_secs || 0), 0) /
          connectedCalls.length
      )
    : 0;
  const interestedN = finishedCalls.filter((q) => q.outcome === "interested").length;
  const followUpN = finishedCalls.filter((q) => q.outcome === "follow_up").length;
  // Every "Call quality" number below is COUNTED from these same calls — no
  // invented metric, no invented denominator (Suren's honesty rule).
  const answered = connectedCalls.filter((q) => (q.duration_secs || 0) > 0);
  const longestSecs = answered.reduce((m, q) => Math.max(m, q.duration_secs || 0), 0);
  const peopleReached = new Set(connectedCalls.map((q) => q.contact_id)).size;
  const qualityMetrics: QualityMetric[] = [
    {
      key: "connect",
      label: "Connect rate",
      value: `${connectRate}%`,
      sub: `${connectedCalls.length} of ${finishedCalls.length} answered`,
      icon: "connect",
    },
    { key: "avg", label: "Avg length", value: fmtLen(talkAvg), sub: "min:sec", icon: "length" },
    {
      key: "longest",
      label: "Longest call",
      value: fmtLen(longestSecs),
      sub: "min:sec",
      icon: "longest",
    },
    {
      key: "interested",
      label: "Interested",
      value: String(interestedN),
      sub: interestedN === 1 ? "call" : "calls",
      icon: "interested",
    },
    {
      key: "follow_up",
      label: "Follow-ups",
      value: String(followUpN),
      sub: followUpN === 1 ? "call" : "calls",
      icon: "follow_up",
    },
    {
      key: "people",
      label: "People reached",
      value: String(peopleReached),
      sub: peopleReached === 1 ? "person" : "people",
      icon: "people",
    },
  ];
  // How long answered calls actually run — a real distribution, straight from
  // duration_secs. Shorter → longer, warm → green, never a yellow band.
  const LENGTH_BUCKETS: { label: string; min: number; max: number; color: string }[] = [
    { label: "Under 1 min", min: 0, max: 60, color: "#C2410C" },
    { label: "1-2 min", min: 60, max: 120, color: VIZ.sky },
    { label: "2-4 min", min: 120, max: 240, color: VIZ.blue },
    { label: "4 min+", min: 240, max: Number.POSITIVE_INFINITY, color: VIZ.green },
  ];
  const lengthBuckets: LengthBucket[] = LENGTH_BUCKETS.map((bucket) => {
    const inBucket = answered.filter(
      (q) => (q.duration_secs || 0) >= bucket.min && (q.duration_secs || 0) < bucket.max
    );
    return {
      label: bucket.label,
      count: inBucket.length,
      color: bucket.color,
      calls: inBucket.map((q) => ({
        id: q.id,
        name: q.contact_name,
        company: q.company || "Account",
        length: fmtLen(q.duration_secs || 0),
      })),
    };
  });
  // Calls per day over the last 14 days (sample calls + any live ones).
  const DAY = 86_400_000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const perDay = Array.from({ length: 14 }, (_, i) => {
    const dayStart = midnight.getTime() - (13 - i) * DAY;
    const q = called.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= dayStart && t < dayStart + DAY;
    }).length;
    const r = convos.filter((c) => {
      if (!c.start_time_unix_secs) return false;
      const t = c.start_time_unix_secs * 1000;
      return t >= dayStart && t < dayStart + DAY;
    }).length;
    return q + r;
  });
  const dayLabels = [13, 9, 5, 0].map((back) => {
    const d = new Date(midnight.getTime() - back * DAY);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const perDayLabels = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(midnight.getTime() - (13 - i) * DAY);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  });
  // Who was called each day — the people behind each plotted point (sample
  // queue calls + any live conversations on this agent's line).
  const perDayTips = Array.from({ length: 14 }, (_, i) => {
    const dayStart = midnight.getTime() - (13 - i) * DAY;
    const qTips = called
      .filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= dayStart && t < dayStart + DAY;
      })
      .map((c) => ({ avatar: c.contact_name, name: c.contact_name, sub: c.company }));
    const rTips = convos
      .filter((c) => {
        if (!c.start_time_unix_secs) return false;
        const t = c.start_time_unix_secs * 1000;
        return t >= dayStart && t < dayStart + DAY;
      })
      .map((c) => ({
        avatar: persona.name,
        name: persona.name,
        sub: c.direction === "inbound" ? "Inbound call" : "Outbound call",
      }));
    return [...qTips, ...rTips];
  });
  // The same outcomes as the donut, day by day — the second chart inside the
  // "How calls ended" card. Only calls that actually finished, so nothing is
  // counted twice or invented.
  const outcomeDays: OutcomeDay[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = midnight.getTime() - (6 - i) * DAY;
    const dayCalls = finishedCalls.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= dayStart && t < dayStart + DAY;
    });
    const d = new Date(dayStart);
    return {
      key: `${d.getMonth() + 1}/${d.getDate()}`,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      total: dayCalls.length,
      stack: OUTCOME_ORDER.map((o) => ({
        key: o,
        label: OUTCOME_META[o].label,
        color: OUTCOME_META[o].color,
        value: dayCalls.filter((c) => c.outcome === o).length,
      })),
      people: dayCalls.map((c) => ({
        id: c.id,
        name: c.contact_name,
        company: c.company || "Account",
        outcome: c.outcome as string,
      })),
    };
  });
  // Talk time per placed call — WHO was on each call (avatar), not a bare name.
  // `outcome` is the OUTCOME_META KEY: the panel renders it as the app's
  // colour + icon pill instead of plain text.
  const talk = called
    .filter((q) => q.duration_secs)
    .map((q) => ({
      id: q.id,
      name: q.contact_name,
      company: q.company || "Account",
      value: q.duration_secs || 0,
      outcome: q.outcome || "ai_call_completed",
      createdAt: q.created_at,
      href: `/voice/c/${q.conversation_id || q.id}`,
    }));
  const outcomeRecords = finishedCalls.map((call) => ({
    id: call.id,
    label: call.contact_name,
    meta: call.company || "Account",
    outcome: call.outcome || undefined,
    value: call.duration_secs ? fmtLen(call.duration_secs) : "-",
    href: `/voice/c/${call.conversation_id || call.id}`,
    avatar: call.contact_name,
  }));
  const activityRecords = called.map((call) => ({
    id: call.id,
    label: call.contact_name,
    meta: `${call.company || "Account"} · ${formatDateTime(call.created_at)}`,
    outcome: call.outcome || undefined,
    value: call.duration_secs ? fmtLen(call.duration_secs) : undefined,
    href: `/voice/c/${call.id}`,
    avatar: call.contact_name,
  }));

  // 30-day trajectory sparklines for the KPI cards (real, from this agent's
  // calls). Conversations = per-day count; length + went-well = per-call.
  const chrono = [...called].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const lenPts = chrono.filter((c) => c.duration_secs);
  const lenSeries = lenPts.map((c) => c.duration_secs || 0);
  const lenLabels = lenPts.map((c) => formatDate(c.created_at).replace(/,.*$/, ""));
  // Each length point is one answered call — show who it was with.
  const lenTips = lenPts.map((c) => [
    { avatar: c.contact_name, name: c.contact_name, sub: c.company },
  ]);
  const wellSeries = chrono.map((_, i) => {
    const up = chrono.slice(0, i + 1);
    const ok = up.filter(
      (c) => c.outcome === "interested" || c.outcome === "follow_up"
    ).length;
    return Math.round((ok / up.length) * 100);
  });
  const wellLabels = chrono.map((c) => formatDate(c.created_at).replace(/,.*$/, ""));
  // Each went-well point is a call — name the person + how it landed.
  const wellTips = chrono.map((c) => [
    {
      avatar: c.contact_name,
      name: c.contact_name,
      sub: c.company,
      value: c.outcome ? OUTCOME_META[c.outcome].label : undefined,
    },
  ]);
  const hasAnalytics = finishedCalls.length > 0;

  const avgLenVal = fmtLen(
    avg ||
      (called.length
        ? Math.round(
            called.reduce((s, q) => s + (q.duration_secs || 0), 0) /
              Math.max(called.filter((q) => q.duration_secs).length, 1)
          )
        : 0)
  );
  const wentWellVal = done.length
    ? `${Math.round((success / done.length) * 100)}%`
    : called.length
    ? `${Math.round(
        (called.filter(
          (q) => q.outcome === "interested" || q.outcome === "follow_up"
        ).length /
          called.length) *
          100
      )}%`
    : "-";

  const tiles: {
    label: string;
    value: string;
    icon: typeof PhoneCall;
    sub?: string;
    spark?: number[];
    sparkLabels?: string[];
    sparkFmt?: "number" | "duration" | "percent";
    sparkTips?: TipItem[][];
  }[] = [
    {
      label: "Conversations",
      value: String(convos.length + called.length),
      icon: PhoneCall,
      sub: convos.length ? "live + sample" : "sample calls",
      spark: perDay,
      sparkLabels: perDayLabels,
      sparkFmt: "number",
      sparkTips: perDayTips,
    },
    {
      label: "Avg length",
      value: avgLenVal,
      icon: Timer,
      sub: "per answered call",
      spark: lenSeries.length > 1 ? lenSeries : undefined,
      sparkLabels: lenLabels,
      sparkFmt: "duration",
      sparkTips: lenSeries.length > 1 ? lenTips : undefined,
    },
    {
      label: "Went well",
      value: wentWellVal,
      icon: ThumbsUp,
      sub: "interested or follow-up",
      spark: wellSeries.length > 1 ? wellSeries : undefined,
      sparkLabels: wellLabels,
      sparkFmt: "percent",
      sparkTips: wellSeries.length > 1 ? wellTips : undefined,
    },
    {
      label: "In the queue",
      value: String(waiting.length),
      icon: ListChecks,
      sub: "waiting to dial",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Identity first */}
      <div>
        <SmartBack
          fallback="/voice"
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voice agents
        </SmartBack>
        <div className="flex items-start gap-4">
          <span
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white"
            style={{ background: persona.color }}
          >
            <Icon size={26} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
                {persona.name}
              </h1>
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                  status.phoneConnected
                    ? "text-success bg-success/10"
                    : "text-warning bg-warning/10"
                )}
              >
                {status.phoneConnected ? "Live" : "Ready: awaiting number"}
              </span>
            </div>
            <p className="text-[14px] text-text-secondary mt-0.5">
              {persona.category} · {persona.tagline}
            </p>
            {line && (
              <p className="text-[13px] text-text-tertiary mt-1.5">
                Their line:{" "}
                <span className="font-semibold text-text-primary tnum">
                  {formatPhone(line.number)}
                </span>
               , call it and {persona.name} answers; outbound runs from it too.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Numbers at a glance — separate cards (like Forecast/Pipeline), each
          with a 30-day trajectory sparkline so the space works and you can see
          the trend without clicking (Suren). Hover a line for the exact point. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => {
          const Ti = t.icon;
          return (
            <Card key={t.label} className="p-4 flex flex-col">
              <div className="flex items-center gap-2.5 mb-2.5">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white"
                  style={{ background: persona.color }}
                >
                  <Ti size={15} strokeWidth={1.9} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary leading-tight">
                  {t.label}
                </span>
              </div>
              <p className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[24px] font-bold leading-none tnum text-text-primary">
                  {t.value}
                </span>
                {t.sub && (
                  <span className="text-[11.5px] text-text-tertiary">{t.sub}</span>
                )}
              </p>
              <div className="mt-3">
                {t.spark ? (
                  <Sparkline
                    points={t.spark}
                    color={persona.color}
                    height={36}
                    format={t.sparkFmt}
                    xLabels={t.sparkLabels}
                    pointTips={t.sparkTips}
                  />
                ) : (
                  <div className="h-9 flex items-end text-[11px] text-text-tertiary">
                    Fills in as calls go out
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </section>

      {/* Per-agent analytics — a sales manager should see exactly how this
          rep is performing (Suren: "tons of graphs… how they're performing"). */}
      {hasAnalytics && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <BarChart3 size={15} strokeWidth={1.9} className="text-blue-primary" />
            {persona.name}&apos;s performance
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Outcome mix */}
            {/* Search removed from the CARD (it lives in the expanded view) —
                the donut now charts the full set, and the freed space carries
                the share bars + a second chart (Suren, Jul 27). */}
            <ChartInspector
              title="How calls ended"
              description="Every finished call, by outcome."
              records={outcomeRecords}
              searchPlaceholder="Find a contact..."
              inlineSearch={false}
              expandedChildren={
                <div className="flex flex-wrap items-center justify-center gap-10 py-4">
                  <DonutChart
                    segments={outcomeSegments}
                    size={280}
                    thickness={28}
                    syncId="voice-agent-outcomes-lg"
                  />
                  <DonutLegend
                    items={outcomeSegments}
                    syncId="voice-agent-outcomes-lg"
                    className="min-w-[240px] max-w-[320px] text-[14px]"
                  />
                </div>
              }
            >
              <OutcomeMixPanel
                segments={outcomeSegments}
                totalCalls={finishedCalls.length}
                days={outcomeDays}
                syncId="voice-agent-outcomes"
              />
            </ChartInspector>

            {/* Quality — six counted metrics pinned under the header, then a
                real distribution chart filling the rest (no dead band). */}
            <CallQualityCard
              name={persona.name}
              metrics={qualityMetrics}
              buckets={lengthBuckets}
            />

            {/* Talk time per call — WHO was on each call (photo), not a name */}
            <ContactTalkTimePanel calls={talk} color={persona.color} />
          </div>

          {/* Activity trend */}
          <ChartInspector
            title="Calls per day"
            description={`${persona.name}'s calling activity over the last two weeks.`}
            records={activityRecords}
            searchPlaceholder="Find a contact..."
            inlineSearch={false}
            expandedChildren={
              <LineChart
                series={[{ label: "Calls", color: persona.color, points: perDay }]}
                xLabels={dayLabels}
                pointLabels={perDayLabels}
                pointTips={perDayTips}
                unit="calls"
                height={390}
              />
            }
          >
            <LineChart
              series={[{ label: "Calls", color: persona.color, points: perDay }]}
              xLabels={dayLabels}
              pointLabels={perDayLabels}
              pointTips={perDayTips}
              unit="calls"
              height={150}
            />
          </ChartInspector>
        </section>
      )}

      {/* Live conversations with transcripts */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          {persona.name}&apos;s conversations
        </h2>
        {convos.length === 0 && called.length === 0 && waiting.length === 0 ? (
          <Card>
            <p className="text-[13px] text-text-secondary">
              Nothing yet, call{" "}
              {line ? (
                <span className="font-semibold text-text-primary tnum">
                  {formatPhone(line.number)}
                </span>
              ) : (
                `${persona.name}'s line`
              )}{" "}
              or queue contacts from the Contacts page, and every conversation
              lands here with its transcript.
            </p>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-border-light">
                    {["Call", "Status", "Length", "When", ""].map((h, i) => (
                      <th
                        key={i}
                        className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {convos.map((c) => (
                    <tr key={c.conversation_id}>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-text-primary">
                        {c.direction === "inbound" ? "Inbound call" : "Outbound call"}
                        <span className="text-text-tertiary font-normal">
                          {" "}
                          · {c.message_count ?? "-"} turns
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                            c.status === "done"
                              ? "text-success bg-success/10"
                              : c.status === "failed"
                              ? "text-error bg-error/10"
                              : "text-blue-primary bg-blue-light"
                          )}
                        >
                          {c.status === "done"
                            ? "Finished"
                            : c.status === "failed"
                            ? "Failed"
                            : "In progress"}
                        </span>
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
                  ))}
                  {queue.map((q) => {
                    const phone = q.phone || contactById.get(q.contact_id)?.phone;
                    // This section is a list of CONVERSATIONS — clicking one opens
                    // that call's transcript (Suren). The profile is one hop away
                    // via "View contact" on the transcript.
                    const href =
                      isDialedVoiceCall(q.status)
                        ? `/voice/c/${q.conversation_id || q.id}`
                        : `/voice/contact/${q.contact_id}`;
                    return (
                    <tr key={q.id} className="hover:bg-surface transition-colors group">
                      <td className="px-5 py-3.5">
                        <Link href={href} className="flex items-center gap-2.5">
                          <Avatar
                            name={q.contact_name}
                            className="w-8 h-8 text-[11px] shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-text-primary group-hover:text-blue-primary truncate">
                              {q.contact_name}
                            </span>
                            <span className="block text-[11.5px] text-text-tertiary truncate">
                              {phone ? (
                                <span className="tnum">{formatPhone(phone)}</span>
                              ) : (
                                q.company || q.offering_name
                              )}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {(() => {
                          // Colour + icon come from the OUTCOME, not from "was it
                          // dialed" — otherwise declined and interested read the
                          // same. Calls with no outcome yet fall back to the
                          // queue state's own amber/blue.
                          const om =
                            isDialedVoiceCall(q.status) && q.outcome
                              ? OUTCOME_META[q.outcome as VoiceOutcome]
                              : null;
                          const Icon = om?.icon ?? Clock3;
                          return (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                                om
                                  ? om.chip
                                  : isDialedVoiceCall(q.status)
                                    ? "text-blue-primary bg-blue-light"
                                    : "text-warning bg-warning/10"
                              )}
                            >
                              <Icon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
                              {om ? om.label : voiceCallStatusLabel(q.status)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary tnum whitespace-nowrap">
                        {q.duration_secs ? fmtLen(q.duration_secs) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                        {formatDateTime(q.created_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={href}
                          className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors"
                          aria-label={`Open ${q.contact_name}`}
                        >
                          <ArrowRight size={16} strokeWidth={1.5} />
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

      {/* What they can pitch */}
      <Card>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
          <Package size={16} strokeWidth={1.8} className="text-blue-primary" />
          What {persona.name} knows ({offerings.length})
        </h2>
        <p className="text-[12px] text-text-tertiary mb-3">
          Every offering in {persona.category}, the knowledge behind the calls.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {offerings.map((o) => (
            <Link
              key={o.id}
              href={`/offerings/${o.id}`}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-primary bg-white border border-border-light rounded-lg pl-1.5 pr-2.5 py-1 hover:border-blue-subtle hover:text-blue-primary hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all"
            >
              <OfferingIcon name={o.offering_name} className="w-[18px] h-[18px] text-[8px] shrink-0" />
              {o.offering_name}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
