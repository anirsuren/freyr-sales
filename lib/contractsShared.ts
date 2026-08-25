/**
 * CONTRACTS — where sales logically closes (Suren, Aug 25 call).
 *
 * The moment: "you can have one more status here — submitted to client, and
 * after that, create contract. So there you close the thing."
 *
 * WHAT LIVES HERE, and only this: "in the contracts module what is the basics?
 * Contract ID, contract name, the customer details, and then accrual planning
 * for the contract… from here I need the baseline of the contract: what is a
 * contract, who is a customer, what is a value, those kind of details."
 *
 * WHAT DOES NOT: "the whole process — assigning resources, creating projects,
 * raising invoices — that whole thing will go in the contracts thing [Anish's
 * delivery platform]. Here you cannot see the project details, or how invoicing
 * is done, or who are the resources working on it."
 *
 * THE HANDSHAKE: "every contract should have an ID; that ID will act as a link
 * between this system and that system… we'll have one common repository. This
 * interface should enter the data, because this is where we are logically
 * closing." Sales writes; delivery reads. Which is why `reference` is a first
 * class field with a stable, human-quotable format rather than a random id.
 *
 * SCHEDULE REVENUE REPLACES ACCRUAL. Also his: "once it is executed you don't
 * need the accrual revenue in this sense; from sales there I am going to give
 * you schedule revenue… and schedule revenue is more reliable because that is
 * decided after the contract started." So a signed contract's months are the
 * truth, and the opportunity's accrual plan stops being the number anybody
 * quotes. See scheduleSupersedesAccrual() below.
 *
 * Client-safe: types and pure helpers only. Store is lib/contracts.ts.
 */

import type { AccrualLine } from "./revenueAccrualsShared";

/**
 * Deliberately short. A contract in this app is a baseline and a handoff, not
 * a workflow — every status beyond these belongs to the delivery platform.
 */
export const CONTRACT_STATUSES = [
  /** Sales is still filling it in. Nothing has been handed over. */
  "Draft",
  /** Complete and sitting in the delivery team's basket ("leave the completed
   *  package in his basket and just forget it, and that guy picks it up"). */
  "Ready for delivery",
  /** Delivery has it. This app is view-mostly from here on. */
  "Signed",
  "Cancelled",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export type ScheduleLine = AccrualLine;

export type Contract = {
  id: string;
  /** THE HANDSHAKE KEY: "that ID will act as a link between this system and
   *  that system". FR-C-0001, never reused, printed everywhere. */
  reference: string;
  name: string;
  customer: string;
  customerId?: string;
  /** The deal this closed. Optional: a contract can be entered on its own. */
  opportunityId?: string;
  opportunityName?: string;
  offeringId?: string;
  offeringLabel?: string;
  /** Total contract value, USD, same rule as everywhere else in the app. */
  value: number;
  status: ContractStatus;
  startDate?: string;
  endDate?: string;
  signedOn?: string;
  owner?: string;
  /** "Schedule revenue" — the month-by-month plan, decided after the contract
   *  starts, that supersedes the opportunity's accrual plan. */
  schedule: ScheduleLine[];
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type ContractsState = { contracts: Contract[] };

export const EMPTY_CONTRACTS: ContractsState = { contracts: [] };

export function scheduleTotal(c: Pick<Contract, "schedule">): number {
  return c.schedule.reduce((s, l) => s + (l.amount || 0), 0);
}

/**
 * Once a deal has a live contract, its accrual plan is history: the contract's
 * schedule is "more reliable because that is decided after the contract
 * started". Cancelled and Draft do not count — a draft is sales still typing.
 */
export function scheduleSupersedesAccrual(c: Contract): boolean {
  return c.status === "Ready for delivery" || c.status === "Signed";
}

/** Next reference in the FR-C-0001 series. Never reuses a retired number. */
export function nextContractReference(existing: Contract[]): string {
  const highest = existing.reduce((max, c) => {
    const n = Number(/^FR-C-(\d+)$/.exec(c.reference)?.[1] ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `FR-C-${String(highest + 1).padStart(4, "0")}`;
}

export function contractStatusColor(status: ContractStatus): string {
  /* Status colours are reserved in this app: green means done, red means
     somebody stopped it, and nothing else may borrow them. */
  return status === "Signed"
    ? "#16A34A"
    : status === "Ready for delivery"
      ? "#4338CA"
      : status === "Cancelled"
        ? "#DC2626"
        : "#8E98A8";
}

/**
 * What is missing before this can go to delivery. The delivery side gets a
 * package, not a puzzle, so the handoff is gated on the baseline being real.
 */
export function readinessGaps(c: Contract): string[] {
  const gaps: string[] = [];
  if (!c.name.trim()) gaps.push("a contract name");
  if (!c.customer.trim()) gaps.push("a customer");
  if (!c.value) gaps.push("a contract value");
  if (!c.startDate) gaps.push("a start date");
  if (!c.schedule.length) gaps.push("a revenue schedule");
  else if (c.value > 0 && Math.abs(scheduleTotal(c) - c.value) > 1) {
    gaps.push("a schedule that adds up to the contract value");
  }
  return gaps;
}
