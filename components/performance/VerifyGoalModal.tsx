"use client";

import { useEffect, useState } from "react";

import {
  Paperclip,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  ENTRY_COLOR,
  GOAL_PROGRESS_COLOR,
  entryStatus,
  fmtAmount,
  goalFamilyActuals,
  type PerformanceState,
  type PrimaryGoal,
  resultWhen,
} from "@/lib/performanceShared";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { EvidenceLinkRow } from "./EvidenceViewer";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
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
/**
 * WHOSE APPROVAL THIS DIALOG IS ABOUT. Absent = the goal itself; otherwise a
 * person's slice of it, a subgoal, or a person on a subgoal.
 *
 * Those three used to flip the moment you clicked their pill — no dialog, no
 * confirm, money in or out of the count on one stray click (Anir, Aug 19: "I
 * just pressed the undo sign-off button... it didn't even ask me for
 * confirmation in a pop-up"). One decision, one dialog, wherever it is made.
 */
export type VerifyScope = {
  person?: string;
  subgoalId?: string;
  /** What the header names: "Suren Dheenadayalan", "Growth Accounts". */
  label: string;
  /** The sign-off flag as it stands for this slice. */
  verified: boolean;
};

export function VerifyGoalModal({
  open,
  goal,
  state,
  meName,
  busy,
  run,
  onClose,
  scope,
}: {
  open: boolean;
  goal: PrimaryGoal | null;
  state: PerformanceState;
  meName: string;
  busy: boolean;
  run: RunOp;
  onClose: () => void;
  scope?: VerifyScope | null;
}) {
  const [entryQuery, setEntryQuery] = useState("");

  useEffect(() => {
    setEntryQuery("");
  }, [open, goal?.id, scope?.label]);

  if (!open || !goal) return null;

  const inScope = (a: { person: string; subgoalId?: string | null }) =>
    (!scope?.person || a.person === scope.person) &&
    (!scope?.subgoalId || a.subgoalId === scope.subgoalId);
  const entries = goalFamilyActuals(state, goal)
    .filter(inScope)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const undoing = scope ? scope.verified : goal.verified;
  const subjectName = scope ? scope.label : goal.name;
  const verifiedEntries = entries.filter((a) => entryStatus(a) === "verified");
  const pendingEntries = entries.filter((a) => entryStatus(a) === "reported");
  const sentBackEntries = entries.filter((a) => entryStatus(a) === "sent_back");
  const reviewEntries = undoing
    ? verifiedEntries
    : pendingEntries;
  const sumEntries = (list: typeof entries) =>
    list.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const verified = sumEntries(verifiedEntries);
  const waiting = sumEntries(pendingEntries);
  const sentBack = sumEntries(sentBackEntries);
  const total = verified + waiting + sentBack;
  const countableTotal = verified + waiting;
  const target = goal.target || 0;
  const progressPercent = target > 0 ? Math.min(100, (countableTotal / target) * 100) : 0;
  const markerPercent = Math.min(96, Math.max(4, progressPercent));
  const normalizedQuery = entryQuery.trim().toLowerCase();
  const visibleEntries = normalizedQuery
    ? reviewEntries.filter((entry) => {
        const status =
          entryStatus(entry) === "verified"
            ? "verified"
            : entryStatus(entry) === "sent_back"
              ? "sent back"
              : "waiting";
        const evidence = (entry.evidence ?? [])
          .map((file) => `${file.name ?? ""} ${file.url ?? ""}`)
          .join(" ");
        return [
          entry.person,
          entry.customer,
          entry.note,
          entry.managerNote,
          entry.addedBy,
          entry.verifiedBy,
          entry.sentBackBy,
          entry.date,
          resultWhen(entry),
          fmtAmount(goal.unit, entry.amount, entry.currency),
          entry.currency,
          status,
          evidence,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
    : reviewEntries;
  const missingEvidenceCount = visibleEntries.filter(
    (entry) => !entry.evidence?.length
  ).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={undoing ? "Take back this approval" : "Verify this goal"}
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
            {subjectName}
            {scope && (
              <span className="ml-1.5 text-[12px] font-semibold text-text-tertiary">
                on {goal.name}
              </span>
            )}
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

        <div className="relative mt-3 pb-7 pt-5">
          <span className="absolute left-0 top-0 text-[10.5px] font-semibold text-text-tertiary tnum">
            0
          </span>
          {target > 0 && (
            <span className="absolute right-0 top-0 text-[10.5px] font-bold text-text-primary tnum">
              Goal {fmtAmount(goal.unit, target)}
            </span>
          )}
          <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
          {/* The same goal-progress treatment as every other bar: solid green
              counts, striped amber waits, and striped red needs a fix. */}
            <span
              className="block h-full"
              style={{
                width: `${target > 0 ? Math.min(100, (verified / target) * 100) : verified > 0 ? (verified / total) * 100 : 0}%`,
                background: ENTRY_COLOR.verified,
              }}
            />
            <span
              className="unverified-fill block h-full"
              style={{
                width: `${target > 0 ? Math.min(100, (waiting / target) * 100) : waiting > 0 ? (waiting / total) * 100 : 0}%`,
                ["--fill" as string]: GOAL_PROGRESS_COLOR.reported,
              }}
            />
            <span
              className="sent-back-fill block h-full"
              style={{
                width: `${target > 0 ? Math.min(100, (sentBack / target) * 100) : sentBack > 0 ? (sentBack / total) * 100 : 0}%`,
                ["--fill" as string]: GOAL_PROGRESS_COLOR.sent_back,
              }}
            />
          </div>
          <span className="absolute left-0 top-[18px] h-5 w-px bg-text-tertiary/60" />
          {target > 0 && (
            <span className="absolute right-0 top-[17px] h-6 w-0.5 rounded-full bg-text-primary" />
          )}
          {target > 0 && (
            <span
              className="absolute top-[17px] h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-white shadow-sm"
              style={{ left: `${markerPercent}%`, background: ENTRY_COLOR.verified }}
              aria-label={`${fmtAmount(goal.unit, countableTotal)} of ${fmtAmount(goal.unit, target)}`}
            />
          )}
          <span
            className="absolute bottom-0 -translate-x-1/2 text-[10.5px] font-bold tnum"
            style={{ left: `${markerPercent}%`, color: ENTRY_COLOR.verified }}
          >
            {fmtAmount(goal.unit, countableTotal)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: ENTRY_COLOR.verified }}
            />
            Counted
            <b className="text-text-primary tnum">{fmtAmount(goal.unit, verified)}</b>
          </span>
          {waiting > 0 && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: ENTRY_COLOR.reported }}
            />
            Needs review
            <b className="text-text-primary tnum">{fmtAmount(goal.unit, waiting)}</b>
          </span>
          )}
          {sentBack > 0 && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
              <span className="h-2 w-2 rounded-full bg-[color:var(--entry-sent-back-ink)]" />
              Sent back
              <b className="text-text-primary tnum">{fmtAmount(goal.unit, sentBack)}</b>
            </span>
          )}
        </div>
      </div>

      {total === 0 && !undoing && (
        // The Aug 15 rule was "don't let me sign off nothing", and it was
        // enforced by killing the pill — which turned undo into a one-way
        // door the moment nothing was logged (Anir, Aug 19: "I can't even
        // verify it again"). The pill stays alive; the warning moved here,
        // where it can be read and overruled.
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[color:var(--ink-orange)]">
          <TriangleAlert size={12} strokeWidth={2.4} className="mt-[3px] shrink-0" />
          <span>
            Nothing is logged against this yet, so this approves zero. It only
            records that you have signed it off.
          </span>
        </p>
      )}
      {reviewEntries.length > 0 && (
        <label className="relative mt-4 block">
          <span className="sr-only">Search logged entries</span>
          <Search
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            value={entryQuery}
            onChange={(event) => setEntryQuery(event.target.value)}
            placeholder="Search entries to review…"
            className="h-10 w-full rounded-xl border border-border-light bg-white pl-9 pr-3 text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:ring-2 focus:ring-blue-light"
          />
        </label>
      )}

      <p className={cn("text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary", reviewEntries.length > 0 ? "mt-2.5" : "mt-4")}>
        {undoing ? "Included in this approval" : "Needs your review"} · {reviewEntries.length}{" "}
        {reviewEntries.length === 1 ? "entry" : "entries"}
        {normalizedQuery && (
          <span className="ml-1 normal-case tracking-normal text-text-secondary">
            · {visibleEntries.length} shown
          </span>
        )}
        {missingEvidenceCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-text-secondary">
            <Paperclip size={10} strokeWidth={2.2} />
            {missingEvidenceCount} without evidence
          </span>
        )}
      </p>
      {reviewEntries.length === 0 ? (
        <p className="mt-1.5 rounded-xl bg-surface px-3 py-4 text-center text-[12.5px] text-text-secondary">
          {undoing
            ? "No counted entries are attached to this approval."
            : "Nothing is waiting for your review."}
        </p>
      ) : visibleEntries.length === 0 ? (
        <p className="mt-1.5 rounded-xl bg-surface px-3 py-5 text-center text-[12.5px] text-text-secondary">
          No logged entries match “{entryQuery.trim()}”.
        </p>
      ) : (
        <div className="mt-1.5 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
          {visibleEntries.slice(0, 40).map((a) => {
            return (
              <div key={a.id}>
                {/* ONE CARD, TWO SIDES (Anir, Aug 20: "I like the entry, but
                    you have to make the entry look good. The profile's on the
                    left, and the right side has that. It's just so
                    confusing"). Left: who, for which account, when. Right: the
                    money and its verdict. The middle stopped being a bag of
                    fragments fighting for one line. */}
                <div className="flex items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5">
                  <Avatar name={a.person} className="mt-0.5 h-7 w-7 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                      {a.person}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-text-secondary">
                      {a.customer && (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CompanyLogo
                            name={a.customer}
                            className="h-[16px] w-[16px] shrink-0 text-[6px]"
                          />
                          <span className="min-w-0 truncate">{a.customer}</span>
                        </span>
                      )}
                      <span className="shrink-0 text-text-tertiary tnum">
                        {a.customer ? "· " : ""}
                        {resultWhen(a)}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <b className="block text-[14px] text-text-primary tnum">
                      {fmtAmount(goal.unit, a.amount, a.currency)}
                    </b>
                  </span>
                </div>

                {a.note && (
                  <p className="mt-1 pl-3 text-[11.5px] italic text-text-secondary">
                    &ldquo;{a.note}&rdquo;
                  </p>
                )}

                {/* THE PROOF, ALREADY OPEN — same as Review this claim. Signing
                    a goal off without reading what it rests on is just
                    clicking a button. */}
                {a.evidence?.length ? (
                  <div className="mt-1.5 space-y-1.5 pl-8">
                    {a.evidence.map((e) => (
                      <EvidenceLinkRow key={e.url} file={e} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {visibleEntries.length > 40 && (
            <p className="px-1 text-[11.5px] text-text-tertiary">
              And {visibleEntries.length - 40} more.
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
              {
                op: "set-verified",
                goalId: goal.id,
                ...(scope?.person ? { person: scope.person } : {}),
                ...(scope?.subgoalId ? { subgoalId: scope.subgoalId } : {}),
                verified: !undoing,
              },
              undoing
                ? `${subjectName} is no longer approved`
                : waiting > 0
                  ? `${subjectName} approved. ${fmtAmount(goal.unit, waiting)} counts now`
                  : `${subjectName} approved by ${meName}`
            );
            if (ok) onClose();
          }}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50",
            undoing ? "bg-[color:#DC2626]" : "bg-blue-primary"
          )}
        >
          <ShieldCheck size={14} strokeWidth={2.4} />
          {undoing ? "Take back the approval" : "Verify and lock"}
        </button>
      </div>
    </Modal>
  );
}
