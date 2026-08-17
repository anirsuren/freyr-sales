"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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
  customerName: string;
  /** The engagement's own money, for a dollar-counting activity. */
  dollarValue?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [goalId, setGoalId] = useState(goals.length === 1 ? goals[0].id : "");
  const [busy, setBusy] = useState(false);
  const picked = goals.find((g) => g.id === goalId) ?? null;

  const activityMeta =
    activity in CUSTOMER_OFFERING_ACTIVITIES
      ? CUSTOMER_OFFERING_ACTIVITIES[activity as CustomerOfferingActivity]
      : null;
  const color = activityMeta?.color ?? master.color;
  const label = activityMeta?.label ?? master.label;

  const isCount = master.contribution === "count";
  const amount = isCount ? 1 : (dollarValue ?? 0);

  const amountLine = useMemo(() => {
    if (!picked) return "";
    return isCount
      ? `Adds 1 to ${picked.name}`
      : `Adds ${fmtAmount(picked.unit, amount)} to ${picked.name}`;
  }, [picked, isCount, amount]);

  /** A count is one click: no money, no evidence rule, logged and queued for
   *  the group owner like anything else. */
  async function logCount() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "log-actual",
          goalId: picked.id,
          subgoalId: null,
          person: meName,
          amount: 1,
          customer: customerName,
          note: `${label} on ${customerName} — logged from the activity`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      toast(
        `1 added to ${picked.name}. It counts once the group owner verifies it.`
      );
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  /** Money goes through Log a result, where the contract gets attached. */
  function handOffDollar() {
    if (!picked) return;
    const q = new URLSearchParams({
      logGoal: picked.id,
      logCustomer: customerName,
      logNote: `${label} on ${customerName} — logged from the activity`,
    });
    if (amount > 0) q.set("logAmount", String(amount));
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

      <p className="mt-3 text-[12px] leading-relaxed text-text-secondary">
        {picked ? (
          <>
            <b className="text-text-primary">{amountLine}</b>, credited to{" "}
            <b className="text-text-primary">{meName}</b> — the goal goes
            against whoever logs the activity.
            {!isCount &&
              " Money needs the signed contract attached, so the next screen is the usual Log a result with everything filled in."}
          </>
        ) : (
          "Pick which goal this one counts toward."
        )}
      </p>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
        {isCount ? (
          <Button onClick={logCount} disabled={!picked} loading={busy}>
            {picked ? `Add 1 to ${picked.name}` : "Count it"}
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
