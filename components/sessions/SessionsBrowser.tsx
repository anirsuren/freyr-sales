"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Search, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OutcomeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarClock } from "lucide-react";
import { OUTCOME_META, formatDate, cn } from "@/lib/utils";
import { REVIEW_META } from "@/lib/review";
import type { ReviewStatus } from "@/lib/types";
import { toCSV, downloadCSV } from "@/lib/csv";

export interface SessionRow {
  id: string;
  company: string;
  contact: string;
  title: string;
  service: string;
  outcome: string | null;
  review: ReviewStatus;
  date: string;
}

const SORTS = [
  { key: "recent", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "company", label: "Company A–Z" },
];

export function SessionsBrowser({ rows }: { rows: SessionRow[] }) {
  const router = useRouter();
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
      ["Customer", "Contact", "Recommended Service", "Outcome", "Review", "Date"],
      view.map((r) => [
        r.company,
        r.contact,
        r.service,
        r.outcome ? OUTCOME_META[r.outcome]?.label || r.outcome : "",
        REVIEW_META[r.review].label,
        formatDate(r.date),
      ])
    );
    downloadCSV("freyr-sessions.csv", csv);
  }

  return (
    <div>
      {/* Title + filters (incl. a compact search) on one row — no standalone
          search bar eating a whole row (Suren). */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            Sessions
          </h1>
          <p className="text-[14px] text-text-secondary mt-0.5">
            {rows.length} pitch session{rows.length === 1 ? "" : "s"} across your book.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="relative w-[190px]">
            <Search size={15} strokeWidth={1.6} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sessions…"
              className="w-full text-[13px] bg-surface border border-border rounded-md pl-8 pr-3 py-2 outline-none focus:border-blue-primary"
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
            className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <Download size={16} strokeWidth={1.5} />
            Export CSV
          </button>
        </div>
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
                  {["Customer", "Contact", "Recommended Service", "Outcome", "Review", "Date"].map((h) => (
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light stagger">
                {view.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/sessions/${r.id}`)}
                    className="hover:bg-surface active:bg-blue-light/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <CompanyLogo name={r.company} className="w-8 h-8 text-[11px]" />
                        <span className="text-[13px] font-semibold text-text-primary">{r.company}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.contact} className="w-7 h-7 text-[10px]" />
                        <div>
                          <div className="text-[13px] font-semibold text-text-primary">{r.contact}</div>
                          <div className="text-[11px] text-text-tertiary">{r.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary whitespace-nowrap">{r.service}</td>
                    <td className="px-5 py-4">{r.outcome ? <OutcomeBadge outcome={r.outcome} /> : "—"}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className="text-[10.5px] font-bold uppercase tracking-[0.04em] px-2 py-1 rounded"
                        style={{
                          background: REVIEW_META[r.review].bg,
                          color: REVIEW_META[r.review].color,
                        }}
                      >
                        {REVIEW_META[r.review].label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-5 py-4 text-right">
                      <ArrowRight
                        size={16}
                        strokeWidth={1.5}
                        className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform"
                      />
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
