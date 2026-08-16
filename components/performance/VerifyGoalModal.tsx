"use client";

import { useState } from "react";
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
import { EvidencePreview, EvidenceThumb } from "./EvidenceViewer";
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
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
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
      size="wide"
    >
      <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-secondary">
        {undoing ? "Removing your sign-off from" : "Signing off"}
        <b className="text-text-primary">{goal.name}</b>
        for {goal.year}.
      </p>

      {/* WHAT THE NUMBER IS MADE OF. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Fact label="Target" value={goal.target > 0 ? fmtAmount(goal.unit, goal.target) : "none set"} />
        <Fact label="Achieved" value={fmtAmount(goal.unit, total)} />
        <Fact
          label="Checked by a group owner"
          value={fmtAmount(goal.unit, verified)}
          tone="good"
        />
        <Fact
          label="Still somebody's word"
          value={fmtAmount(goal.unit, waiting)}
          tone={waiting > 0 ? "warn" : undefined}
        />
      </div>

      {goal.target > 0 && (
        <p className="mt-2 text-[12px] text-text-secondary tnum">
          That is <b className="text-text-primary">{Math.round(pctMet(total, goal.target))}%</b>{" "}
          of the target.
        </p>
      )}

      {waiting > 0 && !undoing && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[rgba(194,65,12,0.08)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[color:#C2410C]">
          <TriangleAlert size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          <span>
            {fmtAmount(goal.unit, waiting)} of this has not been checked by a
            group owner yet. You can still sign the goal off, but you are
            vouching for numbers nobody has verified.
          </span>
        </p>
      )}

      {/* EVERY ENTRY BEHIND IT. */}
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        What was logged · {entries.length}{" "}
        {entries.length === 1 ? "entry" : "entries"}
      </p>
      {entries.length === 0 ? (
        <p className="mt-2 rounded-xl border border-border-light px-3 py-4 text-center text-[12.5px] text-text-secondary">
          Nothing has been logged against this goal.
        </p>
      ) : (
        <div className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
          {entries.slice(0, 40).map((a) => {
            const locked = entryStatus(a) === "verified";
            return (
              <div
                key={a.id}
                className="rounded-xl border border-border-light px-3 py-2.5"
              >
              <div className="flex flex-wrap items-center gap-2.5">
                <Avatar name={a.person} className="h-7 w-7 shrink-0 text-[10px]" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
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

              {/* THE PROOF, WHICH IS THE WHOLE POINT (Anir, Aug 16: "where is
                  the document? Where is the information I need to look at?").
                  Signing a goal off without reading what it rests on is just
                  clicking a button. */}
              {a.evidence?.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {a.evidence.map((e) => (
                    <button
                      key={e.url}
                      type="button"
                      onClick={() => setPreview({ name: e.name, url: e.url })}
                      title={`Open ${e.name}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white p-1.5 pr-3 text-left transition-colors hover:border-blue-primary"
                    >
                      <EvidenceThumb file={e} />
                      <span className="min-w-0">
                        <span className="block max-w-[220px] truncate text-[11.5px] font-semibold text-text-primary">
                          {e.name}
                        </span>
                        <span className="block text-[10px] text-blue-primary">
                          Click to read it
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[color:#C2410C]">
                  <Paperclip size={11} strokeWidth={2.4} />
                  Nothing attached — there is no proof to read for this one.
                </p>
              )}

              {a.note && (
                <p className="mt-1.5 text-[11.5px] text-text-secondary">
                  &ldquo;{a.note}&rdquo;
                </p>
              )}
              </div>
            );
          })}
          {entries.length > 40 && (
            <p className="px-1 py-1 text-[11.5px] text-text-tertiary">
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
      {preview && (
        <EvidencePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </Modal>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border-light px-3 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </span>
      <b
        className={cn(
          "mt-0.5 block text-[15px] tnum",
          tone === "good"
            ? "text-[color:#16A34A]"
            : tone === "warn"
              ? "text-[color:#C2410C]"
              : "text-text-primary"
        )}
      >
        {value}
      </b>
    </div>
  );
}
