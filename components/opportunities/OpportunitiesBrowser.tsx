"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  Sparkles,
  Tag,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  X,
  Target,
  Percent,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrioritySearchInput } from "@/components/ui/SearchPriority";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";
import { refreshOpportunities } from "@/lib/useOpportunities";
import { useStoredView } from "@/lib/useStoredView";
import {
  OPPORTUNITY_LEVELS,
  OPPORTUNITY_STATUSES,
  REVENUE_TYPES,
  offeringCount,
  weightedValue,
  lines as linesOf,
  lineLabel,
  lineWeighted,
  opportunityConfidence,
  resolveOfferingLabel,
  type Opportunity,
  type OpportunityLine,
} from "@/lib/opportunitiesShared";
import { MultiPicker } from "@/components/ui/MultiPicker";
import {
  OfferingChip,
  offeringTypeColors,
} from "@/components/ui/OfferingChip";
import { typeMeta } from "@/components/performance/bits";
import { CURRENCIES, convert, fmtMoney, type CurrencyCode, type CurrencyRates } from "@/lib/currency";
import { OpportunityActivities } from "@/components/opportunities/OpportunityActivities";

/**
 * OPPORTUNITIES — Suren's pipeline, as records you can change.
 *
 * The columns are his sheet's, in his order: level, client, offering,
 * ARR/OTS, estimated sign date, total contract value, status, confidence,
 * next steps, and Freyr's own opportunity id. Add, edit and remove all live
 * here; the goal drill-down reads the same records as its line items.
 */

const LEVEL_COLOR: Record<string, string> = {
  Pipeline: "#0071E3",
  "Go get": "#B4318F",
  "High confidence": "#0F766E",
  Future: "#7C3AED",
};

const STATUS_COLOR: Record<string, string> = {
  Qualify: "#0891B2",
  Propose: "#0071E3",
  "Submitted to client": "#7C3AED",
  "Under review": "#B4318F",
  "On hold": "#8E98A8",
  Won: "#16A34A",
  Lost: "#DC2626",
};

/**
 * THE MONEY CELL IS BLUE-ON-BLUE, NOT A VERDICT WALL. The first cut coloured
 * confidence red/amber/green and a young pipeline became a page of red —
 * "red means horrible", and 25% confidence is not horrible, it is early
 * (Anir, Aug 17: "this isn't what I envision… make it look more premium").
 * So the cell uses the exact idiom every Performance bar already speaks:
 * solid blue for the weighted share, washed blue for the rest of the total.
 * The dropdown's per-row confidence keeps a quiet blue too.
 */
const MONEY_BLUE = "#0071E3";
function confidenceColor(_pct: number): string {
  return MONEY_BLUE;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** One editable offering row. Everything is text while it is being typed, so
 *  a half-written number is never eaten out from under the person typing it. */
type DraftLine = {
  key: string;
  /** A catalogue offering, or "" when it is being typed as free text. */
  offeringId: string;
  offeringLabel: string;
  /** True only when the person explicitly picked "Not in the catalogue". */
  offeringOther: boolean;
  revenueType: string;
  value: string;
  /** What the client pays in their own money — display only, USD counts. */
  localValue: string;
  localCurrency: string;
  status: string;
  confidence: string;
  estSignDate: string;
};

type Draft = {
  id?: string;
  externalId: string;
  name: string;
  customer: string;
  customerId: string;
  /** True only when the person explicitly picked "Not on the list" — a fresh
   *  form shows a neutral "Pick the account…" instead of looking like the
   *  type-it option chose itself (Anir, Aug 17: "why does it auto select
   *  not on the list?"). */
  customerOther: boolean;
  rows: DraftLine[];
  goalIds: string[];
  level: string;
  status: string;
  /** The activity stage this deal is AT (activity-master id). */
  activity: string;
  activityStatus: string;
  activityStart: string;
  activityEnd: string;
  owner: string;
  nextSteps: string;
};

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `new-${lineSeq}`,
    offeringId: "",
    offeringLabel: "",
    offeringOther: false,
    revenueType: "",
    value: "",
    localValue: "",
    localCurrency: "",
    status: "",
    confidence: "",
    estSignDate: "",
  };
}

const BLANK: Draft = {
  externalId: "",
  name: "",
  customer: "",
  customerId: "",
  customerOther: false,
  rows: [],
  goalIds: [],
  level: "Pipeline",
  status: "",
  activity: "",
  activityStatus: "initiated",
  activityStart: "",
  activityEnd: "",
  owner: "",
  nextSteps: "",
};

function toDraft(
  o: Opportunity,
  /** So a sheet row that says "GRI" opens with Regulatory Intelligence
   *  Services already picked, instead of asking someone to re-find it. */
  catalogue: { id: string; name: string }[] = []
): Draft {
  const existing = linesOf(o);
  // An opportunity saved before rows existed opens as ONE row holding exactly
  // what it always held, so editing an old record never silently drops it.
  const rows: DraftLine[] = existing.length
    ? existing.map((l) => {
        lineSeq += 1;
        return {
          key: l.id || `row-${lineSeq}`,
          offeringId:
            l.offeringId ??
            (l.offeringLabel
              ? (resolveOfferingLabel(l.offeringLabel, catalogue) ?? "")
              : ""),
          offeringLabel: l.offeringLabel ?? "",
          offeringOther: !l.offeringId && !!l.offeringLabel,
          revenueType: l.revenueType ?? "",
          value: l.value ? String(l.value) : "",
          localValue: l.localValue ? String(l.localValue) : "",
          localCurrency: l.localCurrency ?? "",
          status: l.status ?? "",
          confidence: l.confidence === undefined ? "" : String(l.confidence),
          estSignDate: l.estSignDate ?? "",
        };
      })
    : [
        {
          ...blankLine(),
          offeringId:
            o.offeringIds[0] ??
            (o.offeringLabels[0]
              ? (resolveOfferingLabel(o.offeringLabels[0], catalogue) ?? "")
              : ""),
          offeringLabel: o.offeringLabels[0] ?? "",
          offeringOther: o.offeringIds.length === 0 && !!o.offeringLabels[0],
          revenueType: o.revenueType ?? "",
          value: o.value ? String(o.value) : "",
          status: o.status ?? "",
          confidence: o.confidence === undefined ? "" : String(o.confidence),
          estSignDate: o.estSignDate ?? "",
        },
      ];
  return {
    id: o.id,
    externalId: o.externalId ?? "",
    name: o.name,
    customer: o.customer,
    customerId: o.customerId ?? "",
    customerOther: !o.customerId && !!o.customer,
    rows,
    goalIds: [...(o.goalIds ?? [])],
    level: o.level,
    status: o.status ?? "",
    // The deal's CURRENT stage = the newest entry in its activity history.
    activity: (o.activities ?? []).at(-1)?.activity ?? "",
    activityStatus: (o.activities ?? []).at(-1)?.status ?? "initiated",
    activityStart: (o.activities ?? []).at(-1)?.startDate ?? "",
    activityEnd: (o.activities ?? []).at(-1)?.endDate ?? "",
    owner: o.owner ?? "",
    nextSteps: o.nextSteps ?? "",
  };
}

export function OpportunitiesBrowser({
  opportunities,
  offerings,
  offeringTypes = [],
  customers,
  goals,
  masterActivities = [],
  rates = {},
  people = [],
  meName,
  canEdit,
  live,
}: {
  opportunities: Opportunity[];
  offerings: { id: string; name: string; type?: string }[];
  /** Ordered, so an offering's colour matches its card on the Offerings page. */
  offeringTypes?: { name: string }[];
  customers: { id: string; name: string }[];
  goals: { id: string; name: string; year: number; type?: string }[];
  /** The activity master's stages — the deal says which one it is AT. */
  masterActivities?: { id: string; label: string; color: string }[];
  /** Admin-entered FX rates (units per USD) — a EUR entry converts itself. */
  rates?: CurrencyRates;
  /** The roster the Owner dropdown offers. */
  people?: string[];
  meName: string;
  canEdit: boolean;
  live: boolean;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<Opportunity[]>(opportunities);
  /** CURRENT | FUTURE — two tabs, one page (Anir, Aug 17: "shouldn't it be
   *  separate, like a separate tab within the pipeline page?"). Future deals
   *  have no money yet, so they get their own table instead of $0 rows
   *  diluting the pipeline's numbers. Remembered per person. */
  const [pipeView, setPipeView] = useStoredView<"current" | "future">(
    "freyr.opportunities.view",
    "current",
    ["current", "future"]
  );
  /** GROUPING IS A LENS, NOT A STRUCTURE (Suren, Aug 17 call: "bring all the
   *  opportunities together under one customer… it's just a grouping
   *  mechanism — every row is an opportunity, I'm not taking that out"). */
  const [groupBy, setGroupBy] = useStoredView<"none" | "customer" | "offering">(
    "freyr.opportunities.groupBy",
    "customer",
    ["none", "customer", "offering"]
  );
  const futures = useMemo(
    () => list.filter((o) => o.level === "Future"),
    [list]
  );
  const currentList = useMemo(
    () => list.filter((o) => o.level !== "Future"),
    [list]
  );
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  /** Suren, Aug 16: "I need two column names where you can filter based on
   *  customer… it's like how you do customers, and within the customers,
   *  certain opportunities are coming." */
  const [customerFilter, setCustomerFilter] = useState("all");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);

  const offeringName = useMemo(
    () => new Map(offerings.map((o) => [o.id, o.name])),
    [offerings]
  );

  /**
   * EVERY OFFERING WEARS ITS OWN COLOUR (Anir, Aug 16: "the offering has to
   * have the color, the icon, etc., to make sure it's completely accurate").
   * Resolved by type, the same way the Offerings page does it, so the two
   * screens never disagree about what colour an offering is. Free-text
   * offerings from the sheet have no type, so they get no colour rather than
   * borrowing one that means something else.
   */
  const typeColor = useMemo(
    () => offeringTypeColors(offeringTypes),
    [offeringTypes]
  );
  const colorForOfferingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offerings) {
      // The same fallback the Offerings page uses when a type name has
      // drifted from the types master (its pill goes violet, not gray) —
      // "Freyr Services" vs the master's spelling left GRI colourless in
      // Real (Anir, Aug 17: "that has to be color-coded with the tag and
      // the pill and stuff"). Only truly untyped offerings stay neutral.
      const c = o.type ? (typeColor[o.type] ?? "#7C3AED") : undefined;
      if (c) map.set(o.id, c);
    }
    return map;
  }, [offerings, typeColor]);
  /** Free text off the sheet: match it to the catalogue by name when we can,
   *  so "GRI" is not colourless just because it arrived as words. */
  const colorForOfferingLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offerings) {
      const c = o.type ? (typeColor[o.type] ?? "#7C3AED") : undefined;
      if (c) map.set(o.name.trim().toLowerCase(), c);
    }
    return map;
  }, [offerings, typeColor]);
  const lineColor = (line: OpportunityLine): string | undefined => {
    if (line.offeringId) return colorForOfferingId.get(line.offeringId);
    if (!line.offeringLabel) return undefined;
    const direct = colorForOfferingLabel.get(line.offeringLabel.trim().toLowerCase());
    if (direct) return direct;
    // "GRI" is Regulatory Intelligence Services said the way the team says it,
    // so it wears that offering's colour rather than reading as untyped.
    const resolved = resolveOfferingLabel(line.offeringLabel, offerings);
    return resolved ? colorForOfferingId.get(resolved) : undefined;
  };

  /** Every account with a deal on it, for the filter. Names as they are
   *  stored, so an account that arrived from the sheet is reachable too. */
  const customersInPipeline = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of list) {
      const name = o.customer.trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [list]);

  const groupKeyOf = (o: Opportunity): string =>
    groupBy === "customer"
      ? o.customer
      : (o.offeringIds[0]
          ? (offeringName.get(o.offeringIds[0]) ?? o.offeringIds[0])
          : o.offeringLabels[0]) ?? "No offering";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return currentList
      .filter((o) => levelFilter === "all" || o.level === levelFilter)
      .filter((o) => statusFilter === "all" || (o.status ?? "") === statusFilter)
      .filter(
        (o) =>
          customerFilter === "all" ||
          o.customer.trim().toLowerCase() === customerFilter.toLowerCase()
      )
      .filter(
        (o) =>
          !q ||
          o.name.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          (o.externalId ?? "").toLowerCase().includes(q) ||
          (o.owner ?? "").toLowerCase().includes(q) ||
          o.offeringLabels.some((l) => l.toLowerCase().includes(q)) ||
          o.offeringIds.some((id) =>
            (offeringName.get(id) ?? "").toLowerCase().includes(q)
          )
      )
      .sort((a, b) => b.value - a.value);
  }, [currentList, query, levelFilter, statusFilter, customerFilter, offeringName]);

  const groupedShown = useMemo(() => {
    if (groupBy === "none") return shown;
    const totals = new Map<string, number>();
    for (const o of shown) {
      const k = groupKeyOf(o);
      totals.set(k, (totals.get(k) ?? 0) + o.value);
    }
    return [...shown].sort((a, b) => {
      const ka = groupKeyOf(a), kb = groupKeyOf(b);
      if (ka !== kb) {
        const d = (totals.get(kb) ?? 0) - (totals.get(ka) ?? 0);
        return d !== 0 ? d : ka.localeCompare(kb);
      }
      return b.value - a.value;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, offeringName]);

  const totals = useMemo(() => {
    const value = shown.reduce((s, o) => s + o.value, 0);
    const weighted = shown.reduce((s, o) => s + weightedValue(o), 0);
    const withConfidence = shown.filter((o) => o.confidence !== undefined);
    return {
      value,
      weighted,
      count: shown.length,
      avgConfidence: withConfidence.length
        ? Math.round(
            withConfidence.reduce((s, o) => s + (o.confidence ?? 0), 0) /
              withConfidence.length
          )
        : null,
    };
  }, [shown]);

  /**
   * WHAT AN OPPORTUNITY CANNOT SAVE WITHOUT (Anir, Aug 17: "why is it letting
   * me add this stuff if i didn't fill out the fields"): a name, a customer,
   * at least one offering, and every offering row named and carrying money.
   * Status, confidence and dates can genuinely be unknown — his own imported
   * deals have blanks there — so those stay optional.
   */
  const missing: string[] = !editing
    ? []
    : [
        !editing.name.trim() ? "a name for the opportunity" : "",
        !editing.customerId && !editing.customer.trim() ? "the customer" : "",
        editing.rows.length === 0 ? "at least one offering" : "",
        editing.rows.some((r) => !r.offeringId && !r.offeringLabel.trim())
          ? "the offering"
          : "",
        // Value is demanded on rows ADDED here and now — five of his real
        // imported deals genuinely carry no value yet, and editing those must
        // not trap him behind a rule about a number nobody has.
        editing.rows.some(
          (r) =>
            r.key.startsWith("new-") &&
            (r.offeringId || r.offeringLabel.trim()) &&
            (r.value === "" || !(Number(r.value) > 0))
        )
          ? "a value on the offering"
          : "",
      ].filter(Boolean);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      // The rows ARE the money. The server sums them, so nothing here types a
      // total that could disagree with what is listed under it.
      const payload = {
        op: editing.id ? "update" : "add",
        id: editing.id,
        externalId: editing.externalId,
        name: editing.name,
        customer: editing.customer,
        customerId: editing.customerId || undefined,
        lines: editing.rows.map((r) => ({
          id: r.key.startsWith("new-") ? undefined : r.key,
          offeringId: r.offeringId || undefined,
          offeringLabel: r.offeringId ? undefined : r.offeringLabel || undefined,
          revenueType: r.revenueType || undefined,
          value: r.value === "" ? 0 : Number(r.value),
          localValue:
            r.localValue === "" ? undefined : Number(r.localValue) || undefined,
          localCurrency: r.localCurrency || undefined,
          status: r.status || undefined,
          confidence: r.confidence === "" ? undefined : Number(r.confidence),
          estSignDate: r.estSignDate || undefined,
        })),
        goalIds: editing.goalIds,
        level: editing.level,
        status: editing.status || undefined,
        owner: editing.owner || undefined,
        nextSteps: editing.nextSteps || undefined,
        // Picking a different stage APPENDS to the deal's activity history —
        // the list stays the record, its last entry is where the deal is.
        activities: (() => {
          const existing = editing.id
            ? (list.find((x) => x.id === editing.id)?.activities ?? [])
            : [];
          const last = existing.at(-1);
          if (!editing.activity) return undefined;
          const entry = {
            activity: editing.activity,
            status: editing.activityStatus || "initiated",
            person: last?.activity === editing.activity ? (last.person || meName) : meName,
            date: new Date().toISOString().slice(0, 10),
            startDate: editing.activityStart || undefined,
            endDate: editing.activityEnd || undefined,
          };
          if (last?.activity === editing.activity) {
            // Same stage — its status and dates update in place.
            if (
              last.status === entry.status &&
              (last.startDate ?? "") === (entry.startDate ?? "") &&
              (last.endDate ?? "") === (entry.endDate ?? "")
            )
              return undefined;
            return [...existing.slice(0, -1), { ...last, ...entry }];
          }
          // A new stage appends the next line of the history.
          return [...existing, entry];
        })(),
      };
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      const saved: Opportunity = data.opportunity;
      setList((prev) =>
        editing.id
          ? prev.map((o) => (o.id === saved.id ? saved : o))
          : [saved, ...prev]
      );
      refreshOpportunities();
      toast(editing.id ? `${saved.name} saved` : `${saved.name} added`);
      setEditing(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(o: Opportunity) {
    setBusy(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "remove", id: o.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't delete.");
      setList((prev) => prev.filter((x) => x.id !== o.id));
      refreshOpportunities();
      toast(`${o.name} removed`);
      setConfirmRemove(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't delete.");
    } finally {
      setBusy(false);
    }
  }

  const writable = canEdit && live;

  return (
    <div>
      <PageHeader
        title="Opportunities"
        subtitle="Every live deal: what it is worth, who it is with, which offerings it covers, and how sure we are."
        action={
          writable ? (
            <Button
              onClick={() =>
                // Opens on one empty offering row, because that is the first
                // thing to fill in and an empty list reads as a dead end.
                setEditing({
                  ...BLANK,
                  owner: meName,
                  // ONE offering per opportunity (Suren, Aug 17 call) — the
                  // form opens with its single offering block ready.
                  rows: [blankLine()],
                  level: pipeView === "future" ? "Future" : "Pipeline",
                })
              }
            >
              <Plus size={14} strokeWidth={2.2} /> New opportunity
            </Button>
          ) : undefined
        }
      />

      {/* Same pill idiom as the performance rooms. NO entrance animation on
          these — the performance lesson holds here too. */}
      <div className="relative z-40 mt-4">
        <div className="inline-flex items-center gap-1 rounded-full bg-surface p-1">
          {([
            { key: "current" as const, label: "Current pipeline", count: currentList.length },
            { key: "future" as const, label: "Future", count: futures.length },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={pipeView === t.key}
              onClick={() => setPipeView(t.key)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold tracking-[-0.01em] transition-all",
                pipeView === t.key
                  ? "bg-white text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tnum",
                  t.key === "future"
                    ? "bg-[rgba(124,58,237,0.12)] text-[color:#7C3AED]"
                    : "bg-[rgba(0,113,227,0.10)] text-[color:#0058B0]"
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Same entrance the performance rooms play when the tab flips — the
          pills above hold still, only the content below arrives. */}
      <div key={pipeView} className="tab-panel">
      {pipeView === "future" ? (
        <FutureSection
          futures={futures}
          writable={writable}
          offeringName={offeringName}
          colorForOffering={(o) =>
            o.offeringIds[0]
              ? (colorForOfferingId.get(o.offeringIds[0]) ?? "#7C3AED")
              : "#7C3AED"
          }
          onEdit={(o) => setEditing(toDraft(o, offerings))}
          onRemove={(o) => setConfirmRemove(o)}
        />
      ) : (
      <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Briefcase}
          label="Opportunities"
          value={String(totals.count)}
          sub={levelFilter === "all" ? "in the pipeline" : levelFilter.toLowerCase()}
        />
        <StatTile
          icon={Target}
          label="Total value"
          value={money(totals.value)}
          sub="contract value"
        />
        <StatTile
          icon={TrendingUp}
          label="Weighted"
          value={money(totals.weighted)}
          sub="value × confidence"
        />
        <StatTile
          icon={Percent}
          label="Average confidence"
          value={totals.avgConfidence === null ? "—" : `${totals.avgConfidence}%`}
          sub={
            totals.avgConfidence === null
              ? "none recorded yet"
              : "across those that have one"
          }
        />
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-4 py-3">
          <PrioritySearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search deals, accounts, offerings, owners…"
            className="min-w-[240px] flex-1"
          />
          {/* THE ACCOUNT IS THE FIRST THING YOU NARROW BY (Suren, Aug 16:
              "it's like how you do customers, and within the customers,
              certain opportunities are coming"), so it leads the filters. */}
          <ColorSelect
            value={customerFilter}
            ariaLabel="Filter by customer"
            onChange={setCustomerFilter}
            minWidth={210}
            options={[
              { value: "all", label: "All customers" },
              // THE ACCOUNT'S OWN MARK, not a row of identical blue dots
              // (Anir, Aug 16: "here you need to have the company logo").
              ...customersInPipeline.map((c) => ({
                value: c,
                label: c,
                logoName: c,
              })),
            ]}
          />
          <ColorSelect
            value={levelFilter}
            ariaLabel="Filter by level"
            onChange={setLevelFilter}
            options={[
              { value: "all", label: "All levels" },
              ...OPPORTUNITY_LEVELS.filter((l) => l !== "Future").map((l) => ({
                value: l,
                label: l,
                color: LEVEL_COLOR[l],
              })),
            ]}
          />
          <ColorSelect
            value={groupBy}
            ariaLabel="Group rows"
            onChange={(v) => setGroupBy(v as "none" | "customer" | "offering")}
            options={[
              { value: "none", label: "No grouping", color: "#8E98A8" },
              { value: "customer", label: "Group by customer", color: "#0071E3", icon: Briefcase },
              { value: "offering", label: "Group by offering", color: "#B4318F", icon: Sparkles },
            ]}
          />
          <ColorSelect
            value={statusFilter}
            ariaLabel="Filter by status"
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Any status" },
              ...OPPORTUNITY_STATUSES.map((s) => ({
                value: s,
                label: s,
                color: STATUS_COLOR[s],
              })),
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={list.length === 0 ? "No opportunities yet" : "Nothing matches"}
            description={
              list.length === 0
                ? "Add the first deal and it shows up here, on its account, and as a line item under any goal it feeds."
                : "Clear the search or the filters to see the rest of the pipeline."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            {/* table-fixed, because auto layout poured every spare pixel
                into the first two columns — 500px for "Novartis" — and shoved
                Value, Confidence, Status and Actions past a horizontal scroll
                nobody could see (Anir, Aug 17: "I couldn't even tell that
                there was more stuff in the table"). Fixed widths on the data
                columns; Customer and Opportunity share the rest and truncate
                instead of ballooning. */}
            <table className="w-full min-w-[1024px] table-fixed border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                  <th className="w-[21%] px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Opportunity</th>
                  <th className="w-[13%] px-4 py-2.5">Offerings</th>
                  {/* ONE COLUMN FOR THE MONEY (Anir, Aug 17: "does weighted
                      have any relation to value? you could probably merge the
                      two… and color-code it, like a bar"). Weighted IS value ×
                      confidence, so the bar draws the relation instead of
                      three columns asking the reader to compute it: the track
                      is the contract value, the fill is the weighted share,
                      the colour is the confidence verdict. */}
                  <th className="w-[200px] px-4 py-2.5">Value · weighted</th>
                  <th className="w-[132px] px-4 py-2.5">Status</th>
                  <th className="w-[104px] px-4 py-2.5">Est. sign</th>
                  <th className="w-[84px] px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {groupedShown.map((o, gi) => {
                  const open = openRow === o.id;
                  const gKey = groupBy !== "none" ? groupKeyOf(o) : null;
                  const newGroup =
                    gKey !== null &&
                    (gi === 0 || groupKeyOf(groupedShown[gi - 1]) !== gKey);
                  const groupRows =
                    newGroup && gKey !== null
                      ? groupedShown.filter((x) => groupKeyOf(x) === gKey)
                      : [];
                  const names = [
                    ...o.offeringIds.map((id) => offeringName.get(id) ?? id),
                    ...o.offeringLabels,
                  ];
                  const rows = linesOf(o);
                  const shownConfidence = opportunityConfidence(o);
                  return (
                    <Fragment key={o.id}>
                      {newGroup && gKey !== null && (
                        <tr className="bg-surface/70">
                          <td colSpan={7} className="px-4 py-2">
                            <span className="flex items-center gap-2.5">
                              {groupBy === "customer" ? (
                                <CompanyLogo name={gKey} className="h-5 w-5 shrink-0 text-[7px]" />
                              ) : (
                                <OfferingChip name={gKey} color={lineColor({ id: "g", offeringLabel: gKey, value: 0 }) ?? "#B4318F"} size="xs" />
                              )}
                              {groupBy === "customer" && (
                                <b className="text-[12.5px] text-text-primary">{gKey}</b>
                              )}
                              <span className="text-[11.5px] text-text-tertiary tnum">
                                {groupRows.length} {groupRows.length === 1 ? "deal" : "deals"} · {money(groupRows.reduce((sum, x) => sum + x.value, 0))} total
                              </span>
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr
                        onClick={() => setOpenRow(open ? null : o.id)}
                        aria-expanded={open}
                        className={cn(
                          "cursor-pointer transition-colors",
                          open
                            ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                            : "hover:bg-surface"
                        )}
                      >
                        {/* THE ACCOUNT GETS ITS OWN COLUMN (Suren, Aug 16:
                            "where is the customer name? I need two column
                            names where you can filter based on customer"). It
                            was a grey subtitle under the deal name, so the one
                            thing you scan a pipeline by could not be scanned. */}
                        <td className="px-4 py-3.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <CompanyLogo
                              name={o.customer}
                              className="h-8 w-8 shrink-0 text-[10px]"
                            />
                            <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
                              {o.customer}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block min-w-0">
                            <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                              {o.name}
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                                style={{
                                  background: `${LEVEL_COLOR[o.level]}18`,
                                  color: LEVEL_COLOR[o.level],
                                }}
                              >
                                {o.level}
                              </span>
                              {o.externalId && (
                                <span className="text-[10px] text-text-tertiary tnum">
                                  {o.externalId}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        {/* THE OFFERINGS, IN THEIR OWN COLOURS. A row per
                            offering when the deal has rows, so "which
                            offerings does this cover" is answered without
                            opening anything. */}
                        <td className="px-4 py-3.5">
                          {rows.length === 0 && names.length === 0 ? (
                            <span className="text-[12px] text-text-tertiary">—</span>
                          ) : rows.length > 0 ? (
                            /* One chip per DISTINCT offering — a deal quoted
                               as ARR + OTS is two rows of the same offering,
                               and "GRI GRI" said less than "GRI" (the split
                               lives in the dropdown). */
                            <span className="flex flex-wrap items-center gap-1">
                              {(() => {
                                const seen = new Map<string, (typeof rows)[number]>();
                                for (const line of rows) {
                                  const label = lineLabel(line, (id) => offeringName.get(id));
                                  if (!seen.has(label)) seen.set(label, line);
                                }
                                const uniq = [...seen.entries()];
                                return (
                                  <>
                                    {uniq.slice(0, 2).map(([label, line]) => (
                                      <OfferingChip
                                        key={label}
                                        name={label}
                                        color={lineColor(line)}
                                        size="xs"
                                        className="max-w-[150px]"
                                      />
                                    ))}
                                    {uniq.length > 2 && (
                                      <span className="text-[11px] font-semibold text-text-tertiary">
                                        +{uniq.length - 2}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              {names.slice(0, 2).map((n) => {
                                const resolved = resolveOfferingLabel(n, offerings);
                                return (
                                  <OfferingChip
                                    key={n}
                                    name={n}
                                    color={
                                      colorForOfferingLabel.get(n.trim().toLowerCase()) ??
                                      (resolved
                                        ? colorForOfferingId.get(resolved)
                                        : undefined)
                                    }
                                    size="xs"
                                    className="max-w-[150px]"
                                  />
                                );
                              })}
                              {names.length > 2 && (
                                <span className="text-[11px] font-semibold text-text-tertiary">
                                  +{names.length - 2}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        {/* Value, weighted and confidence as ONE picture —
                            and each number SAYS which it is (Anir, Aug 17:
                            "I need to see specifically this much is weighted,
                            this much is the total. color code, not grey").
                            Weighted wears the confidence colour, same as the
                            bar it explains. */}
                        {/* Left-anchored like its neighbours (Anir: "it's
                            right-aligned. It's not left-aligned"). Fixed
                            width, so the totals still stack on one line. */}
                        <td className="px-4 py-3.5">
                          <div className="flex w-[168px] flex-col gap-1">
                            <div className="flex items-end justify-between gap-3">
                              <span className="flex flex-col items-start">
                                <span className="text-[9px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Weighted
                                </span>
                                <span
                                  className="text-[13px] font-bold tnum"
                                  style={
                                    shownConfidence === undefined
                                      ? undefined
                                      : { color: confidenceColor(shownConfidence) }
                                  }
                                >
                                  {shownConfidence === undefined
                                    ? "—"
                                    : money(weightedValue(o))}
                                </span>
                              </span>
                              <span className="flex flex-col items-end">
                                <span className="text-[9px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Total
                                </span>
                                <span className="text-[14px] font-bold text-text-primary tnum">
                                  {money(o.value)}
                                </span>
                              </span>
                            </div>
                            <span className="flex h-2 w-full overflow-hidden rounded-full bg-[rgba(0,113,227,0.14)]">
                              {shownConfidence !== undefined && (
                                <span
                                  className="block h-full rounded-full bg-blue-primary transition-[width]"
                                  style={{ width: `${shownConfidence}%` }}
                                />
                              )}
                            </span>
                            <span className="text-[10.5px] tnum">
                              {shownConfidence === undefined ? (
                                <span className="text-text-tertiary">
                                  no confidence set
                                </span>
                              ) : (
                                <span className="font-semibold text-[color:#0058B0]">
                                  {shownConfidence}% confident
                                </span>
                              )}
                              {rows.length > 1 && (
                                <span className="text-text-tertiary">
                                  {" "}· {rows.length} rows
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {o.status ? (
                            <span
                              className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                              style={{
                                background: `${STATUS_COLOR[o.status]}18`,
                                color: STATUS_COLOR[o.status],
                              }}
                            >
                              {o.status}
                            </span>
                          ) : (
                            <span className="text-[12px] text-text-tertiary">
                              not set
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-text-secondary tnum">
                          {o.estSignDate ?? "—"}
                        </td>
                        <td className="px-2 py-3.5">
                          <span className="flex items-center justify-end gap-0.5">
                            {writable && (
                              <>
                                <button
                                  type="button"
                                  title={`Edit ${o.name}`}
                                  aria-label={`Edit ${o.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing(toDraft(o, offerings));
                                  }}
                                  className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                                >
                                  <Pencil size={13} strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  title={`Remove ${o.name}`}
                                  aria-label={`Remove ${o.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmRemove(o);
                                  }}
                                  className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                                >
                                  <Trash2 size={13} strokeWidth={2.2} />
                                </button>
                              </>
                            )}
                            <ChevronDown
                              size={15}
                              strokeWidth={2.2}
                              aria-hidden="true"
                              className={cn(
                                "text-text-tertiary transition-transform",
                                open && "rotate-180 text-blue-primary"
                              )}
                            />
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="!border-t-0 bg-surface">
                          <td
                            colSpan={7}
                            className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          >
                            {/* THE OFFERING ROWS, IN FULL (Suren, Aug 16:
                                "under opportunity, offering 1 value, offering
                                2 value, offering 3 value… all the values
                                together will become the total opportunity
                                value"). Each row carries its own money, its
                                own status and its own confidence, because that
                                is the point: "within that opportunity, this
                                offering has a better status and confidence
                                level, more." */}
                            <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white">
                            {rows.length > 1 && (
                              /* No caption, no column headers — each line
                                 says itself: the offering chip, its ARR/OTS,
                                 the money with the same blue weighted bar the
                                 row above wears, the status, the date. ONLY
                                 when there are several offerings — a single
                                 offering's line just restated the row above
                                 it (Anir, Aug 17: "you don't have to say
                                 250k, 1 million, 25% again"). */
                              <div className="divide-y divide-border-light">
                                {rows.map((line) => (
                                  <div
                                    key={line.id}
                                    className="grid grid-cols-[minmax(150px,1fr)_230px_130px_110px] items-center gap-x-6 px-3.5 py-2.5"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <OfferingChip
                                        name={lineLabel(line, (id) => offeringName.get(id))}
                                        color={lineColor(line)}
                                        size="xs"
                                      />
                                      {line.revenueType && (
                                        <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10px] font-bold text-[color:#0058B0]">
                                          {line.revenueType}
                                        </span>
                                      )}
                                    </span>
                                    {/* Same shape as the column above it: the
                                        bar, then the amounts under the bar.
                                        Grey = the whole deal, light blue =
                                        this offering, strong blue = weighted. */}
                                    <span className="flex flex-col gap-1">
                                      {/* A single-offering deal's bar would
                                          just repeat the row above it (Anir,
                                          Aug 17: "this is kind of redundant,
                                          having 2 bars") — the bar and the
                                          "of the whole deal" only appear when
                                          there are several offerings to
                                          compare. */}
                                      {rows.length > 1 && (
                                        <span className="relative flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                                          <span
                                            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary opacity-[0.32]"
                                            style={{
                                              width: `${o.value > 0 ? Math.min(100, (line.value / o.value) * 100) : 0}%`,
                                            }}
                                          />
                                          <span
                                            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary"
                                            style={{
                                              width: `${o.value > 0 ? Math.min(100, (lineWeighted(line) / o.value) * 100) : 0}%`,
                                            }}
                                          />
                                        </span>
                                      )}
                                      <span className="whitespace-nowrap text-[11px] tnum">
                                        {/* One offering = the header above
                                            already says all three numbers
                                            (Anir, Aug 17: "you don't have to
                                            say 250k, 1 million, 25% again").
                                            Only several offerings earn their
                                            own money lines. */}
                                        {rows.length > 1 && (
                                          <>
                                            <b className="text-blue-primary">
                                              {line.confidence === undefined
                                                ? "—"
                                                : money(lineWeighted(line))}
                                            </b>
                                            <span className="font-semibold text-[color:rgba(0,113,227,0.55)]">
                                              {" "}of {money(line.value)}
                                            </span>
                                            <span className="text-text-tertiary">
                                              {" "}of {money(o.value)}
                                            </span>
                                            {line.confidence !== undefined && (
                                              <span className="text-text-secondary"> · {line.confidence}%</span>
                                            )}
                                          </>
                                        )}
                                        {line.localValue && line.localCurrency && (
                                          // What the client actually pays, in
                                          // their money. Reference only — the
                                          // USD number is what counts.
                                          <span className="text-text-tertiary">
                                            {" "}· {fmtMoney(line.localValue, line.localCurrency)} local
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                    <span>
                                      {line.status ? (
                                        <span
                                          className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                                          style={{
                                            background: `${STATUS_COLOR[line.status]}18`,
                                            color: STATUS_COLOR[line.status],
                                          }}
                                        >
                                          {line.status}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-text-tertiary">not set</span>
                                      )}
                                    </span>
                                    <span className="text-right text-[11.5px] text-text-tertiary tnum">
                                      {line.estSignDate ?? "no date"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* SUBSTANCE FIRST (Anir, Aug 17: "the stuff
                                below the row, in the container in the
                                dropdown, looks bad"): next steps lead as the
                                widest thing on the panel, the owner and the
                                CRM id sit in a quiet rail beside them, and
                                the activities strip gets the full width
                                under a divider. No half-empty label grid. */}
                            <div className={cn("grid grid-cols-1 gap-x-10 gap-y-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_230px]", rows.length > 1 && "border-t border-border-light")}>
                              <div className="min-w-0">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Next steps
                                </span>
                                <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-primary">
                                  {o.nextSteps ?? (
                                    <span className="text-text-tertiary">
                                      Nothing written down yet.
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="min-w-0 space-y-3.5 sm:border-l sm:border-border-light sm:pl-8">
                                <div>
                                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                    Owner
                                  </span>
                                  {o.owner ? (
                                    <span className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                                      <Avatar
                                        name={o.owner}
                                        className="h-6 w-6 shrink-0 text-[8px]"
                                      />
                                      {o.owner}
                                    </span>
                                  ) : (
                                    <span className="mt-1.5 block text-[12.5px] text-text-tertiary">
                                      Nobody yet
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                    Opportunity id
                                  </span>
                                  {o.externalId ? (
                                    <span className="mt-1.5 inline-block rounded-md bg-surface px-2 py-0.5 text-[12px] font-semibold text-text-secondary tnum">
                                      {o.externalId}
                                    </span>
                                  ) : (
                                    <span className="mt-1.5 block text-[12.5px] text-text-tertiary">
                                      none
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="border-t border-border-light pt-3.5 sm:col-span-2">
                                <OpportunityActivities
                                  opportunity={o}
                                  canEdit={canEdit && live}
                                  onSaved={(saved) =>
                                    setList((prev) =>
                                      prev.map((x) => (x.id === saved.id ? saved : x))
                                    )
                                  }
                                />
                              </div>
                            </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}
      </div>

      {!live && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Sample pipeline — switch to Real mode to add or change deals.
        </p>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : "New opportunity"}
        size="workflow"
        tall
      >
        {editing && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Opportunity name" hint="What this deal is called internally.">
                <input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="e.g. GRI platform — Novartis"
                  className={inputCls}
                />
              </Field>
              <Field label="Customer" hint="The account. Pick one of ours, or type a name that is not on the list yet.">
                {/* The browser-native datalist looked nothing like the app
                    (Anir, Aug 17: "shitty dropdown fix it so its our
                    standards") — same ColorSelect as everywhere, logos and
                    all, with the offering rows' free-text escape hatch. */}
                {(() => {
                  // Imported deals carry the account NAME but no id — resolve
                  // by name so a real account never greets its editor with
                  // "Not on the list". A FRESH form shows a neutral "Pick the
                  // account…" — the type-it row is an explicit choice, never
                  // pre-selected (Anir, Aug 17: "why does it auto select not
                  // on the list?").
                  const resolvedId =
                    editing.customerId ||
                    (customers.find(
                      (c) =>
                        c.name.trim().toLowerCase() ===
                        editing.customer.trim().toLowerCase()
                    )?.id ??
                      "");
                  const selectValue =
                    resolvedId ||
                    (editing.customerOther || editing.customer.trim()
                      ? "__other"
                      : "");
                  return selectValue === "__other" ? (
                    /* TYPING HAPPENS IN THE CONTROL ITSELF (Anir, Aug 17:
                       "you can't have the customer name have its own line —
                       if I select new, I'll enter it right there in the
                       dropdown"). One line: the input wears the trigger's
                       clothes; the chevron goes back to the list. */
                    <span className="relative block">
                      <Tag
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                      />
                      <input
                        autoFocus
                        value={editing.customer}
                        onChange={(e) =>
                          setEditing({ ...editing, customer: e.target.value })
                        }
                        placeholder="Type the account name…"
                        aria-label="Customer account name"
                        className={cn(inputCls, "pl-9 pr-10")}
                      />
                      <button
                        type="button"
                        title="Back to the account list"
                        aria-label="Back to the account list"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            customer: "",
                            customerId: "",
                            customerOther: false,
                          })
                        }
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                      >
                        <ChevronDown size={15} strokeWidth={2} />
                      </button>
                    </span>
                  ) : (
                    <ColorSelect
                      value={selectValue}
                      ariaLabel="Customer account"
                      collapsible={false}
                      className="w-full"
                      onChange={(val) => {
                        if (val === "__other") {
                          setEditing({
                            ...editing,
                            customerId: "",
                            customerOther: true,
                          });
                          return;
                        }
                        const hit = customers.find((c) => c.id === val);
                        setEditing({
                          ...editing,
                          customerId: val,
                          customer: hit ? hit.name : val ? editing.customer : "",
                          customerOther: false,
                        });
                      }}
                      options={[
                        { value: "", label: "Pick the account…", color: "#C7CDD6" },
                        {
                          value: "__other",
                          label: "Not on the list — type it",
                          color: "#8E98A8",
                          icon: Tag,
                        },
                        ...customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          logoName: c.name,
                        })),
                      ]}
                    />
                  );
                })()}
              </Field>
            </div>

            {/* ONE OFFERING PER OPPORTUNITY (Suren, Aug 17 call: "don't do
                multiple offerings on an opportunity — make it one offering on
                an opportunity… it should be a very simple screen"). A second
                offering means a second opportunity. */}
            <SingleOfferingEditor
              line={editing.rows[0] ?? blankLine()}
              offerings={offerings}
              colorForOfferingId={colorForOfferingId}
              rates={rates}
              onChange={(line) => setEditing({ ...editing, rows: [line] })}
            />

            {/* WHICH GOAL THIS DEAL FEEDS (Anir, Aug 16: the straight-line
                "must be at" "doesn't make any sense" for deals dated
                November). With this, a goal's pacing line becomes the deals
                that were supposed to have signed by today instead of a twelfth
                of the target per month. */}
            <Field
              label="Goals this deal feeds"
              hint="Its value counts toward the pacing line on every goal you pick, once its estimated sign date has passed."
            >
              <MultiPicker
                variant="dropdown"
                ariaLabel="Goals this deal feeds"
                options={goals.map((g) => ({
                  id: g.id,
                  label: g.name,
                  sub: String(g.year),
                  color: typeMeta(g.type ?? "").color,
                  icon: typeMeta(g.type ?? "").icon,
                  group: g.type ?? "Other",
                }))}
                selected={editing.goalIds}
                onToggle={(id) =>
                  setEditing({
                    ...editing,
                    goalIds: editing.goalIds.includes(id)
                      ? editing.goalIds.filter((x) => x !== id)
                      : [...editing.goalIds, id],
                  })
                }
                placeholder="Pick the goals this deal feeds…"
                emptyLabel="No goals on the master yet."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Level">
                <ColorSelect
                  value={editing.level}
                  ariaLabel="Opportunity level"
                  collapsible={false}
                  className="w-full"
                  minWidth={110}
                  dense
                  onChange={(v) => setEditing({ ...editing, level: v })}
                  options={OPPORTUNITY_LEVELS.map((l) => ({
                    value: l,
                    label: l,
                    color: LEVEL_COLOR[l],
                  }))}
                />
              </Field>
              <Field label="Status">
                <ColorSelect
                  value={editing.status}
                  ariaLabel="Opportunity status"
                  collapsible={false}
                  className="w-full"
                  minWidth={110}
                  dense
                  onChange={(v) => setEditing({ ...editing, status: v })}
                  options={[
                    { value: "", label: "Not set", color: "#8E98A8" },
                    ...OPPORTUNITY_STATUSES.map((st) => ({
                      value: st,
                      label: st,
                      color: STATUS_COLOR[st],
                    })),
                  ]}
                />
              </Field>
              <Field label="Owner">
                {/* A dropdown like everything else (Anir, Aug 17) — the
                    roster with faces, plus whatever name an imported deal
                    already carries so editing never loses it. */}
                <ColorSelect
                  value={editing.owner}
                  ariaLabel="Deal owner"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => setEditing({ ...editing, owner: v })}
                  options={[
                    { value: "", label: "Unassigned", color: "#8E98A8" },
                    ...[...new Set([
                      ...people,
                      ...(editing.owner ? [editing.owner] : []),
                    ])]
                      .sort((a, b) => a.localeCompare(b))
                      .map((n) => ({
                        value: n,
                        label: n === meName ? `${n} (you)` : n,
                        avatarName: n,
                      })),
                  ]}
                />
              </Field>
              <Field
                label="Opportunity id"
                hint="The number from Freyr's own CRM (like DO_0026765). It comes from that system, so the app can't invent it — paste it when the deal has one."
              >
                <input
                  value={editing.externalId}
                  onChange={(e) =>
                    setEditing({ ...editing, externalId: e.target.value })
                  }
                  placeholder="e.g. DO_0026765"
                  className={cn(inputCls, "tnum")}
                />
              </Field>
            </div>

            <Field label="Next steps and pending actions">
              <textarea
                value={editing.nextSteps}
                onChange={(e) =>
                  setEditing({ ...editing, nextSteps: e.target.value })
                }
                rows={3}
                placeholder="e.g. Bid defence done, decision expected in 2 months"
                className={cn(inputCls, "h-auto py-2 leading-relaxed")}
              />
            </Field>

            {/* PINNED, so Save never hides below the fold of a tall form
                (Anir, Aug 17: "the save changes button in the bottom right…
                doesn't even show up"). Sticky inside the modal's scroller,
                white over the content it floats above. */}
            <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-end gap-3 border-t border-border-light bg-white px-5 py-3">
              {editing.id && canEdit && live && (
                <button
                  type="button"
                  onClick={() => {
                    const full = list.find((x) => x.id === editing.id);
                    if (full) setConfirmRemove(full);
                  }}
                  className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                >
                  <Trash2 size={13} strokeWidth={2.2} /> Remove this opportunity
                </button>
              )}
              {missing.length > 0 && (
                <p className="min-w-0 flex-1 truncate text-right text-[12px] text-text-tertiary">
                  Still needed: {missing.join(", ")}.
                </p>
              )}
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy} disabled={missing.length > 0}>
                {editing.id ? "Save changes" : "Add opportunity"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && void remove(confirmRemove)}
        busy={busy}
        title="Remove this opportunity?"
        body={
          <>
            <b>{confirmRemove?.name}</b> comes off the pipeline, and off any goal
            that counted it as a line item.
          </>
        }
        detail="Results already logged against it stay; they simply stop naming a deal."
        confirmLabel="Remove opportunity"
      />
    </div>
  );
}

const inputCls =
  "h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none focus:border-blue-subtle";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-text-primary">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      {children}
    </label>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        {label}
      </span>
      <span className="mt-1 block truncate text-[13px] font-medium text-text-primary">
        {children}
      </span>
    </div>
  );
}

/**
 * A SEARCHABLE PICKER, NOT A WALL OF CHIPS (Anir, Aug 16: "whateven is this
 * fix it").
 *
 * The form listed every offering and every goal as a chip — sixty-odd of them
 * — so the two fields that matter (name, customer) were pushed off the top of
 * the dialog and picking one thing meant reading all of them. Collapsed it is
 * two lines: what you have chosen, and a box to find the next one.
 */
/**
 * THE OFFERING ROWS, EDITABLE.
 *
 * Suren, Aug 16: "right now you have only one offering. If you have offering 1,
 * then one row will come, then a second row, then a third row, and a fourth
 * row… all the values together will become the total opportunity value."
 *
 * The total is shown, never typed, so it cannot disagree with the rows. Each
 * row carries its own status and confidence because that was the other half of
 * what he said: "within that opportunity, this offering has a better status and
 * confidence level, more. For each offering, you can set all these."
 *
 * An offering that is not in the catalogue is typed on its own row rather than
 * in a separate comma-separated field, so the sheet's wording keeps its money
 * and its dates instead of being dumped in a bucket at the bottom of the form.
 */
/**
 * CONFIDENCE AS A 0-100 SLIDER, colour-coded (Anir, Aug 17: "make this a
 * progress bar, like a 0 to 100 thing that's color-coded"). Drag for the
 * shape, type for the exact number — same contract as the target slider.
 * The colour says what the number means while you set it: green when it is
 * nearly won, caution in the middle, red for a long shot.
 */
function ConfidenceSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Dragging is CONTINUOUS and the stored number snaps to 5s; typing is exact
  // (Anir, Aug 17: "the bar moves smoothly but the numbers go every 5 but i
  // can still enter in 72"). `drag` holds the thumb's true position while the
  // pointer is down so the bar glides instead of chunking through 5% steps.
  const [drag, setDrag] = useState<number | null>(null);
  const n = value === "" ? null : Number(value);
  const committed =
    n === null || Number.isNaN(n) ? null : Math.max(0, Math.min(100, n));
  const pct = drag ?? committed ?? 0;
  const color =
    committed === null && drag === null
      ? "#8E98A8"
      : pct >= 75
        ? "#16A34A"
        : pct >= 45
          ? "#EAB308"
          : "#DC2626";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="relative flex h-4 min-w-0 flex-1 items-center"
        style={{ ["--range-color" as string]: color }}
      >
        <span className="pointer-events-none absolute inset-x-0 h-[6px] overflow-hidden rounded-full bg-[color:var(--border-light)]">
          <span
            className="block h-full rounded-full transition-[background-color] duration-200"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}B8, ${color})`,
            }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => {
            const raw = Number(e.target.value);
            setDrag(raw);
            onChange(String(Math.round(raw / 5) * 5));
          }}
          onPointerUp={() => setDrag(null)}
          onBlur={() => setDrag(null)}
          aria-label="Confidence — drag to set"
          className="freyr-range relative z-[1] h-4 w-full cursor-pointer appearance-none bg-transparent"
        />
      </span>
      {/* Just big enough for "100 %" — the wide box beside a thin
          slider read as a mistake (Anir: "the rectangle doesn't need to
          be that big"). */}
      <span className="relative w-[60px] shrink-0">
        <input
          value={value}
          onChange={(e) => {
            // Confidence is 0–100, full stop (Anir: "this shouldn't be
            // allowed" at 145%). Anything typed past the ends snaps to them.
            const text = e.target.value;
            const n = Number(text);
            onChange(
              text.trim() !== "" && Number.isFinite(n)
                ? String(Math.max(0, Math.min(100, n)))
                : text
            );
          }}
          inputMode="numeric"
          placeholder="25"
          aria-label="Confidence — type an exact figure"
          className={cn(inputCls, "px-1.5 pr-5 text-right tnum")}
        />
        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[11px] font-semibold text-text-tertiary">
          %
        </span>
      </span>
    </div>
  );
}

/**
 * THE FUTURE TAB — deals nobody has pitched yet, from the workbook's Future
 * Pipeline sheet. No money columns: these rows honestly have none. What they
 * do have: who, which offering, when the first pitch is planned, and the
 * quarter it targets. Editing one and flipping its level to Pipeline is the
 * promotion path.
 */
function FutureSection({
  futures,
  writable,
  offeringName,
  colorForOffering,
  onEdit,
  onRemove,
}: {
  futures: Opportunity[];
  writable: boolean;
  offeringName: Map<string, string>;
  colorForOffering: (o: Opportunity) => string;
  onEdit: (o: Opportunity) => void;
  onRemove: (o: Opportunity) => void;
}) {
  const dated = futures.filter((o) => o.targetPitchDate);
  const nextPitch = dated
    .map((o) => o.targetPitchDate!)
    .sort()
    .find((d) => d >= new Date().toISOString().slice(0, 10));
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={Briefcase}
          label="Future deals"
          value={String(futures.length)}
          sub="not pitched yet — no money, honestly"
          color="#7C3AED"
        />
        <StatTile
          icon={Target}
          label="With a pitch date"
          value={`${dated.length} of ${futures.length}`}
          sub="the rest only name a quarter"
          color="#7C3AED"
        />
        <StatTile
          icon={TrendingUp}
          label="Next pitch"
          value={
            nextPitch
              ? new Date(`${nextPitch}T12:00:00`).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                })
              : "—"
          }
          sub={nextPitch ? "the soonest planned pitch" : "no upcoming date set"}
          color="#7C3AED"
        />
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        {futures.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Briefcase}
              title="Nothing queued for the future yet"
              description="Add a deal with the level Future and it lives here until it is pitched."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="w-[26%] px-4 py-2.5">Customer</th>
                  <th className="w-[20%] px-2 py-2.5">Offering</th>
                  <th className="w-[13%] px-2 py-2.5">Target pitch</th>
                  <th className="w-[12%] px-2 py-2.5">Target quarter</th>
                  <th className="px-2 py-2.5">Next steps</th>
                  {writable && <th className="w-[84px] px-2 py-2.5 pr-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {futures.map((o) => {
                  const label =
                    o.offeringIds[0]
                      ? (offeringName.get(o.offeringIds[0]) ?? o.offeringLabels[0])
                      : o.offeringLabels[0];
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <CompanyLogo name={o.customer} className="h-7 w-7 shrink-0 text-[9px]" />
                          <span className="truncate text-[13px] font-semibold text-text-primary">
                            {o.customer}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {label ? (
                          <OfferingChip name={label} color={colorForOffering(o)} size="xs" />
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-text-secondary tnum">
                        {o.targetPitchDate
                          ? new Date(`${o.targetPitchDate}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
                          : <span className="text-text-tertiary">not set</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {o.targetQuarter ? (
                          <span className="rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:#7C3AED]">
                            {o.targetQuarter}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-text-secondary">
                        {o.nextSteps ?? <span className="text-text-tertiary">nothing written down</span>}
                      </td>
                      {writable && (
                        <td className="px-2 py-2.5 pr-4 text-right">
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title={`Edit ${o.name} — flip its level to Pipeline when it is pitched`}
                              onClick={() => onEdit(o)}
                              className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                            >
                              <Pencil size={13} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              title={`Remove ${o.name}`}
                              onClick={() => onRemove(o)}
                              className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                            >
                              <Trash2 size={13} strokeWidth={2.2} />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * THE ONE OFFERING ON THE DEAL (Suren, Aug 17 call: "make it one offering on
 * an opportunity… a very simple screen"). Flat fields, always open — the
 * offering with its category fly-out, ARR/OTS, and the money row where the
 * amount is typed in whatever the client pays and USD is computed by the
 * admin rates.
 */
function SingleOfferingEditor({
  line,
  offerings,
  colorForOfferingId,
  rates = {},
  onChange,
}: {
  line: DraftLine;
  offerings: { id: string; name: string; type?: string }[];
  colorForOfferingId: Map<string, string>;
  rates?: CurrencyRates;
  onChange: (line: DraftLine) => void;
}) {
  const labelCls =
    "flex items-center gap-1 text-[12px] font-semibold text-text-primary";
  const set = (patch: Partial<DraftLine>) => onChange({ ...line, ...patch });
  /** The USD figure a local amount is worth, by the admin-entered rate.
   *  "" when no rate exists — never a silent 1:1 (lib/currency's rule). */
  const usdFrom = (amountText: string, cur: string): string => {
    const n = Number(amountText);
    if (!Number.isFinite(n) || n <= 0) return "";
    const c = convert(n, cur as CurrencyCode, "USD", rates);
    return c.exact ? String(Math.round(c.value)) : "";
  };
  return (
    <div className="space-y-3 rounded-xl border border-border-light bg-white px-3.5 py-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <div className="min-w-0">
          <label className={labelCls}>Offering</label>
          <div className="mt-1">
            <MultiPicker
              variant="dropdown"
              single
              ariaLabel="Offering on this opportunity"
              placeholder="Pick the offering…"
              emptyLabel="No offerings in the catalogue yet."
              selected={
                line.offeringId
                  ? [line.offeringId]
                  : line.offeringOther || line.offeringLabel
                    ? ["__other"]
                    : []
              }
              onToggle={(id) => {
                if (id === "__other") {
                  set({ offeringId: "", offeringOther: true });
                  return;
                }
                set({ offeringId: id, offeringLabel: "", offeringOther: false });
              }}
              topOptions={[
                {
                  id: "__other",
                  label: "Not in the catalogue — type it",
                  color: "#8E98A8",
                  icon: Tag,
                },
              ]}
              options={offerings.map((o) => ({
                id: o.id,
                label: o.name,
                group: o.type || "Other",
                color: colorForOfferingId.get(o.id) ?? "#475569",
                icon: Sparkles,
              }))}
            />
          </div>
        </div>
        <div className="min-w-0">
          <label className={labelCls}>ARR / OTS</label>
          <div className="mt-1">
            <ColorSelect
              value={line.revenueType}
              ariaLabel="ARR or OTS"
              collapsible={false}
              minWidth={140}
              className="w-full"
              onChange={(val) => set({ revenueType: val })}
              options={[
                { value: "", label: "Not set", color: "#8E98A8" },
                ...REVENUE_TYPES.map((t) => ({ value: t, label: t, color: "#0071E3" })),
              ]}
            />
          </div>
        </div>
      </div>

      {!line.offeringId && (line.offeringOther || line.offeringLabel) && (
        <div>
          <label className={labelCls}>What it&apos;s called</label>
          <input
            value={line.offeringLabel}
            onChange={(e) => set({ offeringLabel: e.target.value })}
            placeholder="e.g. Customized solution — Standards IA"
            className={cn(inputCls, "mt-1")}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="min-w-0 sm:col-span-2">
          <label className={labelCls}>Value</label>
          {/* ONE amount, in whatever the client pays — USD is computed. */}
          <div className="mt-1 flex gap-1.5">
            <ColorSelect
              value={line.localCurrency || "USD"}
              ariaLabel="Currency"
              collapsible={false}
              dense
              minWidth={88}
              onChange={(cur) => {
                if (cur === "USD") {
                  set({ localCurrency: "", localValue: "" });
                } else {
                  set({
                    localCurrency: cur,
                    localValue: line.localValue,
                    value: usdFrom(line.localValue, cur),
                  });
                }
              }}
              options={CURRENCIES.map((c) => ({
                value: c.code,
                label: c.code,
                color: c.code === "USD" ? "#0071E3" : "#0F766E",
                short: c.symbol.trim(),
              }))}
            />
            <input
              value={line.localCurrency ? line.localValue : line.value}
              onChange={(e) => {
                const text = e.target.value;
                if (line.localCurrency) {
                  set({ localValue: text, value: usdFrom(text, line.localCurrency) });
                } else {
                  set({ value: text });
                }
              }}
              inputMode="decimal"
              placeholder="e.g. 500000"
              aria-label="Deal value"
              className={cn(inputCls, "mt-0 min-w-0 flex-1 tnum")}
            />
          </div>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <label className={labelCls}>Confidence</label>
          <div className="mt-1">
            <ConfidenceSlider
              value={line.confidence}
              onChange={(val) => set({ confidence: val })}
            />
          </div>
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Est. sign</label>
          <input
            type="date"
            value={line.estSignDate}
            onChange={(e) => set({ estSignDate: e.target.value })}
            className={cn(inputCls, "mt-1 tnum")}
          />
        </div>
      </div>

      {line.localCurrency && (
        <p className="text-[11.5px] leading-snug">
          {line.value ? (
            <span className="text-text-secondary">
              ≈ <b className="text-text-primary tnum">{money(Number(line.value))}</b> at the admin rate — goals and totals count the USD figure.
            </span>
          ) : (
            <span className="font-semibold text-[color:#B45309]">
              No {line.localCurrency} rate set yet — an admin adds it on the Performance page; until then this deal has no USD value.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
