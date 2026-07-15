"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  MessageSquareText,
  ArrowRight,
  CalendarDays,
  Clock3,
  UsersRound,
  TrendingUp,
  Download,
  Sparkles,
  Check,
} from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, formatDate, formatDateTime, OUTCOME_META } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  company: string;
  contactName: string;
  contactTitle: string | null;
  customerId: string;
  contactId: string;
  followUpDate: string | null;
  owner: string;
  source: "Agent-assisted" | "Logged manually";
};

// Notes once carried a leading emoji (🔔/📝) as a makeshift icon; we now render a
// proper muted lucide glyph instead, so strip any leftover leading emoji from
// older logged notes for a clean, consistent line.
function cleanNote(note: string): string {
  // Strip a leading run of emoji (UTF-16 surrogate code units), BMP symbols,
  // variation selectors and whitespace — without the `u` flag (build target).
  return note.replace(/^[\uD800-\uDFFF☀-➿️\s]+/, "");
}

function timeOnly(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dueTiming(value: string): string {
  const due = new Date(`${value.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [outcome, setOutcome] = useState("all");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");

  // outcomes present in the data, in a stable order
  const outcomes = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) if (!seen.includes(it.outcome)) seen.push(it.outcome);
    return seen;
  }, [items]);

  // Distinct relationship owners for the supervisor lens.
  const owners = useMemo(() => {
    const seen: string[] = [];
    for (const it of items)
      if (it.owner && !seen.includes(it.owner)) seen.push(it.owner);
    return seen.sort();
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (outcome === "all" || it.outcome === outcome) &&
          (owner === "all" || it.owner === owner) &&
          (!q ||
            it.company.toLowerCase().includes(q.toLowerCase()) ||
            it.contactName.toLowerCase().includes(q.toLowerCase()) ||
            it.owner.toLowerCase().includes(q.toLowerCase()) ||
            it.source.toLowerCase().includes(q.toLowerCase()) ||
            (it.notes || "").toLowerCase().includes(q.toLowerCase()))
      ),
    [items, outcome, owner, q]
  );

  const outcomeCounts = useMemo(
    () =>
      items.reduce<Record<string, number>>((counts, item) => {
        counts[item.outcome] = (counts[item.outcome] || 0) + 1;
        return counts;
      }, {}),
    [items]
  );
  const meetings = outcomeCounts.meeting_booked || 0;
  const active =
    (outcomeCounts.meeting_booked || 0) +
    (outcomeCounts.interested || 0) +
    (outcomeCounts.in_progress || 0);
  const responseRate = items.length
    ? Math.round(((items.length - (outcomeCounts.no_response || 0)) / items.length) * 100)
    : 0;

  function exportCsv() {
    const quote = (value: string | null | undefined) =>
      `"${String(value || "").replace(/"/g, '""')}"`;
    const rows = [
      ["Date", "Account", "Contact", "Outcome", "Next follow-up", "Owner", "Source", "Note"],
      ...filtered.map((item) => [
        formatDateTime(item.created_at),
        item.company,
        item.contactName,
        OUTCOME_META[item.outcome]?.label || item.outcome,
        item.followUpDate ? formatDate(item.followUpDate) : "",
        item.owner,
        item.source,
        cleanNote(item.notes || ""),
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "freyr-activity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Use one band per calendar day. Broad buckets such as "this month" made it
  // hard to tell where one day ended and another began.
  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const map = new Map<string, { label: string; dateLabel: string; items: ActivityItem[] }>();
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    for (const it of sorted) {
      const t = new Date(it.created_at);
      const dayMs = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      const days = Math.round((startOfToday - dayMs) / 86400000);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const label = days <= 0
        ? "Today"
        : days === 1
        ? "Yesterday"
        : t.toLocaleDateString("en-US", { weekday: "long" });
      if (!map.has(key)) {
        map.set(key, {
          label,
          dateLabel: t.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          items: [],
        });
      }
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries()).map(([key, group]) => ({ key, ...group }));
  }, [filtered]);

  const upcomingFollowUps = useMemo(
    () =>
      filtered
        .filter((item) => item.followUpDate)
        .sort(
          (a, b) =>
            new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime()
        )
        .slice(0, 5),
    [filtered]
  );

  const statItems = [
    { label: "Interactions", value: String(items.length), sub: "logged", icon: CalendarDays },
    { label: "Meetings booked", value: String(meetings), sub: "confirmed", icon: UsersRound },
    { label: "Active conversations", value: String(active), sub: "in motion", icon: MessageSquareText, color: "#059669" },
    { label: "Response rate", value: `${responseRate}%`, sub: "of activity", icon: TrendingUp, color: "#7C3AED" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end -mt-[62px] mb-5">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface transition-colors"
        >
          <Download size={15} strokeWidth={1.8} />
          Export
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statItems.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </div>

      <div className="rounded-lg border border-border-light bg-white p-3.5">
        <div className="flex items-center gap-3">
          <div className="relative min-w-[280px] max-w-[460px] flex-1">
            <Search
              size={16}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity by account, contact, note, or owner..."
              className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
          {owners.length > 1 && (
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              aria-label="Filter by relationship owner"
              className="h-9 max-w-[190px] shrink-0 rounded-md border border-border bg-white px-3 text-[13px] text-text-secondary outline-none focus:border-blue-primary"
            >
              <option value="all">Every owner</option>
              {owners.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          <span className="ml-auto shrink-0 text-[12px] text-text-tertiary tnum">
            {filtered.length} {filtered.length === 1 ? "interaction" : "interactions"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
          <button
            onClick={() => setOutcome("all")}
            aria-pressed={outcome === "all"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold transition-all",
              outcome === "all"
                ? "border-blue-primary bg-blue-primary text-white shadow-[0_2px_8px_rgba(10,115,232,0.2)]"
                : "border-border text-text-secondary hover:border-blue-primary/40 hover:bg-blue-light/30"
            )}
          >
            {outcome === "all" && <Check size={12} strokeWidth={2.5} />}
            All outcomes
          </button>
          {outcomes.map((o) => {
            const selected = outcome === o;
            const color = OUTCOME_META[o]?.color || "#4A4A4A";
            return (
              <button
                key={o}
                onClick={() => setOutcome(o)}
                aria-pressed={selected}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold transition-all hover:-translate-y-px"
                style={{
                  color: selected ? "#FFFFFF" : color,
                  background: selected
                    ? color
                    : OUTCOME_META[o]?.bg || "rgba(142,142,147,0.10)",
                  borderColor: selected ? color : `${color}30`,
                  boxShadow: selected ? `0 2px 8px ${color}30` : undefined,
                }}
              >
                {selected ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                )}
                {OUTCOME_META[o]?.label || o}
                <span className={cn("tnum", selected ? "text-white/75" : "opacity-60")}>
                  {outcomeCounts[o] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No activity matches"
          description="Try a different search term or outcome filter."
          action={
            q || outcome !== "all" || owner !== "all" ? (
              <button
                onClick={() => {
                  setQ("");
                  setOutcome("all");
                  setOwner("all");
                }}
                className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <section className="overflow-hidden rounded-lg border border-border-light bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-border-light px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-text-primary">Next follow-ups</h2>
                <p className="mt-0.5 text-[11px] text-text-tertiary">The next scheduled actions in this view</p>
              </div>
              <Link href="/tasks" className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary hover:underline">
                View tasks <ArrowRight size={13} />
              </Link>
            </div>
            {upcomingFollowUps.length ? (
              <div className="grid grid-cols-4 divide-x divide-border-light">
                {upcomingFollowUps.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href={`/contacts/${item.contactId}`}
                    className="group/follow flex min-w-0 items-center gap-2.5 px-4 py-3 hover:bg-blue-light/25"
                  >
                    <Avatar name={item.contactName} className="h-8 w-8 shrink-0 text-[9px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-text-primary group-hover/follow:text-blue-primary">
                        {item.contactName}
                      </span>
                      <span className="block truncate text-[10px] text-text-tertiary">{item.company}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10.5px] font-semibold text-text-primary tnum">
                        {formatDate(item.followUpDate).replace(/, \d{4}$/, "")}
                      </span>
                      <span
                        className={cn(
                          "block text-[9px] font-medium",
                          dueTiming(item.followUpDate!).includes("overdue") ? "text-red-600" : "text-blue-primary"
                        )}
                      >
                        {dueTiming(item.followUpDate!)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-[11px] text-text-tertiary">No follow-ups scheduled in this view.</p>
            )}
          </section>

          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key} className="overflow-hidden rounded-lg border border-border-light bg-white">
                <h2
                  className={cn(
                    "flex items-center gap-2 border-b border-border-light px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em]",
                    g.label === "Today"
                      ? "border-l-[3px] border-l-blue-primary bg-blue-light/65 text-blue-primary"
                      : g.label === "Yesterday"
                      ? "border-l-[3px] border-l-[#8E8E93] bg-surface text-text-secondary"
                      : "border-l-[3px] border-l-border bg-[#FAFAFB] text-text-secondary"
                  )}
                >
                  <span>{g.label}</span>
                  <span className="font-normal normal-case tracking-normal text-text-tertiary">{g.dateLabel}</span>
                  <span className="ml-auto rounded-md border border-border-light bg-white px-2 py-0.5 text-[10px] font-semibold text-text-tertiary tnum">
                    {g.items.length} {g.items.length === 1 ? "interaction" : "interactions"}
                  </span>
                </h2>
                <div className="divide-y divide-border-light">
                  {g.items.map((it) => {
                    const meta = OUTCOME_META[it.outcome];
                    return (
                      <article
                        key={it.id}
                        className="group grid grid-cols-[84px_minmax(0,1fr)_205px] gap-4 px-4 py-4 transition-colors hover:bg-blue-light/20"
                      >
                        <Tooltip label={formatDateTime(it.created_at)} side="bottom" align="left">
                          <div className="cursor-help border-r border-border-light pr-3">
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary tnum">
                              <Clock3 size={14} className="text-text-tertiary" />
                              {timeOnly(it.created_at)}
                            </span>
                            <span className="mt-1.5 block pl-5 text-[9.5px] font-medium text-text-tertiary">
                              {it.source === "Agent-assisted" ? "Agent assisted" : "Manual entry"}
                            </span>
                          </div>
                        </Tooltip>

                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Tooltip label={`Open account: ${it.company}`} side="bottom" align="left" className="min-w-0">
                              <Link href={`/customers/${it.customerId}`} className="flex min-w-0 items-center gap-2.5 hover:text-blue-primary">
                                <CompanyLogo name={it.company} className="h-9 w-9 shrink-0 text-[10px]" />
                                <span className="truncate text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">{it.company}</span>
                              </Link>
                            </Tooltip>
                            <Tooltip label={`Outcome: ${meta?.label || it.outcome}`} side="bottom">
                              <span
                                className="inline-flex w-fit shrink-0 cursor-help items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.03em]"
                                style={{ color: meta?.color, background: meta?.bg }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.color }} />
                                {meta?.label || it.outcome}
                              </span>
                            </Tooltip>
                          </div>

                          <div className="mt-3 grid grid-cols-[220px_minmax(0,1fr)] gap-4">
                            <Tooltip
                              label={it.contactTitle ? `${it.contactName} · ${it.contactTitle}` : it.contactName}
                              side="bottom"
                              align="left"
                              className="min-w-0"
                            >
                              <Link href={`/contacts/${it.contactId}`} className="flex min-w-0 items-center gap-2 hover:text-blue-primary">
                                <Avatar name={it.contactName} className="h-7 w-7 shrink-0 text-[9px]" />
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-semibold text-text-primary group-hover:text-blue-primary">{it.contactName}</span>
                                  <span className="block truncate text-[10.5px] text-text-tertiary">{it.contactTitle || "Contact"}</span>
                                </span>
                              </Link>
                            </Tooltip>
                            <Tooltip
                              label={it.notes ? cleanNote(it.notes) : "No interaction note was logged."}
                              side="bottom"
                              align="left"
                              className="min-w-0"
                            >
                              <span className="flex min-w-0 cursor-help items-start gap-2 text-[11.5px] leading-[1.45] text-text-secondary">
                                {it.source === "Agent-assisted" ? (
                                  <Sparkles size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-blue-primary" />
                                ) : (
                                  <MessageSquareText size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-text-tertiary" />
                                )}
                                <span className="line-clamp-2">{it.notes ? cleanNote(it.notes) : "No note logged"}</span>
                              </span>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="border-l border-border-light pl-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Next follow-up</span>
                              {it.followUpDate ? (
                                <Tooltip label={`Open tasks for ${formatDate(it.followUpDate)}`} side="bottom" align="right">
                                  <Link href="/tasks" className="mt-1 block cursor-help hover:text-blue-primary">
                                    <span className="text-[12px] font-semibold text-text-primary tnum">{formatDate(it.followUpDate)}</span>
                                    <span
                                      className={cn(
                                        "ml-2 text-[10px] font-medium",
                                        dueTiming(it.followUpDate).includes("overdue") ? "text-red-600" : "text-blue-primary"
                                      )}
                                    >
                                      {dueTiming(it.followUpDate)}
                                    </span>
                                  </Link>
                                </Tooltip>
                              ) : (
                                <span className="mt-1 block text-[11px] text-text-tertiary">Not scheduled</span>
                              )}
                            </div>
                            <Link
                              href={`/customers/${it.customerId}`}
                              aria-label={`Open ${it.company}`}
                              title={`Open ${it.company}`}
                              className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                            >
                              <ArrowRight size={15} strokeWidth={1.8} />
                            </Link>
                          </div>
                          <Tooltip label={`${it.owner} owns this relationship. ${it.source}.`} side="bottom" align="right">
                            <div className="mt-3 flex cursor-help items-center gap-2 border-t border-border-light pt-3">
                              <Avatar name={it.owner} className="h-6 w-6 shrink-0 text-[8px]" />
                              <span className="min-w-0">
                                <span className="block text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Relationship owner</span>
                                <span className="block truncate text-[11px] font-medium text-text-secondary">{it.owner}</span>
                              </span>
                            </div>
                          </Tooltip>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
