"use client";

import {
  CheckCircle2,
  Hourglass,
  Paperclip,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  entryStatus,
  familyValue,
  fmtAmount,
  goalFamilyActuals,
  pctMet,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { EvidenceInline } from "./EvidenceViewer";
import type { RunOp } from "./PerformanceModule";

/**
 * SIGNING OFF A GOAL IS A DECISION, NOT A TOGGLE (Anir, Aug 15: "when I press
 * Verify here, it shouldn't just verify. It shouldn't just instantly change.
 * Whatever I have to see should pop up. A nice verify flow").
 *
 * The pill used to flip on click, which is fine for a filter and wrong for a
 * record that leadership is putting its name to. This shows what is actually
 * being signed off — the number, how much of it a group owner has already
 * checked, how much is still somebody's word, and every entry behind it — and
 * makes the claim in one sentence before you confirm.
 *
 * The same dialog un-signs: turning a yes back into a no is also a decision.
 */
export function VerifyGoalModal({
  open,
  goal,
  state,
  meName,
  busy,
  run,
  onClose,
}: {
  open: boolean;
  goal: PrimaryGoal | null;
  state: PerformanceState;
  meName: string;
  busy: boolean;
  run: RunOp;
  onClose: () => void;
}) {
  if (!open || !goal) return null;

  const entries = goalFamilyActuals(state, goal).sort((a, b) =>
    a.date < b.date ? 1 : -1
  );
  const verified = familyValue(state, goal, { verifiedOnly: true });
  const waiting = familyValue(state, goal, { reportedOnly: true });
  const total = verified + waiting;
  const undoing = goal.verified;

  return (
    <Modal
      open
      onClose={onClose}
      title={undoing ? "Take back this sign-off" : "Verify this goal"}
      size="workflow"
      tall
    >
      {/* DRAWN, NOT DESCRIBED (Anir, Aug 17: "I don't like the top. I don't
          like the 'checked by a group owner.' I don't like the weird phrase
          that says 'still somebody's word'… I need everything visually
          shown"). The words are gone; the same two-tone bar every other
          performance screen uses does the talking — solid is approved, washed
          is waiting, the empty track is the distance to the goal. */}
      <div className="rounded-xl bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="min-w-0 flex-1 truncate text-[15px] font-bold text-text-primary">
            {goal.name}
          </b>
          <span className="shrink-0 text-right">
            <b className="text-[22px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
              {fmtAmount(goal.unit, total)}
            </b>
            <span className="ml-1.5 text-[11.5px] text-text-tertiary tnum">
              logged
            </span>
          </span>
        </div>

        <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
          <span
            className="block h-full bg-blue-primary"
            style={{
              width: `${goal.target > 0 ? Math.min(100, (verified / goal.target) * 100) : verified > 0 ? (verified / total) * 100 : 0}%`,
            }}
          />
          <span
            className="block h-full bg-blue-primary opacity-[0.28]"
            style={{
              width: `${goal.target > 0 ? Math.min(100, (waiting / goal.target) * 100) : waiting > 0 ? (waiting / total) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-blue-primary" />
            Approved
            <b className="text-text-primary tnum">{fmtAmount(goal.unit, verified)}</b>
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-blue-primary opacity-[0.28]" />
            Waiting
            <b className="text-text-primary tnum">{fmtAmount(goal.unit, waiting)}</b>
          </span>
          {goal.target > 0 && (
            <span className="ml-auto text-[11.5px] text-text-tertiary tnum">
              Goal {fmtAmount(goal.unit, goal.target)} ·{" "}
              {Math.round(pctMet(total, goal.target))}% there
            </span>
          )}
        </div>
      </div>

      {waiting > 0 && !undoing && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[color:#C2410C]">
          <TriangleAlert size={12} strokeWidth={2.4} className="mt-[3px] shrink-0" />
          <span>
            Signing off approves the {fmtAmount(goal.unit, waiting)} still
            waiting below.
          </span>
        </p>
      )}

      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary">
        What was logged · {entries.length}{" "}
        {entries.length === 1 ? "entry" : "entries"}
      </p>
      {entries.length === 0 ? (
        <p className="mt-1.5 rounded-xl bg-surface px-3 py-4 text-center text-[12.5px] text-text-secondary">
          Nothing has been logged against this goal.
        </p>
      ) : (
        <div className="mt-1.5 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
          {entries.slice(0, 40).map((a) => {
            const locked = entryStatus(a) === "verified";
            return (
              <div key={a.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={a.person} className="h-6 w-6 shrink-0 text-[9px]" />
                  <span className="min-w-[7rem] flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                    {a.person}
                  </span>
                  {a.customer && (
                    <span className="min-w-0 truncate text-[11.5px] text-text-secondary">
                      {a.customer}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                    {a.date}
                  </span>
                  <b className="shrink-0 text-[13px] text-text-primary tnum">
                    {fmtAmount(goal.unit, a.amount, a.currency)}
                  </b>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                      locked
                        ? "bg-[rgba(22,163,74,0.12)] text-[color:#16A34A]"
                        : "bg-[rgba(0,113,227,0.12)] text-[color:#0058B0]"
                    )}
                  >
                    {locked ? (
                      <>
                        <CheckCircle2 size={11} strokeWidth={2.4} /> checked
                      </>
                    ) : (
                      <>
                        <Hourglass size={11} strokeWidth={2.4} /> waiting
                      </>
                    )}
                  </span>
                </div>

                {a.note && (
                  <p className="mt-1 pl-8 text-[11.5px] text-text-secondary">
                    &ldquo;{a.note}&rdquo;
                  </p>
                )}

                {/* THE PROOF, ALREADY OPEN — same as Review this claim. Signing
                    a goal off without reading what it rests on is just
                    clicking a button. */}
                {a.evidence?.length ? (
                  <div className="mt-1.5 space-y-2 pl-8">
                    {a.evidence.map((e) => (
                      <EvidenceInline key={e.url} file={e} height={260} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 pl-8 text-[11.5px] text-[color:#C2410C]">
                    <Paperclip size={11} strokeWidth={2.4} />
                    Nothing attached — there is no proof to read for this one.
                  </p>
                )}
              </div>
            );
          })}
          {entries.length > 40 && (
            <p className="px-1 text-[11.5px] text-text-tertiary">
              And {entries.length - 40} more.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const ok = await run(
              { op: "set-verified", goalId: goal.id, verified: !goal.verified },
              undoing
                ? `${goal.name} is no longer signed off`
                : `${goal.name} signed off by ${meName}`
            );
            if (ok) onClose();
          }}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50",
            undoing ? "bg-[color:#DC2626]" : "bg-[color:#0F766E]"
          )}
        >
          <ShieldCheck size={14} strokeWidth={2.4} />
          {undoing ? "Take back the sign-off" : "Sign this goal off"}
        </button>
      </div>
    </Modal>
  );
}
