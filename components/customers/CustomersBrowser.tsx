"use client";

import { StatTile } from "@/components/ui/StatTile";
import { fmtMoney } from "@/lib/currency";
import { ViewSwitch } from "@/components/ui/ViewSwitch";
import { Card } from "@/components/ui/Card";
import { useStickyValue } from "@/lib/useStickyValue";
import {
  sumEstimates,
  type EstimateMeasure,
  type Opportunity,
} from "@/lib/opportunitiesShared";
import {
  OpportunitySummary,
  type SummaryDimension,
  type Timeline,
} from "@/components/opportunities/OpportunitySummary";
import { TabActions } from "./TabActions";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { PinnableTable, PinTableButton } from "@/components/ui/PinnableTable";
import { useStoredView } from "@/lib/useStoredView";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchX, Download, ArrowRight, ChevronLeft, ChevronRight, CheckSquare, Square, X, Sparkles, ArrowDownAZ, CalendarClock, Target, HeartPulse, Rows3, Plus, Upload, Building2, Users, LayoutList, Table2 } from "lucide-react";
import { CustomerCard } from "./CustomerCard";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { EmptyState } from "@/components/ui/EmptyState";
import { OutcomeBadge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { IndustryTag } from "@/components/ui/IndustryTag";
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
    "How big a deal this account could be. It comes from the size of the company, so a Large company reads High and a Small one reads Low. Use it to see where the bigger prizes are.",
  // Health column intentionally has no header hint — each row's Health badge
  // already explains itself on hover, and an exact-text test depends on the
  // header reading exactly "Health".
  "Last Outcome": "How the last thing you logged with this account went.",
  "Last Session": "The last time you ran a pitch or logged activity with this account.",
};

const SIGNAL: Record<string, { label: string; bars: number; color: string }> = {
  large: { label: "High", bars: 3, color: "#34C759" }, // green
  mid: { label: "Medium", bars: 2, color: "var(--ink-bright-blue)" }, // blue
  small: { label: "Low", bars: 1, color: "var(--ink-orange)" }, // burnt orange, tracks the warning token
};

// Color-code industries so the table scans at a glance (Suren).
const INDUSTRY_STYLE: Record<string, { bg: string; color: string }> = {
  Biotechnology: { bg: "rgba(25,195,177,0.14)", color: "#0E7C70" },
  Pharmaceutical: { bg: "rgba(0,113,227,0.10)", color: "var(--ink-blue)" },
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
  const color = s?.color || "var(--ink-bright-blue)";
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

/** Same shorthand the pipeline tiles use. */
/* ONE SHORTHAND, EVERYWHERE. This used to be its own copy, and the copies had
   drifted into four different answers for the same figure: $2,000,000 read
   "$2M" here and "$2.0M" there, $15,500,000 rounded to "$16M" on two screens,
   and every one of them printed $999,999 as "$1000K" — the carry bug
   lib/currency fixed for itself and nobody else (Anir, Sep 4: "the same figure
   read $2K on one screen and $1.5K on another"). */
function moneyShort(n: number): string {
  return fmtMoney(n);
}

export function CustomersBrowser({
  customers,
  includeDemoTeam,
  deals = [],
  customerGroups = [],
  offeringNames = {},
}: {
  customers: EnrichedCustomer[];
  includeDemoTeam: boolean;
  /** The pipeline, so the summary can total each account's money. */
  deals?: Opportunity[];
  customerGroups?: { id: string; name: string; color: string; customerIds: string[] }[];
  offeringNames?: Record<string, string>;
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

  const [sort, setSort] = useState("recent");
  /**
   * THE LIST IS THE PAGE (Manoj, Sep 3: "In Customers, we will only need
   * 'Customer Group', 'Customer' and 'Owner'. Remove opportunities, tiles, and
   * all other data and filters").
   *
   * This reverses Anir's Aug 30 arrangement, so the reasoning behind that one
   * is kept: the deal summary led "because the question people arrive with is
   * what the book is worth, not what row 14 says". That question now has its
   * own home on Opportunities, and everything an account knows about itself is
   * one click away on the account page. What was left here was the pipeline's
   * numbers on somebody else's screen.
   */
  const [shape, setShape] = useStoredView<"summary" | "list">(
    "freyr.customers.shape",
    "summary",
    ["summary", "list"] as const
  );
  /* THREE, AND ONLY THESE THREE (Manoj, Sep 4, pointing at the chip row:
     "in customers, we will only need customer group, customer, and owner...
     And everything else you can take this off. Like offering, right?
     Opportunity category, all this we don't need").

     Offering and Opportunity category are facts about a DEAL, and this is the
     customer page — cutting the book by them here answered a question nobody
     came to this screen to ask. A stored preference from before today can
     still name them, so `allowedCustomerDims` filters what comes back. */
  const [storedCustDims, setCustDims] = useStickyValue<SummaryDimension[]>(
    "freyr.customers.dims",
    ["customer", "owner", "group"]
  );
  /* A LEVEL THAT SORTS NOTHING IS NOT A LEVEL (found in the loop, Sep 4:
     this page opens on "No customer group — 20 deals", one bucket holding
     every deal, and you have to expand through it to reach anything).

     Nobody has defined a customer group yet, so grouping by one produces
     exactly one row called "No customer group" with the whole book inside it:
     a level of the tree that costs a click and answers nothing. It is offered
     the moment a group exists — this reads the data rather than deciding for
     him — and it is filtered out of a STORED preference too, the same way
     offering and category already are, because his saved order already leads
     with it and a default alone would never reach him. */
  const hasCustomerGroups = customerGroups.some((g) => g.customerIds.length > 0);
  const custDims = useMemo(() => {
    const allowed: SummaryDimension[] = hasCustomerGroups
      ? ["group", "customer", "owner"]
      : ["customer", "owner"];
    const kept = storedCustDims.filter((d) => allowed.includes(d));
    return kept.length ? kept : allowed;
  }, [storedCustDims, hasCustomerGroups]);
  const [custMeasure, setCustMeasure] = useStickyValue<EstimateMeasure>(
    "freyr.customers.measure",
    "tcv"
  );
  const [custTimeline, setCustTimeline] = useStickyValue<Timeline>(
    "freyr.customers.timeline",
    "quarterly"
  );
  /* THE TABLE, NOT CARDS (Manoj, Sep 3: the three columns are the point of
     this page, and a card grid cannot show three columns). Cards remain
     available from the switch for anyone who prefers them. */
  const [view, setView] = useStoredView<"grid" | "table">(
    "freyr.customers.view",
    "table",
    ["grid", "table"]
  );
  const [page, setPage] = useState(1);
  const [loadedListUserId, setLoadedListUserId] = useState<string | null>(null);
  // ONE PAGE BY DEFAULT (Anir, Aug 18: "there is no point in doing multiple
  // pages here… it's literally like two extra rows"). The per-page chooser
  // Suren asked for stays for anyone who wants shorter pages, with "All" as
  // the default; the pager only appears once a choice makes it needed.
  const [perPage, setPerPage] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    setPerPage(Number.POSITIVE_INFINITY);
    setPage(1);
    const urlValue = Number(
      new URLSearchParams(window.location.search).get("per_page")
    );
    const storedValue = Number(localStorage.getItem(perPageStorageKey));
    const v = [8, 12, 24, 48].includes(urlValue) ? urlValue : storedValue;
    if (v && [8, 12, 24, 48].includes(v)) setPerPage(v);
  }, [perPageStorageKey]);
  function changePerPage(v: string) {
    const n = v === "all" ? Number.POSITIVE_INFINITY : Number(v);
    setPerPage(n);
    setPage(1);
    try {
      if (v === "all") localStorage.removeItem(perPageStorageKey);
      else localStorage.setItem(perPageStorageKey, String(n));
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
    const nextSort = params.get("sort") || "recent";
    /* A MISSING URL PARAM IS NOT A CHOICE (Anir, Aug 26: "when I switch the
       mode from tile to list and then go to another page, reload, and go back
       to customers, it doesn't retain that").

       This defaulted to "grid" when ?view= was absent and then called setView,
       which is the PERSISTING setter — so simply landing on /customers with a
       clean URL wrote "grid" over whatever you had chosen. The saved
       preference was destroyed by the act of arriving. Only an explicit param
       overrides storage now. */
    const nextView = params.get("view");
    setQuery(params.get("q") || "");
    setSort(
      ["recent", "company", "size", "health"].includes(nextSort)
        ? nextSort
        : "recent"
    );
    if (nextView === "table" || nextView === "grid") setView(nextView);
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
    setOrDelete("sort", sort, "recent");
    setOrDelete("view", view, "grid");
    url.searchParams.delete("page");
    setOrDelete("per_page", Number.isFinite(perPage) ? String(perPage) : "all", "all");
    window.history.replaceState(null, "", url.toString());
  }, [
    currentUser.id,
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
      return matchesQuery;
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
  }, [customers, query, sort, sizeRank]);

  // reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  // "All on one page" is Infinity, and (page - 1) * Infinity is NaN — which
  // sliced the list to NOTHING and printed "NaN-NaN of 16" (Anir's morning
  // find, Aug 19; my overnight sweeps only checked the page answered 200).
  const start = Number.isFinite(PER_PAGE) ? (current - 1) * PER_PAGE : 0;
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
  const rangeEnd = Number.isFinite(PER_PAGE)
    ? Math.min(start + PER_PAGE, filtered.length)
    : filtered.length;

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
      {/* NO TITLE, NO SUBTITLE (Anir, Aug 30: "I don't think you need to say
          customers. You don't need to say every company in your pipeline.
          Whatever you do on the targets page, just copy this layout onto the
          customers page").

          The tab strip directly above already says which tab you are standing
          in, so the h1 repeated it and the line under it described a page
          nobody needed described. Targets has neither and starts straight into
          its content; this does now too, with the two ways an account enters
          the system kept where they were (Anir, Jul 30: "people should want to
          either import or add a customer, so that should be there"). */}
      <TabActions>
        {canAddCustomers && <>
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
        </>}
      </TabActions>

      {/* The toolbar is its own FULL-WIDTH bar, the same shape the offerings
          page uses. The search is `grow`: its left edge is pinned and focusing
          it expands it RIGHTWARD into the space the compressing filters
          release (Anir, Jul 30: "the search bar shouldn't move like that — it
          should only expand to the right"). The old layout right-aligned a
          width-animated input, so its left edge jumped left on focus. */}


      <PageToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search customers…"
        searchAriaLabel="Search customers"
        onClearAll={() => setQuery("")}
        /* NO FILTERS ON THIS LIST (Manoj's change sheet, item 22: "In
           Customers, we will only need 'Customer Group', 'Customer' and
           'Owner'. Remove opportunities, tiles, and all other data and
           filters").

           Health was the only one left, and it filtered on a column this table
           no longer shows — so the list would come back shorter with nothing
           on screen to say why. Search and sort stay: they are how you find a
           row, not extra data about it. */
        groups={[]}
        sort={
          <ColorSelect
            value={sort}
            onChange={setSort}
            ariaLabel="Sort customers"
            minWidth={185}
            dense
            collapsible={false}
            className="w-[185px] shrink-0"
            options={[
              // Icons alone rendered as a gray list — every option needs its
              // colour (standing rule: chips and dropdowns are never gray).
              // Dark teal, not amber: this label is drawn in its own colour, and
              // it must not echo the caution orange in the health filter beside it.
              { value: "recent", label: "Newest", icon: CalendarClock, color: "var(--ink-teal-deep)" },
              { value: "company", label: "Company A, Z", icon: ArrowDownAZ, color: "var(--ink-bright-blue)" },
              { value: "size", label: "Opportunity", icon: Target, color: "var(--ink-violet-soft)" },
              { value: "health", label: "Health (at-risk first)", icon: HeartPulse, color: "#E11D48" },
            ] satisfies ColorOption[]}
          />
        }
        display={
          <>
            {/* PAGE SIZE IS A DISPLAY CONTROL, so it belongs in the display
                cluster rather than in the filter run, where it had grown a
                line of its own (Anir, Aug 21: "your customers page is weird,
                there's literally a dropdown on its own line there"). */}
            <ColorSelect
              value={Number.isFinite(perPage) ? String(perPage) : "all"}
              onChange={changePerPage}
              ariaLabel="Rows per page"
              /* NO HARD WIDTH (Anir, Aug 24: "why is the 'all on one page' not
                 even showing up? You can't do that"). A fixed 120px box cut
                 "All on one page" to "All on o…", so the one option whose name
                 explains what it does was the one you could not read. The
                 select sizes to whatever it is currently showing now; 120 stays
                 as the floor so the short "8 / page" labels do not shrink the
                 control every time you page. */
              minWidth={120}
              dense
              collapsible={false}
              className="shrink-0"
              options={[
                {
                  value: "all",
                  label: "All on one page",
                  icon: Rows3,
                  short: "All",
                  color: "var(--ink-bright-blue)",
                },
                ...[8, 12, 24, 48].map<ColorOption>((n) => ({
                  value: String(n),
                  label: `${n} / page`,
                  icon: Rows3,
                  // Rows3 alone would collapse every page size to one identical
                  // glyph, so the compressed square shows the number itself.
                  short: String(n),
                  color: "var(--ink-bright-blue)",
                })),
              ]}
            />
            {/* ICONS ONLY, VIEW TOGGLE LAST (Anir, Aug 10: "the tile dropdown
                thing should be last. The download button and the select
                button: you don't have to see what they are. Just have the
                icons, to the left of that"). */}
            {/* SELECTING IS A LIST THING (Anir, Sep 4: "what the fuck does
                this button do? This checkmark button? Is it useless?").

                It turns on the row checkboxes so accounts can be bulk-assigned,
                analysed or exported — real work, but only in the list, which is
                the only view with rows to tick. Offered in Summary it did
                nothing visible at all, which is exactly what made it look
                useless. */}
            {shape === "list" && (
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
            )}
            <PriorityTooltip label="Export CSV">
              <button
                onClick={exportCsv}
                aria-label="Export CSV"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface"
              >
                <Download size={16} strokeWidth={1.5} />
              </button>
            </PriorityTooltip>
          </>
        }
        view={
          <span className="flex shrink-0 items-center gap-2">
            {/* SUMMARY OR THE LIST — the same choice Opportunities offers, so
                the two pages answer "what is this worth" and "show me the
                rows" the same way. */}
            <ViewSwitch
              ariaLabel="How to show the customers"
              className="flex"
              value={shape}
              onChange={setShape}
              options={
                [
                { key: "summary", label: "Summary", icon: Table2 },
                { key: "list", label: "List", icon: LayoutList },
                ] as const
              }
            />
            {shape === "list" && (
              <ViewSelect value={view} onChange={setView} tileValue="grid" tableValue="table" />
            )}
          </span>
        }
      />

      {/* THE BOOK, GROUPED (Anir, Aug 30: "bring that customer also, that
          kind of a grouping first — all the customers"). It is the pipeline
          summary pointed at the same deals: the money is each account's TCV,
          the four levels stack in any order, and the count says accounts
          rather than deals because this is the customer page. */}
      {/* THE DEAL SUMMARY IS GONE FROM THIS PAGE (Manoj, Sep 3: "Remove
          opportunities, tiles, and all other data and filters"). It lived
          here from Aug 30 so the customer list carried the same grouping as
          the pipeline; that view still exists, on Opportunities, which is
          where the pipeline question belongs. */}
      {shape === "summary" && (() => {
        /* THE SUMMARY READS WHAT THE PAGE IS SHOWING (Anir, Aug 30: "that
           list and then the filtering and all that should be based on whatever
           I show"). Scoped to the accounts left after the search and filters,
           by id where a deal has one and by name where it does not — the
           imported pipeline predates customer ids on every row. */
        const shown = new Set(filtered.map((c) => c.id));
        const shownNames = new Set(
          filtered.map((c) => c.company_name.trim().toLowerCase())
        );
        const scoped = deals.filter(
          (d) =>
            (d.customerId && shown.has(d.customerId)) ||
            shownNames.has(d.customer.trim().toLowerCase())
        );
        const live = new Set(
          scoped
            .filter((d) => d.status !== "Won" && d.status !== "Lost")
            .map((d) => d.customer.trim().toLowerCase())
        );
        return (
        /* SWITCHING VIEWS SHOULD LOOK LIKE SOMETHING HAPPENED (Anir, Sep 4:
           "I need proper animations when I switch from list to summary. You
           have it when I go to list, but not when I go to summary").

           The list carried `stagger` on its rows and this branch carried
           nothing, so List faded in and Summary appeared instantly — which
           reads as a glitch rather than a change of view. `key` is the shape,
           so React remounts on the switch and the entrance actually replays
           instead of only firing on first paint. */
        <div key={shape} className="tab-panel mb-4">
          {/* THE TILES STAY. Item 22 read "remove opportunities, tiles, and
              all other data and filters", and they came out — then Manoj, Sep
              4, looking at the page without them: "Number of customers, uh,
              with open deals. Okay, let these tiles be there, but from this
              filtering point of view, whatever these are, just have only these
              three." The line was about the CUTS, not the headline numbers. */}
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              icon={Building2}
              label="Customers"
              value={String(filtered.length)}
              sub={`${scoped.length} ${scoped.length === 1 ? "deal" : "deals"} against them`}
            />
            <StatTile
              icon={Target}
              label="Estimated TCV"
              value={(() => {
                const t = sumEstimates(scoped, "tcv");
                return t.entered === 0 ? "·" : moneyShort(t.total);
              })()}
              sub="across the accounts on screen"
            />
            <StatTile
              icon={Users}
              label="With open deals"
              value={String(
                filtered.filter((c) =>
                  live.has(c.company_name.trim().toLowerCase())
                ).length
              )}
              sub="accounts with something live"
            />
          </div>
          <Card className="p-4">
            <OpportunitySummary
              storageKey="freyr.customers.summaryOpen"
              /* THE CUSTOMER PAGE CUTS BY THREE THINGS AND STOPS AT THE
                 ACCOUNT (Manoj, Sep 4: "customer group, customer, and owner.
                 Only three... We don't want opportunities in this screen at
                 all"). Without `dimensions` the chip row offers Offering and
                 Opportunity category back; without `hideDealRows` an account
                 unfolds into its deals and this becomes the opportunities
                 list wearing a different heading. */
              dimensions={
                hasCustomerGroups
                  ? ["group", "customer", "owner"]
                  : ["customer", "owner"]
              }
              hideDealRows
              /* And the account's own name goes to the account, not to a deal:
                 "It should take us to the information about Galderma." */
              rowHref={(dim, label) => {
                if (dim !== "customer") return null;
                const match = customers.find(
                  (c) =>
                    c.company_name.trim().toLowerCase() === label.trim().toLowerCase()
                );
                return match ? `/customers/${match.id}` : null;
              }}
              deals={scoped}
              order={custDims}
              onReorder={setCustDims}
              measure={custMeasure}
              timeline={custTimeline}
              groupNameFor={(d) => {
                const g = d.customerId
                  ? customerGroups.find((x) => x.customerIds.includes(d.customerId!))
                  : undefined;
                return g?.name ?? "No customer group";
              }}
              offeringNameFor={(d) =>
                (d.offeringIds[0]
                  ? (offeringNames[d.offeringIds[0]] ?? d.offeringIds[0])
                  : d.offeringLabels[0]) ?? "No offering"
              }
              onOpenDeal={(id) => router.push(`/opportunities/${id}`)}
            />
          </Card>
        </div>
        );
      })()}
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

      {/* Everything below is the LIST — the summary above is its own answer
          and does not want a row count or a pin under it. */}
      {shape === "list" && filtered.length > 0 && (
        /* The pin sits on the right of this line in table view, for the same
           reason as Offerings: in the table's corner it permanently covered
           the last column header (Anir, Aug 14). */
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-secondary tnum">
            Showing{" "}
            <span className="font-semibold text-text-primary">
              {rangeStart}-{rangeEnd}
            </span>{" "}
            of <span className="font-semibold text-text-primary">{filtered.length}</span>{" "}
            {filtered.length === 1 ? "account" : "accounts"}
          </p>
          {view === "table" && (
            <PinTableButton id="customers-table" label="column headers" compact />
          )}
        </div>
      )}

      {shape === "list" && (
filtered.length === 0 ? (
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
            query ? (
              <button
                onClick={() => setQuery("")}
                className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
        )
      ) : view === "grid" ? (
        <div key={`grid-${shape}`} className="tab-panel grid grid-cols-1 md:grid-cols-2 gap-5 stagger">
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
          <PinnableTable id="customers-table" showCornerPin={false}>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {selectMode && <th className="pl-5 py-3 w-8" />}
                  {/* THREE COLUMNS (Manoj, Sep 3: "In Customers, we will only need
                      Customer Group, Customer and Owner. Remove opportunities, tiles,
                      and all other data and filters."). Everything the deal
                      pipeline knows about an account lives on the account page
                      now, one click away, rather than crowding the list. */}
                  {["Customer group", "Customer", "Owner"].map((h) => (
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {h}
                        {COL_HINTS[h] && <InfoHint text={COL_HINTS[h]} />}
                      </span>
                    </th>
                  ))}
                  {/* Trailing arrow column: header aligns like its cells. */}
                  <th className="px-5 py-3 text-right" />
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
                    {/* CUSTOMER GROUP, FIRST (Manoj, Sep 3). The name of the
                        group this account belongs to, or the honest absence of
                        one — the same wording the pipeline uses so the two
                        screens agree. */}
                    <td className="px-5 py-4 text-[13px] text-text-secondary whitespace-nowrap">
                      {customerGroups.find((g) => g.customerIds.includes(c.id))?.name ?? (
                        <span className="text-text-tertiary">No customer group</span>
                      )}
                    </td>
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
                    {/* OWNER (Manoj, Sep 3). It was buried in the hover card;
                        it is one of the three things this list is for. */}
                    <td className="px-5 py-4 text-[13px] whitespace-nowrap">
                      {c.owner ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={c.owner} className="h-6 w-6 text-[10px]" />
                          <span className="text-text-primary">{c.owner}</span>
                        </span>
                      ) : (
                        <span className="text-text-tertiary">Unassigned</span>
                      )}
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
          </PinnableTable>
        </div>
      )
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
