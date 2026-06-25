"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageSquareText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OutcomeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDate, OUTCOME_META } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  company: string;
  contactName: string;
  customerId: string;
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [outcome, setOutcome] = useState("all");
  const [q, setQ] = useState("");

  // outcomes present in the data, in a stable order
  const outcomes = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) if (!seen.includes(it.outcome)) seen.push(it.outcome);
    return seen;
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (outcome === "all" || it.outcome === outcome) &&
          (!q ||
            it.company.toLowerCase().includes(q.toLowerCase()) ||
            it.contactName.toLowerCase().includes(q.toLowerCase()) ||
            (it.notes || "").toLowerCase().includes(q.toLowerCase()))
      ),
    [items, outcome, q]
  );

  // Group newest-first into time buckets so a long feed reads at a glance —
  // a rep sees "what happened today" without scanning a wall of dates.
  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const order = ["Today", "Yesterday", "Earlier this week", "This month", "Earlier"];
    const map: Record<string, ActivityItem[]> = {};
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    for (const it of sorted) {
      const t = new Date(it.created_at);
      const dayMs = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      const days = Math.round((startOfToday - dayMs) / 86400000);
      const bucket =
        days <= 0
          ? "Today"
          : days === 1
          ? "Yesterday"
          : days <= 7
          ? "Earlier this week"
          : days <= 31
          ? "This month"
          : "Earlier";
      (map[bucket] ||= []).push(it);
    }
    return order.filter((b) => map[b]?.length).map((b) => ({ label: b, items: map[b] }));
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="relative lg:max-w-[300px] w-full">
          <Search
            size={16}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activity…"
            className="w-full bg-surface border border-border rounded-md pl-9 pr-3 py-2 text-[13px] outline-none focus:border-blue-primary"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setOutcome("all")}
            className={cn(
              "text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors",
              outcome === "all"
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            All
          </button>
          {outcomes.map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={cn(
                "text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors",
                outcome === o
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              {OUTCOME_META[o]?.label || o}
            </button>
          ))}
        </div>
        <span className="lg:ml-auto text-[13px] text-text-secondary tnum">
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No activity matches"
          description="Try a different search term or outcome filter."
          action={
            q || outcome !== "all" ? (
              <button
                onClick={() => {
                  setQ("");
                  setOutcome("all");
                }}
                className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                {g.label}
                <span className="text-text-tertiary/70 tnum"> · {g.items.length}</span>
              </h2>
              <div className="space-y-2.5 stagger">
                {g.items.map((it) => (
                  <Link key={it.id} href={`/customers/${it.customerId}`}>
                    <Card className="p-4 hover:border-blue-subtle transition-colors group">
                      <div className="flex items-start gap-3">
                        <Avatar name={it.company} className="w-9 h-9 text-[12px] rounded-lg shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-semibold text-text-primary">
                              {it.company}
                            </span>
                            <OutcomeBadge outcome={it.outcome} />
                            <span className="text-[12px] text-text-tertiary tnum ml-auto">
                              {formatDate(it.created_at)}
                            </span>
                          </div>
                          <p className="text-[12px] text-text-secondary mt-0.5">
                            {it.contactName}
                          </p>
                          {it.notes && (
                            <p className="text-[13px] text-text-secondary leading-relaxed mt-1.5">
                              {it.notes}
                            </p>
                          )}
                        </div>
                        <ArrowRight
                          size={16}
                          strokeWidth={1.5}
                          className="text-text-tertiary group-hover:text-blue-primary shrink-0 mt-1"
                        />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
