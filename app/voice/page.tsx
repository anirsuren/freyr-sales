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
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { voiceStatus, listVoiceQueue, type VoiceOutcome } from "@/lib/voice";
import { listOfferings } from "@/lib/offerings";
import { formatDateTime, cn } from "@/lib/utils";

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
export default function VoicePage() {
  const status = voiceStatus();
  const queue = listVoiceQueue();
  const offerings = listOfferings();

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

  const tiles = [
    {
      label: "Voice agents ready",
      value: String(categories.length),
      icon: Bot,
      warn: false,
    },
    {
      label: "Phone number",
      value: status.phoneConnected ? "Connected" : "Not connected",
      icon: status.phoneConnected ? PhoneCall : PhoneOff,
      warn: !status.phoneConnected,
    },
    {
      label: "Calls queued",
      value: String(waiting),
      icon: ListChecks,
      warn: false,
    },
    {
      label: "Calls placed",
      value: String(placed),
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
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.label} className="h-[124px] flex flex-col">
              <span
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mb-3",
                  t.warn
                    ? "bg-warning/10 text-warning"
                    : "bg-blue-light text-blue-primary"
                )}
              >
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {t.label}
              </span>
              <span
                className={cn(
                  "mt-auto font-bold leading-none tnum",
                  t.value.length > 4 ? "text-[19px]" : "text-[24px]",
                  t.warn ? "text-warning" : "text-text-primary"
                )}
              >
                {t.value}
              </span>
            </Card>
          );
        })}
      </section>

      {!status.phoneConnected && (
        <p className="text-[13px] text-text-secondary bg-warning/10 border border-warning/20 rounded-lg px-4 py-3">
          <span className="font-semibold text-warning">One step from live:</span>{" "}
          the agents are built and queued calls are waiting — connect a phone
          number (Twilio → ElevenLabs) and everything below starts dialing.
          Nothing dials silently until then.
        </p>
      )}

      {/* The 6 category agents */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          Agents — one per offering category ({categories.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <Card key={c.category} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                  <Bot size={16} strokeWidth={1.9} />
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
              <p className="text-[14px] font-semibold text-text-primary mt-2.5">
                {c.category}
              </p>
              <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                Knows {c.count} offering{c.count === 1 ? "" : "s"}
                {c.names.length > 0 && (
                  <span className="text-text-tertiary">
                    {" "}
                    — {c.names.join(", ")}
                    {c.count > 3 ? "…" : ""}
                  </span>
                )}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Queue by category — where the calling effort is pointed (real data) */}
      {queue.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">
            Queue by category
          </h2>
          <p className="text-[12px] text-text-tertiary mb-3">
            Where the calling effort is pointed right now.
          </p>
          <div className="space-y-2.5">
            {(() => {
              const byCat = new Map<string, number>();
              for (const q of queue)
                byCat.set(q.category, (byCat.get(q.category) || 0) + 1);
              const rows = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
              const max = Math.max(1, ...rows.map(([, n]) => n));
              return rows.map(([cat, n]) => (
                <div key={cat}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span className="text-text-secondary truncate">{cat}</span>
                    <span className="text-text-primary font-medium tnum">
                      {n} call{n === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-primary"
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </Card>
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
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-text-primary whitespace-nowrap">
                        {q.contact_name}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                How calls ended
              </h3>
              <p className="text-[12px] text-text-tertiary mb-3">
                Every finished call, by outcome.
              </p>
              <div className="flex items-center gap-6">
                <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
                  <circle cx="65" cy="65" r={R} fill="none" stroke="#E5E5EA" strokeWidth="12" />
                  {donutSegs.map((s) => (
                    <circle
                      key={s.outcome}
                      cx="65" cy="65" r={R} fill="none"
                      stroke={OUTCOME_META[s.outcome].color}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${CIRC * s.frac} ${CIRC}`}
                      transform={`rotate(${-90 + s.start * 360} 65 65)`}
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

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Connect rate", value: `${connectRate}%`, icon: PhoneCall, sub: `${connected.length} of ${finished.length} answered` },
                { label: "Avg call length", value: fmtLen(avgLen), icon: Timer, sub: "across answered calls" },
                { label: "Interested", value: String(interestedN), icon: ThumbsUp, sub: "want to hear more" },
                { label: "Follow-ups", value: String(finished.filter((q) => q.outcome === "follow_up").length), icon: Clock, sub: "asked to circle back" },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <Card key={t.label} className="h-[124px] flex flex-col">
                    <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-2">
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      {t.label}
                    </span>
                    <span className="mt-auto text-[22px] font-bold leading-none tnum text-text-primary">
                      {t.value}
                    </span>
                    <span className="text-[11px] text-text-tertiary mt-1">{t.sub}</span>
                  </Card>
                );
              })}
              {!status.phoneConnected && (
                <p className="col-span-2 text-[11.5px] text-text-tertiary">
                  Sample calls shown so you can see the shape — live ElevenLabs
                  stats take over the moment your number connects.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
