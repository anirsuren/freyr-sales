import Link from "next/link";
import {
  ArrowLeft,
  PhoneCall,
  Timer,
  ThumbsUp,
  ListChecks,
  Package,
  SearchX,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { voiceStatus, listVoiceQueue } from "@/lib/voice";
import { listConversations } from "@/lib/elevenlabs";
import { listOfferings } from "@/lib/offerings";
import { personaBySlug } from "@/lib/voicePersonas";
import { formatDateTime, formatPhone, cn } from "@/lib/utils";

export const metadata = { title: "Voice agent" };
export const dynamic = "force-dynamic";

const fmtLen = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// One team member, one page (Anir, Jul 4): who they are, their number, every
// conversation they've had — with transcripts — and how their calls are going.
export default async function VoiceAgentPage({
  params,
}: {
  params: { slug: string };
}) {
  const persona = personaBySlug(params.slug);
  if (!persona) {
    return (
      <EmptyState
        icon={SearchX}
        title="Agent not found"
        description="The link may be out of date. Head back to the voice team to find everyone."
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
  const agentId = status.agents[persona.category];
  const line = status.numbers[persona.category];
  const queue = listVoiceQueue().filter((q) => q.category === persona.category);
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

  const called = queue.filter((q) => q.status === "called");
  const waiting = queue.filter((q) => q.status === "waiting_for_number");
  const Icon = persona.icon;

  const tiles = [
    {
      label: "Conversations",
      value: String(convos.length + called.length),
      icon: PhoneCall,
      sub: convos.length ? "live + sample" : "sample calls",
    },
    {
      label: "Avg length",
      value: fmtLen(
        avg ||
          (called.length
            ? Math.round(
                called.reduce((s, q) => s + (q.duration_secs || 0), 0) /
                  Math.max(called.filter((q) => q.duration_secs).length, 1)
              )
            : 0)
      ),
      icon: Timer,
      sub: "per answered call",
    },
    {
      label: "Went well",
      value: done.length
        ? `${Math.round((success / done.length) * 100)}%`
        : called.length
        ? `${Math.round(
            (called.filter((q) => q.outcome === "interested" || q.outcome === "follow_up").length /
              called.length) *
              100
          )}%`
        : "—",
      icon: ThumbsUp,
      sub: "interested or follow-up",
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
        <Link
          href="/voice"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voice agents
        </Link>
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
                {status.phoneConnected ? "Live" : "Ready — awaiting number"}
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
                </span>{" "}
                — call it and {persona.name} answers; outbound runs from it too.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Numbers at a glance */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile
            key={t.label}
            icon={t.icon}
            label={t.label}
            value={t.value}
            sub={t.sub}
            color={persona.color}
          />
        ))}
      </section>

      {/* Live conversations with transcripts */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          {persona.name}&apos;s conversations
        </h2>
        {convos.length === 0 && called.length === 0 && waiting.length === 0 ? (
          <Card>
            <p className="text-[13px] text-text-secondary">
              Nothing yet — call{" "}
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
                        className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
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
                          · {c.message_count ?? "—"} turns
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
                  ))}
                  {queue.map((q) => (
                    <tr key={q.id}>
                      <td className="px-5 py-3.5 text-[13px] font-semibold">
                        <Link
                          href={`/contacts/${q.contact_id}`}
                          className="text-text-primary hover:text-blue-primary"
                        >
                          {q.contact_name}
                        </Link>
                        <span className="text-text-tertiary font-normal">
                          {" "}
                          · {q.company || q.offering_name}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                            q.status === "called"
                              ? "text-success bg-success/10"
                              : "text-warning bg-warning/10"
                          )}
                        >
                          {q.status === "called"
                            ? q.outcome
                              ? q.outcome.replace("_", "-")
                              : "Called"
                            : "Waiting"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-secondary tnum whitespace-nowrap">
                        {q.duration_secs ? fmtLen(q.duration_secs) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                        {formatDateTime(q.created_at)}
                      </td>
                      <td className="px-5 py-3.5" />
                    </tr>
                  ))}
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
          Every offering in {persona.category} — the knowledge behind the calls.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {offerings.map((o) => (
            <Link
              key={o.id}
              href={`/offerings/${o.id}`}
              className="text-[12.5px] font-medium text-text-secondary bg-surface border border-border-light rounded-md px-2.5 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors"
            >
              {o.offering_name}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
