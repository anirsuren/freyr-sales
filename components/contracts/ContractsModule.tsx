"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  Download,

  FileSignature,
  Inbox,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatMoney } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PriorityLabel, PriorityTooltip } from "@/components/ui/SearchPriority";
import { monthKey, monthLabel, spreadEvenly } from "@/lib/revenueAccrualsShared";
import {
  CONTRACT_STATUSES,
  contractStatusColor,
  readinessGaps,
  scheduleTotal,
  type Contract,
  type ContractStatus,
  type ContractsState,
} from "@/lib/contractsShared";

/**
 * CONTRACTS (Suren, Aug 25): "where we are logically closing."
 *
 * What this page holds is deliberately small — "from here I need the baseline
 * of the contract: what is a contract, who is a customer, what is a value" —
 * plus schedule revenue, which supersedes the opportunity's accrual plan once
 * the contract is live ("schedule revenue is more reliable, because that is
 * decided after the contract started").
 *
 * The reference (FR-C-0001) is the handshake with the delivery platform: "that
 * ID will act as a link between this system and that system." It is printed
 * large and copyable on every row for exactly that reason. Projects, invoices
 * and resourcing live over there and are deliberately absent here.
 */

type DealOption = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  value: number;
  status?: string;
  owner?: string;
};

const BLANK = {
  id: "",
  name: "",
  customer: "",
  customerId: "",
  opportunityId: "",
  opportunityName: "",
  offeringId: "",
  offeringLabel: "",
  value: "",
  status: "Draft" as ContractStatus,
  startDate: "",
  endDate: "",
  signedOn: "",
  owner: "",
  note: "",
  scheduleMonths: "12",
  schedule: [] as { month: string; amount: string }[],
};

type Draft = typeof BLANK;

export function ContractsModule({
  state: initial,
  deals,
  members,
  live,
  canWrite,
}: {
  state: ContractsState;
  deals: DealOption[];
  members: string[];
  live: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Contract | null>(null);
  const [sort, setSort] = useState<"value" | "customer" | "starting" | "status">("value");
  const [groupBy, setGroupBy] = useState<"none" | "customer" | "status">("none");

  const contracts = state.contracts;
  const signed = contracts.filter((c) => c.status === "Signed");
  const waiting = contracts.filter((c) => c.status === "Ready for delivery");
  const drafts = contracts.filter((c) => c.status === "Draft");
  const contracted = signed.reduce((s, c) => s + c.value, 0);

  /* Deals sitting at "Create contract" with nothing drafted — the whole point
     of adding that status was that somebody then does this. */
  const awaiting = useMemo(() => {
    const done = new Set(
      contracts.map((c) => c.opportunityId).filter(Boolean) as string[]
    );
    return deals.filter(
      (d) => d.status === "Create contract" && !done.has(d.id)
    );
  }, [deals, contracts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts
      .filter((c) => {
        if (statuses.length && !statuses.includes(c.status)) return false;
        if (!q) return true;
        return [c.reference, c.name, c.customer, c.offeringLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (sort === "customer") {
          return a.customer.localeCompare(b.customer) || b.value - a.value;
        }
        if (sort === "starting") {
          return (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999");
        }
        if (sort === "status") {
          const rank = (c: Contract) => CONTRACT_STATUSES.indexOf(c.status);
          return rank(a) - rank(b) || b.value - a.value;
        }
        return b.value - a.value;
      });
  }, [contracts, statuses, query, sort]);

  /** Same grouping shape the pipeline and the accruals list use. */
  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const by = new Map<string, Contract[]>();
    for (const c of shown) {
      const key = groupBy === "customer" ? c.customer || "No customer" : c.status;
      by.set(key, [...(by.get(key) ?? []), c]);
    }
    return [...by.entries()]
      .map(([key, rows]) => ({
        key,
        rows,
        total: rows.reduce((s, c) => s + c.value, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [shown, groupBy]);

  /** The baseline the delivery side reads, as a sheet. */
  function exportCsv() {
    downloadCSV(
      `freyr-contracts-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(
        ["Reference", "Contract", "Customer", "Offering", "Value", "Status",
         "Starts", "Ends", "Signed", "Owner", "Scheduled", "Months", "Deal"],
        shown.map((c) => [
          c.reference, c.name, c.customer, c.offeringLabel ?? "", c.value,
          c.status, c.startDate ?? "", c.endDate ?? "", c.signedOn ?? "",
          c.owner ?? "", scheduleTotal(c), c.schedule.length,
          c.opportunityName ?? "",
        ])
      )
    );
    toast(`${shown.length} ${shown.length === 1 ? "contract" : "contracts"} exported.`);
  }

  async function post(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data.state) setState(data.state);
      toast(success);
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor(contract?: Contract, fromDeal?: DealOption) {
    if (contract) {
      setEditing({
        ...BLANK,
        id: contract.id,
        name: contract.name,
        customer: contract.customer,
        customerId: contract.customerId ?? "",
        opportunityId: contract.opportunityId ?? "",
        opportunityName: contract.opportunityName ?? "",
        offeringId: contract.offeringId ?? "",
        offeringLabel: contract.offeringLabel ?? "",
        value: String(contract.value),
        status: contract.status,
        startDate: contract.startDate ?? "",
        endDate: contract.endDate ?? "",
        signedOn: contract.signedOn ?? "",
        owner: contract.owner ?? "",
        note: contract.note ?? "",
        scheduleMonths: String(contract.schedule.length || 12),
        schedule: contract.schedule.map((l) => ({
          month: l.month,
          amount: String(l.amount),
        })),
      });
      return;
    }
    setEditing({
      ...BLANK,
      /* Coming from a deal, the baseline is already known — sales should not
         retype what the opportunity already says. */
      name: fromDeal ? `${fromDeal.name}` : "",
      customer: fromDeal?.customer ?? "",
      customerId: fromDeal?.customerId ?? "",
      opportunityId: fromDeal?.id ?? "",
      opportunityName: fromDeal?.name ?? "",
      offeringId: fromDeal?.offeringId ?? "",
      offeringLabel: fromDeal?.offeringLabel ?? "",
      value: fromDeal ? String(fromDeal.value) : "",
      owner: fromDeal?.owner ?? "",
      startDate: new Date().toISOString().slice(0, 10),
    });
  }

  function applySpread() {
    if (!editing) return;
    const value = Number(editing.value) || 0;
    const months = Math.max(1, Math.min(120, Number(editing.scheduleMonths) || 1));
    const start = editing.startDate
      ? monthKey(editing.startDate)
      : monthKey(new Date());
    setEditing({
      ...editing,
      scheduleMonths: String(months),
      schedule: spreadEvenly(value, start, months).map((l) => ({
        month: l.month,
        amount: String(l.amount),
      })),
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim() || !editing.customer.trim()) {
      toast("A contract needs a name and a customer.", "error");
      return;
    }
    const ok = await post(
      {
        op: "save",
        contract: {
          id: editing.id || undefined,
          name: editing.name,
          customer: editing.customer,
          customerId: editing.customerId || undefined,
          opportunityId: editing.opportunityId || undefined,
          opportunityName: editing.opportunityName || undefined,
          offeringId: editing.offeringId || undefined,
          offeringLabel: editing.offeringLabel || undefined,
          value: Math.round(Number(editing.value) || 0),
          status: editing.status,
          startDate: editing.startDate || undefined,
          endDate: editing.endDate || undefined,
          signedOn: editing.signedOn || undefined,
          owner: editing.owner || undefined,
          note: editing.note || undefined,
          schedule: editing.schedule
            .map((l) => ({
              month: l.month,
              amount: Math.round(Number(l.amount) || 0),
            }))
            .filter((l) => l.month),
        },
      },
      editing.id ? "Contract updated." : "Contract created."
    );
    if (ok) setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="Contracts"
        subtitle="Where sales closes. The baseline of every contract and its revenue schedule, with the reference the delivery platform reads it by."
        action={
          live && canWrite ? (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> New contract
            </button>
          ) : (
            <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample contracts. Switch to Real mode to work the live list
            </span>
          )
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          label="Signed"
          value={String(signed.length)}
          color="#16A34A"
          sub={formatMoney(contracted)}
        />
        <StatTile
          icon={Inbox}
          label="In the delivery basket"
          value={String(waiting.length)}
          color="#4338CA"
          sub="complete, waiting to be picked up"
        />
        <StatTile
          icon={Pencil}
          label="Still drafting"
          value={String(drafts.length)}
          sub="sales has not finished them"
        />
        <StatTile
          icon={AlertTriangle}
          label="Deals waiting on a contract"
          value={String(awaiting.length)}
          color="#B45309"
          warn={awaiting.length > 0}
          sub={'at "Create contract" with nothing drafted'}
        />
      </div>

      {/* The queue that the new opportunity status creates. */}
      {awaiting.length > 0 && (
        <section className="mt-4 rounded-xl border border-[rgba(180,83,9,0.3)] bg-white p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <AlertTriangle size={15} strokeWidth={2} style={{ color: "#B45309" }} />
            Deals sitting at “Create contract”
            <InfoHint text="Suren, Aug 25: 'submitted to client, and after that, create contract — so there you close the thing.' These deals reached that status and nobody has drafted the contract yet." />
          </h2>
          <div className="mt-2 divide-y divide-border-light">
            {awaiting.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2.5" data-awaiting-contract={d.id}>
                <CompanyLogo name={d.customer} className="h-7 w-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-text-primary">
                    {d.name}
                  </span>
                  <span className="block truncate text-[12px] text-text-secondary">
                    {d.customer}
                    {d.offeringLabel && ` · ${d.offeringLabel}`}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tnum text-text-primary">
                  {formatMoney(d.value)}
                </span>
                {live && canWrite && (
                  <button
                    type="button"
                    onClick={() => openEditor(undefined, d)}
                    className="shrink-0 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Create the contract
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <PageToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search by reference, contract, customer or offering"
        searchAriaLabel="Search contracts"
        onClearAll={() => {
          setStatuses([]);
          setGroupBy("none");
        }}
        groups={[
          {
            key: "status",
            label: "Status",
            values: statuses,
            onChange: setStatuses,
            options: CONTRACT_STATUSES.map((s) => ({
              value: s,
              label: s,
              color: contractStatusColor(s),
            })),
          },
        ]}
        filtersAfter={
          <ColorSelect
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            ariaLabel="Group rows"
            minWidth={180}
            dense
            collapsible={false}
            options={[
              { value: "none", label: "No grouping", color: "#8E98A8" },
              { value: "customer", label: "Group by customer", color: "#0071E3" },
              { value: "status", label: "Group by status", color: "#4338CA" },
            ]}
          />
        }
        sort={
          <ColorSelect
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            ariaLabel="Sort contracts"
            minWidth={175}
            dense
            collapsible={false}
            options={[
              { value: "value", label: "Biggest first", color: "#0071E3" },
              { value: "customer", label: "Customer A–Z", color: "#8E98A8" },
              { value: "starting", label: "Starting soonest", color: "#0F766E" },
              { value: "status", label: "By status", color: "#4338CA" },
            ]}
          />
        }
        display={
          <PriorityTooltip label="Export CSV">
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export CSV"
              className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              <Download size={16} strokeWidth={1.5} />
              <PriorityLabel>Export CSV</PriorityLabel>
            </button>
          </PriorityTooltip>
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={
            contracts.length === 0 ? "No contract yet" : "Nothing matches that"
          }
          description={
            contracts.length === 0
              ? "A contract is created here when a deal reaches “Create contract”. It carries the baseline — name, customer, value, schedule — and a reference the delivery platform reads it by."
              : "Clear the search or the filter."
          }
        />
      ) : (
        <div className="mt-4 space-y-2.5">
          {(groups
            ? groups.flatMap((g) => [
                /* Group header with its own total — same shape as the pipeline
                   and the accruals list. */
                <div
                  key={`h-${g.key}`}
                  data-contract-group={g.key}
                  className="flex items-center gap-2.5 px-1 pb-0.5 pt-2"
                >
                  {groupBy === "customer" ? (
                    <CompanyLogo name={g.key} className="h-6 w-6 shrink-0" />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: contractStatusColor(g.key as ContractStatus) }}
                    />
                  )}
                  <span className="text-[13px] font-bold text-text-primary">{g.key}</span>
                  <span className="text-[12px] text-text-secondary tnum">
                    {g.rows.length} {g.rows.length === 1 ? "contract" : "contracts"} ·{" "}
                    {formatMoney(g.total)}
                  </span>
                  <span className="h-px flex-1 bg-border-light" />
                </div>,
                ...g.rows,
              ])
            : shown
          ).map((entry) => {
            if (!("reference" in entry)) return entry;
            const c = entry;
            const isOpen = openId === c.id;
            const gaps = readinessGaps(c);
            return (
              <section
                key={c.id}
                data-contract={c.reference}
                className="overflow-hidden rounded-xl border border-border-light bg-white shadow-card"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-light/25"
                >
                  <CompanyLogo name={c.customer} className="h-8 w-8 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                      {c.name}
                    </span>
                    <span className="block truncate text-[12px] text-text-secondary">
                      {c.customer}
                      {c.offeringLabel && ` · ${c.offeringLabel}`}
                    </span>
                  </span>
                  {/* The handshake key, printed rather than hidden. */}
                  <span className="shrink-0 rounded-md border border-border-light bg-surface px-2 py-1 text-[11.5px] font-bold tnum text-text-secondary">
                    {c.reference}
                  </span>
                  <span
                    className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                    style={{
                      background: `${contractStatusColor(c.status)}18`,
                      color: contractStatusColor(c.status),
                    }}
                  >
                    {c.status}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-bold tnum text-text-primary">
                      {formatMoney(c.value)}
                    </span>
                    <span className="block text-[11.5px] tnum text-text-secondary">
                      {c.schedule.length}{" "}
                      {c.schedule.length === 1 ? "month" : "months"} scheduled
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    strokeWidth={2.2}
                    className={cn(
                      "shrink-0 text-text-tertiary transition-transform",
                      !isOpen && "-rotate-90"
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-border-light px-4 py-3.5">
                    {gaps.length > 0 && c.status === "Draft" && (
                      <p
                        className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                        style={{
                          background: "rgba(180,83,9,0.08)",
                          color: "#B45309",
                        }}
                      >
                        Before this can go to delivery it still needs{" "}
                        {gaps.join(", ")}.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
                      {[
                        ["Reference", c.reference],
                        ["Starts", c.startDate ? formatDate(c.startDate) : "—"],
                        ["Ends", c.endDate ? formatDate(c.endDate) : "—"],
                        ["Signed", c.signedOn ? formatDate(c.signedOn) : "—"],
                      ].map(([label, value]) => (
                        <span key={label}>
                          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            {label}
                          </span>
                          <span className="font-semibold tnum text-text-primary">
                            {value}
                          </span>
                        </span>
                      ))}
                    </div>

                    {c.schedule.length > 0 && (
                      <>
                        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                          <Coins size={13} strokeWidth={2.2} className="text-blue-primary" />
                          Schedule revenue
                          <InfoHint text="Suren, Aug 25: 'once it is executed you don't need the accrual revenue in this sense — from sales I am going to give you schedule revenue, and schedule revenue is more reliable because that is decided after the contract started.' Once this contract is Ready for delivery or Signed, this schedule supersedes the deal's accrual plan." />
                          <span className="ml-1 font-normal text-text-secondary tnum">
                            {formatMoney(scheduleTotal(c))} across{" "}
                            {c.schedule.length} months
                          </span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.schedule.map((line) => (
                            <span
                              key={line.month}
                              className="rounded-lg border border-border-light bg-surface/60 px-2.5 py-1.5 text-[12px]"
                            >
                              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                {monthLabel(line.month)}
                              </span>
                              <span className="block font-bold tnum">
                                {formatMoney(line.amount)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}

                    {c.note && (
                      <p className="mt-3 text-[12.5px] text-text-secondary">{c.note}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-text-secondary">
                      {c.owner && (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={c.owner} className="h-5 w-5 text-[8px]" />
                          {c.owner}
                        </span>
                      )}
                      <span>
                        Updated by <b>{c.updatedBy}</b> {formatDate(c.updatedAt)}
                      </span>
                      {c.opportunityId && (
                        <Link
                          href={`/opportunities?deal=${encodeURIComponent(c.opportunityId)}`}
                          className="font-semibold text-blue-primary hover:underline"
                        >
                          Open the deal
                        </Link>
                      )}
                      {live && canWrite && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditor(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                          >
                            <Pencil size={12} strokeWidth={2.2} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(c)}
                            title="Delete this contract"
                            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-[rgba(220,38,38,0.08)] hover:text-[color:#DC2626]"
                          >
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${editing.name}` : "New contract"}
          size="wide"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Contract name">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Freya.Label managed service"
                />
              </Field>
            </div>
            <Field label="Customer">
              <Input
                value={editing.customer}
                onChange={(e) =>
                  setEditing({ ...editing, customer: e.target.value })
                }
              />
            </Field>
            <Field label="Against which deal">
              <ColorSelect
                value={editing.opportunityId}
                ariaLabel="Opportunity"
                className="w-full"
                collapsible={false}
                dense
                searchable
                onChange={(v) => {
                  const deal = deals.find((d) => d.id === v);
                  setEditing({
                    ...editing,
                    opportunityId: v,
                    opportunityName: deal?.name ?? "",
                    customer: deal?.customer ?? editing.customer,
                    customerId: deal?.customerId ?? editing.customerId,
                    offeringId: deal?.offeringId ?? editing.offeringId,
                    offeringLabel: deal?.offeringLabel ?? editing.offeringLabel,
                    value: deal ? String(deal.value) : editing.value,
                  });
                }}
                options={[
                  { value: "", label: "Not against a deal", color: "#8E98A8" },
                  ...deals.map((d) => ({
                    value: d.id,
                    label: `${d.name} · ${d.customer}`,
                    color: "#0071E3",
                  })),
                ]}
              />
            </Field>
            <Field label="Contract value (USD)">
              <Input
                value={editing.value}
                inputMode="numeric"
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    value: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Status">
              <ColorSelect
                value={editing.status}
                ariaLabel="Contract status"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) =>
                  setEditing({ ...editing, status: v as ContractStatus })
                }
                options={CONTRACT_STATUSES.map((s) => ({
                  value: s,
                  label: s,
                  color: contractStatusColor(s),
                }))}
              />
            </Field>
            <Field label="Starts">
              <Input
                type="date"
                value={editing.startDate}
                onChange={(e) =>
                  setEditing({ ...editing, startDate: e.target.value })
                }
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={editing.endDate}
                onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
              />
            </Field>
            <Field label="Signed on">
              <Input
                type="date"
                value={editing.signedOn}
                onChange={(e) =>
                  setEditing({ ...editing, signedOn: e.target.value })
                }
              />
            </Field>
            <Field label="Owner">
              <ColorSelect
                value={editing.owner}
                ariaLabel="Contract owner"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, owner: v })}
                options={[
                  { value: "", label: "Unassigned", color: "#8E98A8" },
                  ...members.map((m) => ({ value: m, label: m, color: "#0071E3" })),
                ]}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-border-light bg-surface/40 p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
              <Coins size={13} strokeWidth={2.2} className="text-blue-primary" />
              Schedule revenue
            </p>
            <p className="mt-0.5 text-[12px] text-text-secondary">
              What delivery will recognise, month by month. Once this contract is
              Ready for delivery or Signed, this replaces the deal&apos;s accrual
              plan as the number anybody quotes.
            </p>
            <div className="mt-2 flex items-end gap-2">
              <Field label="Number of months">
                <Input
                  value={editing.scheduleMonths}
                  inputMode="numeric"
                  className="w-[140px]"
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      scheduleMonths: e.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                />
              </Field>
              <button
                type="button"
                onClick={applySpread}
                className="mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-2 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
              >
                Spread evenly from the start date
              </button>
              <span className="mb-2 text-[12.5px] text-text-secondary tnum">
                {formatMoney(
                  editing.schedule.reduce((s, l) => s + (Number(l.amount) || 0), 0)
                )}{" "}
                scheduled
              </span>
            </div>
            {editing.schedule.length > 0 && (
              <div className="mt-2 max-h-[220px] overflow-y-auto rounded-lg border border-border-light bg-white">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                      <th className="w-1/2">Month</th>
                      <th className="w-1/2">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {editing.schedule.map((line, i) => (
                      <tr key={line.month || i}>
                        <td className="px-3 py-1.5 text-[13px] font-semibold text-text-primary">
                          {monthLabel(line.month)}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={line.amount}
                            inputMode="numeric"
                            aria-label={`Scheduled amount for ${monthLabel(line.month)}`}
                            onChange={(e) => {
                              const schedule = [...editing.schedule];
                              schedule[i] = {
                                ...line,
                                amount: e.target.value.replace(/[^0-9]/g, ""),
                              };
                              setEditing({ ...editing, schedule });
                            }}
                            className="h-8 w-full rounded-md border border-border-light px-2 text-[13px] tnum outline-none focus:border-blue-subtle"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-3">
            <Field label="Notes for the delivery team">
              <Textarea
                rows={2}
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="Anything the delivery side needs to know when they pick this up."
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {editing.id ? "Save changes" : "Create contract"}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await post({ op: "delete", id: confirmDelete.id }, "Contract deleted.");
          setConfirmDelete(null);
        }}
        title="Delete this contract?"
        body={
          confirmDelete
            ? `${confirmDelete.reference} — ${confirmDelete.name} — goes for good, and the delivery platform loses the reference it reads this by. If it simply fell through, set the status to Cancelled instead.`
            : ""
        }
        confirmLabel="Delete contract"
      />
    </div>
  );
}
