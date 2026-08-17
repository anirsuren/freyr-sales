"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronDown,
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
  revenueType: string;
  value: string;
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
  rows: DraftLine[];
  goalIds: string[];
  level: string;
  status: string;
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
    revenueType: "",
    value: "",
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
  // Opens on one empty row, because an opportunity with no offering on it is
  // not a thing anyone wants to save.
  rows: [],
  goalIds: [],
  level: "Pipeline",
  status: "",
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
          revenueType: l.revenueType ?? "",
          value: l.value ? String(l.value) : "",
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
    rows,
    goalIds: [...(o.goalIds ?? [])],
    level: o.level,
    status: o.status ?? "",
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
  meName,
  canEdit,
  live,
}: {
  opportunities: Opportunity[];
  offerings: { id: string; name: string; type?: string }[];
  /** Ordered, so an offering's colour matches its card on the Offerings page. */
  offeringTypes?: { name: string }[];
  customers: { id: string; name: string }[];
  goals: { id: string; name: string; year: number }[];
  meName: string;
  canEdit: boolean;
  live: boolean;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<Opportunity[]>(opportunities);
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
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
  }, [list, query, levelFilter, statusFilter, customerFilter, offeringName]);

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
          status: r.status || undefined,
          confidence: r.confidence === "" ? undefined : Number(r.confidence),
          estSignDate: r.estSignDate || undefined,
        })),
        goalIds: editing.goalIds,
        level: editing.level,
        status: editing.status || undefined,
        owner: editing.owner || undefined,
        nextSteps: editing.nextSteps || undefined,
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
                setEditing({ ...BLANK, owner: meName, rows: [blankLine()] })
              }
            >
              <Plus size={14} strokeWidth={2.2} /> New opportunity
            </Button>
          ) : undefined
        }
      />

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
              ...OPPORTUNITY_LEVELS.map((l) => ({
                value: l,
                label: l,
                color: LEVEL_COLOR[l],
              })),
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
                  <th className="w-[104px] px-4 py-2.5 text-right">Value</th>
                  <th className="w-[110px] px-4 py-2.5 text-right">Confidence</th>
                  <th className="w-[96px] px-4 py-2.5 text-right">Weighted</th>
                  <th className="w-[132px] px-4 py-2.5">Status</th>
                  <th className="w-[104px] px-4 py-2.5">Est. sign</th>
                  <th className="w-[84px] px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shown.map((o) => {
                  const open = openRow === o.id;
                  const names = [
                    ...o.offeringIds.map((id) => offeringName.get(id) ?? id),
                    ...o.offeringLabels,
                  ];
                  const rows = linesOf(o);
                  const shownConfidence = opportunityConfidence(o);
                  return (
                    <Fragment key={o.id}>
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
                        {/* THE TOTAL IS THE SUM OF THE ROWS (Anir, Aug 16:
                            "opportunity value is the total value, but then
                            each offering has its own opportunity value"), so
                            it says how many rows made it rather than looking
                            like a number somebody typed. */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                          {money(o.value)}
                          {rows.length > 1 ? (
                            <span className="ml-1 text-[10px] font-bold text-text-tertiary">
                              {rows.length} rows
                            </span>
                          ) : (
                            o.revenueType && (
                              <span className="ml-1 text-[10px] font-bold text-text-tertiary">
                                {o.revenueType}
                              </span>
                            )
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[13px] tnum">
                          {shownConfidence === undefined ? (
                            <span className="text-text-tertiary">—</span>
                          ) : (
                            /* The number, and the number DRAWN (Anir, Aug 17:
                               "for confidence, can you show that visually?").
                               Blue like every other measure — confidence is
                               not a health verdict, so no traffic colours. */
                            <span className="inline-flex flex-col items-end gap-1">
                              <span>{shownConfidence}%</span>
                              <span className="flex h-1 w-16 overflow-hidden rounded-full bg-[color:var(--border-light)]">
                                <span
                                  className="block h-full rounded-full bg-blue-primary"
                                  style={{ width: `${shownConfidence}%` }}
                                />
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[13px] text-text-secondary tnum">
                          {shownConfidence === undefined ? "—" : money(weightedValue(o))}
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
                            colSpan={9}
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
                            {rows.length > 0 && (
                              <div className="tab-panel mb-3 overflow-hidden rounded-xl border border-border-light bg-white">
                                <div className="flex items-center gap-2 border-b border-border-light px-3 py-2">
                                  <b className="text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary">
                                    Offerings in this opportunity
                                  </b>
                                  <span className="ml-auto text-[11px] font-semibold text-text-secondary tnum">
                                    {rows.length} {rows.length === 1 ? "row" : "rows"} · {money(o.value)} total
                                  </span>
                                </div>
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr className="text-left text-[10px] font-bold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-1.5">
                                      <th>Offering</th>
                                      <th>ARR / OTS</th>
                                      <th className="!text-right">Value</th>
                                      <th className="!text-right">Confidence</th>
                                      <th className="!text-right">Weighted</th>
                                      <th>Status</th>
                                      <th>Est. sign</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border-light">
                                    {rows.map((line) => (
                                      <tr key={line.id} className="[&>td]:px-3 [&>td]:py-2">
                                        <td>
                                          <OfferingChip
                                            name={lineLabel(line, (id) => offeringName.get(id))}
                                            color={lineColor(line)}
                                            size="xs"
                                          />
                                        </td>
                                        <td className="text-[11.5px] font-semibold text-text-secondary">
                                          {line.revenueType ?? (
                                            <span className="font-normal text-text-tertiary">not set</span>
                                          )}
                                        </td>
                                        <td className="text-right text-[13px] font-semibold text-text-primary tnum">
                                          {money(line.value)}
                                        </td>
                                        <td className="text-right text-[12.5px] tnum">
                                          {line.confidence === undefined ? (
                                            <span className="text-text-tertiary">—</span>
                                          ) : (
                                            `${line.confidence}%`
                                          )}
                                        </td>
                                        <td className="text-right text-[12.5px] text-text-secondary tnum">
                                          {line.confidence === undefined
                                            ? "—"
                                            : money(lineWeighted(line))}
                                        </td>
                                        <td>
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
                                            <span className="text-[11.5px] text-text-tertiary">not set</span>
                                          )}
                                        </td>
                                        <td className="text-[11.5px] text-text-secondary tnum">
                                          {line.estSignDate ?? (
                                            <span className="text-text-tertiary">no date</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="tab-panel grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                              <Fact label="Owner">
                                {o.owner ? (
                                  <span className="flex items-center gap-1.5">
                                    <Avatar
                                      name={o.owner}
                                      className="h-5 w-5 shrink-0 text-[7px]"
                                    />
                                    {o.owner}
                                  </span>
                                ) : (
                                  <span className="text-text-tertiary">nobody yet</span>
                                )}
                              </Fact>
                              <Fact label="Revenue type">
                                {o.revenueType ?? (
                                  <span className="text-text-tertiary">not set</span>
                                )}
                              </Fact>
                              <Fact label="Offerings">
                                {offeringCount(o) === 0 ? (
                                  <span className="text-text-tertiary">none linked</span>
                                ) : (
                                  names.join(", ")
                                )}
                              </Fact>
                              <Fact label="Opportunity id">
                                {o.externalId ?? (
                                  <span className="text-text-tertiary">none</span>
                                )}
                              </Fact>
                              <div className="col-span-2 min-w-0 sm:col-span-4">
                                <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                                  Next steps
                                </span>
                                <p className="mt-1 text-[13px] text-text-primary">
                                  {o.nextSteps ?? (
                                    <span className="text-text-tertiary">
                                      Nothing written down yet.
                                    </span>
                                  )}
                                </p>
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
                <input
                  value={editing.customer}
                  onChange={(e) => {
                    const name = e.target.value;
                    const hit = customers.find(
                      (c) => c.name.toLowerCase() === name.trim().toLowerCase()
                    );
                    setEditing({
                      ...editing,
                      customer: name,
                      customerId: hit?.id ?? "",
                    });
                  }}
                  list="freyr-opportunity-customers"
                  placeholder="Start typing an account…"
                  className={inputCls}
                />
                <datalist id="freyr-opportunity-customers">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
            </div>

            {/* ONE ROW PER OFFERING (Suren, Aug 16: "if you have offering 1,
                then one row will come, then a second row, then a third row,
                then a fourth row… these things you're setting, you can
                actually set it at the opportunity level, and you can also set
                it at the offering level"). Value, status, confidence and sign
                date all live per row; the total is their sum and is never
                typed. */}
            <OfferingRowsEditor
              rows={editing.rows}
              offerings={offerings}
              colorForOfferingId={colorForOfferingId}
              onChange={(rows) => setEditing({ ...editing, rows })}
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
                options={goals.map((g) => ({
                  id: g.id,
                  label: g.name,
                  sub: String(g.year),
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
                placeholder="Search goals…"
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
                <input
                  value={editing.owner}
                  onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                  placeholder="Who is chasing it"
                  className={inputCls}
                />
              </Field>
              <Field label="Opportunity id" hint="Freyr's own reference, when there is one.">
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

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy}>
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
function OfferingRowsEditor({
  rows,
  offerings,
  colorForOfferingId,
  onChange,
}: {
  rows: DraftLine[];
  offerings: { id: string; name: string; type?: string }[];
  colorForOfferingId: Map<string, string>;
  onChange: (rows: DraftLine[]) => void;
}) {
  const total = rows.reduce(
    (sum, r) => sum + (r.value === "" ? 0 : Number(r.value) || 0),
    0
  );
  const weighted = rows.reduce((sum, r) => {
    const v = r.value === "" ? 0 : Number(r.value) || 0;
    const c = r.confidence === "" ? null : Number(r.confidence);
    return sum + (c === null || Number.isNaN(c) ? 0 : (v * c) / 100);
  }, 0);

  const set = (i: number, patch: Partial<DraftLine>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label className="text-[12px] font-semibold text-text-primary">
          Offerings in this opportunity
        </label>
        <InfoHint text={"One row per offering, each with its own value, status and confidence.\nThe opportunity's total contract value is the sum of these rows, so it is never typed by hand."} />
        {rows.length > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-text-secondary tnum">
            {money(total)} total
            {weighted > 0 && (
              <span className="font-normal text-text-tertiary">
                {" "}· {money(weighted)} weighted
              </span>
            )}
          </span>
        )}
      </div>

      <div className="mt-1.5 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-[12px] text-text-secondary">
            No offerings on this deal yet. Add the first one and its value
            becomes the opportunity&apos;s total.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="rounded-xl border border-border-light bg-white p-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="mt-2 w-4 shrink-0 text-center text-[11px] font-bold text-text-tertiary tnum">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_110px]">
                  <ColorSelect
                    value={r.offeringId}
                    ariaLabel={`Offering for row ${i + 1}`}
                    collapsible={false}
                    className="w-full"
                    minWidth={360}
                    onChange={(v) =>
                      set(i, { offeringId: v, offeringLabel: v ? "" : r.offeringLabel })
                    }
                    options={[
                      {
                        value: "",
                        label: "Not in the catalogue — type it",
                        color: "#8E98A8",
                      },
                      ...offerings.map((o) => ({
                        value: o.id,
                        label: o.name,
                        description: o.type,
                        color: colorForOfferingId.get(o.id) ?? "#475569",
                      })),
                    ]}
                  />
                  <ColorSelect
                    value={r.revenueType}
                    ariaLabel={`ARR or OTS for row ${i + 1}`}
                    collapsible={false}
                    className="w-full"
                    onChange={(v) => set(i, { revenueType: v })}
                    options={[
                      { value: "", label: "ARR / OTS", color: "#8E98A8" },
                      ...REVENUE_TYPES.map((t) => ({
                        value: t,
                        label: t,
                        color: "#0071E3",
                      })),
                    ]}
                  />
                </div>

                {!r.offeringId && (
                  <input
                    value={r.offeringLabel}
                    onChange={(e) => set(i, { offeringLabel: e.target.value })}
                    placeholder="What this offering is called, e.g. Customized solution — Standards IA"
                    className={inputCls}
                  />
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                      Value
                    </span>
                    <input
                      value={r.value}
                      onChange={(e) => set(i, { value: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 500000"
                      className={cn(inputCls, "tnum")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                      Confidence %
                    </span>
                    <input
                      value={r.confidence}
                      onChange={(e) => set(i, { confidence: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 25"
                      className={cn(inputCls, "tnum")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                      Status
                    </span>
                    <ColorSelect
                      value={r.status}
                      ariaLabel={`Status for row ${i + 1}`}
                      collapsible={false}
                      className="w-full"
                      onChange={(v) => set(i, { status: v })}
                      options={[
                        { value: "", label: "Not set", color: "#8E98A8" },
                        ...OPPORTUNITY_STATUSES.map((st) => ({
                          value: st,
                          label: st,
                          color: STATUS_COLOR[st],
                        })),
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                      Est. sign
                    </span>
                    <input
                      type="date"
                      value={r.estSignDate}
                      onChange={(e) => set(i, { estSignDate: e.target.value })}
                      className={cn(inputCls, "tnum")}
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove offering row ${i + 1}`}
                title="Remove this offering"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="mt-1 shrink-0 cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
              >
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, blankLine()])}
        className="mt-2 cursor-pointer rounded-full border border-border-light bg-white px-3 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
      >
        ＋ Add another offering
      </button>
    </div>
  );
}

