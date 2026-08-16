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
      {/* THE SAME SHAPE AS REVIEW THIS CLAIM (Anir, Aug 16: "this is ugly. i
          dont like the way this looks"). Four boxed tiles with wrapping
          uppercase captions and a red slab under them made a decision screen
          look like a form. One header strip carries the number, two dot rows
          say what it is made of, and the proof is drawn rather than linked. */}
      <div className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(15,118,110,0.10)", color: "#0F766E" }}
        >
          <ShieldCheck size={19} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-text-primary">
            {goal.name}
          </span>
          <span className="block text-[12px] text-text-secondary">
            {undoing ? "removing your sign-off" : "signing off"} · {goal.year}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <b className="block text-[22px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
            {fmtAmount(goal.unit, total)}
          </b>
          <span className="block text-[11px] text-text-tertiary tnum">
            {goal.target > 0
              ? `${Math.round(pctMet(total, goal.target))}% of ${fmtAmount(goal.unit, goal.target)}`
              : "no target set"}
          </span>
        </span>
      </div>

      <div className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-[color:var(--border-light)]">
        <span className="flex items-center gap-2 py-[3px] text-[12px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:#16A34A]" />
          <span className="min-w-0 flex-1 text-text-secondary">
            Checked by a group owner
          </span>
          <b className="shrink-0 text-text-primary tnum">
            {fmtAmount(goal.unit, verified)}
          </b>
        </span>
        <span className="flex items-center gap-2 py-[3px] text-[12px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-primary opacity-[0.28]" />
          <span className="min-w-0 flex-1 text-text-secondary">
            Still somebody&apos;s word
          </span>
          <b className="shrink-0 text-text-primary tnum">
            {fmtAmount(goal.unit, waiting)}
          </b>
        </span>
      </div>

      {waiting > 0 && !undoing && (
        /* One quiet line, not a slab. */
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[color:#C2410C]">
          <TriangleAlert size={12} strokeWidth={2.4} className="mt-[3px] shrink-0" />
          <span>
            Signing off vouches for {fmtAmount(goal.unit, waiting)} nobody has
            checked yet.
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
