import {
  PhoneCall,
  PhoneOff,
  Bot,
  ListChecks,
  BarChart3,
  Clock,
  Timer,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { voiceStatus, listVoiceQueue, type VoiceOutcome } from "@/lib/voice";
import { listConversations } from "@/lib/elevenlabs";
import { syncConversations } from "@/lib/voiceSync";
import { listOfferings } from "@/lib/offerings";
import { VOICE_PERSONAS, personaFor } from "@/lib/voicePersonas";
import { LineChart, BarChart, VIZ } from "@/components/charts/Charts";
import { StatTile } from "@/components/ui/StatTile";
import { formatDateTime, formatPhone, cn } from "@/lib/utils";

export const metadata = { title: "Voice agents" };
export const dynamic = "force-dynamic";

// One place to define how each call outcome renders — donut, legend, table.
const OUTCOME_META: Record<VoiceOutcome, { label: string; color: string; chip: string }> = {
  interested: { label: "Interested", color: "#34C759", chip: "text-success bg-success/10" },
  follow_up: { label: "Follow-up", color: "#0071E3", chip: "text-blue-primary bg-blue-light" },
  no_answer: { label: "No answer", color: "#FF9F0A", chip: "text-warning bg-warning/10" },
  declined: { label: "Declined", color: "#FF3B30", chip: "text-error bg-error/10" },
};
const OUTCOME_ORDER: VoiceOutcome[] = ["interested", "follow_up", "no_answer", "declined"];

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// Voice command center (Anir's rep-lens audit): a rep who queues calls needs
// to SEE them — the agents, the queue, and the numbers — without digging.
// The analytics run on the seeded sample calls (Anir: "show mock data — I
// need to see how the graphs would look") and swap to live ElevenLabs stats
// the moment a phone number connects.
export default async function VoicePage() {
  const status = voiceStatus();
  const queue = listVoiceQueue();
  const offerings = listOfferings();

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

  const placed = queue.filter((q) => q.status === "called").length;
  const waiting = queue.filter((q) => q.status === "waiting_for_number").length;

  // Analytics over finished calls — outcomes, connect rate, talk time.
  const finished = queue.filter((q) => q.status === "called" && q.outcome);
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
  // Donut geometry — same pattern as the campaign delivery ring.
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const donutSegs = outcomeCounts.map(({ outcome, n: cnt }) => {
    const frac = cnt / finished.length;
    const seg = { outcome, frac, start: acc };
    acc += frac;
    return seg;
  });

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

  const lineCount = Object.keys(status.numbers).length;
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
      sub: status.phoneConnected ? "live — one per agent" : undefined,
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
        subtitle="One AI caller per offering category — queue calls from any contact or the Contacts list, and watch them here."
      />

      {/* At-a-glance numbers */}
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
          the agents are built and queued calls are waiting — connect a phone
          number (Twilio → ElevenLabs) and everything below starts dialing.
          Nothing dials silently until then.
        </p>
      )}

      {/* The team — six personas, each with their own line. Click one for
          their conversations, transcripts and stats. */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          The calling team — one per offering category ({categories.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {VOICE_PERSONAS.map((p) => {
            const cat = categories.find((c) => c.category === p.category);
            const line = status.numbers[p.category];
            const Icon = p.icon;
            return (
              <Link key={p.slug} href={`/voice/agents/${p.slug}`}>
                <Card className="p-5 h-full hover:border-blue-subtle hover:-translate-y-0.5 transition-all duration-200 group">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ background: p.color }}
                    >
                      <Icon size={19} strokeWidth={1.9} />
                    </span>
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                        status.phoneConnected
                          ? "text-success bg-success/10"
                          : "text-warning bg-warning/10"
                      )}
                    >
                      {status.phoneConnected ? "Live" : "Ready — awaiting number"}
                    </span>
                  </div>
                  <p className="text-[16px] font-semibold text-text-primary mt-3 group-hover:text-blue-primary transition-colors">
                    {p.name}
                    <span className="text-[12px] font-medium text-text-tertiary">
                      {" "}
                      · {p.category}
                    </span>
                  </p>
                  <p className="text-[12.5px] text-text-secondary mt-1 leading-relaxed">
                    {p.tagline}
                  </p>
                  <p className="flex items-center justify-between text-[12px] mt-3 pt-3 border-t border-border-light">
                    <span className="text-text-tertiary">
                      {line ? (
                        <span className="tnum font-medium text-text-secondary">
                          {formatPhone(line.number)}
                        </span>
                      ) : (
                        `Knows ${cat?.count || 0} offering${(cat?.count || 0) === 1 ? "" : "s"}`
                      )}
                    </span>
                    <span className="font-semibold text-blue-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Open →
                    </span>
                  </p>
                </Card>
              </Link>
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
                No live calls yet — every conversation lands here the moment it
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
                  : "—",
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
                          className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
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
                          <span className="text-[12.5px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary capitalize whitespace-nowrap">
                        {c.direction || "—"}
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
                        {c.call_duration_secs ? fmtLen(c.call_duration_secs) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                        {c.start_time_unix_secs
                          ? formatDateTime(
                              new Date(c.start_time_unix_secs * 1000).toISOString()
                            )
                          : "—"}
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
              description="Queue one from a contact's AI voice call, or select contacts on the Contacts page and run a category's agent on the whole list."
            />
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-border-light">
                    {["Contact", "Company", "About", "Status", "Outcome", "Length", "Queued"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {queue.map((q) => (
                    <tr key={q.id}>
                      <td className="px-5 py-3.5 text-[13px] font-semibold whitespace-nowrap">
                        <Link
                          href={`/contacts/${q.contact_id}`}
                          className="text-text-primary hover:text-blue-primary"
                        >
                          {q.contact_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-secondary whitespace-nowrap">
                        {q.company || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-secondary">
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
                            "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                            q.status === "called"
                              ? "text-success bg-success/10"
                              : q.status === "no_agent"
                              ? "text-error bg-error/10"
                              : "text-warning bg-warning/10"
                          )}
                        >
                          {q.status === "called" ? (
                            <PhoneCall size={11} strokeWidth={2.2} />
                          ) : (
                            <Clock size={11} strokeWidth={2.2} />
                          )}
                          {q.status === "called"
                            ? "Called"
                            : q.status === "no_agent"
                            ? "No agent"
                            : "Waiting for number"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {q.outcome ? (
                          <span
                            className={cn(
                              "inline-flex text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                              OUTCOME_META[q.outcome].chip
                            )}
                          >
                            {OUTCOME_META[q.outcome].label}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary tnum whitespace-nowrap">
                        {q.duration_secs ? fmtLen(q.duration_secs) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                        {formatDateTime(q.created_at)}
                      </td>
                    </tr>
                  ))}
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
              Conversation stats — durations, outcomes, interest signals and
              transcripts — appear here automatically once calls start going
              out. ElevenLabs records every conversation, so nothing extra to
              set up.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* One even row — three cards, same height (Anir: symmetry). */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="flex flex-col">
                <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                  How calls ended
                </h3>
                <p className="text-[12px] text-text-tertiary mb-3">
                  Every finished call, by outcome.
                </p>
                <div className="flex-1 flex items-center gap-5">
                  <svg width="120" height="120" viewBox="0 0 130 130" className="shrink-0">
                    <circle cx="65" cy="65" r={R} fill="none" stroke="#E5E5EA" strokeWidth="12" />
                    {donutSegs.map((sg) => (
                      <circle
                        key={sg.outcome}
                        cx="65" cy="65" r={R} fill="none"
                        stroke={OUTCOME_META[sg.outcome].color}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${CIRC * sg.frac} ${CIRC}`}
                        transform={`rotate(${-90 + sg.start * 360} 65 65)`}
                      />
                    ))}
                    <text x="65" y="59" textAnchor="middle" className="tnum" fontSize="24" fontWeight="700" fill="#1D1D1F">
                      {finished.length}
                    </text>
                    <text x="65" y="77" textAnchor="middle" fontSize="10" fill="#8A8A8E">
                      calls
                    </text>
                  </svg>
                  <div className="space-y-2 text-[13px]">
                    {outcomeCounts.map(({ outcome, n: cnt }) => (
                      <p key={outcome} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: OUTCOME_META[outcome].color }}
                        />
                        <span className="text-text-secondary">
                          {OUTCOME_META[outcome].label}
                        </span>
                        <span className="font-semibold text-text-primary tnum">{cnt}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col">
                <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                  Call quality
                </h3>
                <p className="text-[12px] text-text-tertiary mb-3">
                  How the conversations are going.
                </p>
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-4 content-center">
                  {[
                    { icon: PhoneCall, label: "Connect rate", value: `${connectRate}%` },
                    { icon: Timer, label: "Avg length", value: fmtLen(avgLen) },
                    { icon: ThumbsUp, label: "Interested", value: String(interestedN) },
                    { icon: Clock, label: "Follow-ups", value: String(finished.filter((q) => q.outcome === "follow_up").length) },
                  ].map((st) => {
                    const StIcon = st.icon;
                    return (
                      <div key={st.label} className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                          <StIcon size={15} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            {st.label}
                          </span>
                          <span className="block text-[17px] font-bold leading-tight tnum text-text-primary">
                            {st.value}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="flex flex-col">
                <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                  Calls by team member
                </h3>
                <p className="text-[12px] text-text-tertiary mb-3">
                  Each agent in their color.
                </p>
                <div className="flex-1 flex items-end">
                  <BarChart
                    data={VOICE_PERSONAS.map((p) => ({
                      label: p.name,
                      value: queue.filter((q) => q.category === p.category).length,
                      color: p.color,
                    }))}
                    height={132}
                  />
                </div>
              </Card>
            </div>

            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                Calls per day
              </h3>
              <p className="text-[12px] text-text-tertiary mb-3">
                Calling activity over the last two weeks.
              </p>
              <LineChart
                series={[{ label: "Calls", color: VIZ.blue, points: callsPerDay }]}
                xLabels={dayLabels}
                height={150}
              />
              {!status.phoneConnected && (
                <p className="text-[11.5px] text-text-tertiary mt-3">
                  Sample calls shown so you can see the shape — live ElevenLabs
                  stats take over the moment the numbers connect.
                </p>
              )}
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
