"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Workflow,
  Zap,
  ChevronRight,
  Check,
  ShieldCheck,
  ArrowUpRight,
  Circle,
  RotateCw,
  Undo2,
  ListChecks,
  Maximize2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import type { AgentRun, AgentStepStatus } from "@/lib/types";

const KIND_ICON = { act: Bot, play: Workflow, autopilot: Zap, plan: ListChecks } as const;
const KIND_LABEL = {
  act: "Drafted",
  play: "Outreach",
  autopilot: "Autopilot",
  plan: "Goal",
} as const;

const OUTCOME_STYLE: Record<AgentRun["outcome"], string> = {
  handled: "bg-blue-light text-blue-primary",
  sent: "bg-success/15 text-success",
  escalated: "bg-warning/15 text-warning",
  mixed: "bg-surface text-text-secondary",
};

function StepIcon({ status }: { status: AgentStepStatus }) {
  if (status === "gated")
    return <ShieldCheck size={14} strokeWidth={2} className="text-warning" />;
  if (status === "escalated")
    return <ArrowUpRight size={14} strokeWidth={2} className="text-warning" />;
  if (status === "skipped")
    return <Circle size={14} strokeWidth={2} className="text-text-tertiary" />;
  return <Check size={14} strokeWidth={2.4} className="text-success" />;
}

export function AgentRunHistory({ runs }: { runs: AgentRun[] }) {
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<AgentRun["kind"] | "all">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<AgentRun["outcome"] | "all">(
    "all"
  );
  const { toast } = useToast();
  const router = useRouter();

  // #53 — only offer a filter that actually exists in the data.
  const kinds = Array.from(new Set(runs.map((r) => r.kind)));
  const outcomes = Array.from(new Set(runs.map((r) => r.outcome)));
  const showFilters = runs.length > 2 && (kinds.length > 1 || outcomes.length > 1);
  const visible = runs.filter(
    (r) =>
      (kindFilter === "all" || r.kind === kindFilter) &&
      (outcomeFilter === "all" || r.outcome === outcomeFilter)
  );

  async function undo(run: AgentRun) {
    setUndoing(run.id);
    try {
      const res = await fetch("/api/agent/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Reverted — ${data.removed ?? 0} step(s) rolled back`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't undo that run", "error");
      }
    } catch {
      toast("Couldn't undo that run", "error");
    } finally {
      setUndoing(null);
    }
  }

  async function replay(run: AgentRun) {
    if (!run.customer_id) return;
    setReplaying(run.id);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: run.customer_id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Re-ran the play for ${run.company ?? "the account"}`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't re-run that play", "error");
      }
    } catch {
      toast("Couldn't re-run that play", "error");
    } finally {
      setReplaying(null);
    }
  }

  return (
    <div>
      {showFilters && (
        <div className="flex items-center gap-2 mb-3">
          <select
            aria-label="Filter runs by kind"
            value={kindFilter}
            onChange={(e) =>
              setKindFilter(e.target.value as AgentRun["kind"] | "all")
            }
            className="bg-surface border border-border rounded-md px-2.5 py-1 text-[12px] text-text-primary outline-none focus:border-blue-primary transition-colors"
          >
            <option value="all">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter runs by outcome"
            value={outcomeFilter}
            onChange={(e) =>
              setOutcomeFilter(e.target.value as AgentRun["outcome"] | "all")
            }
            className="bg-surface border border-border rounded-md px-2.5 py-1 text-[12px] text-text-primary outline-none focus:border-blue-primary transition-colors capitalize"
          >
            <option value="all">All outcomes</option>
            {outcomes.map((o) => (
              <option key={o} value={o} className="capitalize">
                {o}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-text-tertiary tnum ml-auto">
            {visible.length} of {runs.length}
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <p className="text-[13px] text-text-secondary">
            No runs match this filter.
          </p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {visible.map((run) => {
          const Icon = KIND_ICON[run.kind];
          const isOpen = open === run.id;
          return (
            <li key={run.id}>
              <button
                onClick={() => setOpen(isOpen ? null : run.id)}
                className="grid w-full grid-cols-[32px_minmax(0,1fr)_16px] items-start gap-x-2.5 px-3 py-3 text-left transition-colors hover:bg-surface"
                aria-expanded={isOpen}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                  <Icon size={15} strokeWidth={1.7} />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="min-w-0 text-[13px] font-semibold leading-snug text-text-primary">
                      {run.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize",
                        run.reverted
                          ? "bg-surface text-text-tertiary line-through"
                          : OUTCOME_STYLE[run.outcome]
                      )}
                    >
                      {run.reverted ? "reverted" : run.outcome}
                    </span>
                  </span>
                  <span className="mt-0.5 block break-words text-[11.5px] leading-snug text-text-secondary">
                    {KIND_LABEL[run.kind]} · {run.steps.length} step
                    {run.steps.length === 1 ? "" : "s"}
                  </span>
                  <span className="mt-1 block break-words text-[11.5px] leading-snug text-text-tertiary">
                    {run.summary}
                  </span>
                  <span className="mt-1 block text-[10.5px] text-text-tertiary tnum">
                    {formatDateTime(run.created_at)}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className={cn(
                    "mt-1 shrink-0 text-text-tertiary transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <ol className="relative ml-4 space-y-3 border-l border-border-light py-1">
                    {run.steps.map((step, i) => (
                      <li key={i} className="relative min-w-0 pl-5">
                        <span className="absolute -left-[9px] top-0 w-[18px] h-[18px] rounded-full bg-white border border-border-light flex items-center justify-center">
                          <StepIcon status={step.status} />
                        </span>
                        <span className="block break-words text-[12.5px] font-medium leading-snug text-text-primary">
                          {step.label}
                        </span>
                        {step.detail && (
                          <span className="mt-0.5 block break-words text-[11.5px] leading-snug text-text-secondary">
                            {step.detail}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>

                  <div className="mt-3 grid grid-cols-2 gap-2 pl-4">
                    <Link
                      href={`/agent/runs/${run.id}`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border-light px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-surface"
                    >
                      <Maximize2 size={13} strokeWidth={2} />
                      Open run
                    </Link>
                    {run.kind === "play" && run.customer_id && (
                      <button
                        onClick={() => replay(run)}
                        disabled={replaying === run.id}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border-light px-2.5 py-1.5 text-[11.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-light disabled:opacity-50"
                      >
                        <RotateCw
                          size={13}
                          strokeWidth={2}
                          className={cn(replaying === run.id && "animate-spin")}
                        />
                        {replaying === run.id ? "Re-running…" : "Run again"}
                      </button>
                    )}
                    {run.kind !== "play" &&
                      !run.reverted &&
                      (run.interaction_ids?.length ?? 0) > 0 && (
                        <button
                          onClick={() => undo(run)}
                          disabled={undoing === run.id}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-light text-text-secondary hover:bg-surface transition-colors disabled:opacity-50"
                        >
                          <Undo2 size={13} strokeWidth={2} />
                          {undoing === run.id ? "Undoing…" : "Undo"}
                        </button>
                      )}
                    {run.reverted && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary">
                        <Undo2 size={13} strokeWidth={2} /> Reverted
                      </span>
                    )}
                  </div>
                </div>
              )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
