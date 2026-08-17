"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { typeMeta } from "@/components/performance/bits";
import { fmtAmount, type GoalUnit } from "@/lib/performanceShared";
import { CUSTOMER_OFFERING_ACTIVITIES } from "@/lib/customerOfferingHeatMap";
import type { CustomerOfferingActivity } from "@/lib/types";
import type { MasterActivity } from "@/lib/activityMasterShared";

export type PromptGoal = {
  id: string;
  name: string;
  unit: GoalUnit;
  year: number;
  type: string;
};

/**
 * "THIS COUNTS TOWARD A GOAL" — the moment an activity completes.
 *
 * Suren, Aug 17: "when they actually make something current, whatever goal is
 * connected to that particular activity, that goal automatically gets
 * connected. They don't have to enter." And whose number it becomes: "that is
 * based on who is actually adding that activity. That guy adds an activity,
 * then against his name that goal goes."
 *
 * One goal connected: it is already picked. Several: "they can select that
 * goal" — his Contract → New vs Existing Business example — so a required
 * pick, nothing pre-chosen for money.
 *
 * A COUNT activity (a pilot is 1) logs right here in one click: no evidence
 * rule applies to a count. A DOLLAR activity carries money, and money claims
 * need the contract attached before they can be submitted — that rule does
 * not bend here — so the button hands off to Log a result with the goal,
 * amount and customer already filled, and the person attaches the file and
 * submits there.
 */
export function ActivityGoalPrompt({
  open,
  activity,
  master,
  goals,
  meName,
  people,
  customerName,
  dollarValue,
  onClose,
}: {
  open: boolean;
  activity: CustomerOfferingActivity | string;
  master: MasterActivity;
  /** Only the goals this activity actually feeds. */
  goals: PromptGoal[];
  meName: string;
  /** Everyone this person may log credit for. Just [meName] for a rep;
   *  admins get the whole roster, group owners their group (Suren: "only
   *  the admin guys and the group owners can do it"). */
  people?: string[];
  customerName: string;
  /** The engagement's own money, for a dollar-counting activity. */
  dollarValue?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [goalId, setGoalId] = useState(goals.length === 1 ? goals[0].id : "");
  const [busy, setBusy] = useState(false);
  const [creditTo, setCreditTo] = useState(meName);
  /** For a "person types the number" activity — the master's third kind. */
  const [typedAmount, setTypedAmount] = useState("");
  const picked = goals.find((g) => g.id === goalId) ?? null;
  const roster = people && people.length > 0 ? people : [meName];
  const canPickPerson = roster.length > 1;

  const activityMeta =
    activity in CUSTOMER_OFFERING_ACTIVITIES
      ? CUSTOMER_OFFERING_ACTIVITIES[activity as CustomerOfferingActivity]
      : null;
  const color = activityMeta?.color ?? master.color;
  const label = activityMeta?.label ?? master.label;

  const isCount = master.contribution === "count";
  const isTyped = master.contribution === "typed";
  const typedNumber = Number(typedAmount);
  const typedOk = typedAmount.trim() !== "" && Number.isFinite(typedNumber) && typedNumber > 0;
  const amount = isCount ? 1 : isTyped ? (typedOk ? typedNumber : 0) : (dollarValue ?? 0);
  /** Counts and typed numbers log right here; only dollar activities carry
   *  the deal's own money through Log a result. */
  const logsDirectly = isCount || isTyped;

  const amountLine = useMemo(() => {
    if (!picked) return "";
    return isCount
      ? `Adds 1 to ${picked.name}`
      : `Adds ${fmtAmount(picked.unit, amount)} to ${picked.name}`;
  }, [picked, isCount, amount]);

  /** Counts and typed numbers are one click: logged and queued for the group
   *  owner like anything else, credited to whoever is chosen above. */
  async function logDirect() {
    if (!picked || (isTyped && !typedOk)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "log-actual",
          goalId: picked.id,
          subgoalId: null,
          person: creditTo,
          amount,
          // The invisible stamp: which activity this number came from, so
          // activity→goal flow can be reported later.
          activityId: master.id,
          customer: customerName,
          note: `${label} on ${customerName} — logged from the activity`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      toast(
        `${amount} added to ${picked.name}. It counts once the group owner verifies it.`
      );
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  /** The deal's money goes through Log a result, prefilled. */
  function handOffDollar() {
    if (!picked) return;
    const q = new URLSearchParams({
      logGoal: picked.id,
      logCustomer: customerName,
      logNote: `${label} on ${customerName} — logged from the activity`,
    });
    if (amount > 0) q.set("logAmount", String(amount));
    if (creditTo && creditTo !== meName) q.set("logPerson", creditTo);
    q.set("logActivity", master.id);
    onClose();
    router.push(`/performance/org?${q.toString()}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="This counts toward a goal">
      <p className="flex flex-wrap items-center gap-1.5 text-[13px] leading-relaxed text-text-secondary">
        You just completed
        <span
          className="rounded-full px-2 py-0.5 text-[11.5px] font-bold"
          style={{ background: `${color}16`, color }}
        >
          {label}
        </span>
        on <b className="text-text-primary">{customerName}</b> — and {label}
        {goals.length === 1 ? " feeds a goal." : " feeds these goals."}
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {goals.map((g) => {
          const on = g.id === goalId;
          const t = typeMeta(g.type);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGoalId(on && goals.length > 1 ? "" : g.id)}
              aria-pressed={on}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                on
                  ? "border-blue-primary bg-blue-light/60"
                  : "border-border-light bg-white hover:border-blue-subtle hover:bg-surface"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  on
                    ? "border-blue-primary bg-blue-primary text-white"
                    : "border-border-light bg-white"
                )}
              >
                {on && <Check size={10} strokeWidth={3.4} />}
              </span>
              <t.icon
                size={14}
                strokeWidth={2.4}
                aria-hidden="true"
                style={{ color: t.color }}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">
                {g.name}
              </span>
              <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                {g.year}
              </span>
            </button>
          );
        })}
      </div>

      {isTyped && (
        <div className="mt-3">
          <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
            How much does it add?
          </label>
          <input
            value={typedAmount}
            onChange={(e) => setTypedAmount(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 3"
            aria-label="Amount this activity adds"
            className="mt-1 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary focus:shadow-input-focus tnum"
          />
        </div>
      )}

      {canPickPerson && (
        <div className="mt-3">
          <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
            Counts for
          </label>
          {/* Admins credit anyone, a group owner their people (Suren: "only
              the admin guys and the group owners can do it — otherwise the
              individual only"). Everyone else never sees this select. */}
          <div className="mt-1">
            <ColorSelect
              value={creditTo}
              ariaLabel="Who this counts for"
              collapsible={false}
              className="w-full"
              onChange={setCreditTo}
              options={roster.map((n) => ({
                value: n,
                label: n === meName ? `${n} (you)` : n,
                avatarName: n,
              }))}
            />
          </div>
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-text-secondary">
        {picked ? (
          <>
            <b className="text-text-primary">{amountLine}</b>, credited to{" "}
            <b className="text-text-primary">{creditTo}</b>.
            {!logsDirectly &&
              " The next screen is the usual Log a result with everything filled in."}
          </>
        ) : (
          "Pick which goal this one counts toward — only the goals on the master's list for this activity are offered."
        )}
      </p>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
        {logsDirectly ? (
          <Button
            onClick={logDirect}
            disabled={!picked || (isTyped && !typedOk)}
            loading={busy}
          >
            {picked
              ? `Add ${isTyped ? (typedOk ? amount : "…") : 1} to ${picked.name}`
              : "Count it"}
          </Button>
        ) : (
          <Button onClick={handOffDollar} disabled={!picked}>
            Log the money
          </Button>
        )}
      </div>
    </Modal>
  );
}
