"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  CircleDashed,
  ChevronDown,
  Circle,
  CalendarClock,
  CalendarDays,
  Coins,
  Download,
  FileText,
  Target,
  FileSignature,
  Inbox,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { FormRoom } from "@/components/ui/FormRoom";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { typeMeta } from "@/components/performance/bits";
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
import { monthKey, monthLabel, monthsFrom } from "@/lib/revenueAccrualsShared";
import { BarChart } from "@/components/charts/Charts";
import {
  CONTRACT_STATUSES,
  contractChecks,
  contractStatusColor,
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
  documentUrl: "",
  signedBy: "",
  /** Which booked-revenue goal this counts towards, and whose credit it is. */
  goalId: "",
  goalPerson: "",
  note: "",
  scheduleMonths: "12",
  /** `pinned` means a person typed this month, so the even split works
   *  around it instead of overwriting it. */
  schedule: [] as { month: string; amount: string; pinned?: boolean }[],
};

type Draft = typeof BLANK;

/** How many handover rows the queue banner shows before it asks to be opened. */
const AWAITING_PREVIEW = 4;

/** The schedule rows on screen: `scheduleMonths` of them, always keyed from
 *  the start date, so moving the start slides the whole schedule. Months
 *  parked beyond the visible count are remembered, not counted. */
function scheduleRowsOf(d: Draft): { month: string; amount: string; pinned?: boolean }[] {
  const count = Math.max(1, Math.min(120, Number(d.scheduleMonths) || 1));
  const start = d.startDate ? monthKey(d.startDate) : monthKey(new Date());
  return monthsFrom(start, count).map((month, i) => ({
    month,
    amount: d.schedule[i]?.amount ?? "",
    ...(d.schedule[i]?.pinned ? { pinned: true } : {}),
  }));
}

export function ContractsModule({
  state: initial,
  deals,
  members,
  goals,
  meName,
  canWrite,
  live = true,
}: {
  state: ContractsState;
  deals: DealOption[];
  members: string[];
  /** The Goal Master, so a signed contract can be put against one. */
  goals: { id: string; name: string; year: number; type?: string }[];
  meName: string;
  canWrite: boolean;
  /** Real workspace data, or the demo set. The pill above says which. */
  live?: boolean;
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
  const [showAllAwaiting, setShowAllAwaiting] = useState(false);

  const contracts = state.contracts;
  /* The schedule ON SCREEN is the schedule. A month parked past the visible
     count is remembered, not counted, or the running total would argue with
     the table it sits under. */
  const scheduleRows = editing ? scheduleRowsOf(editing) : [];
  const scheduleTotalNow = scheduleRows.reduce(
    (sum, l) => sum + (Number(l.amount) || 0),
    0
  );
  const scheduleValue = editing ? Number(editing.value) || 0 : 0;
  const goalName = useMemo(
    () => new Map(goals.map((g) => [g.id, `${g.name} · ${g.year}`])),
    [goals]
  );
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
        documentUrl: contract.documentUrl ?? "",
        signedBy: contract.signedBy ?? "",
        goalId: contract.goalLink?.goalId ?? "",
        goalPerson: contract.goalLink?.person ?? "",
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

  /**
   * THE SAME LIVE FORMULA THE ACCRUAL DIALOG USES. Both forms ask for a value,
   * a start and a month count and then draw a table, so both behave the same
   * way: the table follows the three fields on every keystroke (Anir, Aug 28:
   * "if I'm changing the number here, shouldn't it change below? and make me
   * enter in other stuff / prefill it").
   *
   * A month someone typed into is HELD and never rewritten; the loose months
   * share whatever the held ones have not claimed, so the schedule lands on
   * the contract value by itself. Shrinking the count only hides months —
   * their amounts stay put, because typing "12" over "4" passes through an
   * empty box and must not throw work away in that keystroke.
   */
  function reshapeSchedule(next: Draft): Draft {
    const count = Math.max(1, Math.min(120, Number(next.scheduleMonths) || 1));
    const start = next.startDate ? monthKey(next.startDate) : monthKey(new Date());
    const keys = monthsFrom(start, count);
    if (!keys.length) return { ...next, scheduleMonths: String(count) };
    const value = Number(next.value) || 0;

    const held = keys.map((_, i) =>
      next.schedule[i]?.pinned ? Number(next.schedule[i]?.amount) || 0 : null
    );
    const loose = held.filter((a) => a === null).length;
    const left = Math.max(0, value - held.reduce((s: number, a) => s + (a ?? 0), 0));
    const per = loose ? Math.floor(left / loose) : 0;
    let seen = 0;

    const schedule = keys.map((month, i) => {
      if (held[i] !== null)
        return { month, amount: next.schedule[i].amount, pinned: true };
      seen += 1;
      /* The rounding remainder lands on the last loose month so the rows add
         back to exactly the contract value. */
      return { month, amount: String(seen === loose ? left - per * (loose - 1) : per) };
    });

    return {
      ...next,
      scheduleMonths: String(count),
      schedule: [...schedule, ...next.schedule.slice(count)],
    };
  }

  /** Edit the value, the start date or the month count; the table follows. */
  function editSchedule(patch: Partial<Draft>) {
    if (!editing) return;
    setEditing(reshapeSchedule({ ...editing, ...patch }));
  }

  /** Typing an amount holds that month; the loose ones re-split around it. */
  function editScheduleMonth(index: number, raw: string) {
    if (!editing) return;
    const schedule = [...editing.schedule];
    while (schedule.length <= index) schedule.push({ month: "", amount: "" });
    schedule[index] = { ...schedule[index], amount: raw, pinned: true };
    setEditing(reshapeSchedule({ ...editing, schedule }));
  }

  /** The way back: every month goes loose and the value re-splits clean. */
  function applySpread() {
    if (!editing) return;
    setEditing(reshapeSchedule({ ...editing, schedule: [] }));
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
          documentUrl: editing.documentUrl || undefined,
          signedBy: editing.signedBy || undefined,
          /* The handle and the posted date are the server's to write, never
             the browser's — echoing them back is exactly how the deal flow
             learned to double-count. It finds the standing entry itself. */
          goalLink: editing.goalId
            ? { goalId: editing.goalId, person: editing.goalPerson || undefined }
            : undefined,
          note: editing.note || undefined,
          schedule: scheduleRowsOf(editing)
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
          canWrite ? (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> New contract
            </button>
          ) : (
            /* THE SHIELD IN THE TOP BAR ALREADY SAYS THIS (Anir, Sep 1:
                "I don't want you to say that"). A pill announcing what you
                CANNOT do is a permanent apology in the header of every page a
                view-only account opens, and the access shield answers it on
                hover already. The mock notice stays — that one says the DATA
                is not real, which nothing else says. */
            live ? null : (
              <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
                Sample contracts. Switch to Real mode to work the live list
              </span>
            )
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

      {/* The queue that the new opportunity status creates.

          IT IS A BANNER, NOT A SECOND LIST (Anir, Aug 28: "why is it so height
          wise long. u see that?"). It sat above the contracts table with no
          ceiling, so a busy week of handovers pushed the actual page below the
          fold. Four rows, then a count you can open — the top of the queue is
          always the part worth seeing first. */}
      {awaiting.length > 0 && (
        <section className="mt-4 rounded-xl border border-[rgba(180,83,9,0.3)] bg-white p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <AlertTriangle size={15} strokeWidth={2} style={{ color: "#B45309" }} />
            Deals sitting at “Create contract”
            <InfoHint text="These deals have reached the “Create contract” status and nobody has drafted the contract yet. That status is where sales hands over to delivery, so anything sitting here is a handover that has not happened." />
          </h2>
          <div className="mt-2 divide-y divide-border-light">
            {(showAllAwaiting ? awaiting : awaiting.slice(0, AWAITING_PREVIEW)).map((d) => (
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
                {canWrite && (
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
          {awaiting.length > AWAITING_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllAwaiting((v) => !v)}
              className="mt-2 text-[12.5px] font-semibold text-blue-primary hover:underline"
            >
              {showAllAwaiting
                ? "Show fewer"
                : `Show all ${awaiting.length} waiting`}
            </button>
          )}
        </section>
      )}

      {/* The toolbar needs air under the stat tiles (Anir, Aug 26: "the search
          bar is touching the cards"). Every other list page spaces this row;
          these three called PageToolbar bare and it sat flush against the
          tiles above it. */}
      <PageToolbar
        className="mt-4"
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
            return (
              <section
                key={c.id}
                data-contract={c.reference}
                className={cn(
                  "overflow-hidden rounded-xl border border-border-light bg-white shadow-card",
                  /* THE RAIL DOWN THE OPEN BLOCK, the same idiom as every other
                     list in the app (Anir, Aug 26: "if you're missing that
                     anywhere else please fix"). On the SECTION, so the header
                     and the panel under it are one line rather than two. */
                  isOpen && "[box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                )}
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
                    {/* WHAT IS LEFT ON IT, SAID ONCE (Anir, Aug 31: "this is
                        a horrible UI. I have no idea what this is").

                        It used to say the same thing four times: a banner
                        listing the gaps, a "2 of 6 confirmed" badge, a chip per
                        gap repeating the banner, and a "2 done" chip repeating
                        the left half of the badge. Four readings of one fact,
                        which is the restatement he keeps striking out — a
                        breakdown, not a restatement.

                        And all of it in alarm amber, on a contract whose only
                        crime was being a draft. Amber and red mean something is
                        WRONG; a draft that is not signed yet is not wrong, it
                        is early. Colour is reserved, so progress is drawn in
                        the app's own blue and the outstanding items are quiet.

                        One line now: how far along, then the specific things
                        still outstanding. */}
                    {(() => {
                      const checks = contractChecks(c);
                      const missing = checks.filter((x) => !x.ok);
                      const done = checks.length - missing.length;
                      const all = missing.length === 0;
                      return (
                        <div className="mb-3.5">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                            {/* SIX SEGMENTS, ONE PER FACT. A count you have to
                                read is slower than a bar you can glance at, and
                                the glance test is the standing one. */}
                            <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
                              {checks.map((chk, i) => (
                                <span
                                  key={chk.label}
                                  className={cn(
                                    "h-1.5 w-5 rounded-full",
                                    i < done
                                      ? all
                                        ? "bg-[color:#16A34A]"
                                        : "bg-blue-primary"
                                      : "bg-border-light"
                                  )}
                                />
                              ))}
                            </span>
                            <span
                              className={cn(
                                "text-[12.5px] font-semibold",
                                all ? "text-[color:#16A34A]" : "text-text-primary"
                              )}
                            >
                              {all
                                ? "Everything confirmed"
                                : `${done} of ${checks.length} confirmed`}
                            </span>
                            {!all && (
                              <span className="text-[12.5px] text-text-secondary">
                                still to do:
                              </span>
                            )}
                            {missing.map((chk) => (
                              <span
                                key={chk.label}
                                title={chk.detail ?? chk.label}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-white px-2.5 py-1 text-[12px] font-medium text-text-secondary"
                              >
                                <CircleDashed
                                  size={12}
                                  strokeWidth={2.4}
                                  className="text-text-tertiary"
                                />
                                {chk.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ONLY THE FACTS THIS CONTRACT ACTUALLY HAS. A grid of
                        four em-dashes is a row of holes where information
                        should be, and Reference was printed here as well as in
                        the row header a few pixels above it. A fact with no
                        value is already reported by its chip in the line
                        above. */}
                    {(() => {
                      const facts: [string, string][] = [];
                      if (c.startDate) facts.push(["Starts", formatDate(c.startDate)]);
                      if (c.endDate) facts.push(["Ends", formatDate(c.endDate)]);
                      if (c.signedOn) facts.push(["Signed", formatDate(c.signedOn)]);
                      if (c.owner) facts.push(["Owner", c.owner]);
                      if (facts.length === 0) return null;
                      return (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
                          {facts.map(([label, value]) => (
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
                      );
                    })()}

                    {/* WHERE THIS CONTRACT'S MONEY WENT. A row that says a
                        contract is signed but not whose number it became is
                        half the story, and the goal it fed is the half people
                        argue about. Only shown once it has actually posted. */}
                    {c.goalLink?.actualId && (
                      <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-[rgba(22,163,74,0.08)] px-3 py-2 text-[12.5px] text-[color:#16A34A]">
                        <Target size={13} strokeWidth={2.3} />
                        <span className="font-semibold">
                          {formatMoney(c.value)} counted towards{" "}
                          {goalName.get(c.goalLink.goalId) ?? "a goal"}
                        </span>
                        <span className="font-medium opacity-80">
                          for {c.goalLink.person || c.owner || "the owner"}
                          {c.goalLink.postedAt
                            ? ` · posted ${formatDate(c.goalLink.postedAt)}`
                            : ""}
                        </span>
                      </p>
                    )}

                    {c.schedule.length > 0 && (() => {
                      /* SCHEDULE REVENUE, DRAWN (Anir, Aug 26: "the schedule
                         revenue part, where you just have numbers and you're
                         not showing anything"). A column per month, plus how
                         much of the contract has been recognised by each one,
                         because "when do we get to half" is the question a
                         revenue schedule exists to answer. */
                      const total = scheduleTotal(c);
                      const now = monthKey(new Date());
                      let running = 0;
                      const bars = c.schedule.map((line) => {
                        running += line.amount;
                        const past = line.month < now;
                        return {
                          label: monthLabel(line.month).replace(" 20", " '"),
                          value: line.amount,
                          color: past ? "#16A34A" : "#4338CA",
                          tip: [
                            { name: "Scheduled", value: formatMoney(line.amount) },
                            { name: "Recognised by then", value: formatMoney(running) },
                            {
                              name: "Share of the contract",
                              value: `${Math.round((running / (total || 1)) * 100)}%`,
                            },
                            ...(past
                              ? [{ name: "Already recognised", sub: "this month has passed" }]
                              : []),
                          ],
                        };
                      });
                      const recognised = c.schedule
                        .filter((l) => l.month < now)
                        .reduce((s, l) => s + l.amount, 0);
                      const pct = Math.round((recognised / (total || 1)) * 100);
                      return (
                        <>
                          <p className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                            <Coins size={13} strokeWidth={2.2} className="text-blue-primary" />
                            Schedule revenue
                            <InfoHint text="What delivery will recognise, month by month. Once a contract is Ready for delivery or Signed this schedule supersedes the deal's accrual plan, because it is decided after the contract starts and is therefore the firmer number." />
                            <span className="ml-1 font-normal text-text-secondary tnum">
                              {formatMoney(total)} across {c.schedule.length}{" "}
                              {c.schedule.length === 1 ? "month" : "months"}
                            </span>
                          </p>
                          <div className="mt-2 rounded-xl border border-border-light bg-surface/40 p-3.5">
                            {/* TALLER BARS (Anir, Aug 26: "those bars can
                                genuinely be a lot bigger height-wise without
                                changing how the entire rectangle looks"). 140
                                was leaving air at the top of the card. */}
                            <BarChart
                              hideLabelDots
                              data={bars}
                              height={210}
                              format="money"
                            />
                            {/* THE PROGRESS METER IS NOT A SECOND SCROLLBAR
                                (Anir, Aug 26: "there's a weird gray scroll bar
                                at the bottom that's like an additional scroll
                                bar, I don't know what that gray thing is").

                                A bare grey track sitting directly under a
                                horizontally-scrolling chart reads as chrome,
                                especially at 0% where there is no green at all
                                to say otherwise. It gets a label on its left
                                now, so it is obviously a meter, and it is
                                separated from the chart by a rule instead of
                                floating under it. */}
                            {/* A METER THAT LOOKS LIKE ONE (Anir, Aug 26: "the
                                recognised part, I don't even know what that is.
                                I see there's a progress bar. I didn't even know
                                that was a progress bar. I thought it was a
                                separator").

                                It was a 2.5px hairline in a row of hairlines,
                                directly under a chart, so it read as chrome. It
                                is a real track now: tall enough to be a bar,
                                the number that matters written large beside it,
                                and the two amounts labelled underneath rather
                                than strung along one line. */}
                            <div className="mt-4 rounded-xl border border-border-light bg-surface/40 p-3.5">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <span className="text-[12.5px] font-semibold text-text-primary">
                                  Recognised so far
                                </span>
                                <span
                                  className="tnum text-[20px] font-bold leading-none"
                                  style={{ color: pct > 0 ? "#16A34A" : "var(--text-tertiary)" }}
                                >
                                  {pct}%
                                </span>
                              </div>
                              <span className="mt-2 block h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-border-light">
                                <span
                                  className="block h-full rounded-full transition-[width] duration-300"
                                  style={{
                                    width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`,
                                    background: "#16A34A",
                                  }}
                                />
                              </span>
                              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {[
                                  {
                                    label: "Recognised",
                                    value: formatMoney(recognised),
                                    color: pct > 0 ? "#16A34A" : undefined,
                                  },
                                  {
                                    label: "Still to come",
                                    value: formatMoney(total - recognised),
                                  },
                                  {
                                    label: "Runs",
                                    value: `${monthLabel(c.schedule[0]?.month ?? "")} to ${monthLabel(
                                      c.schedule[c.schedule.length - 1]?.month ?? ""
                                    )}`,
                                  },
                                ].map((cell) => (
                                  <span key={cell.label} className="min-w-0">
                                    <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                      {cell.label}
                                    </span>
                                    <span
                                      className="tnum block truncate text-[13.5px] font-semibold"
                                      style={{ color: cell.color ?? "var(--text-primary)" }}
                                    >
                                      {cell.value}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {c.note && (
                      <p className="mt-3 text-[12.5px] text-text-secondary">{c.note}</p>
                    )}

                    {/* THE FOOTER, IN THE APP'S OWN IDIOM (Anir, Aug 26:
                        "where you say the name, then the updated by, and then
                        the open the contract, that entire part is bad too.
                        You're not following the design guidelines").

                        It was five unrelated things strung along one line in
                        one grey weight: a face, a sentence, a button, a link
                        and the actions. Now the PEOPLE fact reads as one quiet
                        line, the two ways OUT are buttons that look like
                        buttons, and a hairline separates the whole footer from
                        the meter above it. */}
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-light pt-3">
                      <span className="flex min-w-0 items-center gap-2 text-[12px] text-text-secondary">
                        {c.owner ? (
                          <>
                            <Avatar name={c.owner} className="h-6 w-6 shrink-0 text-[8px]" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-text-primary">
                                {c.owner}
                              </span>
                              <span className="block text-[11px] text-text-tertiary">
                                {c.updatedBy === c.owner ? "Updated" : `Updated by ${c.updatedBy}`}{" "}
                                {formatDate(c.updatedAt)}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">
                            Updated by <b className="text-text-secondary">{c.updatedBy}</b>{" "}
                            {formatDate(c.updatedAt)}
                          </span>
                        )}
                      </span>

                      <span className="flex flex-wrap items-center gap-1.5">
                        {/* "HOW DO I OPEN THE CONTRACT?" (Anir, Aug 26). Here. */}
                        {c.documentUrl ? (
                          <a
                            href={c.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                          >
                            <FileText size={12} strokeWidth={2.2} /> Open the contract
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-text-tertiary">
                            <FileText size={12} strokeWidth={2.2} /> No document yet
                          </span>
                        )}
                        {/* THE ARROW, NOT THE SENTENCE (Anir, Aug 30: "stop
                            with this fucking button, I don't want this button
                            anywhere" — and, on the same shape elsewhere,
                            "replace it with the arrow"). This one was missed in
                            the first sweep and found by re-reading the chat
                            against the code. */}
                        {c.opportunityId && (
                          <Link
                            href={`/opportunities?deal=${encodeURIComponent(c.opportunityId)}`}
                            title="Open the deal"
                            aria-label="Open the deal behind this contract"
                            className="inline-flex cursor-pointer items-center rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <ArrowUpRight size={15} strokeWidth={2.2} />
                          </Link>
                        )}
                      </span>
                      {canWrite && (
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
                            className="rounded-lg p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
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
          /* ONE SIZE FOR EVERY FORM DIALOG (Anir, Aug 26: "all the pop-ups,
             let's just make it a set size"). These were "wide" (640px), which
             is too narrow for a two-column form — the fields stacked and the
             dialog came out tall and thin. "workflow" is 980px, the width the
             Solutioning request dialog already uses, and the floor below stops
             a short form collapsing into a strip. */
          size="workflow"
        >
          {/* FOUR ROOMS, NOT TEN CONTROLS IN A ROW (Anir, Aug 28: "it just
              has 10 dropdowns off the rip for the user, they got overwhelmed
              ... the booked revenue part isn't really that visible, make it
              like the other one where you have 4 sections. Same for
              scheduled revenue"). Same FormRoom the deal form uses, so the
              two long forms in this app now read the same way: the first
              room open, the rest shut with a one-line summary of what is
              inside. */}
          <div className="min-h-[420px] space-y-3">
          <FormRoom
            icon={FileSignature}
            title="The contract"
            defaultOpen
            summary={editing.name || "Not named yet"}
          >
          <div className="grid grid-cols-2 content-start gap-3">
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
              {/* Every empty box says what goes in it (Anir, Aug 26: "I need
                  placeholders on all of em"). */}
              <Input
                value={editing.customer}
                placeholder="Helix Therapeutics"
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
                  /* Picking a deal brings its value with it, and the value is
                     what the schedule is a division of — so the months have to
                     follow, exactly as they do when the value is typed. */
                  editSchedule({
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
                    /* SAY EACH THING ONCE (Anir, Aug 28: "why r u repeating").
                       A deal is named after its offering and its account, so
                       "GRI — Gilead · Gilead" printed the account twice. */
                    label: d.name.toLowerCase().includes(d.customer.toLowerCase())
                      ? d.name
                      : `${d.name} · ${d.customer}`,
                    /* THE ACCOUNT'S OWN MARK, not a blue dot (Anir, Aug 28:
                       "profile Pictures, hello"). Every other picker in the
                       app carries the logo; these two were the holdouts. */
                    logoName: d.customer,
                    color: "#0071E3",
                  })),
                ]}
              />
            </Field>
            <Field label="Contract value (USD)">
              <Input
                value={editing.value}
                placeholder="250000"
                inputMode="numeric"
                /* THE VALUE IS PART OF THE SCHEDULE'S FORMULA. Typing it used
                   to leave the months below untouched, so the rows appeared
                   and stayed blank and the schedule read $0 against a $600K
                   contract. Same three fields the accrual dialog uses: value,
                   start, count. */
                onChange={(e) =>
                  editSchedule({ value: e.target.value.replace(/[^0-9]/g, "") })
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
            <div className="col-span-2">
              <Field label="Link to the executed contract">
                <Input
                  value={editing.documentUrl}
                  onChange={(e) =>
                    setEditing({ ...editing, documentUrl: e.target.value })
                  }
                  placeholder="https://… wherever the signed PDF lives"
                />
              </Field>
            </div>
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
                  /* A person is a face, not a dot (Anir, Aug 28: "profile
                     Pictures, hello"). Same avatar the booked-revenue picker
                     right below this one already uses. */
                  ...members.map((m) => ({ value: m, label: m, avatarName: m })),
                ]}
              />
            </Field>
          </div>
          </FormRoom>

          <FormRoom
            icon={CalendarDays}
            title="Dates and signature"
            summary={
              editing.signedOn
                ? `Signed ${editing.signedOn}`
                : editing.startDate
                  ? `Starts ${editing.startDate}`
                  : "No dates yet"
            }
          >
          <div className="grid grid-cols-2 content-start gap-3">
            <Field label="Starts">
              <Input
                type="date"
                value={editing.startDate}
                /* The months are keyed from the start date, so moving it
                   slides the whole schedule rather than relabelling it. */
                onChange={(e) => editSchedule({ startDate: e.target.value })}
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
            <Field label="Signed by (customer side)">
              <Input
                value={editing.signedBy}
                onChange={(e) => setEditing({ ...editing, signedBy: e.target.value })}
                placeholder="Who signed for the customer"
              />
            </Field>
          </div>
          </FormRoom>

          <FormRoom
            icon={Coins}
            title="Booked revenue"
            summary={editing.goalId ? "A goal is picked" : "No goal picked"}
          >
          <div className="grid grid-cols-2 content-start gap-3">
            {/* WHERE THE MONEY LANDS (Suren, Aug 18: a signed contract is
                what produces booked revenue; Anir, Aug 26, on which goal:
                "Yeah, the person picks the goal"). Nothing is inferred from
                the offering or the owner's group. It posts the moment the
                contract is Signed with a date and a value, backdated to the
                signature month, and withdraws itself if the contract goes
                back to Draft or Cancelled — unless a group owner has already
                signed the number off, in which case it is theirs and stays. */}
            {/* The room's own header says "Booked revenue" now, so the card
                that used to introduce this block only repeated it inside a
                second border (Anir, Aug 28: "why r u repeating"). */}
            <div className="col-span-2">
              <p className="text-[12px] leading-snug text-text-secondary">
                {editing.goalId
                  ? editing.status === "Signed"
                    ? `${editing.value ? formatMoney(Number(String(editing.value).replace(/[^0-9.]/g, "")) || 0) : "The value"} counts towards this goal${editing.signedOn ? ` in ${formatDate(editing.signedOn)}` : " once you set the signed date"}.`
                    : "It will count once this contract is marked Signed."
                  : "Pick a goal and this contract's value counts towards it once it is signed. Leave it blank and nothing is posted."}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ColorSelect
                  value={editing.goalId}
                  ariaLabel="Booked revenue goal"
                  collapsible={false}
                  dense
                  className="min-w-[220px] flex-1"
                  onChange={(v) => setEditing({ ...editing, goalId: v })}
                  options={[
                    { value: "", label: "No goal", color: "#8E98A8" },
                    ...goals.map((g) => ({
                      value: g.id,
                      label: `${g.name} · ${g.year}`,
                      color: typeMeta(g.type ?? "").color,
                      icon: typeMeta(g.type ?? "").icon,
                    })),
                  ]}
                />
                <ColorSelect
                  value={editing.goalPerson}
                  ariaLabel="Whose booked revenue this is"
                  collapsible={false}
                  dense
                  minWidth={160}
                  onChange={(v) => setEditing({ ...editing, goalPerson: v })}
                  options={[
                    { value: "", label: "Contract owner", color: "#8E98A8" },
                    ...[
                      ...new Set([
                        ...members,
                        ...(editing.goalPerson ? [editing.goalPerson] : []),
                      ]),
                    ]
                      .sort(
                        (a, b) =>
                          Number(b === meName) - Number(a === meName) ||
                          a.localeCompare(b)
                      )
                      .map((n) => ({
                        value: n,
                        label: n,
                        tag: n === meName ? "You" : undefined,
                        avatarName: n,
                      })),
                  ]}
                />
              </div>
              {goals.length === 0 && (
                <p className="mt-2 text-[11.5px] text-text-tertiary">
                  No goals exist yet. Create one in Performance and it will
                  show up here.
                </p>
              )}
            </div>
          </div>
          </FormRoom>

          <FormRoom
            icon={CalendarClock}
            title="Schedule revenue"
            summary={
              scheduleRows.some((m) => Number(m.amount) > 0)
                ? "Months set"
                : "Nothing scheduled yet"
            }
          >
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
                    editSchedule({
                      scheduleMonths: e.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                />
              </Field>
              {/* The table moves on its own now, so this became the way BACK:
                  it lets go of every month somebody typed and re-splits. */}
              <button
                type="button"
                onClick={applySpread}
                className="mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-2 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
              >
                {scheduleRows.some((m) => m.pinned)
                  ? "Start over, even split"
                  : "Spread evenly from the start date"}
              </button>
            </div>

            {/* THE MONTHS ADD UP, OR THEY SAY SO. The same sentence the accrual
                dialog carries, for the same reason: a schedule that quietly
                does not match the contract it belongs to is the thing that
                sends people back to a spreadsheet. */}
            {scheduleValue > 0 && (
              <p className="mt-2 text-[12.5px]">
                The months add up to{" "}
                <b className="tnum text-text-primary">{formatMoney(scheduleTotalNow)}</b>
                {Math.abs(scheduleTotalNow - scheduleValue) > 1 && (
                  <span className="font-semibold text-[color:#B45309]">
                    {" "}
                    — that is {formatMoney(Math.abs(scheduleTotalNow - scheduleValue))}{" "}
                    {scheduleTotalNow > scheduleValue ? "more" : "less"} than the
                    contract value.
                  </span>
                )}
              </p>
            )}

            {scheduleRows.length > 0 ? (
              /* TWO MONTHS TO A ROW (Anir, Aug 28: "I didn't like the way this
                 looked").

                 It was one month per row with an amount box running half the
                 width of the dialog, so a year of revenue was twelve tall rows
                 with a canyon of white between each month and its own number,
                 and the section was twice the height it needed to be. Paired
                 up, a year is six rows, the number sits beside the month it
                 belongs to, and the width is used instead of spanned. */
              <div className="mt-2 grid gap-x-6 rounded-lg border border-border-light bg-white p-1.5 sm:grid-cols-2">
                {scheduleRows.map((line, i) => (
                  <label
                    key={line.month || i}
                    className="flex h-10 items-center gap-3 rounded-md px-2 transition-colors hover:bg-surface/60"
                  >
                    <span className="w-[74px] shrink-0 text-[12.5px] font-semibold text-text-primary">
                      {monthLabel(line.month)}
                    </span>
                    <input
                      value={line.amount}
                      placeholder="0"
                      inputMode="numeric"
                      aria-label={`Scheduled amount for ${monthLabel(line.month)}`}
                      onChange={(e) =>
                        editScheduleMonth(i, e.target.value.replace(/[^0-9]/g, ""))
                      }
                      className={cn(
                        "h-8 min-w-0 flex-1 rounded-md border px-2 text-right text-[13px] tnum outline-none focus:border-blue-subtle",
                        line.pinned
                          ? "border-blue-subtle bg-blue-light/40 font-semibold text-text-primary"
                          : "border-border-light"
                      )}
                    />
                  </label>
                ))}
              </div>
            ) : null}

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
          </FormRoom>
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
