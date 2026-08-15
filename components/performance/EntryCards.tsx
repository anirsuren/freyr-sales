"use client";

import { useState } from "react";
import { CheckCircle2, Paperclip, RotateCcw } from "lucide-react";
import {
  entryStatus,
  fmtAmount,
  verificationQueue,
  headedGroups,
  type PerfActual,
  type PerformanceState,
} from "@/lib/performanceShared";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { RunOp } from "./PerformanceModule";
import { typeMeta } from "./bits";

/**
 * THE EVIDENCE-AND-VERIFICATION SURFACES (Suren, Aug 13).
 *
 * A claim is logged with proof attached; it WAITS until the group owner —
 * and only the group owner — checks the attachment and locks it. Verified
 * money is the only money that rolls up. These two cards are that story on
 * the People tab: what I claimed and where it stands, and, for a group
 * owner, everything waiting on them.
 */

function goalChip(state: PerformanceState, goalId: string) {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const meta = typeMeta(goal.type);
  return (
    <span
      className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `${meta.color}1A`, color: meta.color }}
    >
      {goal.name}
    </span>
  );
}

function EvidenceLinks({ entry }: { entry: PerfActual }) {
  if (!entry.evidence?.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {entry.evidence.map((e) => (
        <a
          key={e.url}
          href={e.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-blue-primary transition-colors hover:bg-[rgba(0,113,227,0.14)]"
        >
          <Paperclip size={10} strokeWidth={2.4} /> {e.name}
        </a>
      ))}
    </span>
  );
}

export function StatusPill({ entry }: { entry: PerfActual }) {
  if (entryStatus(entry) === "verified") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(22,163,74,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#16A34A]">
        <CheckCircle2 size={11} strokeWidth={2.4} /> Verified · locked
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B45309]">
      ⏳ Waiting for the group owner
    </span>
  );
}

/** The signed-in person's recent claims, with proof and where each stands. */
export function MyEntriesCard({
  state,
  person,
}: {
  state: PerformanceState;
  person: string;
}) {
  const mine = state.actuals
    .filter((a) => a.person === person)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    .slice(0, 8);
  if (mine.length === 0) return null;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-text-primary">
          Logged results
        </h3>
        <span className="text-[11px] text-text-tertiary">
          the bar only moves once an entry is verified
        </span>
      </div>
      <div className="divide-y divide-border-light/70 px-4">
        {mine.map((a) => {
          const goal = state.goals.find((g) => g.id === a.goalId);
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
              {goalChip(state, a.goalId)}
              <b className="text-[12.5px] text-text-primary tnum">
                {goal ? fmtAmount(goal.unit, a.amount) : a.amount}
              </b>
              {a.customer && (
                <span className="min-w-0 truncate text-[11.5px] text-text-secondary">
                  {a.customer}
                </span>
              )}
              <span className="text-[10.5px] text-text-tertiary tnum">{a.date}</span>
              <EvidenceLinks entry={a} />
              <span className="ml-auto flex items-center gap-2">
                <StatusPill entry={a} />
              </span>
              {a.managerNote && entryStatus(a) === "reported" && (
                <p className="w-full rounded-lg bg-[rgba(180,83,9,0.07)] px-2.5 py-1.5 text-[11px] leading-snug text-[color:#B45309]">
                  Sent back: {a.managerNote}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Everything waiting on a group owner. Renders only for group owners. */
export function VerifyQueueCard({
  state,
  run,
  meName,
  busy,
}: {
  state: PerformanceState;
  run: RunOp;
  meName: string;
  busy: boolean;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const heads = headedGroups(state, meName);
  if (heads.length === 0) return null;
  const queue = verificationQueue(state, meName);
  return (
    <Card className="overflow-hidden border-[rgba(180,83,9,0.35)] p-0">
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-text-primary">
          Waiting for your verification
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            queue.length
              ? "bg-[rgba(180,83,9,0.12)] text-[color:#B45309]"
              : "bg-[rgba(22,163,74,0.12)] text-[color:#16A34A]"
          )}
        >
          {queue.length || "all clear"}
        </span>
        {/* A GROUP NAME IS A TAG, NOT A WORD IN A SENTENCE (Anir, Aug 15:
            "those variable names have to have a tag... just make it blue").
            "you own test." read like a typo; a pill makes it obviously a
            name, and blue is the same tag the group name wears everywhere
            else. */}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-text-tertiary">
          you own
          {heads.map((g) => (
            <span
              key={g.id}
              className="rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold text-blue-primary"
            >
              {g.name}
            </span>
          ))}
          <span>Only you can lock these</span>
        </span>
      </div>
      {queue.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-text-secondary">
          Nothing pending. New claims from your people land here with their
          evidence.
        </p>
      ) : (
        <div className="divide-y divide-border-light/70 px-4">
          {queue.map((a) => {
            const goal = state.goals.find((g) => g.id === a.goalId);
            return (
              <div key={a.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={a.person} className="h-6 w-6 text-[9px]" />
                  <b className="text-[12.5px] text-text-primary">{a.person}</b>
                  {goalChip(state, a.goalId)}
                  <b className="text-[12.5px] tnum">
                    {goal ? fmtAmount(goal.unit, a.amount) : a.amount}
                  </b>
                  {a.customer && (
                    <span className="min-w-0 truncate text-[11.5px] text-text-secondary">
                      {a.customer}
                    </span>
                  )}
                  <span className="text-[10.5px] text-text-tertiary tnum">
                    {a.date}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          { op: "verify-actual", actualId: a.id },
                          "Verified and locked. It counts now"
                        )
                      }
                      className="cursor-pointer rounded-lg bg-blue-primary px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                      Verify and lock ✓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setNoteFor(noteFor === a.id ? null : a.id);
                        setNote("");
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                    >
                      <RotateCcw size={11} strokeWidth={2.2} /> Send back
                    </button>
                  </span>
                </div>
                {a.evidence?.length ? (
                  <div className="mt-1.5 pl-8">
                    <EvidenceLinks entry={a} />
                  </div>
                ) : (
                  <p className="mt-1.5 pl-8 text-[10.5px] text-[color:#B45309]">
                    No evidence attached.
                  </p>
                )}
                {noteFor === a.id && (
                  <div className="mt-2 flex items-center gap-2 pl-8">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What needs fixing before you can verify this?"
                      className="h-[34px] flex-1 rounded-lg border border-border-light bg-white px-2.5 text-[12px] outline-none focus:border-blue-subtle"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(
                          { op: "send-back-actual", actualId: a.id, note },
                          "Sent back with your note"
                        );
                        if (ok) setNoteFor(null);
                      }}
                      className="cursor-pointer rounded-lg bg-[color:#B45309] px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      Send it back
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
