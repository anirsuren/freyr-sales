"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { OutcomeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarClock } from "lucide-react";
import { OUTCOME_META, formatDate, cn } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";

export interface SessionRow {
  id: string;
  company: string;
  contact: string;
  title: string;
  service: string;
  outcome: string | null;
  date: string;
}

const SORTS = [
  { key: "recent", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "company", label: "Company A–Z" },
];

export function SessionsBrowser({ rows }: { rows: SessionRow[] }) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [sort, setSort] = useState("recent");

  const outcomes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.outcome).filter(Boolean))) as string[],
    [rows]
  );

  const view = useMemo(() => {
    let v = rows.filter(
      (r) =>
        (outcome === "all" || r.outcome === outcome) &&
        (!q ||
          r.company.toLowerCase().includes(q.toLowerCase()) ||
          r.contact.toLowerCase().includes(q.toLowerCase()) ||
          r.service.toLowerCase().includes(q.toLowerCase()))
    );
    v = [...v];
    if (sort === "recent")
      v.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    else if (sort === "oldest")
      v.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    else v.sort((a, b) => a.company.localeCompare(b.company));
    return v;
  }, [rows, q, outcome, sort]);

  function exportCsv() {
    const csv = toCSV(
      ["Customer", "Contact", "Recommended Service", "Outcome", "Date"],
      view.map((r) => [
        r.company,
        r.contact,
        r.service,
        r.outcome ? OUTCOME_META[r.outcome]?.label || r.outcome : "",
        formatDate(r.date),
      ])
    );
    downloadCSV("freyr-sessions.csv", csv);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative sm:max-w-[320px] w-full">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sessions…"
            className="pl-9"
          />
        </div>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
        >
          <option value="all">All outcomes</option>
          {outcomes.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_META[o]?.label || o}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          className="sm:ml-auto flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
        >
          <Download size={16} strokeWidth={1.5} />
          Export CSV
        </button>
      </div>

      {view.length > 0 && (
        <p className="text-[13px] text-text-secondary mb-4 tnum">
          Showing <span className="font-semibold text-text-primary">{view.length}</span> of{" "}
          <span className="font-semibold text-text-primary">{rows.length}</span>{" "}
          {rows.length === 1 ? "session" : "sessions"}
        </p>
      )}

      {view.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={CalendarClock}
            title="No sessions match"
            description="Try a different search or clear the filters."
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
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {["Customer", "Contact", "Recommended Service", "Outcome", "Date"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light stagger">
                {view.map((r) => (
                  <tr key={r.id} className="hover:bg-surface transition-colors group">
                    <td className="px-5 py-4 text-[13px] font-semibold text-text-primary">{r.company}</td>
                    <td className="px-5 py-4">
                      <div className="text-[13px] text-text-primary">{r.contact}</div>
                      <div className="text-[11px] text-text-tertiary">{r.title}</div>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary whitespace-nowrap">{r.service}</td>
                    <td className="px-5 py-4">{r.outcome ? <OutcomeBadge outcome={r.outcome} /> : "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/sessions/${r.id}`} className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors" aria-label="Open session">
                        <ArrowRight size={16} strokeWidth={1.5} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
