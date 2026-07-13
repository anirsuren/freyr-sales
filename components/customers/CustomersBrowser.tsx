"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchX, Search, Download, LayoutGrid, Table2, ArrowRight, ChevronLeft, ChevronRight, CheckSquare, Square, X, Sparkles, ArrowDownWideNarrow, Rows3 } from "lucide-react";
import { CustomerCard } from "./CustomerCard";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SizeBadge, OutcomeBadge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { useToast } from "@/components/ui/Toast";
import { cn, SIZE_TIER_LABEL, OUTCOME_META, formatDateTime } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { REPS } from "@/lib/pipeline";
import { HEALTH_COLOR, type AccountHealth } from "@/lib/health";
import { HoverCard } from "@/components/ui/HoverCard";
import type { Customer } from "@/lib/types";
import type { TipItem } from "@/components/charts/Charts";

type EnrichedCustomer = Customer & {
  contact_count: number;
  contacts_preview: { id: string; name: string }[];
  last_outcome: string | null;
  last_session_date: string | null;
  health: AccountHealth;
  // Hover-reveal charts: pipeline mix (or touch outcomes when no open deals)
  // + the 5-week health trend — each slice/point carries the deals/touches
  // behind it.
  stage_mix?: { label: string; value: number; color: string; tip: TipItem[] }[];
  outcome_mix?: { label: string; value: number; color: string; tip: TipItem[] }[];
  health_trend?: number[];
  trend_tips?: TipItem[][];
};

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

const SIGNAL: Record<string, { label: string; bars: number; color: string }> = {
  large: { label: "High", bars: 3, color: "#34C759" }, // green
  mid: { label: "Medium", bars: 2, color: "#0071E3" }, // blue
  small: { label: "Low", bars: 1, color: "#FF9F0A" }, // amber
};

// Color-code industries so the table scans at a glance (Suren).
const INDUSTRY_STYLE: Record<string, { bg: string; color: string }> = {
  Biotechnology: { bg: "rgba(25,195,177,0.14)", color: "#0E7C70" },
  Pharmaceutical: { bg: "rgba(0,113,227,0.10)", color: "#0040A0" },
  "Consumer Health": { bg: "rgba(224,51,142,0.12)", color: "#A31E68" },
  "Medical Device": { bg: "rgba(255,159,10,0.16)", color: "#8A5A00" },
};
function industryStyle(ind: string | null) {
  return (
    (ind && INDUSTRY_STYLE[ind]) || {
      bg: "rgba(142,152,168,0.14)",
      color: "#59616E",
    }
  );
}

function Signal({ tier }: { tier: string | null }) {
  const s = tier ? SIGNAL[tier] : null;
  const bars = s?.bars ?? 0;
  const color = s?.color || "#0071E3";
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
              className="w-1 rounded-sm"
              style={{
                height: `${b * 4 + 2}px`,
                background: b <= bars ? color : "#E5E5EA",
              }}
            />
          ))}
        </span>
        <span
          className="text-[13px] font-semibold"
          style={{ color: s ? color : "#8A8A8E" }}
        >
          {s?.label || "—"}
        </span>
      </span>
    </Tooltip>
  );
}

// Health as a bar (Suren: "the health should be like a bar") — coloured by band.
function HealthBar({ health }: { health: AccountHealth }) {
  const c = HEALTH_COLOR[health.band];
  return (
    <div className="w-[124px]">
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.03em]"
          style={{ color: c.color }}
        >
          {health.label}
        </span>
        <span className="text-[11px] tnum text-text-tertiary">
          {health.score}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(health.score, 4)}%`,
            background: c.color,
          }}
        />
      </div>
    </div>
  );
}

export function CustomersBrowser({
  customers,
}: {
  customers: EnrichedCustomer[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  // How many rows per page — user's choice, remembered (Suren: "let me decide how
  // many to show per page, on every page"). Defaults to 12 (6 rows in the 2-col
  // grid) instead of a cramped 8.
  const [perPage, setPerPage] = useState(12);
  useEffect(() => {
    const v = Number(localStorage.getItem("freyr.customers.perPage"));
    if (v && [8, 12, 24, 48].includes(v)) setPerPage(v);
  }, []);
  function changePerPage(v: string) {
    const n = Number(v);
    setPerPage(n);
    setPage(1);
    try {
      localStorage.setItem("freyr.customers.perPage", String(n));
    } catch {}
  }
  const PER_PAGE = perPage;

  // bulk actions (V4 #7)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState(REPS[0]);
  const [assigning, setAssigning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

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
      const matchesHealth =
        healthFilter === "all" || c.health.band === healthFilter;
      return matchesQuery && matchesHealth;
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
  }, [customers, query, healthFilter, sort]);

  // reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [query, healthFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);
  const rangeStart = filtered.length === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + PER_PAGE, filtered.length);

  function rowsToCsv(list: EnrichedCustomer[]) {
    return toCSV(
      [
        "Company",
        "Size",
        "Industry",
        "Geography",
        "Health",
        "Contacts",
        "Last Outcome",
        "Last Session",
      ],
      list.map((c) => [
        c.company_name,
        c.size_tier ? SIZE_TIER_LABEL[c.size_tier] || c.size_tier : "",
        c.industry || "",
        c.geography || "",
        // Health leads the list (a badge on every card, sortable + filterable),
        // so it belongs in the Excel export too.
        c.health ? `${c.health.label} (${c.health.score}/100)` : "",
        c.contact_count,
        c.last_outcome ? OUTCOME_META[c.last_outcome]?.label || c.last_outcome : "",
        c.last_session_date ? formatDateTime(c.last_session_date) : "",
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

  // Bulk "Run customer analysis" (Suren's Jun 27 ask): for ~1000 customers he
  // can't run each one, so select-all → analyze → auto-saves the qualified type,
  // ownership, and revenue for every selected account.
  async function runAnalysis() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setAnalyzing(true);
    let done = 0;
    try {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const a = await fetch(`/api/customers/${id}/analyze`, {
              method: "POST",
            }).then((r) => r.json());
            if (!a.ok) return;
            await fetch(`/api/customers/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customer_type: a.analysis.customer_type,
                ownership: a.analysis.ownership,
                revenue: a.analysis.revenue,
                analyzed_at: true,
              }),
            });
            done++;
          } catch {
            /* skip this one */
          }
        })
      );
      toast(`Analyzed ${done} account${done === 1 ? "" : "s"} — profiles updated.`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      {/* Title + filters (incl. a compact search) on one row — no standalone
          search bar eating a whole row (Suren). */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            Customers
          </h1>
          <p className="text-[14px] text-text-secondary mt-0.5">
            Every company in your pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Compact search sits inline with the filters — no dedicated row
              hogging space (Suren: the top-bar search already covers global
              search; this just filters the grid). */}
          <div className="relative w-[190px]">
            <Search size={15} strokeWidth={1.6} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              placeholder="Search customers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-[13px] bg-surface border border-border rounded-md pl-8 pr-3 py-2 outline-none focus:border-blue-primary"
            />
          </div>
          <ColorSelect
            value={healthFilter}
            onChange={setHealthFilter}
            minWidth={140}
            options={[
              { value: "all", label: "All health" },
              { value: "healthy", label: "Healthy", color: HEALTH_COLOR.healthy.color },
              { value: "watch", label: "Watch", color: HEALTH_COLOR.watch.color },
              { value: "at_risk", label: "At risk", color: HEALTH_COLOR.at_risk.color },
            ]}
          />
          <ColorSelect
            value={sort}
            onChange={setSort}
            minWidth={185}
            options={[
              { value: "recent", label: "Newest" },
              { value: "company", label: "Company A–Z" },
              { value: "size", label: "Opportunity" },
              { value: "health", label: "Health (at-risk first)" },
            ].map<ColorOption>((o) => ({ ...o, icon: ArrowDownWideNarrow }))}
          />
          <ColorSelect
            value={String(perPage)}
            onChange={changePerPage}
            minWidth={120}
            options={[8, 12, 24, 48].map<ColorOption>((n) => ({
              value: String(n),
              label: `${n} / page`,
              icon: Rows3,
            }))}
          />
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              title="Grid view"
              className={cn("p-2 transition-colors", view === "grid" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
            >
              <LayoutGrid size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              title="Table view"
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
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
            >
              <Sparkles size={15} strokeWidth={1.8} />
              {analyzing ? "Analyzing…" : "Run analysis"}
            </button>
            <span className="w-px h-5 bg-border-light" />
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
              className="text-[13px] font-semibold px-3 py-1.5 rounded-md bg-white border border-border text-text-secondary hover:bg-surface transition-colors disabled:opacity-50"
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
          description="Try a different search term or clear the filters."
          action={
            query || healthFilter !== "all" ? (
              <button
                onClick={() => {
                  setQuery("");
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
              contacts={c.contacts_preview}
              lastOutcome={c.last_outcome}
              lastSessionDate={c.last_session_date}
              health={c.health}
              stageMix={c.stage_mix}
              outcomeMix={c.outcome_mix}
              healthTrend={c.health_trend}
              trendTips={c.trend_tips}
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
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
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
                      <HoverCard
                        side="bottom"
                        width={280}
                        content={
                          <div>
                            <div className="flex items-center gap-2.5 mb-2.5">
                              <CompanyLogo name={c.company_name} className="w-9 h-9 text-[11px]" />
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold text-text-primary truncate">
                                  {c.company_name}
                                </p>
                                <p className="text-[11.5px] text-text-tertiary truncate">
                                  {[c.industry, c.geography].filter(Boolean).join(" · ") || "—"}
                                </p>
                              </div>
                            </div>
                            <div className="mb-2.5">
                              <HealthBar health={c.health} />
                            </div>
                            <div className="space-y-1 text-[12.5px]">
                              <div className="flex justify-between gap-3">
                                <span className="text-text-tertiary">Opportunity</span>
                                <span className="font-medium text-text-primary">
                                  {c.size_tier ? SIGNAL[c.size_tier]?.label ?? "—" : "—"}
                                </span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-text-tertiary">Contacts</span>
                                <span className="font-medium text-text-primary tnum">{c.contact_count}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-text-tertiary">Last touch</span>
                                <span className="font-medium text-text-primary">
                                  {c.last_outcome ? c.last_outcome.replace(/_/g, " ") : "none"}
                                </span>
                              </div>
                              {c.owner && (
                                <div className="flex justify-between gap-3">
                                  <span className="text-text-tertiary">Owner</span>
                                  <span className="font-medium text-text-primary truncate">{c.owner}</span>
                                </div>
                              )}
                            </div>
                            <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                              Open account →
                            </p>
                          </div>
                        }
                      >
                        <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                          <CompanyLogo name={c.company_name} className="w-8 h-8 text-[11px]" />
                          <span className="text-[13px] font-semibold text-text-primary">{c.company_name}</span>
                        </Link>
                      </HoverCard>
                    </td>
                    <td className="px-5 py-4"><Signal tier={c.size_tier} /></td>
                    <td className="px-5 py-4"><HealthBar health={c.health} /></td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {c.industry ? (
                        <span
                          className="inline-flex items-center text-[12px] font-medium rounded-full px-2.5 py-0.5"
                          style={industryStyle(c.industry)}
                        >
                          {c.industry}
                        </span>
                      ) : (
                        <span className="text-[13px] text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {c.contacts_preview.length > 0 ? (
                        <div className="flex items-center -space-x-2">
                          {c.contacts_preview.slice(0, 3).map((ct) => (
                            <Avatar
                              key={ct.id}
                              name={ct.name}
                              className="w-7 h-7 text-[10px] ring-2 ring-white"
                            />
                          ))}
                          {c.contact_count > 3 && (
                            <span className="w-7 h-7 rounded-full bg-surface border border-border-light text-[10px] font-semibold text-text-secondary flex items-center justify-center ring-2 ring-white tnum">
                              +{c.contact_count - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[13px] text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">{c.last_outcome ? <OutcomeBadge outcome={c.last_outcome} /> : "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">
                      {c.last_session_date ? formatDateTime(c.last_session_date) : "—"}
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
