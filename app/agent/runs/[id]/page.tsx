import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Play,
  Zap,
  ListChecks,
  Check,
  ShieldCheck,
  ArrowUpRight,
  Circle,
  Building2,
  Clock,
  Hash,
  Undo2,
  ScrollText,
  FileText,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { OutcomeBadge } from "@/components/ui/Badge";
import { RunDetailActions } from "@/components/agent/RunDetailActions";
import { cn, formatDateTime } from "@/lib/utils";
import type { AgentRun, AgentStepStatus, Interaction } from "@/lib/types";

export const metadata = { title: "Agent run" };
export const dynamic = "force-dynamic";

const KIND_ICON = { act: Bot, play: Play, autopilot: Zap, plan: ListChecks } as const;
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

const STEP_LABEL: Record<AgentStepStatus, string> = {
  done: "Done",
  gated: "Awaited your approval",
  escalated: "Needs your approval",
  skipped: "Skipped",
};

function StepIcon({ status }: { status: AgentStepStatus }) {
  if (status === "gated")
    return <ShieldCheck size={15} strokeWidth={2} className="text-warning" />;
  if (status === "escalated")
    return <ArrowUpRight size={15} strokeWidth={2} className="text-warning" />;
  if (status === "skipped")
    return <Circle size={14} strokeWidth={2} className="text-text-tertiary" />;
  return <Check size={15} strokeWidth={2.4} className="text-success" />;
}

export default async function AgentRunDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = getDb();
  const run = await db.agentRuns.get(params.id);
  if (!run) notFound();

  // Only pull the activity log when the run actually wrote entries (#52).
  const [allInteractions, customers] = run.interaction_ids?.length
    ? await Promise.all([db.interactions.list(), db.customers.list()])
    : [[] as Interaction[], []];
  const companyOf = new Map(customers.map((c) => [c.id, c.company_name]));

  const Icon = KIND_ICON[run.kind];
  const steps = run.steps || [];
  const doneCount = steps.filter((s) => s.status === "done").length;
  const interactionCount = run.interaction_ids?.length ?? 0;

  // #52 — resolve the actual timeline entries this run wrote, so the run links
  // to the durable account activity it created (not just the step narrative).
  const logged: Interaction[] = interactionCount
    ? (run.interaction_ids || [])
        .map((id) => allInteractions.find((i) => i.id === id))
        .filter((i): i is Interaction => Boolean(i))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline mb-3"
        >
          <ArrowLeft size={14} strokeWidth={1.9} />
          Back to Agent
        </Link>
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mt-0.5">
            <Icon size={20} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <PageHeader title={run.title} subtitle={run.summary} />
          </div>
          <span
            className={cn(
              "text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 capitalize mt-1",
              run.reverted
                ? "bg-surface text-text-tertiary line-through"
                : OUTCOME_STYLE[run.outcome]
            )}
          >
            {run.reverted ? "reverted" : run.outcome}
          </span>
        </div>
      </div>

      {/* Run metadata */}
      <Card className="p-0 overflow-hidden">
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border-light">
          <div className="px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
              <Bot size={12} strokeWidth={1.8} className="text-blue-primary" />
              Kind
            </dt>
            <dd className="text-[13px] font-medium text-text-primary mt-1">
              {KIND_LABEL[run.kind]}
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
              <ListChecks size={12} strokeWidth={1.8} className="text-blue-primary" />
              Steps
            </dt>
            <dd className="text-[13px] font-medium text-text-primary mt-1 tnum">
              {doneCount}/{steps.length} done
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
              <Hash size={12} strokeWidth={1.8} className="text-blue-primary" />
              Logged
            </dt>
            <dd className="text-[13px] font-medium text-text-primary mt-1 tnum">
              {interactionCount} entr{interactionCount === 1 ? "y" : "ies"}
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
              <Clock size={12} strokeWidth={1.8} className="text-blue-primary" />
              When
            </dt>
            <dd className="text-[13px] font-medium text-text-primary mt-1">
              {formatDateTime(run.created_at)}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {run.customer_id && run.company ? (
          <Link
            href={`/customers/${run.customer_id}`}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-primary hover:underline"
          >
            <Building2 size={15} strokeWidth={1.9} />
            {run.company}
            <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
        ) : (
          <span />
        )}
        <RunDetailActions run={run} />
      </div>

      {/* Step timeline */}
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          Step timeline
        </h2>
        <Card>
          {steps.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              This run recorded no individual steps.
            </p>
          ) : (
            <ol className="relative border-l border-border-light ml-1 space-y-4 py-1">
              {steps.map((step, i) => (
                <li key={i} className="relative pl-6">
                  <span className="absolute -left-[10px] top-0 w-[20px] h-[20px] rounded-full bg-white border border-border-light flex items-center justify-center">
                    <StepIcon status={step.status} />
                  </span>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-text-primary">
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium shrink-0",
                        step.status === "gated" || step.status === "escalated"
                          ? "text-warning"
                          : step.status === "skipped"
                          ? "text-text-tertiary"
                          : "text-success"
                      )}
                    >
                      {STEP_LABEL[step.status]}
                    </span>
                  </div>
                  {step.detail && (
                    <span className="block text-[12px] text-text-secondary mt-0.5">
                      {step.detail}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* The draft the agent produced — the actual, readable output (#agent). */}
      {run.draft && (
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1 flex items-center gap-2">
            <FileText size={16} strokeWidth={1.8} className="text-blue-primary" />
            The draft
          </h2>
          <p className="text-[12px] text-text-secondary mb-3">
            A first draft from this account&apos;s live data — edit before you
            send. Nothing was sent.
          </p>
          <Card>
            <p className="text-[14px] font-semibold text-text-primary mb-2">
              {run.draft.title}
            </p>
            <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary bg-surface border border-border-light rounded-xl p-4 font-sans">
              {run.draft.body}
            </pre>
          </Card>
        </div>
      )}

      {/* What it logged — the durable timeline entries this run wrote (#52) */}
      {interactionCount > 0 && (
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1 flex items-center gap-2">
            <ScrollText size={16} strokeWidth={1.8} className="text-blue-primary" />
            What it logged
          </h2>
          <p className="text-[12px] text-text-secondary mb-3">
            {run.reverted
              ? "These entries were rolled back when the run was reverted."
              : `This run wrote ${logged.length} entr${
                  logged.length === 1 ? "y" : "ies"
                } to the account timeline.`}
          </p>
          {logged.length === 0 ? (
            <Card>
              <p className="text-[13px] text-text-secondary">
                The entries this run created are no longer on the timeline.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {logged.map((it) => {
                const company = companyOf.get(it.customer_id);
                return (
                  <Card key={it.id} className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <OutcomeBadge outcome={it.outcome} />
                        {company && (
                          <Link
                            href={`/customers/${it.customer_id}`}
                            className={cn(
                              "text-[13px] font-semibold text-blue-primary hover:underline inline-flex items-center gap-1",
                              run.reverted && "line-through"
                            )}
                          >
                            {company}
                            <ArrowUpRight size={12} strokeWidth={2} />
                          </Link>
                        )}
                      </div>
                      <span className="text-[12px] text-text-tertiary shrink-0">
                        {formatDateTime(it.created_at)}
                      </span>
                    </div>
                    {it.notes && (
                      <p className="text-[13px] text-text-secondary leading-relaxed">
                        {it.notes}
                      </p>
                    )}
                    {it.logged_by && (
                      <p className="text-[12px] text-text-tertiary mt-2">
                        Logged by {it.logged_by}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {run.reverted && (
        <Card className="bg-surface border-border-light flex items-center gap-2.5">
          <Undo2 size={15} strokeWidth={2} className="text-text-tertiary shrink-0" />
          <p className="text-[13px] text-text-secondary">
            This run was reverted — the timeline entries it created have been
            rolled back.
          </p>
        </Card>
      )}
    </div>
  );
}
