"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Search,
  Sparkles,
} from "lucide-react";
import { AgentActions } from "@/components/agent/AgentActions";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import type { AgentAction } from "@/lib/agent";

type ReviewTask = {
  id: string;
  customerId: string;
  contactId: string;
  company: string;
  contact: string;
  service: string;
  status: string;
};

type FollowUpTask = {
  id: string;
  customerId: string;
  contactId: string;
  company: string;
  contact: string;
  due: string;
};

type Filter = "all" | "review" | "followup" | "overdue";

function dueInfo(due: string, todayMs: number) {
  const d = new Date(due);
  const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayMs - todayMs) / 86400000);
  if (days < 0)
    return { kind: "overdue" as const, label: `${Math.abs(days)}d overdue`, days };
  if (days === 0) return { kind: "today" as const, label: "Due today", days };
  if (days === 1) return { kind: "soon" as const, label: "Tomorrow", days };
  if (days <= 7) return { kind: "soon" as const, label: `In ${days} days`, days };
  return { kind: "later" as const, label: formatDate(due), days };
}

export function TasksWorkspace({
  reviewTasks,
  followUps,
  agentActions,
  todayMs,
}: {
  reviewTasks: ReviewTask[];
  followUps: FollowUpTask[];
  agentActions: AgentAction[];
  todayMs: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const queue = useMemo(() => {
    const reviews = reviewTasks.map((task) => ({
      ...task,
      kind: "review" as const,
      task: task.service,
      dueLabel: "Needs review",
      urgency: task.status === "changes_requested" ? -2 : -1,
      href: `/sessions/${task.id}`,
    }));
    const followups = followUps.map((task) => {
      const due = dueInfo(task.due, todayMs);
      return {
        ...task,
        kind: "followup" as const,
        status: due.kind,
        task: `Follow up with ${task.contact}`,
        dueLabel: due.label,
        urgency: due.days,
        href: `/contacts/${task.contactId}`,
      };
    });
    return [...reviews, ...followups].sort((a, b) => a.urgency - b.urgency);
  }, [followUps, reviewTasks, todayMs]);

  const overdue = queue.filter((task) => task.kind === "followup" && task.status === "overdue").length;
  const dueSoon = queue.filter(
    (task) => task.kind === "followup" && ["overdue", "today", "soon"].includes(task.status)
  ).length;

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return queue.filter((task) => {
      if (filter === "review" && task.kind !== "review") return false;
      if (filter === "followup" && task.kind !== "followup") return false;
      if (filter === "overdue" && !(task.kind === "followup" && task.status === "overdue")) return false;
      if (!normalized) return true;
      return [task.company, task.contact, task.task, task.dueLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, query, queue]);

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="You're all caught up"
        description="No pitches are awaiting review and no follow-ups are due."
      />
    );
  }

  const filters: { key: Filter; label: string; count: number; color: string; active: string }[] = [
    { key: "all", label: "All", count: queue.length, color: "bg-blue-light text-blue-primary", active: "ring-blue-primary/25" },
    { key: "review", label: "Reviews", count: reviewTasks.length, color: "bg-violet-50 text-violet-700", active: "ring-violet-500/25" },
    { key: "followup", label: "Follow-ups", count: followUps.length, color: "bg-emerald-50 text-emerald-700", active: "ring-emerald-500/25" },
    { key: "overdue", label: "Overdue", count: overdue, color: "bg-red-50 text-red-700", active: "ring-red-500/25" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Needs attention", value: queue.length, note: "open tasks", icon: ClipboardCheck, color: "text-blue-primary", bg: "bg-blue-light" },
          { label: "Compliance", value: reviewTasks.length, note: "awaiting review", icon: ClipboardCheck, color: "text-violet-700", bg: "bg-violet-50" },
          { label: "Due this week", value: dueSoon, note: "follow-ups", icon: CalendarClock, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Overdue", value: overdue, note: overdue ? "act now" : "nothing late", icon: AlertTriangle, color: overdue ? "text-red-700" : "text-text-tertiary", bg: overdue ? "bg-red-50" : "bg-surface" },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="p-4 flex items-center gap-3 min-h-[92px]">
              <span className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", metric.bg, metric.color)}>
                <Icon size={19} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase text-text-tertiary">{metric.label}</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[25px] leading-none font-semibold text-text-primary tnum">{metric.value}</span>
                  <span className="text-[12px] text-text-secondary truncate">{metric.note}</span>
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {agentActions.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
                <Sparkles size={17} className="text-blue-primary" /> Agent-ready actions
              </h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Draft, review, or clear the next move without leaving the queue.</p>
            </div>
            <Link href="/agent" className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline">
              Open Agent <ArrowRight size={13} />
            </Link>
          </div>
          <AgentActions actions={agentActions} />
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary">Work queue</h2>
            <p className="text-[12px] text-text-secondary">Sorted by urgency, with the next action first.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-[260px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, accounts, contacts..."
                aria-label="Search tasks"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-white text-[13px] outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10"
              />
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter tasks">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={filter === item.key}
                  className={cn(
                    "h-8 rounded-full px-3 text-[12px] font-semibold transition-all",
                    item.color,
                    filter === item.key
                      ? `ring-2 ring-offset-1 ${item.active}`
                      : "opacity-70 hover:opacity-100"
                  )}
                >
                  {item.label} <span className="ml-1 tnum opacity-75">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <div className="grid grid-cols-[120px_minmax(220px,1.1fr)_minmax(280px,1.4fr)_150px_40px] gap-4 items-center px-4 h-10 bg-surface border-b border-border text-[11px] font-semibold uppercase text-text-tertiary">
            <span>Type</span><span>Account / contact</span><span>Task</span><span>Due / status</span><span />
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[14px] font-semibold text-text-primary">No tasks match this view</p>
              <p className="text-[12px] text-text-secondary mt-1">Try another filter or search term.</p>
            </div>
          ) : (
            visible.map((task) => {
              const isReview = task.kind === "review";
              return (
                <div
                  key={`${task.kind}-${task.id}`}
                  className="grid grid-cols-[120px_minmax(220px,1.1fr)_minmax(280px,1.4fr)_150px_40px] gap-4 items-center px-4 min-h-[76px] border-b border-border-light last:border-b-0 hover:bg-blue-light/25 transition-colors group"
                >
                  <span className={cn(
                    "inline-flex w-fit items-center gap-1.5 text-[11px] font-bold uppercase px-2 py-1 rounded",
                    isReview ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"
                  )}>
                    {isReview ? <ClipboardCheck size={12} /> : <CalendarClock size={12} />}
                    {isReview ? "Review" : "Follow-up"}
                  </span>

                  <div className="flex items-center gap-2.5 min-w-0">
                    <Link href={`/customers/${task.customerId}`} aria-label={`Open ${task.company}`} className="shrink-0">
                      <CompanyLogo name={task.company} className="w-9 h-9 text-[11px]" />
                    </Link>
                    <div className="min-w-0">
                      <Link href={`/customers/${task.customerId}`} title={task.company} className="block text-[13px] font-semibold text-text-primary hover:text-blue-primary truncate">
                        {task.company}
                      </Link>
                      <Link href={`/contacts/${task.contactId}`} title={task.contact} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary hover:text-blue-primary truncate mt-0.5">
                        <Avatar name={task.contact} className="w-4 h-4 text-[7px]" />
                        <span className="truncate">{task.contact}</span>
                      </Link>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text-primary truncate" title={task.task}>{task.task}</p>
                    <p className="text-[11.5px] text-text-secondary mt-0.5">
                      {isReview ? "Open the pitch, verify claims, and approve or return it." : "Open the contact and log the next interaction."}
                    </p>
                  </div>

                  <span className={cn(
                    "inline-flex w-fit items-center gap-1.5 text-[11.5px] font-semibold px-2 py-1 rounded",
                    isReview && "bg-amber-50 text-amber-800",
                    !isReview && task.status === "overdue" && "bg-red-50 text-red-700",
                    !isReview && task.status === "today" && "bg-amber-50 text-amber-800",
                    !isReview && task.status === "soon" && "bg-blue-light text-blue-primary",
                    !isReview && task.status === "later" && "bg-surface text-text-secondary"
                  )}>
                    {!isReview && task.status === "overdue" && <AlertTriangle size={11} />}
                    {task.dueLabel}
                  </span>

                  <Link href={task.href} aria-label={`Open task for ${task.company}`} className="w-8 h-8 rounded-md flex items-center justify-center text-text-tertiary group-hover:text-blue-primary group-hover:bg-white transition-colors">
                    <ArrowRight size={16} />
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
