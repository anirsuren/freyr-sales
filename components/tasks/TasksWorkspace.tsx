"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Search,
  Timer,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { cn, formatDate } from "@/lib/utils";

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

// How urgent a due date is, as its own band. Every follow-up used to land in
// one "soon" bucket, so "Tomorrow" and "In 6 days" wore the identical blue pill
// and the column carried no signal at all (Anir, Jul 27: "the due status should
// be colour-coded based on how important it is"). Five bands now, each with its
// own colour AND its own icon — the standing rule for anything categorical.
type DueKind = "overdue" | "today" | "tomorrow" | "week" | "later";

function dueInfo(due: string, todayMs: number) {
  const d = new Date(due);
  const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayMs - todayMs) / 86400000);
  if (days < 0)
    return { kind: "overdue" as DueKind, label: `${Math.abs(days)}d overdue`, days };
  if (days === 0) return { kind: "today" as DueKind, label: "Due today", days };
  if (days === 1) return { kind: "tomorrow" as DueKind, label: "Tomorrow", days };
  if (days <= 7) return { kind: "week" as DueKind, label: `In ${days} days`, days };
  return { kind: "later" as DueKind, label: formatDate(due), days };
}

// Red → burnt orange → blue → green → violet: hot to cool, so the column can be
// read at a glance without reading a single word. Never amber — #C2410C is the
// app-wide caution token.
const DUE_STYLE: Record<
  DueKind | "review",
  { cls: string; icon: typeof AlertTriangle }
> = {
  overdue: { cls: "bg-red-50 text-red-700", icon: AlertTriangle },
  today: { cls: "bg-[#C2410C]/10 text-[#C2410C]", icon: AlarmClock },
  tomorrow: { cls: "bg-blue-light text-blue-primary", icon: Timer },
  week: { cls: "bg-emerald-50 text-emerald-700", icon: CalendarClock },
  later: { cls: "bg-violet-50 text-violet-700", icon: CalendarDays },
  review: { cls: "bg-[#C2410C]/10 text-[#C2410C]", icon: ClipboardCheck },
};

export function TasksWorkspace({
  reviewTasks,
  followUps,
  todayMs,
}: {
  reviewTasks: ReviewTask[];
  followUps: FollowUpTask[];
  todayMs: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const queueRef = useRef<HTMLElement>(null);

  /**
   * Filtering must not move the screen AT ALL. v1 of this fix re-anchored the
   * queue with scrollIntoView — still a jump, still broke the flow (Anir: "it
   * pushes my screen up, it ruins the flow"). Now the scroll position is
   * captured before the filter applies and restored after paint, and the rows
   * container reserves height (min-h below) so a one-row result can't shorten
   * the page underneath the current scroll offset.
   */
  function applyFilter(next: Filter) {
    const scroller =
      (document.querySelector("main") as HTMLElement | null) ??
      (document.scrollingElement as HTMLElement | null);
    const y = scroller ? scroller.scrollTop : 0;
    setFilter(next);
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = y;
    });
  }

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
    (task) =>
      task.kind === "followup" &&
      ["overdue", "today", "tomorrow", "week"].includes(task.status)
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

  // These read as chips now, not as four washed-out lozenges with a halo around
  // the selected one (Anir, Jul 27: "I don't like the way these four tags look.
  // They don't look anything like the other tags you have throughout the
  // website"). Same anatomy as every other chip in the app: a solid icon bubble
  // in the chip's own colour, the label, then the count — and the colour is
  // carried at full strength when selected instead of by an outline ring.
  const filters: {
    key: Filter;
    label: string;
    count: number;
    color: string;
    icon: typeof Inbox;
  }[] = [
    { key: "all", label: "All", count: queue.length, color: "#0071E3", icon: Inbox },
    { key: "review", label: "Reviews", count: reviewTasks.length, color: "#6D28D9", icon: ClipboardCheck },
    { key: "followup", label: "Follow-ups", count: followUps.length, color: "#047857", icon: CalendarClock },
    { key: "overdue", label: "Overdue", count: overdue, color: "#B02020", icon: AlertTriangle },
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

      <section ref={queueRef} className="scroll-mt-24">
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
              {filters.map((item) => {
                const on = filter === item.key;
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => applyFilter(item.key)}
                    aria-pressed={on}
                    style={
                      on
                        ? {
                            background: `${item.color}14`,
                            borderColor: `${item.color}59`,
                            color: item.color,
                          }
                        : undefined
                    }
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-1.5 pr-2.5 text-[12.5px] font-semibold leading-tight transition-colors",
                      !on &&
                        "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:bg-surface"
                    )}
                  >
                    <span
                      className="flex h-[1.45em] w-[1.45em] shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: item.color }}
                    >
                      <Icon size={11} strokeWidth={2.2} className="h-[0.85em] w-[0.85em]" />
                    </span>
                    {item.label}
                    <span
                      className="tnum rounded-full px-1.5 py-px text-[11px] font-bold"
                      style={{
                        background: on ? `${item.color}1F` : "rgba(0,0,0,0.05)",
                        color: on ? item.color : undefined,
                      }}
                    >
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden bg-white min-h-[420px]">
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
                    {/* A review row's whole Task cell IS the offering being
                        pitched — an offering name is a CATEGORY and can never
                        be flat text, so it wears the same glyph + colour chip
                        it carries on the pipeline cards and sessions table.
                        A follow-up's task ("Follow up with …") is a sentence,
                        not an offering, and stays plain. Neither truncates:
                        a clipped task is the one thing a rep can't act on. */}
                    {task.kind === "review" ? (
                      <ServiceTag name={task.service} />
                    ) : (
                      <p className="text-[13px] font-medium text-text-primary">{task.task}</p>
                    )}
                    <p className="text-[11.5px] text-text-secondary mt-0.5">
                      {isReview ? "Open the pitch, verify claims, and approve or return it." : "Open the contact and log the next interaction."}
                    </p>
                  </div>

                  {(() => {
                    const due =
                      DUE_STYLE[
                        isReview ? "review" : (task.status as DueKind)
                      ] ?? DUE_STYLE.later;
                    const DueIcon = due.icon;
                    return (
                      <span
                        className={cn(
                          "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-[11.5px] font-semibold",
                          due.cls
                        )}
                      >
                        <DueIcon size={12} strokeWidth={2.2} className="shrink-0" />
                        {task.dueLabel}
                      </span>
                    );
                  })()}

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
