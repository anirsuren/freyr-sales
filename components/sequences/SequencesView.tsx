"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Phone,
  Users,
  Clock,
  ChevronRight,
  Zap,
  Play,
  CheckCircle2,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  SEQUENCES,
  CHANNEL_LABEL,
  type SequenceChannel,
} from "@/lib/sequences";

export type Enrollment = {
  customerId: string;
  company: string;
  stage: string;
  stepIndex: number; // which step they're currently on
  sequenceId: string; // which cadence they're enrolled in
  enrollmentId?: string; // persisted (agent-managed) enrollment id
  managed?: boolean; // the agent can advance this one
};

const CHANNEL_ICON: Record<SequenceChannel, typeof Mail> = {
  email: Mail,
  call: Phone,
  wait: Clock,
};

function SeqStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-4 h-full">
      <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
        <InfoHint text={hint} />
      </span>
      <p className="text-[24px] font-bold text-text-primary leading-none mt-1.5 tnum">
        {value}
      </p>
    </Card>
  );
}

export function SequencesView({ enrollments }: { enrollments: Enrollment[] }) {
  const [activeId, setActiveId] = useState(SEQUENCES[0].id);
  const active = SEQUENCES.find((s) => s.id === activeId) || SEQUENCES[0];
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function advance(payload: object, key: string, label: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/agent/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          data.advanced > 0
            ? `${label} — ${data.advanced} step${data.advanced === 1 ? "" : "s"} advanced`
            : "Nothing to advance"
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't advance", "error");
      }
    } catch {
      toast("Couldn't advance", "error");
    } finally {
      setBusy(null);
    }
  }

  const activeEnrollments = enrollments.filter((e) => e.sequenceId === activeId);
  const advanceable = activeEnrollments.filter(
    (e) => e.managed && e.enrollmentId && e.stepIndex < active.steps.length - 1
  );
  const totalSteps = SEQUENCES.reduce((n, s) => n + s.steps.length, 0);
  const countBySeq = enrollments.reduce<Record<string, number>>((m, e) => {
    m[e.sequenceId] = (m[e.sequenceId] || 0) + 1;
    return m;
  }, {});

  return (
    <div>
      {/* stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SeqStat
          label="Active sequences"
          value={SEQUENCES.length}
          icon={Zap}
          hint="Outreach plans you have set up. Each is a series of steps (emails and calls) spaced over days."
        />
        <SeqStat
          label="Accounts enrolled"
          value={enrollments.length}
          icon={Users}
          hint="Accounts currently working through a sequence — i.e. somewhere in the middle of the plan."
        />
        <SeqStat
          label="Total steps"
          value={totalSteps}
          icon={ListChecks}
          hint="Every step across all your sequences combined — the size of the plan, not work done on its own."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* cadence list */}
        <div className="space-y-2">
          {SEQUENCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              aria-pressed={activeId === s.id}
              className={cn(
                "w-full text-left rounded-xl border p-4 transition-colors",
                activeId === s.id
                  ? "border-blue-primary bg-blue-light"
                  : "border-border-light bg-white hover:border-blue-subtle"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[14px] font-semibold",
                    activeId === s.id ? "text-blue-primary" : "text-text-primary"
                  )}
                >
                  {s.name}
                </span>
                <span className="text-[11px] font-semibold text-text-tertiary tnum">
                  {s.steps.length} steps
                </span>
              </div>
              <p className="text-[12px] text-text-secondary leading-snug mt-1">
                {s.description}
              </p>
              {countBySeq[s.id] > 0 && (
                <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-blue-primary">
                  <Users size={12} strokeWidth={1.9} />
                  {countBySeq[s.id]} enrolled
                </span>
              )}
            </button>
          ))}
        </div>

        {/* selected cadence detail */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Zap size={18} strokeWidth={1.8} className="text-blue-primary" />
              <h2 className="text-[16px] font-semibold text-text-primary">
                {active.name}
              </h2>
            </div>
            <ol className="relative pl-7 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border-light">
              {active.steps.map((step, i) => {
                const Icon = CHANNEL_ICON[step.channel];
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-blue-light text-blue-primary flex items-center justify-center">
                      <Icon size={13} strokeWidth={1.8} />
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                        Day {step.day}
                      </span>
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-surface text-text-secondary">
                        {CHANNEL_LABEL[step.channel]}
                      </span>
                    </div>
                    <p className="text-[14px] text-text-primary mt-0.5">{step.label}</p>
                  </li>
                );
              })}
            </ol>
            <p className="text-[12px] text-text-tertiary mt-4 pt-3 border-t border-border-light flex items-start gap-1.5">
              <Phone size={13} strokeWidth={1.7} className="mt-0.5 shrink-0" />
              <span>
                Call steps are reminders for <span className="font-medium text-text-secondary">you</span> to
                dial — the agent drafts the email steps and preps the calls, but it never sends or dials on
                its own.
              </span>
            </p>
          </Card>

          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary inline-flex items-center gap-1">
                Enrolled accounts
                <span className="text-text-primary tnum"> ({activeEnrollments.length})</span>
                <InfoHint text="Accounts working through this sequence. 'Advance' moves one to its next step — the agent preps that step (drafts the email / sets the call reminder) for your approval. It doesn't send or dial." />
              </h3>
              {advanceable.length > 0 && (
                <button
                  onClick={() =>
                    advance(
                      { sequenceId: activeId },
                      "all",
                      "Sequence advanced"
                    )
                  }
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
                >
                  <Play size={13} strokeWidth={2} />
                  {busy === "all" ? "Advancing…" : `Advance all (${advanceable.length})`}
                </button>
              )}
            </div>
            {activeEnrollments.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                No accounts are enrolled in this sequence yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeEnrollments.map((e) => {
                  const step = active.steps[Math.min(e.stepIndex, active.steps.length - 1)];
                  const pct = Math.round(((e.stepIndex + 1) / active.steps.length) * 100);
                  const atEnd = e.stepIndex >= active.steps.length - 1;
                  return (
                    <Card key={e.enrollmentId || e.customerId} className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.company} className="w-9 h-9 text-[12px] rounded-lg shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/customers/${e.customerId}`}
                            className="text-[14px] font-semibold text-text-primary truncate hover:text-blue-primary block"
                          >
                            {e.company}
                          </Link>
                          <p className="text-[12px] text-text-secondary truncate">
                            Step {e.stepIndex + 1} of {active.steps.length} · {step.label}
                          </p>
                        </div>
                        {e.managed && e.enrollmentId ? (
                          atEnd ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success shrink-0">
                              <CheckCircle2 size={14} strokeWidth={2} /> Completed
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                advance(
                                  { enrollmentId: e.enrollmentId },
                                  e.enrollmentId!,
                                  `${e.company} advanced`
                                )
                              }
                              disabled={busy !== null}
                              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-md border border-border-light text-blue-primary hover:bg-blue-light transition-colors disabled:opacity-50 shrink-0"
                            >
                              <Play size={12} strokeWidth={2} />
                              {busy === e.enrollmentId ? "…" : "Advance"}
                            </button>
                          )
                        ) : (
                          <Link
                            href={`/customers/${e.customerId}`}
                            aria-label={`Open ${e.company}`}
                            className="shrink-0"
                          >
                            <ChevronRight size={16} strokeWidth={1.5} className="text-text-tertiary hover:text-blue-primary" />
                          </Link>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-3">
                        <div className="h-full rounded-full bg-blue-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
