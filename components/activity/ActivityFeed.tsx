"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  Clock3,
  Download,
  MessageSquareText,
  Reply,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  cn,
  formatDate,
  formatDateTime,
  OUTCOME_CHART_COLOR,
  OUTCOME_META,
} from "@/lib/utils";

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

function cleanNote(note: string): string {
  return note.replace(/^[\uD800-\uDFFF☀-➿️\s]+/, "");
}

function timeOnly(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dueStatus(value: string): {
  label: string;
  color: string;
  bg: string;
  bucket: "overdue" | "today" | "upcoming";
} {
  const due = new Date(`${value.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      color: "#B42318",
      bg: "#FEF3F2",
      bucket: "overdue",
    };
  }
  if (days === 0) {
    return {
      label: "Due today",
      color: "#8A6100",
      bg: "#FFF7D6",
      bucket: "today",
    };
  }
  return {
    label: days === 1 ? "Tomorrow" : `In ${days}d`,
    color: "#0057B8",
    bg: "#EAF4FF",
    bucket: "upcoming",
  };
}

function outcomeAccent(outcome: string): string {
  return OUTCOME_CHART_COLOR[outcome] || "#64748B";
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [outcome, setOutcome] = useState("all");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [scope, setScope] = useState<"activity" | "followups">("activity");

  const outcomes = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      if (!seen.includes(item.outcome)) seen.push(item.outcome);
    }
    return seen;
  }, [items]);

  const owners = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.owner).filter(Boolean))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(
      (item) =>
        (outcome === "all" || item.outcome === outcome) &&
        (owner === "all" || item.owner === owner) &&
        (!query ||
          item.company.toLowerCase().includes(query) ||
          item.contactName.toLowerCase().includes(query) ||
          item.owner.toLowerCase().includes(query) ||
          item.source.toLowerCase().includes(query) ||
          (item.notes || "").toLowerCase().includes(query))
    );
  }, [items, outcome, owner, q]);

  const outcomeCounts = useMemo(
    () =>
      items.reduce<Record<string, number>>((counts, item) => {
        counts[item.outcome] = (counts[item.outcome] || 0) + 1;
        return counts;
      }, {}),
    [items]
  );

  const followUps = useMemo(() => {
    const seen = new Set<string>();
    return filtered
      .filter((item) => item.followUpDate)
      .sort(
        (a, b) =>
          new Date(a.followUpDate!).getTime() -
          new Date(b.followUpDate!).getTime()
      )
      .filter((item) => {
        const key = `${item.contactId}-${item.followUpDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [filtered]);

  const visibleItems = useMemo(
    () =>
      scope === "followups"
        ? filtered.filter((item) => Boolean(item.followUpDate))
        : filtered,
    [filtered, scope]
  );

  // Headline metrics stay page-wide while search/filtering narrows the feed
  // and the queue. Mixing a filtered follow-up count with unfiltered activity
  // totals made the summary internally inconsistent.
  const allFollowUps = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item.followUpDate) return false;
      const key = `${item.contactId}-${item.followUpDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [items]);

  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const map = new Map<
      string,
      { label: string; dateLabel: string; items: ActivityItem[] }
    >();
    const sorted = [...visibleItems].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    for (const item of sorted) {
      const date = new Date(item.created_at);
      const dayMs = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      ).getTime();
      const daysAgo = Math.round((startOfToday - dayMs) / 86400000);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getDate()).padStart(2, "0")}`;
      const label =
        daysAgo <= 0
          ? "Today"
          : daysAgo === 1
          ? "Yesterday"
          : date.toLocaleDateString("en-US", { weekday: "long" });

      if (!map.has(key)) {
        map.set(key, {
          label,
          dateLabel: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }

    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      ...group,
    }));
  }, [visibleItems]);

  const meetings = outcomeCounts.meeting_booked || 0;
  const replies = Math.max(0, items.length - (outcomeCounts.no_response || 0));
  const responseRate = items.length
    ? Math.round((replies / items.length) * 100)
    : 0;
  const dueCounts = followUps.reduce(
    (counts, item) => {
      counts[dueStatus(item.followUpDate!).bucket] += 1;
      return counts;
    },
    { overdue: 0, today: 0, upcoming: 0 }
  );
  const allDueCounts = allFollowUps.reduce(
    (counts, item) => {
      counts[dueStatus(item.followUpDate!).bucket] += 1;
      return counts;
    },
    { overdue: 0, today: 0, upcoming: 0 }
  );

  const summary = [
    {
      label: "Interactions",
      value: String(items.length),
      context: "total touches",
      icon: MessageSquareText,
      color: "#0071E3",
      bg: "#EAF4FF",
    },
    {
      label: "Replies",
      value: String(replies),
      context: `${responseRate}% response rate`,
      icon: Reply,
      color: "#007A5A",
      bg: "#E9F8F2",
    },
    {
      label: "Meetings",
      value: String(meetings),
      context: "booked",
      icon: UsersRound,
      color: "#6D28D9",
      bg: "#F3EEFF",
    },
    {
      label: "Follow-ups",
      value: String(allFollowUps.length),
      context:
        allDueCounts.overdue > 0
          ? `${allDueCounts.overdue} overdue`
          : "scheduled",
      icon: CalendarCheck2,
      color: allDueCounts.overdue > 0 ? "#B42318" : "#8A6100",
      bg: allDueCounts.overdue > 0 ? "#FEF3F2" : "#FFF7D6",
    },
  ];

  function exportCsv() {
    const quote = (value: string | null | undefined) =>
      `"${String(value || "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "Date",
        "Account",
        "Contact",
        "Outcome",
        "Next follow-up",
        "Owner",
        "Source",
        "Note",
      ],
      ...visibleItems.map((item) => [
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
    const blob = new Blob(
      [rows.map((row) => row.map(quote).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "freyr-activity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-border-light sm:grid-cols-4 sm:divide-y-0">
          {summary.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center gap-3 px-4 py-3.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: stat.bg, color: stat.color }}
                >
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    {stat.label}
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[19px] font-bold leading-none text-text-primary tnum">
                      {stat.value}
                    </span>
                    <span
                      className="truncate text-[10.5px] text-text-tertiary"
                      style={stat.label === "Follow-ups" ? { color: stat.color } : undefined}
                    >
                      {stat.context}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-light px-4 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              {scope === "activity" ? "Customer activity" : "Follow-ups"}
            </h2>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              {scope === "activity"
                ? "Every customer touch, arranged for fast scanning."
                : "Only conversations with a scheduled next action."}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-surface/65 p-1">
            <button
              type="button"
              onClick={() => setScope("activity")}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[11.5px] font-semibold transition-colors",
                scope === "activity"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <MessageSquareText size={14} strokeWidth={1.8} />
              Activity <span className="tnum opacity-65">{filtered.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setScope("followups")}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[11.5px] font-semibold transition-colors",
                scope === "followups"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <CalendarCheck2 size={14} strokeWidth={1.8} />
              Follow-ups <span className="tnum opacity-65">{followUps.length}</span>
            </button>
          </div>
        </div>

        <div className="border-b border-border-light bg-white px-4 py-3">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                strokeWidth={1.6}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search accounts, contacts, notes, or owners..."
                className="h-10 w-full rounded-lg border border-border bg-surface/35 pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-blue-primary focus:bg-white"
              />
            </div>
            {owners.length > 1 && (
              <select
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                aria-label="Filter by relationship owner"
                className="h-10 shrink-0 rounded-lg border border-border bg-white px-3 text-[12.5px] text-text-secondary outline-none focus:border-blue-primary md:max-w-[190px]"
              >
                <option value="all">Every owner</option>
                {owners.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              <Download size={15} strokeWidth={1.8} />
              Export
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
            <button
              type="button"
              onClick={() => setOutcome("all")}
              aria-pressed={outcome === "all"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                outcome === "all"
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border bg-white text-text-secondary hover:border-blue-primary/40 hover:bg-blue-light/30"
              )}
            >
              {outcome === "all" && <Check size={12} strokeWidth={2.5} />}
              All outcomes
            </button>
            {outcomes.map((key) => {
              const selected = outcome === key;
              const accent = outcomeAccent(key);
              const inProgress = key === "in_progress";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOutcome(key)}
                  aria-pressed={selected}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-[transform,box-shadow] hover:-translate-y-px"
                  style={{
                    color: selected
                      ? inProgress
                        ? "#3E3300"
                        : "#FFFFFF"
                      : inProgress
                      ? "#765B00"
                      : OUTCOME_META[key]?.color || accent,
                    background: selected ? accent : `${accent}1A`,
                    borderColor: selected ? accent : `${accent}55`,
                    boxShadow: selected ? `0 2px 8px ${accent}33` : undefined,
                  }}
                >
                  {selected ? (
                    <Check size={12} strokeWidth={2.5} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                  )}
                  {OUTCOME_META[key]?.label || key}
                  <span className="tnum opacity-70">{outcomeCounts[key] || 0}</span>
                </button>
              );
            })}

            {scope === "followups" && (
              <div className="ml-auto flex items-center gap-2">
                {[
                  ["Overdue", dueCounts.overdue, "#B42318", "#FEF3F2"],
                  ["Today", dueCounts.today, "#8A6100", "#FFF7D6"],
                  ["Upcoming", dueCounts.upcoming, "#0057B8", "#EAF4FF"],
                ].map(([label, value, color, bg]) => (
                  <span
                    key={String(label)}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                    style={{ color: String(color), background: String(bg) }}
                  >
                    {label} <span className="tnum">{value}</span>
                  </span>
                ))}
              </div>
            )}
            <span className={cn("text-[11px] text-text-tertiary tnum", scope !== "followups" && "ml-auto")}>
              Showing {visibleItems.length} of {items.length}
            </span>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="px-4 py-10">
            <EmptyState
              icon={scope === "followups" ? CalendarCheck2 : MessageSquareText}
              title={scope === "followups" ? "No follow-ups match" : "No activity matches"}
              description="Try a different search term, owner, or outcome filter."
              action={
                q || outcome !== "all" || owner !== "all" || scope !== "activity" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setOutcome("all");
                      setOwner("all");
                      setScope("activity");
                    }}
                    className="rounded-md bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(190px,1fr)_120px_minmax(210px,1.2fr)_125px_110px_20px] gap-3 border-b border-border-light bg-surface/45 px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary xl:grid">
              <span>Account and contact</span>
              <span>Outcome</span>
              <span>Interaction</span>
              <span>Next follow-up</span>
              <span>Owner and time</span>
              <span />
            </div>

            {groups.map((group) => (
              <section key={group.key}>
                <div className="flex items-center gap-2 border-b border-border-light bg-surface/70 px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-text-tertiary">{group.dateLabel}</span>
                  <span className="ml-auto text-[10px] text-text-tertiary tnum">
                    {group.items.length} {group.items.length === 1 ? "touch" : "touches"}
                  </span>
                </div>

                <div className="divide-y divide-border-light">
                  {group.items.map((item) => {
                    const meta = OUTCOME_META[item.outcome];
                    const accent = outcomeAccent(item.outcome);
                    const due = item.followUpDate ? dueStatus(item.followUpDate) : null;
                    const inProgress = item.outcome === "in_progress";
                    const note = item.notes
                      ? cleanNote(item.notes)
                      : "No note logged for this interaction.";

                    return (
                      <article
                        key={item.id}
                        className="group/activity relative grid gap-3 px-4 py-3.5 transition-colors hover:bg-blue-light/20 xl:grid-cols-[minmax(190px,1fr)_120px_minmax(210px,1.2fr)_125px_110px_20px] xl:items-center"
                      >
                        <span
                          className="absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover/activity:opacity-100"
                          style={{ background: accent }}
                        />

                        <div className="flex min-w-0 items-center gap-3">
                          <Link href={`/customers/${item.customerId}`}>
                            <CompanyLogo name={item.company} className="h-9 w-9 shrink-0 text-[9px]" />
                          </Link>
                          <div className="min-w-0">
                            <Link
                              href={`/customers/${item.customerId}`}
                              className="block text-[12.5px] font-semibold text-text-primary hover:text-blue-primary"
                            >
                              {item.company}
                            </Link>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5">
                              <Avatar name={item.contactName} className="h-5 w-5 shrink-0 text-[7px]" />
                              <Link
                                href={`/contacts/${item.contactId}`}
                                className="min-w-0 text-[10.5px] text-text-secondary hover:text-blue-primary"
                              >
                                <span className="font-semibold">{item.contactName}</span>
                                {item.contactTitle && (
                                  <span className="text-text-tertiary"> · {item.contactTitle}</span>
                                )}
                              </Link>
                            </div>
                          </div>
                        </div>

                        <div>
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.04em]"
                            style={{
                              color: inProgress ? "#705600" : meta?.color,
                              background: inProgress ? "#FFF0A8" : meta?.bg,
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                            {meta?.label || item.outcome}
                          </span>
                        </div>

                        <Tooltip label={note} side="bottom" align="left">
                          <div className="flex cursor-help items-start gap-2 text-[11px] leading-[1.45] text-text-secondary">
                            {item.source === "Agent-assisted" ? (
                              <Sparkles size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-blue-primary" />
                            ) : (
                              <MessageSquareText size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-text-tertiary" />
                            )}
                            <span className="line-clamp-2">{note}</span>
                          </div>
                        </Tooltip>

                        <div>
                          {item.followUpDate && due ? (
                            <Link
                              href="/tasks"
                              className="inline-flex flex-col rounded-lg px-2.5 py-1.5 transition-opacity hover:opacity-80"
                              style={{ color: due.color, background: due.bg }}
                            >
                              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold">
                                <CalendarCheck2 size={12} strokeWidth={2} />
                                {formatDate(item.followUpDate).replace(/, \d{4}$/, "")}
                              </span>
                              <span className="mt-0.5 text-[9.5px] opacity-75">{due.label}</span>
                            </Link>
                          ) : (
                            <span className="text-[10.5px] text-text-tertiary">Not scheduled</span>
                          )}
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={item.owner} className="h-7 w-7 shrink-0 text-[8px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-[10.5px] font-semibold text-text-secondary">{item.owner}</span>
                            <Tooltip label={formatDateTime(item.created_at)} side="bottom" align="right">
                              <span className="mt-0.5 inline-flex cursor-help items-center gap-1 text-[9.5px] text-text-tertiary tnum">
                                <Clock3 size={11} strokeWidth={1.8} />
                                {timeOnly(item.created_at)}
                              </span>
                            </Tooltip>
                          </span>
                        </div>

                        <Link
                          href={`/customers/${item.customerId}`}
                          aria-label={`Open ${item.company}`}
                          className="rounded-md p-1.5 text-text-tertiary opacity-50 transition-[opacity,color,background-color] hover:bg-blue-light hover:text-blue-primary group-hover/activity:opacity-100"
                        >
                          <ArrowRight size={15} strokeWidth={1.8} />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
