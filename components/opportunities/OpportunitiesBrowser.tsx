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
  type Opportunity,
} from "@/lib/opportunitiesShared";

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

type Draft = {
  id?: string;
  externalId: string;
  name: string;
  customer: string;
  customerId: string;
  offeringIds: string[];
  offeringLabels: string;
  goalIds: string[];
  level: string;
  status: string;
  revenueType: string;
  value: string;
  confidence: string;
  estSignDate: string;
  owner: string;
  nextSteps: string;
};

const BLANK: Draft = {
  externalId: "",
  name: "",
  customer: "",
  customerId: "",
  offeringIds: [],
  offeringLabels: "",
  goalIds: [],
  level: "Pipeline",
  status: "",
  revenueType: "",
  value: "",
  confidence: "",
  estSignDate: "",
  owner: "",
  nextSteps: "",
};

function toDraft(o: Opportunity): Draft {
  return {
    id: o.id,
    externalId: o.externalId ?? "",
    name: o.name,
    customer: o.customer,
    customerId: o.customerId ?? "",
    offeringIds: [...o.offeringIds],
    offeringLabels: o.offeringLabels.join(", "),
    goalIds: [...(o.goalIds ?? [])],
    level: o.level,
    status: o.status ?? "",
    revenueType: o.revenueType ?? "",
    value: o.value ? String(o.value) : "",
    confidence: o.confidence === undefined ? "" : String(o.confidence),
    estSignDate: o.estSignDate ?? "",
    owner: o.owner ?? "",
    nextSteps: o.nextSteps ?? "",
  };
}

export function OpportunitiesBrowser({
  opportunities,
  offerings,
  customers,
  goals,
  meName,
  canEdit,
  live,
}: {
  opportunities: Opportunity[];
  offerings: { id: string; name: string }[];
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
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);

  const offeringName = useMemo(
    () => new Map(offerings.map((o) => [o.id, o.name])),
    [offerings]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((o) => levelFilter === "all" || o.level === levelFilter)
      .filter((o) => statusFilter === "all" || (o.status ?? "") === statusFilter)
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
  }, [list, query, levelFilter, statusFilter, offeringName]);

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
      const payload = {
        op: editing.id ? "update" : "add",
        id: editing.id,
        externalId: editing.externalId,
        name: editing.name,
        customer: editing.customer,
        customerId: editing.customerId || undefined,
        offeringIds: editing.offeringIds,
        offeringLabels: editing.offeringLabels
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        goalIds: editing.goalIds,
        level: editing.level,
        status: editing.status || undefined,
        revenueType: editing.revenueType || undefined,
        value: editing.value === "" ? 0 : Number(editing.value),
        confidence: editing.confidence === "" ? undefined : Number(editing.confidence),
        estSignDate: editing.estSignDate || undefined,
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
            <Button onClick={() => setEditing({ ...BLANK, owner: meName })}>
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
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                  <th className="px-4 py-2.5">Opportunity</th>
                  <th className="px-4 py-2.5">Offerings</th>
                  <th className="px-4 py-2.5 text-right">Value</th>
                  <th className="px-4 py-2.5 text-right">Confidence</th>
                  <th className="px-4 py-2.5 text-right">Weighted</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Est. sign</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shown.map((o) => {
                  const open = openRow === o.id;
                  const names = [
                    ...o.offeringIds.map((id) => offeringName.get(id) ?? id),
                    ...o.offeringLabels,
                  ];
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
                        <td className="px-4 py-3.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <CompanyLogo
                              name={o.customer}
                              className="h-8 w-8 shrink-0 text-[10px]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                                {o.name}
                              </span>
                              <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
                                <span className="truncate">{o.customer}</span>
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
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {names.length === 0 ? (
                            <span className="text-[12px] text-text-tertiary">—</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              {names.slice(0, 2).map((n) => (
                                <span
                                  key={n}
                                  className="max-w-[150px] truncate rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-blue-primary"
                                >
                                  {n}
                                </span>
                              ))}
                              {names.length > 2 && (
                                <span className="text-[11px] text-text-tertiary">
                                  +{names.length - 2}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                          {money(o.value)}
                          {o.revenueType && (
                            <span className="ml-1 text-[10px] font-bold text-text-tertiary">
                              {o.revenueType}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[13px] tnum">
                          {o.confidence === undefined ? (
                            <span className="text-text-tertiary">—</span>
                          ) : (
                            `${o.confidence}%`
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right text-[13px] text-text-secondary tnum">
                          {o.confidence === undefined ? "—" : money(weightedValue(o))}
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
                                    setEditing(toDraft(o));
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
                            colSpan={8}
                            className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          >
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

            <Field label="Offerings" hint="An opportunity can cover several. Search and pick each one it includes.">
              <MultiPicker
                options={offerings.map((o) => ({ id: o.id, label: o.name }))}
                selected={editing.offeringIds}
                onToggle={(id) =>
                  setEditing({
                    ...editing,
                    offeringIds: editing.offeringIds.includes(id)
                      ? editing.offeringIds.filter((x) => x !== id)
                      : [...editing.offeringIds, id],
                  })
                }
                placeholder="Search offerings…"
                emptyLabel="No offerings in the catalogue yet."
              />
            </Field>

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

            <Field
              label="Offerings not in the catalogue"
              hint="Comma separated. Keeps what the pipeline sheet said even when the catalogue has no match yet."
            >
              <input
                value={editing.offeringLabels}
                onChange={(e) =>
                  setEditing({ ...editing, offeringLabels: e.target.value })
                }
                placeholder="e.g. Customized solution — Standards IA"
                className={inputCls}
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
              <Field label="Revenue type">
                <ColorSelect
                  value={editing.revenueType}
                  ariaLabel="Revenue type"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => setEditing({ ...editing, revenueType: v })}
                  options={[
                    { value: "", label: "Not set", color: "#8E98A8" },
                    ...REVENUE_TYPES.map((r) => ({
                      value: r,
                      label: r,
                      color: "#0071E3",
                    })),
                  ]}
                />
              </Field>
              <Field label="Est. sign date">
                <input
                  type="date"
                  value={editing.estSignDate}
                  onChange={(e) =>
                    setEditing({ ...editing, estSignDate: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Total contract value">
                <input
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  inputMode="decimal"
                  placeholder="e.g. 500000"
                  className={cn(inputCls, "tnum")}
                />
              </Field>
              <Field label="Confidence %">
                <input
                  value={editing.confidence}
                  onChange={(e) =>
                    setEditing({ ...editing, confidence: e.target.value })
                  }
                  inputMode="decimal"
                  placeholder="e.g. 25"
                  className={cn(inputCls, "tnum")}
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
function MultiPicker({
  options,
  selected,
  onToggle,
  placeholder,
  emptyLabel,
}: {
  options: { id: string; label: string; sub?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      options
        .filter((o) => !selected.includes(o.id))
        .filter(
          (o) =>
            !q ||
            o.label.toLowerCase().includes(q) ||
            (o.sub ?? "").toLowerCase().includes(q)
        )
        .slice(0, 40),
    [options, selected, q]
  );

  return (
    <div className="rounded-lg border border-border-light bg-white p-2">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              title="Remove"
              className="group inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-primary px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[color:#0058B0]"
            >
              {byId.get(id)?.label ?? id}
              <X size={11} strokeWidth={2.8} className="opacity-70 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={selected.length ? "Add another…" : placeholder}
        className="h-[34px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
      />
      {open && (
        <div className="mt-1.5 max-h-[168px] overflow-y-auto rounded-lg border border-border-light">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">{emptyLabel}</p>
          ) : matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">
              {q ? `Nothing matches "${query.trim()}".` : "All of them are already on this deal."}
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onToggle(o.id);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-text-primary transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && (
                  <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                    {o.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
