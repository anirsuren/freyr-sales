"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDotDashed,
  Clock,
  Copy,
  ListChecks,
  Mail,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { SequenceAgentBanner } from "@/components/sequences/SequenceAgentBanner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABEL,
  type Sequence,
  type SequenceChannel,
  type SequenceStep,
} from "@/lib/sequences";

export type Enrollment = {
  customerId: string;
  company: string;
  stage: string;
  stepIndex: number;
  sequenceId: string;
  enrollmentId?: string;
  managed?: boolean;
};

export type SequenceCandidate = {
  id: string;
  company: string;
  industry: string;
};

const CHANNEL_META: Record<
  SequenceChannel,
  { icon: typeof Mail; color: string; bg: string }
> = {
  email: { icon: Mail, color: "#0066CC", bg: "rgba(0,113,227,0.10)" },
  call: { icon: Phone, color: "#047857", bg: "rgba(5,150,105,0.11)" },
  wait: { icon: Clock, color: "#64748B", bg: "rgba(100,116,139,0.10)" },
};

function stageStyle(stage: string) {
  const key = stage.toLowerCase();
  if (key.includes("meeting")) return { color: "#047857", bg: "rgba(5,150,105,0.11)" };
  if (key.includes("qualified")) return { color: "#6D28D9", bg: "rgba(109,40,217,0.10)" };
  if (key.includes("engaged")) return { color: "#0066CC", bg: "rgba(0,113,227,0.10)" };
  return { color: "#475569", bg: "rgba(100,116,139,0.10)" };
}

function blankStep(day = 0): SequenceStep {
  return { day, channel: "email", label: "" };
}

const SEQUENCE_TEMPLATES: Array<{
  label: string;
  description: string;
  steps: SequenceStep[];
}> = [
  {
    label: "Executive outreach",
    description: "Open a focused conversation with a senior regulatory stakeholder.",
    steps: [
      { day: 0, channel: "email", label: "Send a concise, role-specific introduction" },
      { day: 2, channel: "email", label: "Share a relevant proof point or customer outcome" },
      { day: 4, channel: "call", label: "Make the first call attempt and leave a voicemail" },
      { day: 7, channel: "email", label: "Address the most likely timing or risk objection" },
      { day: 10, channel: "call", label: "Make a final call attempt and confirm next steps" },
    ],
  },
  {
    label: "Post-meeting follow-up",
    description: "Turn a completed meeting into an agreed commercial next step.",
    steps: [
      { day: 0, channel: "email", label: "Send the recap, owners, and agreed next steps" },
      { day: 2, channel: "call", label: "Confirm stakeholders, timing, and open questions" },
      { day: 5, channel: "email", label: "Share the most relevant supporting material" },
      { day: 8, channel: "call", label: "Resolve blockers and confirm the decision path" },
    ],
  },
  {
    label: "Re-engage a stalled account",
    description: "Restart a quiet conversation without repeating the original pitch.",
    steps: [
      { day: 0, channel: "email", label: "Send a short pattern-interrupt with a new reason to reply" },
      { day: 3, channel: "call", label: "Call with a specific, low-friction question" },
      { day: 7, channel: "email", label: "Close the loop and offer a later restart" },
    ],
  },
];

function timingLabel(steps: SequenceStep[], index: number) {
  if (index === 0) {
    if (steps[index].day === 0) return "Starts immediately";
    return `Starts after ${steps[index].day} day${steps[index].day === 1 ? "" : "s"}`;
  }
  const gap = Math.max(0, steps[index].day - steps[index - 1].day);
  if (gap === 0) return `Same day as step ${index}`;
  return `${gap} day${gap === 1 ? "" : "s"} after step ${index}`;
}

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function SequencesView({
  sequences,
  enrollments,
  candidates,
  candidateCount,
  dueCount,
}: {
  sequences: Sequence[];
  enrollments: Enrollment[];
  candidates: SequenceCandidate[];
  candidateCount: number;
  dueCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState(sequences[0]?.id || "");
  const [sequenceQuery, setSequenceQuery] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSteps, setDraftSteps] = useState<SequenceStep[]>([blankStep()]);
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollQuery, setEnrollQuery] = useState("");
  const [pickedAccounts, setPickedAccounts] = useState<Set<string>>(new Set());

  const active = sequences.find((sequence) => sequence.id === activeId) || sequences[0] || null;

  useEffect(() => {
    if (sequences.length && !sequences.some((sequence) => sequence.id === activeId)) {
      setActiveId(sequences[0].id);
    }
  }, [activeId, sequences]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openEditor();
      router.replace("/sequences", { scroll: false });
    }
    // Opening is intentionally driven only by the query value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const countBySequence = useMemo(
    () =>
      enrollments.reduce<Record<string, number>>((counts, enrollment) => {
        counts[enrollment.sequenceId] = (counts[enrollment.sequenceId] || 0) + 1;
        return counts;
      }, {}),
    [enrollments]
  );

  const visibleSequences = sequences.filter((sequence) => {
    const query = sequenceQuery.trim().toLowerCase();
    return !query || `${sequence.name} ${sequence.description}`.toLowerCase().includes(query);
  });
  const activeEnrollments = active
    ? enrollments.filter((enrollment) => enrollment.sequenceId === active.id)
    : [];
  const visibleEnrollments = activeEnrollments.filter((enrollment) =>
    enrollment.company.toLowerCase().includes(accountQuery.trim().toLowerCase())
  );
  const advanceable = active
    ? activeEnrollments.filter(
        (enrollment) =>
          enrollment.managed &&
          enrollment.enrollmentId &&
          enrollment.stepIndex < active.steps.length - 1
      )
    : [];
  const enrolledCustomerIds = new Set(activeEnrollments.map((item) => item.customerId));
  const availableCandidates = candidates.filter((candidate) => {
    const query = enrollQuery.trim().toLowerCase();
    return (
      !enrolledCustomerIds.has(candidate.id) &&
      (!query || `${candidate.company} ${candidate.industry}`.toLowerCase().includes(query))
    );
  });
  const totalSteps = sequences.reduce((total, sequence) => total + sequence.steps.length, 0);
  const activeCount = sequences.filter((sequence) => sequence.status === "active").length;
  const reengagement = sequences.find((sequence) => sequence.id === "reengage");

  const stats = [
    { icon: Zap, label: "Active sequences", value: String(activeCount), sub: "running" },
    { icon: Users, label: "Accounts enrolled", value: String(enrollments.length), sub: "across all plans" },
    { icon: CalendarClock, label: "Due now", value: String(dueCount), sub: dueCount === 1 ? "touch to prep" : "touches to prep", color: "#D97706" },
    { icon: CircleDotDashed, label: "Re-engage", value: String(candidateCount), sub: candidateCount === 1 ? "stalled account" : "stalled accounts", color: "#7C3AED" },
  ];

  function openEditor(sequence?: Sequence) {
    setEditingId(sequence?.id || null);
    setDraftName(sequence?.name || "");
    setDraftDescription(sequence?.description || "");
    setDraftSteps(sequence?.steps.map((step) => ({ ...step })) || [blankStep()]);
    setTemplateChoice(null);
    setEditorOpen(true);
  }

  function updateDraftStep(index: number, patch: Partial<SequenceStep>) {
    setDraftSteps((steps) =>
      steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step))
    );
  }

  function applyTemplate(template: (typeof SEQUENCE_TEMPLATES)[number]) {
    setTemplateChoice(template.label);
    setDraftName(template.label);
    setDraftDescription(template.description);
    setDraftSteps(template.steps.map((step) => ({ ...step })));
  }

  async function saveSequence() {
    if (!draftName.trim()) return toast("Give the sequence a name.", "error");
    if (!draftSteps.length || draftSteps.some((step) => !step.label.trim())) {
      return toast("Every step needs a clear action.", "error");
    }
    if (draftSteps.some((step, index) => index > 0 && step.day < draftSteps[index - 1].day)) {
      return toast("Step days need to move forward through the cadence.", "error");
    }
    setBusy("save-sequence");
    try {
      const response = await fetch(editingId ? `/api/sequences/${editingId}` : "/api/sequences", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          description: draftDescription,
          steps: draftSteps,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not save the sequence.");
      setActiveId(data.sequence.id);
      setEditorOpen(false);
      toast(editingId ? "Sequence updated." : "Sequence created and ready to enroll.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the sequence.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function patchSequence(patch: object, label: string) {
    if (!active) return;
    setBusy(label);
    try {
      const response = await fetch(`/api/sequences/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not update the sequence.");
      toast(label);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update the sequence.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function duplicateSequence() {
    if (!active) return;
    setBusy("duplicate");
    try {
      const response = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${active.name} copy`,
          description: active.description,
          steps: active.steps,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not duplicate the sequence.");
      setActiveId(data.sequence.id);
      toast("Sequence duplicated.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not duplicate the sequence.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function enrollAccounts() {
    if (!active || !pickedAccounts.size) return;
    setBusy("enroll");
    try {
      const response = await fetch("/api/sequences/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: active.id, customerIds: Array.from(pickedAccounts) }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not enroll the accounts.");
      toast(`${data.enrolled} account${data.enrolled === 1 ? "" : "s"} enrolled.`);
      setEnrollOpen(false);
      setPickedAccounts(new Set());
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not enroll the accounts.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function advance(payload: object, key: string, label: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/agent/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not advance the sequence.");
      toast(data.advanced ? `${label} · ${data.advanced} advanced` : "Nothing is due to advance.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not advance the sequence.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function removeEnrollment(enrollmentId: string) {
    setBusy(enrollmentId);
    try {
      const response = await fetch("/api/sequences/enrollments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not remove the enrollment.");
      toast("Account removed from the sequence.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not remove the enrollment.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => <StatTile key={stat.label} {...stat} />)}
      </div>

      {reengagement && (
        <SequenceAgentBanner
          candidateCount={candidateCount}
          dueCount={dueCount}
          sequenceId={reengagement.id}
          sequenceName={reengagement.name}
        />
      )}

      <div className="grid grid-cols-[310px_minmax(0,1fr)] items-start gap-5">
        <aside className="overflow-hidden rounded-lg border border-border-light bg-white">
          <div className="border-b border-border-light p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-text-primary">Sequence library</h2>
                <p className="text-[10.5px] text-text-tertiary">{totalSteps} steps across {sequences.length} plans</p>
              </div>
              <Tooltip label="Create a new sequence" side="bottom" align="right">
                <button
                  type="button"
                  onClick={() => openEditor()}
                  aria-label="New sequence"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-primary text-white hover:bg-blue-hover"
                >
                  <Plus size={15} />
                </button>
              </Tooltip>
            </div>
            <div className="relative mt-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                value={sequenceQuery}
                onChange={(event) => setSequenceQuery(event.target.value)}
                placeholder="Search sequences..."
                className="h-8 w-full rounded-md border border-border bg-surface/50 pl-8 pr-2.5 text-[12px] outline-none focus:border-blue-primary focus:bg-white"
              />
            </div>
          </div>
          <div className="divide-y divide-border-light">
            {visibleSequences.map((sequence) => {
              const selected = sequence.id === active?.id;
              const duration = sequence.steps[sequence.steps.length - 1]?.day || 0;
              return (
                <button
                  key={sequence.id}
                  type="button"
                  onClick={() => {
                    setActiveId(sequence.id);
                    setAccountQuery("");
                  }}
                  aria-pressed={selected}
                  className={cn(
                    "group relative w-full px-4 py-3.5 text-left transition-colors",
                    selected ? "bg-blue-light/40" : "hover:bg-surface/70"
                  )}
                >
                  {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-blue-primary" />}
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {sequence.name}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-text-tertiary">
                      <span className={cn("h-1.5 w-1.5 rounded-full", sequence.status === "active" ? "bg-success" : "bg-text-tertiary")} />
                      {sequence.status === "active" ? "Active" : "Paused"}
                    </span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-text-secondary">
                    {sequence.description || "No description yet."}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-[10.5px] text-text-tertiary">
                    <span>{sequence.steps.length} steps</span>
                    <span>·</span>
                    <span>{duration} days</span>
                    <span>·</span>
                    <span>{countBySequence[sequence.id] || 0} enrolled</span>
                  </span>
                  <span className="mt-2 flex items-center gap-1">
                    {sequence.steps.slice(0, 8).map((step, index) => {
                      const meta = CHANNEL_META[step.channel];
                      return <span key={`${step.day}-${index}`} className="h-1.5 flex-1 rounded-full" style={{ background: meta.color, opacity: 0.75 }} />;
                    })}
                  </span>
                </button>
              );
            })}
            {!visibleSequences.length && (
              <p className="px-4 py-8 text-center text-[12px] text-text-tertiary">No sequences match that search.</p>
            )}
          </div>
        </aside>

        {active ? (
          <div className="min-w-0 space-y-5">
            <Card className="overflow-hidden p-0">
              <div className="flex items-start justify-between gap-5 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                      <Zap size={17} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[18px] font-semibold text-text-primary">{active.name}</h2>
                        <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", active.status === "active" ? "bg-success/10 text-success" : "bg-surface text-text-secondary")}>
                          {active.status === "active" ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-text-secondary">{active.description || "No description yet."}</p>
                      <p className="mt-1.5 text-[10.5px] text-text-tertiary">Owned by {active.owner} · {activeEnrollments.length} enrolled accounts</p>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="secondary" className="h-8 px-2.5 py-0 text-[12px]" onClick={() => setEnrollOpen(true)}>
                    <Users size={13} /> Enroll accounts
                  </Button>
                  <Tooltip label="Edit sequence" side="bottom">
                    <button onClick={() => openEditor(active)} aria-label="Edit sequence" className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface hover:text-blue-primary">
                      <Pencil size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip label="Duplicate sequence" side="bottom">
                    <button onClick={duplicateSequence} disabled={busy !== null} aria-label="Duplicate sequence" className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface hover:text-blue-primary disabled:opacity-50">
                      <Copy size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip label={active.status === "active" ? "Pause sequence" : "Resume sequence"} side="bottom" align="right">
                    <button
                      onClick={() => patchSequence({ status: active.status === "active" ? "paused" : "active" }, active.status === "active" ? "Sequence paused." : "Sequence resumed.")}
                      disabled={busy !== null}
                      aria-label={active.status === "active" ? "Pause sequence" : "Resume sequence"}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface hover:text-blue-primary disabled:opacity-50"
                    >
                      {active.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div className="border-t border-border-light bg-surface/25 px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[12px] font-semibold text-text-primary">Cadence timeline</h3>
                    <p className="text-[10.5px] text-text-tertiary">Every touch, in the exact order it will be prepared.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-text-secondary">
                    <span className="rounded-md border border-border-light bg-white px-2 py-1">{active.steps.length} steps</span>
                    <span className="rounded-md border border-border-light bg-white px-2 py-1">{active.steps[active.steps.length - 1]?.day || 0} days</span>
                    <span className="rounded-md border border-border-light bg-white px-2 py-1">{active.steps.filter((step) => step.channel === "email").length} emails</span>
                    <span className="rounded-md border border-border-light bg-white px-2 py-1">{active.steps.filter((step) => step.channel === "call").length} calls</span>
                  </div>
                </div>
                <ol className="grid grid-cols-4 gap-3" aria-label={`${active.name} timeline`}>
                  {active.steps.map((step, index) => {
                    const meta = CHANNEL_META[step.channel];
                    const Icon = meta.icon;
                    return (
                      <li
                        key={`${step.day}-${index}`}
                        aria-label={`Step ${index + 1} on day ${step.day}: ${CHANNEL_LABEL[step.channel]} — ${step.label}`}
                        className="relative flex min-h-[146px] min-w-0 flex-col rounded-md border border-border-light bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                        style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-text-secondary">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-text-primary text-[9px] text-white">{index + 1}</span>
                            Step {index + 1}
                          </span>
                          <span className="rounded-md bg-surface px-2 py-1 text-[10px] font-bold text-text-primary tnum">Day {step.day}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ color: meta.color, background: meta.bg }}>
                            <Icon size={13} strokeWidth={2.1} />
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: meta.color }}>
                            {CHANNEL_LABEL[step.channel]}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-[12px] font-medium leading-[1.35] text-text-primary">{step.label}</p>
                        <p className="mt-auto border-t border-border-light pt-2 text-[10px] font-medium text-text-tertiary">
                          {timingLabel(active.steps, index)}
                        </p>
                        {index < active.steps.length - 1 && index % 4 !== 3 && (
                          <ChevronRight size={14} className="absolute -right-[14px] top-1/2 z-10 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-light px-5 py-3.5">
                <div>
                  <h3 className="text-[14px] font-semibold text-text-primary">Enrolled accounts <span className="text-text-tertiary tnum">({activeEnrollments.length})</span></h3>
                  <p className="text-[11.5px] text-text-tertiary">Live position, next action, and completion for every account.</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative w-[210px]">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="Search accounts..." className="h-8 w-full rounded-md border border-border bg-white pl-8 pr-2.5 text-[12px] outline-none focus:border-blue-primary" />
                  </div>
                  {advanceable.length > 0 && active.status === "active" && (
                    <Button onClick={() => advance({ sequenceId: active.id }, "advance-all", "Sequence advanced")} loading={busy === "advance-all"} className="h-8 px-3 py-0 text-[12px]">
                      <Play size={12} /> Advance due ({advanceable.length})
                    </Button>
                  )}
                </div>
              </div>

              {visibleEnrollments.length ? (
                <div className="divide-y divide-border-light">
                  {visibleEnrollments.map((enrollment) => {
                    const stepIndex = Math.min(enrollment.stepIndex, active.steps.length - 1);
                    const step = active.steps[stepIndex];
                    const meta = CHANNEL_META[step.channel];
                    const StepIcon = meta.icon;
                    const percent = Math.round(((stepIndex + 1) / active.steps.length) * 100);
                    const complete = enrollment.stepIndex >= active.steps.length - 1;
                    const nextStep = complete ? null : active.steps[stepIndex + 1];
                    const nextMeta = nextStep ? CHANNEL_META[nextStep.channel] : null;
                    const NextIcon = nextMeta?.icon;
                    const stage = stageStyle(enrollment.stage);
                    return (
                      <article key={enrollment.enrollmentId || `${enrollment.customerId}-${enrollment.sequenceId}`} className="px-5 py-4 hover:bg-surface/30">
                        <div className="grid grid-cols-[minmax(170px,1fr)_160px_auto] items-center gap-4">
                          <Link href={`/customers/${enrollment.customerId}`} className="group flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/30">
                            <CompanyLogo name={enrollment.company} className="h-8 w-8 shrink-0 text-[10px]" />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold text-text-primary group-hover:text-blue-primary">{enrollment.company}</span>
                              <span className="mt-1 block w-fit rounded px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: stage.color, background: stage.bg }}>{enrollment.stage}</span>
                            </span>
                          </Link>
                          <span className="min-w-0">
                            <span className="flex items-center justify-between text-[10px] font-medium text-text-secondary"><span>{complete ? "Completed" : `${active.steps.length - stepIndex - 1} remaining`}</span><span className="tnum">{percent}%</span></span>
                            <span className="mt-1.5 flex gap-1" aria-label={`${percent}% complete`}>
                              {active.steps.map((cadenceStep, cadenceIndex) => (
                                <span
                                  key={`${cadenceStep.day}-${cadenceIndex}`}
                                  className="h-1.5 min-w-0 flex-1 rounded-full"
                                  style={{ background: cadenceIndex <= stepIndex ? CHANNEL_META[cadenceStep.channel].color : "#E5E7EB" }}
                                />
                              ))}
                            </span>
                          </span>
                          <span className="flex items-center justify-end gap-1.5">
                            {complete ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success"><CheckCircle2 size={14} /> Done</span>
                            ) : enrollment.managed && enrollment.enrollmentId ? (
                              <>
                                <button onClick={() => advance({ enrollmentId: enrollment.enrollmentId }, enrollment.enrollmentId!, `${enrollment.company} advanced`)} disabled={busy !== null || active.status === "paused"} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-blue-primary hover:bg-blue-light disabled:opacity-40"><Play size={11} /> Advance</button>
                                <Tooltip label="Remove from sequence" align="right">
                                  <button onClick={() => removeEnrollment(enrollment.enrollmentId!)} disabled={busy !== null} aria-label={`Remove ${enrollment.company} from sequence`} className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-error/10 hover:text-error disabled:opacity-40"><Trash2 size={13} /></button>
                                </Tooltip>
                              </>
                            ) : (
                              <Link href={`/customers/${enrollment.customerId}`} aria-label={`Open ${enrollment.company}`} className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-blue-primary"><ChevronRight size={15} /></Link>
                            )}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-stretch gap-2">
                          <div className="rounded-md border border-border-light bg-surface/35 p-2.5">
                            <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Current touch</span>
                            <span className="flex min-w-0 items-start gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: meta.color, background: meta.bg }}><StepIcon size={14} /></span>
                              <span className="min-w-0">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-secondary">Step {stepIndex + 1} of {active.steps.length} <span className="text-text-tertiary">· Day {step.day}</span></span>
                                <span className="mt-1 block line-clamp-2 text-[11.5px] leading-snug text-text-primary">{step.label}</span>
                              </span>
                            </span>
                          </div>
                          <span className="flex items-center justify-center text-text-tertiary"><ChevronRight size={14} /></span>
                          <div className="rounded-md border border-border-light bg-white p-2.5">
                            <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Next touch</span>
                            {nextStep && nextMeta && NextIcon ? (
                              <span className="flex min-w-0 items-start gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: nextMeta.color, background: nextMeta.bg }}><NextIcon size={14} /></span>
                                <span className="min-w-0">
                                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-text-secondary">Step {stepIndex + 2} <span className="text-text-tertiary">· Day {nextStep.day}</span></span>
                                  <span className="mt-1 block line-clamp-2 text-[11.5px] leading-snug text-text-primary">{nextStep.label}</span>
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold text-success"><CheckCircle2 size={15} /> Sequence complete</span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="text-[13px] font-medium text-text-primary">{accountQuery ? "No matching accounts" : "No accounts enrolled"}</p>
                  <p className="mt-1 text-[12px] text-text-tertiary">{accountQuery ? "Try a different account name." : "Enroll the first accounts to put this sequence into motion."}</p>
                  {!accountQuery && <Button className="mt-4" onClick={() => setEnrollOpen(true)}><Users size={14} /> Enroll accounts</Button>}
                </div>
              )}
            </Card>

            <p className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
              <ListChecks size={13} /> Email steps create drafts and call steps create reminders. Nothing sends or dials without review.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
            <Archive className="mx-auto text-text-tertiary" size={24} />
            <h2 className="mt-3 text-[15px] font-semibold text-text-primary">Create your first sequence</h2>
            <p className="mt-1 text-[12px] text-text-tertiary">Build a repeatable email and call cadence, then enroll accounts.</p>
            <Button className="mt-4" onClick={() => openEditor()}><Plus size={14} /> New sequence</Button>
          </div>
        )}
      </div>

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit sequence" : "New sequence"} size="workflow">
        <div className="space-y-4">
          {!editingId && (
            <section aria-labelledby="sequence-template-heading">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="sequence-template-heading" className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-secondary">Template</h3>
                <span className="text-[10.5px] text-text-tertiary">Optional</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SEQUENCE_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    aria-pressed={templateChoice === template.label}
                    className={cn(
                      "rounded-md border bg-white px-3 py-2.5 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/30",
                      templateChoice === template.label ? "border-blue-primary bg-blue-light/35 ring-1 ring-blue-primary/10" : "border-border-light"
                    )}
                  >
                    <span className="block text-[12px] font-semibold text-text-primary">{template.label}</span>
                    <span className="mt-1 block text-[10.5px] text-text-tertiary">{template.steps.length} steps · {template.steps[template.steps.length - 1]?.day || 0} days</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-md border border-border-light bg-surface/30 p-3.5" aria-labelledby="sequence-details-heading">
            <h3 id="sequence-details-heading" className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-text-secondary">Sequence details</h3>
            <div className="grid grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)] gap-3">
              <label>
                <span className="mb-1 block text-[10.5px] font-semibold text-text-secondary">Name</span>
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Sequence name" placeholder="e.g. Clinical-stage outreach" className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none focus:border-blue-primary" />
              </label>
              <label>
                <span className="mb-1 block text-[10.5px] font-semibold text-text-secondary">Purpose and audience</span>
                <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} aria-label="Sequence description" placeholder="Who this is for and the outcome it should drive" className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none focus:border-blue-primary" />
              </label>
            </div>
          </section>

          <section aria-labelledby="cadence-builder-heading">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h3 id="cadence-builder-heading" className="text-[13px] font-semibold text-text-primary">Cadence builder</h3>
                  <p className="text-[10.5px] text-text-tertiary">{countLabel(draftSteps.length, "step")} · {countLabel(draftSteps[draftSteps.length - 1]?.day || 0, "day")} · {countLabel(draftSteps.filter((step) => step.channel === "email").length, "email")} · {countLabel(draftSteps.filter((step) => step.channel === "call").length, "call")}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDraftSteps((steps) => [...steps, blankStep((steps[steps.length - 1]?.day || 0) + 2)])} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] font-semibold text-blue-primary hover:bg-blue-light"><Plus size={13} /> Add step</button>
            </div>
            <div className="mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1">
              {draftSteps.map((step, index) => {
                const meta = CHANNEL_META[step.channel];
                return (
                  <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_32px] gap-3 rounded-md border border-border-light bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}>
                    <div className="flex flex-col items-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-text-primary text-[11px] font-bold text-white">{index + 1}</span>
                      {index < draftSteps.length - 1 && <span className="mt-1 h-full min-h-[36px] w-px bg-border-light" />}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-secondary">Step {index + 1}</span>
                        <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-medium text-text-tertiary">{timingLabel(draftSteps, index)}</span>
                      </div>
                      <div className="grid grid-cols-[210px_86px_minmax(0,1fr)] items-end gap-2.5">
                        <div>
                          <span className="mb-1 block text-[9.5px] font-semibold text-text-tertiary">Channel</span>
                          <div className="grid h-9 grid-cols-3 rounded-md border border-border bg-surface/40 p-0.5" role="group" aria-label={`Step ${index + 1} channel`}>
                            {(["email", "call", "wait"] as SequenceChannel[]).map((channel) => {
                              const channelMeta = CHANNEL_META[channel];
                              const ChannelIcon = channelMeta.icon;
                              const selected = step.channel === channel;
                              return (
                                <button
                                  key={channel}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => updateDraftStep(index, { channel })}
                                  className={cn("inline-flex items-center justify-center gap-1 rounded text-[10px] font-semibold transition-colors", selected ? "bg-white text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary")}
                                >
                                  <ChannelIcon size={11} style={{ color: selected ? channelMeta.color : undefined }} /> {CHANNEL_LABEL[channel]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <label>
                          <span className="mb-1 block text-[9.5px] font-semibold text-text-tertiary">Day</span>
                          <input type="number" min={0} value={step.day} onChange={(event) => updateDraftStep(index, { day: Math.max(0, Number(event.target.value)) })} aria-label={`Step ${index + 1} day`} className="h-9 w-full rounded-md border border-border bg-white px-2 text-[12px] font-semibold outline-none focus:border-blue-primary" />
                        </label>
                        <label className="min-w-0">
                          <span className="mb-1 block text-[9.5px] font-semibold text-text-tertiary">Action</span>
                          <input value={step.label} onChange={(event) => updateDraftStep(index, { label: event.target.value })} aria-label={`Step ${index + 1} action`} placeholder="Describe the exact touch" className="h-9 w-full min-w-0 rounded-md border border-border bg-white px-3 text-[12px] outline-none focus:border-blue-primary" />
                        </label>
                      </div>
                    </div>
                    <Tooltip label="Remove step" align="right">
                      <button type="button" onClick={() => setDraftSteps((steps) => steps.filter((_, stepIndex) => stepIndex !== index))} disabled={draftSteps.length === 1} aria-label={`Remove step ${index + 1}`} className="mt-6 flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-error/10 hover:text-error disabled:opacity-30"><Trash2 size={14} /></button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex items-center justify-between border-t border-border-light pt-4">
            <p className="inline-flex items-center gap-1.5 text-[10.5px] text-text-tertiary"><ListChecks size={12} /> Drafts and call reminders stay review-gated.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={saveSequence} loading={busy === "save-sequence"}><Check size={14} /> {editingId ? "Save changes" : "Create sequence"}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title={`Enroll accounts${active ? ` · ${active.name}` : ""}`} size="wide">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={enrollQuery} onChange={(event) => setEnrollQuery(event.target.value)} placeholder="Search accounts or industries..." className="h-10 w-full rounded-md border border-border pl-9 pr-3 text-[13px] outline-none focus:border-blue-primary" />
        </div>
        <div className="mt-3 max-h-[360px] overflow-y-auto rounded-md border border-border-light">
          {availableCandidates.map((candidate) => (
            <label key={candidate.id} className="flex cursor-pointer items-center gap-3 border-b border-border-light px-3 py-2.5 last:border-b-0 hover:bg-surface">
              <input type="checkbox" checked={pickedAccounts.has(candidate.id)} onChange={() => setPickedAccounts((current) => { const next = new Set(current); if (next.has(candidate.id)) next.delete(candidate.id); else next.add(candidate.id); return next; })} />
              <CompanyLogo name={candidate.company} className="h-8 w-8 text-[10px]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-text-primary">{candidate.company}</span><span className="block truncate text-[11px] text-text-tertiary">{candidate.industry}</span></span>
            </label>
          ))}
          {!availableCandidates.length && <p className="px-4 py-10 text-center text-[12px] text-text-tertiary">Every matching account is already enrolled.</p>}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12px] text-text-tertiary">{pickedAccounts.size} selected</span>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setEnrollOpen(false)}>Cancel</Button><Button onClick={enrollAccounts} loading={busy === "enroll"} disabled={!pickedAccounts.size}><Users size={14} /> Enroll selected</Button></div>
        </div>
      </Modal>
    </div>
  );
}
