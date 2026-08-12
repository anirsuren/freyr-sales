"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { useStoredView } from "@/lib/useStoredView";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchX, Download, LayoutGrid, Table2, ArrowRight, ChevronLeft, ChevronRight, CheckSquare, Square, X, Sparkles, ArrowDownAZ, CalendarClock, Target, HeartPulse, Rows3, Plus, Upload } from "lucide-react";
import { CustomerCard } from "./CustomerCard";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  SearchPriority,
  PrioritySearchInput,
  PriorityLabel,
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { EmptyState } from "@/components/ui/EmptyState";
import { OutcomeBadge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { cn, formatDateTime, SIZE_TIER_LABEL, OUTCOME_META } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { repOptionsFor } from "@/lib/pipeline";
import { userScopedStorageKey } from "@/lib/userIdentity";
import { HEALTH_COLOR, type AccountHealth } from "@/lib/health";
import { HoverCard } from "@/components/ui/HoverCard";
import { PeopleSelect } from "@/components/ui/PeopleSelect";
import { Modal } from "@/components/ui/Modal";
import type { Customer } from "@/lib/types";
import type { TipItem } from "@/components/charts/Charts";
import { geographyWithFlag } from "@/lib/countryFlags";

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
    "How big a deal this account could be, based on company size. High = Large, Medium = Mid, Low = Small. A quick read on where the bigger prizes are.",
  // Health column intentionally has no header hint — each row's Health badge
  // already explains itself on hover, and an exact-text test depends on the
  // header reading exactly "Health".
  "Last Outcome": "The result of the most recent touch you logged with this account.",
  "Last Session": "The last time you ran a pitch or logged activity with this account.",
};

const SIGNAL: Record<string, { label: string; bars: number; color: string }> = {
  large: { label: "High", bars: 3, color: "#34C759" }, // green
  mid: { label: "Medium", bars: 2, color: "#0071E3" }, // blue
  small: { label: "Low", bars: 1, color: "#C2410C" }, // burnt orange, tracks the warning token
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
    ? `${s.label} opportunity: based on company size (${sizeLabel}). Bigger accounts tend to mean bigger potential deals.`
    : "Company size hasn't been set for this account yet.";
  return (
    <Tooltip label={label} side="bottom" align="left">
      <span className="inline-flex items-center gap-1.5 cursor-pointer">
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
          {s?.label || "-"}
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
  includeDemoTeam,
}: {
  customers: EnrichedCustomer[];
  includeDemoTeam: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canAddCustomers = currentUser.role === "admin";
  const ownerOptions = repOptionsFor(currentUser.name, includeDemoTeam);
  const perPageStorageKey = userScopedStorageKey(
    "freyr.customers.perPage",
    currentUser.id
  );
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useStoredView<"grid" | "table">(
    "freyr.customers.view",
    "grid",
    ["grid", "table"]
  );
  const [page, setPage] = useState(1);
  const [loadedListUserId, setLoadedListUserId] = useState<string | null>(null);
  // How many rows per page — user's choice, remembered (Suren: "let me decide how
  // many to show per page, on every page"). Defaults to 12 (6 rows in the 2-col
  // grid) instead of a cramped 8.
  const [perPage, setPerPage] = useState(12);
  useEffect(() => {
    setPerPage(12);
    setPage(1);
    const urlValue = Number(
      new URLSearchParams(window.location.search).get("per_page")
    );
    const storedValue = Number(localStorage.getItem(perPageStorageKey));
    const v = [8, 12, 24, 48].includes(urlValue) ? urlValue : storedValue;
    if (v && [8, 12, 24, 48].includes(v)) setPerPage(v);
  }, [perPageStorageKey]);
  function changePerPage(v: string) {
    const n = Number(v);
    setPerPage(n);
    setPage(1);
    try {
      localStorage.setItem(perPageStorageKey, String(n));
    } catch {}
  }
  const PER_PAGE = perPage;

  // Adding accounts — both doors go through the SAME approved importer
  // (/api/import/crm): the CSV picker sends the file as-is, "Add customer"
  // sends a one-row CSV. One pipeline, one dedupe/skip behaviour.
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addForm, setAddForm] = useState({ company: "", website: "", contactName: "", contactEmail: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function postCrmCsv(file: File | Blob, filename: string) {
    const body = new FormData();
    body.append("file", file, filename);
    const res = await fetch("/api/import/crm", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Import failed");
    return data as { customers: number; contacts: number; skipped: number };
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const r = await postCrmCsv(file, file.name);
      toast(
        `Imported ${r.customers} account${r.customers === 1 ? "" : "s"}, ${r.contacts} contact${r.contacts === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`
      );
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  async function addCustomer() {
    const name = addForm.company.trim();
    if (!name) {
      toast("Give the company a name", "error");
      return;
    }
    setAdding(true);
    try {
      const esc = (v: string) => `"${v.trim().replace(/"/g, '""')}"`;
      const csv =
        "company_name,website_url,contact_name,contact_email\n" +
        [name, addForm.website, addForm.contactName, addForm.contactEmail].map(esc).join(",") +
        "\n";
      const r = await postCrmCsv(new Blob([csv], { type: "text/csv" }), "add-customer.csv");
      if (r.customers === 0 && r.skipped > 0) {
        toast("That account already exists", "error");
      } else {
        toast(`${name} added`);
        setAddOpen(false);
        setAddForm({ company: "", website: "", contactName: "", contactEmail: "" });
        router.refresh();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that", "error");
    } finally {
      setAdding(false);
    }
  }

  // bulk actions (V4 #7)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState(currentUser.name);
  const [assigning, setAssigning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setLoadedListUserId(null);
    const params = new URLSearchParams(window.location.search);
    const nextHealth = params.get("health") || "all";
    const nextSort = params.get("sort") || "recent";
    const nextView = params.get("view") || "grid";
    setQuery(params.get("q") || "");
    setHealthFilter(
      ["all", "healthy", "watch", "at_risk"].includes(nextHealth)
        ? nextHealth
        : "all"
    );
    setSort(
      ["recent", "company", "size", "health"].includes(nextSort)
        ? nextSort
        : "recent"
    );
    setView(nextView === "table" ? "table" : "grid");
    setPage(1);
    setSelectMode(false);
    setSelected(new Set());
    setBulkOwner(currentUser.name);
    setAssigning(false);
    setAnalyzing(false);
    setLoadedListUserId(currentUser.id);
  }, [currentUser.id, currentUser.name]);

  useEffect(() => {
    if (loadedListUserId !== currentUser.id) return;
    const url = new URL(window.location.href);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    };
    setOrDelete("q", query, "");
    setOrDelete("health", healthFilter, "all");
    setOrDelete("sort", sort, "recent");
    setOrDelete("view", view, "grid");
    url.searchParams.delete("page");
    setOrDelete("per_page", String(perPage), "12");
    window.history.replaceState(null, "", url.toString());
  }, [
    currentUser.id,
    healthFilter,
    loadedListUserId,
    perPage,
    query,
    sort,
    view,
  ]);

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sizeRank = useMemo<Record<string, number>>(
    () => ({ large: 3, mid: 2, small: 1 }),
    []
  );

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
  }, [customers, query, healthFilter, sort, sizeRank]);

  // reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [query, healthFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);
  const selectedInScope = useMemo(
    () => paged.filter((customer) => selected.has(customer.id)),
    [paged, selected]
  );
  const visibleIdsKey = paged.map((customer) => customer.id).join("\u0000");
  useEffect(() => {
    const visibleIds = new Set(
      visibleIdsKey ? visibleIdsKey.split("\u0000") : []
    );
    setSelected((previous) => {
      const next = new Set(
        Array.from(previous).filter((id) => visibleIds.has(id))
      );
      return next.size === previous.size ? previous : next;
    });
  }, [visibleIdsKey]);
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
    const list = selectedInScope;
    if (!list.length) return;
    downloadCSV("freyr-customers-selected.csv", rowsToCsv(list));
    toast(`Exported ${list.length} account${list.length === 1 ? "" : "s"}`);
  }
  async function assignOwner() {
    const ids = selectedInScope.map((customer) => customer.id);
    if (!ids.length) return;
    setAssigning(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/customers/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              owner: bulkOwner,
              owner_user_id:
                bulkOwner === currentUser.name
                  ? currentUser.memberId || undefined
                  : undefined,
            }),
          }).catch(() => null)
        )
      );
      const assigned = results.filter((response) => response?.ok).length;
      if (assigned) {
        toast(
          `Assigned ${assigned} account${assigned === 1 ? "" : "s"} to ${bulkOwner}`
        );
      }
      if (assigned !== ids.length) {
        toast(
          `${ids.length - assigned} account${
            ids.length - assigned === 1 ? "" : "s"
          } could not be reassigned.`,
          "error"
        );
      }
      if (assigned === ids.length) setSelected(new Set());
    } finally {
      setAssigning(false);
    }
  }

  // Bulk "Run customer analysis" (Suren's Jun 27 ask): for ~1000 customers he
  // can't run each one, so select-all → analyze → auto-saves the qualified type,
  // ownership, and revenue for every selected account.
  async function runAnalysis() {
    const ids = selectedInScope.map((customer) => customer.id);
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
      toast(`Analyzed ${done} account${done === 1 ? "" : "s"}: profiles updated.`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      {/* Title left, the two ways an account ENTERS the system right (Anir,
          Jul 30: "people should want to either import or add a customer, so
          that should be there"). */}
      {/* Same geometry and the same lift as the shared PageHeader that
          Offerings and FDL Components use — this block predates it and had
          drifted on subtitle size and bottom margin (Anir, Aug 9: "make sure
          that the header, the subheader and the button are in the same place
          so it's consistent"). */}
      <div className="rise-in flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            Customers
          </h1>
          <p className="text-[13px] text-text-secondary mt-1">
            Every company in your pipeline.
          </p>
        </div>
        {canAddCustomers && <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Upload size={15} strokeWidth={1.8} />
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <Plus size={15} strokeWidth={2.2} />
            Add customer
          </button>
          {/* Hidden picker behind Import CSV — same columns the approved
              importer expects. */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = "";
            }}
          />
        </div>}
      </div>

      {/* The toolbar is its own FULL-WIDTH bar, the same shape the offerings
          page uses. The search is `grow`: its left edge is pinned and focusing
          it expands it RIGHTWARD into the space the compressing filters
          release (Anir, Jul 30: "the search bar shouldn't move like that — it
          should only expand to the right"). The old layout right-aligned a
          width-animated input, so its left edge jumped left on focus. */}
      <SearchPriority
        query={query}
        // rise-in, because the toolbar was the one strip that just appeared
        // while the header above and the cards below lifted in (Anir, Aug 9:
        // "the filter with the row and search bar doesn't animate with the
        // rest of the page... it looks like it's an issue on the customers
        // page too").
        className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5"
      >
          <PrioritySearchInput
            grow
            className="flex-1"
            value={query}
            onChange={setQuery}
            placeholder="Search customers…"
            ariaLabel="Search customers"
          />
          <ColorSelect
            value={healthFilter}
            onChange={setHealthFilter}
            minWidth={140}
            options={[
              { value: "all", label: "All health", color: "#0071E3" },
              { value: "healthy", label: "Healthy", color: HEALTH_COLOR.healthy.color },
              // Pulled from HEALTH_COLOR like its neighbours instead of a
              // hardcoded yellow — the option label is rendered AS this colour,
              // and #EAB308 was both illegible and out of sync with the badge.
              { value: "watch", label: "Watch", color: HEALTH_COLOR.watch.color },
              { value: "at_risk", label: "At risk", color: HEALTH_COLOR.at_risk.color },
            ]}
          />
          <ColorSelect
            value={sort}
            onChange={setSort}
            minWidth={185}
            options={[
              // Icons alone rendered as a gray list — every option needs its
              // colour (standing rule: chips and dropdowns are never gray).
              // Dark teal, not amber: this label is drawn in its own colour, and
              // it must not echo the caution orange in the health filter beside it.
              { value: "recent", label: "Newest", icon: CalendarClock, color: "#0F766E" },
              { value: "company", label: "Company A–Z", icon: ArrowDownAZ, color: "#0071E3" },
              { value: "size", label: "Opportunity", icon: Target, color: "#7C3AED" },
              { value: "health", label: "Health (at-risk first)", icon: HeartPulse, color: "#E11D48" },
            ] satisfies ColorOption[]}
          />
          <ColorSelect
            value={String(perPage)}
            onChange={changePerPage}
            minWidth={120}
            options={[8, 12, 24, 48].map<ColorOption>((n) => ({
              value: String(n),
              label: `${n} / page`,
              icon: Rows3,
              // Rows3 alone would collapse every page size to one identical
              // glyph, so the compressed square shows the number itself.
              short: String(n),
              color: "#0071E3",
            }))}
          />
          {/* ICONS ONLY, VIEW TOGGLE LAST (Anir, Aug 10: "the tile dropdown
              thing should be last. The download button and the select button:
              you don't have to see what they are. Just have the icons, to the
              left of that"). Their tooltips still name them on approach. */}
          <PriorityTooltip label={selectMode ? "Done selecting" : "Select accounts"}>
            <button
              onClick={() => {
                // Selecting works in BOTH layouts now — flipping people into
                // the table was a surprise every time (Anir, Aug 12: "I should
                // be able to check it off like on normal view too").
                const next = !selectMode;
                setSelectMode(next);
                setSelected(new Set());
              }}
              aria-label={selectMode ? "Done selecting" : "Select accounts"}
              aria-pressed={selectMode}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                selectMode
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              <CheckSquare size={15} strokeWidth={1.8} />
            </button>
          </PriorityTooltip>
          <PriorityTooltip label="Export CSV">
            <button
              onClick={exportCsv}
              aria-label="Export CSV"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              <Download size={16} strokeWidth={1.5} />
            </button>
          </PriorityTooltip>
          <ViewSelect value={view} onChange={setView} tileValue="grid" tableValue="table" />
      </SearchPriority>
      {/* Bulk action bar */}
      {selectMode && selectedInScope.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg border border-blue-primary bg-blue-light flex-wrap">
          <span className="text-[13px] font-semibold text-blue-primary tnum">
            {selectedInScope.length} selected
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
            {/* The one native <select> left on this page — every rep picker in
                the app is a PeopleSelect with headshots (Anir, Jul 30: "make
                sure all the dropdowns are good… some don't have the colors"). */}
            <PeopleSelect
              ariaLabel="Bulk assign owner"
              value={bulkOwner}
              options={ownerOptions}
              onChange={setBulkOwner}
              allowUnassigned={false}
            />
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
        customers.length === 0 ? (
          // A truly empty workspace is an invitation, not a failed search
          // (Anir, Jul 30). Same two doors as the header.
          <EmptyState
            icon={Plus}
            title="No customers yet"
            description={
              canAddCustomers
                ? "Add your first account, or import your whole list from a CSV. Columns: company_name, website_url, contact_name, contact_email."
                : "There are no accounts in this workspace yet. Ask a workspace admin to add or import the first accounts."
            }
            action={canAddCustomers ? (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
                >
                  <Upload size={15} strokeWidth={1.8} />
                  {importing ? "Importing…" : "Import CSV"}
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
                >
                  <Plus size={15} strokeWidth={2.2} />
                  Add customer
                </button>
              </div>
            ) : undefined}
          />
        ) : (
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
        )
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
              selectMode={selectMode}
              selected={selected.has(c.id)}
              onToggleSelect={() => toggleSel(c.id)}
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
                                  {[c.industry, geographyWithFlag(c.geography, "")].filter(Boolean).join(" · ") || "-"}
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
                                  {c.size_tier ? SIGNAL[c.size_tier]?.label ?? "-" : "-"}
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
                        <span className="text-[13px] text-text-tertiary">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {c.contacts_preview.length > 0 ? (
                        <div className="flex items-center -space-x-2">
                          {c.contacts_preview.slice(0, 3).map((ct) => (
                            <Link
                              key={ct.id}
                              href={`/contacts/${ct.id}`}
                              aria-label={`Open ${ct.name}`}
                              className="relative rounded-full hover:z-10"
                            >
                              <Avatar
                                name={ct.name}
                                className="w-7 h-7 text-[10px] ring-2 ring-[color:var(--white)]"
                              />
                            </Link>
                          ))}
                          {c.contact_count > 3 && (
                            <span className="w-7 h-7 rounded-full bg-surface border border-border-light text-[10px] font-semibold text-text-secondary flex items-center justify-center ring-2 ring-[color:var(--white)] tnum">
                              +{c.contact_count - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[13px] text-text-tertiary">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">{c.last_outcome ? <OutcomeBadge outcome={c.last_outcome} /> : "-"}</td>
                    <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">
                      {c.last_session_date ? formatDateTime(c.last_session_date) : "-"}
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

      {/* Add ONE account by hand — a one-row CSV through the same importer
          the file picker uses, so both doors share dedupe and validation. */}
      <Modal open={canAddCustomers && addOpen} onClose={() => setAddOpen(false)} title="Add a customer">
        <div className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Company name
            </label>
            <input
              autoFocus
              value={addForm.company}
              onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="e.g. GSK"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary focus:border-blue-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Website (optional)
            </label>
            <input
              value={addForm.website}
              onChange={(e) => setAddForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary focus:border-blue-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Contact name (optional)
              </label>
              <input
                value={addForm.contactName}
                onChange={(e) => setAddForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Who you talk to there"
                className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary focus:border-blue-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Contact email (optional)
              </label>
              <input
                value={addForm.contactEmail}
                onChange={(e) => setAddForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary focus:border-blue-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setAddOpen(false)}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={addCustomer}
              disabled={adding}
              className="rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add customer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
