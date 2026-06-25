"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SearchX, Search, Download, LayoutGrid, Table2, ArrowRight, ChevronLeft, ChevronRight, CheckSquare, Square, X } from "lucide-react";
import { CustomerCard } from "./CustomerCard";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SizeBadge, OutcomeBadge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate, SIZE_TIER_LABEL, OUTCOME_META } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { REPS } from "@/lib/pipeline";
import { HealthBadge } from "@/components/ui/HealthBadge";
import type { AccountHealth } from "@/lib/health";
import type { Customer } from "@/lib/types";

type EnrichedCustomer = Customer & {
  contact_count: number;
  last_outcome: string | null;
  last_session_date: string | null;
  health: AccountHealth;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "small", label: "Small" },
  { key: "mid", label: "Mid" },
  { key: "large", label: "Large" },
];

// Plain-English explanations for the table columns a rep might not recognize.
const COL_HINTS: Record<string, string> = {
  Opportunity:
    "How big a deal this account could be, based on company size — High = Large, Medium = Mid, Low = Small. A quick read on where the bigger prizes are.",
  // Health column intentionally has no header hint — each row's Health badge
  // already explains itself on hover, and an exact-text test depends on the
  // header reading exactly "Health".
  "Last Outcome": "The result of the most recent touch you logged with this account.",
  "Last Session": "The last time you ran a pitch or logged activity with this account.",
};

const SIGNAL: Record<string, { label: string; bars: number }> = {
  large: { label: "High", bars: 3 },
  mid: { label: "Medium", bars: 2 },
  small: { label: "Low", bars: 1 },
};

function Signal({ tier }: { tier: string | null }) {
  const s = tier ? SIGNAL[tier] : null;
  const bars = s?.bars ?? 0;
  const sizeLabel = tier ? SIZE_TIER_LABEL[tier] || tier : null;
  const label = s
    ? `${s.label} opportunity — based on company size (${sizeLabel}). Bigger accounts tend to mean bigger potential deals.`
    : "Company size hasn't been set for this account yet.";
  return (
    <Tooltip label={label} side="bottom" align="left">
      <span className="inline-flex items-center gap-1.5 cursor-help">
        <span className="flex items-end gap-0.5 h-3.5">
          {[1, 2, 3].map((b) => (
            <span
              key={b}
              className={cn(
                "w-1 rounded-sm",
                b <= bars ? "bg-blue-primary" : "bg-border-light"
              )}
              style={{ height: `${b * 4 + 2}px` }}
            />
          ))}
        </span>
        <span className="text-[13px] text-text-secondary">{s?.label || "—"}</span>
      </span>
    </Tooltip>
  );
}

export function CustomersBrowser({
  customers,
}: {
  customers: EnrichedCustomer[];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const PER_PAGE = 8;

  // bulk actions (V4 #7)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState(REPS[0]);
  const [assigning, setAssigning] = useState(false);

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const sizeRank: Record<string, number> = { large: 3, mid: 2, small: 1 };

  const filtered = useMemo(() => {
    let v = customers.filter((c) => {
      const matchesQuery =
        !query ||
        c.company_name.toLowerCase().includes(query.toLowerCase()) ||
        (c.industry || "").toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "all" || c.size_tier === filter;
      const matchesHealth =
        healthFilter === "all" || c.health.band === healthFilter;
      return matchesQuery && matchesFilter && matchesHealth;
    });
    v = [...v];
    if (sort === "company") v.sort((a, b) => a.company_name.localeCompare(b.company_name));
    else if (sort === "size")
      v.sort((a, b) => (sizeRank[b.size_tier || ""] || 0) - (sizeRank[a.size_tier || ""] || 0));
    else if (sort === "health")
      v.sort((a, b) => a.health.score - b.health.score);
    else
      v.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    return v;
  }, [customers, query, filter, healthFilter, sort]);

  // reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [query, filter, healthFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);
  const rangeStart = filtered.length === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + PER_PAGE, filtered.length);

  function rowsToCsv(list: EnrichedCustomer[]) {
    return toCSV(
      ["Company", "Size", "Industry", "Geography", "Contacts", "Last Outcome", "Last Session"],
      list.map((c) => [
        c.company_name,
        c.size_tier ? SIZE_TIER_LABEL[c.size_tier] || c.size_tier : "",
        c.industry || "",
        c.geography || "",
        c.contact_count,
        c.last_outcome ? OUTCOME_META[c.last_outcome]?.label || c.last_outcome : "",
        c.last_session_date ? formatDate(c.last_session_date) : "",
      ])
    );
  }
  function exportCsv() {
    downloadCSV("freyr-customers.csv", rowsToCsv(filtered));
  }
  function exportSelected() {
    const list = filtered.filter((c) => selected.has(c.id));
    if (!list.length) return;
    downloadCSV("freyr-customers-selected.csv", rowsToCsv(list));
    toast(`Exported ${list.length} account${list.length === 1 ? "" : "s"}`);
  }
  async function assignOwner() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setAssigning(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/customers/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner: bulkOwner }),
          }).catch(() => {})
        )
      );
      toast(`Assigned ${ids.length} account${ids.length === 1 ? "" : "s"} to ${bulkOwner}`);
      setSelected(new Set());
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        <div className="relative lg:max-w-[300px] w-full">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search customers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "text-[13px] font-medium px-3.5 py-2 rounded-md border transition-colors",
                filter === f.key
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <select
            aria-label="Filter by health"
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
          >
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="at_risk">At risk</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
          >
            <option value="recent">Newest</option>
            <option value="company">Company A–Z</option>
            <option value="size">Opportunity</option>
            <option value="health">Health (at-risk first)</option>
          </select>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={cn("p-2 transition-colors", view === "grid" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
            >
              <LayoutGrid size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              className={cn("p-2 border-l border-border transition-colors", view === "table" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
            >
              <Table2 size={16} strokeWidth={1.5} />
            </button>
          </div>
          <button
            onClick={() => {
              const next = !selectMode;
              setSelectMode(next);
              setSelected(new Set());
              if (next) setView("table");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border transition-colors",
              selectMode
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            <CheckSquare size={15} strokeWidth={1.8} />
            {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <Download size={16} strokeWidth={1.5} />
            CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg border border-blue-primary bg-blue-light flex-wrap">
          <span className="text-[13px] font-semibold text-blue-primary tnum">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-[12px] text-text-secondary">Assign owner</span>
            <select
              aria-label="Bulk assign owner"
              value={bulkOwner}
              onChange={(e) => setBulkOwner(e.target.value)}
              className="bg-white border border-border rounded-md px-2 py-1.5 text-[13px] outline-none focus:border-blue-primary"
            >
              {REPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={assignOwner}
              disabled={assigning}
              className="text-[13px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
            <button
              onClick={exportSelected}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md border border-border text-text-secondary hover:bg-white transition-colors"
            >
              <Download size={15} strokeWidth={1.7} />
              Export
            </button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="text-text-tertiary hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-[13px] text-text-secondary mb-4 tnum">
          Showing{" "}
          <span className="font-semibold text-text-primary">
            {rangeStart}–{rangeEnd}
          </span>{" "}
          of <span className="font-semibold text-text-primary">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "account" : "accounts"}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No customers match"
          description="Try a different search term or clear the size filter."
          action={
            query || filter !== "all" || healthFilter !== "all" ? (
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setHealthFilter("all");
                }}
                className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 stagger">
          {paged.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              contactCount={c.contact_count}
              lastOutcome={c.last_outcome}
              lastSessionDate={c.last_session_date}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-border-light rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {selectMode && <th className="pl-5 py-3 w-8" />}
                  {["Company", "Opportunity", "Health", "Industry", "Contacts", "Last Outcome", "Last Session"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {h}
                        {COL_HINTS[h] && <InfoHint text={COL_HINTS[h]} />}
                      </span>
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light stagger">
                {paged.map((c) => {
                  const isSel = selected.has(c.id);
                  return (
                  <tr key={c.id} className={cn("transition-colors group", isSel ? "bg-blue-light" : "hover:bg-surface")}>
                    {selectMode && (
                      <td className="pl-5 py-4">
                        <button
                          onClick={() => toggleSel(c.id)}
                          aria-label={`Select ${c.company_name}`}
                          aria-pressed={isSel}
                          className="text-blue-primary align-middle"
                        >
                          {isSel ? (
                            <CheckSquare size={17} strokeWidth={1.8} />
                          ) : (
                            <Square size={17} strokeWidth={1.8} className="text-text-tertiary" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.company_name} className="w-8 h-8 text-[12px] rounded-md" />
                        <span className="text-[13px] font-semibold text-text-primary">{c.company_name}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-4"><Signal tier={c.size_tier} /></td>
                    <td className="px-5 py-4"><HealthBadge health={c.health} /></td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary whitespace-nowrap">{c.industry || "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum">{c.contact_count}</td>
                    <td className="px-5 py-4">{c.last_outcome ? <OutcomeBadge outcome={c.last_outcome} /> : "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">
                      {c.last_session_date ? formatDate(c.last_session_date) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/customers/${c.id}`} className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors" aria-label="Open customer">
                        <ArrowRight size={16} strokeWidth={1.5} />
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > PER_PAGE && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-[13px] text-text-secondary tnum">
            Page {current} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current <= 1}
              className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} strokeWidth={1.8} />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={current >= pageCount}
              className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
