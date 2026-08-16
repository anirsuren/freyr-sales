"use client";

import { Fragment, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Hourglass,
  Paperclip,
  PenLine,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  entryStatus,
  fmtAmount,
  parseAmountInput,
  verificationQueue,
  headedGroups,
  type PerfActual,
  type PerformanceState,
} from "@/lib/performanceShared";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyFan } from "@/components/ui/CompanyFan";
import { EvidenceInline, EvidencePreview, EvidenceThumb } from "./EvidenceViewer";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { RunOp } from "./PerformanceModule";
import { typeMeta, GroupPill } from "./bits";

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
      className="inline-flex max-w-[240px] items-center gap-1 truncate rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: `${meta.color}1A`, color: meta.color }}
    >
      {goal.name}
    </span>
  );
}

function EvidenceLinks({
  entry,
  onOpen,
}: {
  entry: PerfActual;
  onOpen?: (file: { name: string; url: string }) => void;
}) {
  if (!entry.evidence?.length) {
    return (
      <span className="text-[13px] text-text-tertiary">—</span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {entry.evidence.map((e) => (
        <button
          key={e.url}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.({ name: e.name, url: e.url });
          }}
          title={`Preview ${e.name}`}
          className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[12px] font-semibold text-blue-primary transition-colors hover:bg-[rgba(0,113,227,0.14)]"
        >
          <Paperclip size={11} strokeWidth={2.4} />
          <span className="max-w-[160px] truncate">{e.name}</span>
        </button>
      ))}
    </span>
  );
}

/** The customer as a face, never a string (Anir, Aug 15). */
function CustomerCell({
  customer,
  customerId,
  logoClassName,
}: {
  customer?: string;
  customerId?: string;
  logoClassName?: string;
}) {
  const names = (customer ?? "")
    .split(/\s*\+\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
  return (
    <CompanyFan
      logoClassName={logoClassName}
      companies={names.map((n, i) => ({
        name: n,
        // The id only ever belongs to the account that was picked, which is
        // the first one named; the rest are free text.
        id: i === 0 ? customerId : undefined,
      }))}
    />
  );
}

export function StatusPill({
  entry,
  onUnlock,
  waitingOnMe = false,
}: {
  entry: PerfActual;
  /** Present only for someone who may reopen this claim. */
  onUnlock?: () => void;
  /** The reader is the group owner who has to check this one. */
  waitingOnMe?: boolean;
}) {
  if (entryStatus(entry) === "verified") {
    if (onUnlock) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
          title="Unlock this claim and send it back"
          className="group/st inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[11.5px] font-bold text-[color:#16A34A] transition-colors hover:bg-[rgba(220,38,38,0.12)] hover:text-[color:#DC2626]"
        >
          <CheckCircle2
            size={12}
            strokeWidth={2.4}
            className="group-hover/st:hidden"
          />
          <RotateCcw
            size={12}
            strokeWidth={2.4}
            className="hidden group-hover/st:block"
          />
          <span className="group-hover/st:hidden">Verified · locked</span>
          <span className="hidden group-hover/st:inline">Unlock and send back</span>
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[11.5px] font-bold text-[color:#16A34A]">
        <CheckCircle2 size={12} strokeWidth={2.4} /> Verified · locked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(0,113,227,0.12)] px-2.5 py-1 text-[11.5px] font-bold text-[color:#0058B0]">
      <Hourglass size={12} strokeWidth={2.4} />{" "}
      {waitingOnMe ? "Waiting for you to verify" : "Waiting for the group owner"}
    </span>
  );
}

/** One labelled fact in the expanded row. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        {label}
      </span>
      <span className="mt-1 block text-[13.5px] font-medium text-text-primary">
        {children}
      </span>
    </div>
  );
}

/**
 * LOGGED RESULTS — a real table, and every row opens (Anir, Aug 15: "it should
 * be like a more detailed table… it should probably be like a dropdown").
 *
 * Collapsed, it answers who / what / how much / for whom / when / proof /
 * where it stands, in aligned columns. Open, it adds everything the row cannot
 * hold: the exact goal and subgoal, the deal, when it was entered, who locked
 * it and when, the note it came back with, and the proof as thumbnails you
 * click to see full size.
 */
export function MyEntriesCard({
  state,
  person,
  run,
  meName,
  busy = false,
}: {
  state: PerformanceState;
  person: string;
  /** Present on the live page; absent in read-only embeds. */
  run?: RunOp;
  meName?: string;
  busy?: boolean;
}) {
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [undoFor, setUndoFor] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState("");
  const [dropFor, setDropFor] = useState<string | null>(null);
  /** Fixing a typo used to mean delete and re-enter, losing the upload. */
  const [editFor, setEditFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({ amount: "", date: "", customer: "" });
  /**
   * A LOCK NEEDS AN UNDO (bug, Aug 15). Verifying pulls the row out of the
   * queue, and the queue was the only place Send back lived — so a claim
   * locked by mistake could not be reopened from anywhere in the UI, though
   * the server has always accepted it. Same op, same rule about who may do
   * it: only an owner of a group this person is in.
   */
  const iOwnThisPerson =
    !!run &&
    !!meName &&
    headedGroups(state, meName).some((g) =>
      [g.head, ...g.members]
        .map((m) => m.trim().toLowerCase())
        .includes(person.trim().toLowerCase())
    );
  const mine = state.actuals
    .filter((a) => a.person === person)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    .slice(0, 8);
  if (mine.length === 0) return null;

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
          <h3 className="text-[13.5px] font-semibold text-text-primary">
            Logged results
          </h3>
          {/* NO BAR ON THIS CARD (Anir, Aug 16: "It says the bar only moves
              once an entry is verified... There's no bar. I don't see a bar
              here"). The bar it meant is the goal's, one card up. Say the rule
              itself instead of pointing at something that is not on screen. */}
          <span className="text-[11px] text-text-tertiary">
            nothing counts toward a goal until it is verified
          </span>
          <span className="ml-auto text-[11px] text-text-tertiary tnum">
            {mine.length} {mine.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="px-4 py-2.5">Logged by</th>
                <th className="px-4 py-2.5">Goal</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Proof</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {mine.map((a) => {
                const goal = state.goals.find((g) => g.id === a.goalId);
                const sub = goal?.subgoals.find((x) => x.id === a.subgoalId);
                const open = openRow === a.id;
                const status = entryStatus(a);
                /** Your own claim, still unlocked: yours to change or drop. */
                const canEdit =
                  status === "reported" &&
                  !!run &&
                  (a.person === meName || a.addedBy === meName);
                return (
                  <Fragment key={a.id}>
                    <tr
                      onClick={() => setOpenRow(open ? null : a.id)}
                      aria-expanded={open}
                      /* THE SAME OPEN STATE AS EVERY OTHER DROPDOWN (Anir,
                         Aug 16: "this dropdown looks off, just super, super
                         off. I can't put my finger on it. Maybe it's the
                         colour"). It was the only one washed in blue; the goal
                         rows open onto plain surface with a blue rail down the
                         left, so this now does too. */
                      className={cn(
                        "cursor-pointer transition-colors",
                        open
                          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          : "hover:bg-surface"
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={a.person} className="h-8 w-8 shrink-0 text-[11px]" />
                          <span className="truncate text-[13.5px] font-semibold text-text-primary">
                            {a.person}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">{goalChip(state, a.goalId)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                        {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerCell customer={a.customer} customerId={a.customerId} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-text-secondary tnum">
                        {a.date}
                      </td>
                      <td className="px-4 py-3.5">
                        <EvidenceLinks entry={a} onOpen={setPreview} />
                      </td>
                      <td className="px-4 py-3.5">
                        {/* The pill IS the control: hovering a locked claim
                            turns it into Unlock (Anir, Aug 15: "you don't even
                            need that button there. Put that button when I hover
                            over the status where it says Verified"). */}
                        <StatusPill
                          entry={a}
                          waitingOnMe={iOwnThisPerson}
                          onUnlock={
                            iOwnThisPerson && status === "verified"
                              ? () => {
                                  setOpenRow(a.id);
                                  setUndoFor(a.id);
                                  setUndoNote("");
                                }
                              : undefined
                          }
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        {/* EDIT AND DELETE LIVE IN THE ACTIONS COLUMN (Anir,
                            Aug 16: "The Edit button and the Delete button
                            should go in the action column, which should be the
                            last column instead of putting it here. Just icons
                            would be a lot better"). They still open the same
                            forms inside the row; only the way in moved. */}
                        <span className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                title="Edit this entry"
                                aria-label={`Edit the ${a.date} entry`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRow(a.id);
                                  setEditFor(a.id);
                                  setDropFor(null);
                                  setDraft({
                                    amount: String(a.amount),
                                    date: a.date,
                                    customer: a.customer ?? "",
                                  });
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                              >
                                <PenLine size={14} strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                title="Delete this entry"
                                aria-label={`Delete the ${a.date} entry`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRow(a.id);
                                  setDropFor(a.id);
                                  setEditFor(null);
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-surface"
                              >
                                <Trash2 size={14} strokeWidth={2.2} />
                              </button>
                            </>
                          )}
                          <ChevronDown
                            size={16}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "ml-0.5 text-text-tertiary transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr className="!border-t-0 bg-surface">
                        <td
                          colSpan={8}
                          className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        >
                          <div className="tab-panel grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            <Fact label="Goal">
                              {goal?.name ?? "Goal removed"}
                            </Fact>
                            <Fact label="Subgoal">
                              {sub?.name ?? (
                                <span className="text-text-tertiary">
                                  logged on the goal itself
                                </span>
                              )}
                            </Fact>
                            <Fact label="Result date">{a.date}</Fact>
                            <Fact label="Entered">
                              {a.addedAt.slice(0, 10)}
                              {a.addedBy && a.addedBy !== a.person ? ` by ${a.addedBy}` : ""}
                            </Fact>
                            <Fact label="Customer">
                              <CustomerCell customer={a.customer} customerId={a.customerId} />
                            </Fact>
                            <Fact label="Deal">
                              {a.dealLabel ?? (
                                <span className="text-text-tertiary">not tied to a deal</span>
                              )}
                            </Fact>
                            <Fact label="Status">
                              {status === "verified"
                                ? `Locked${a.verifiedBy ? ` by ${a.verifiedBy}` : ""}${
                                    a.verifiedAt ? ` on ${a.verifiedAt.slice(0, 10)}` : ""
                                  }`
                                : iOwnThisPerson
                                  ? "Waiting for you to check the proof and lock it"
                                  : "Waiting for the group owner to check the proof"}
                            </Fact>
                            <Fact label="Note">
                              {a.note ?? (
                                <span className="text-text-tertiary">none</span>
                              )}
                            </Fact>
                          </div>

                          {/* The proof, big enough to judge without opening it. */}
                          <div className="mt-4">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                              Proof
                            </span>
                            {a.evidence?.length ? (
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {a.evidence.map((e) => (
                                  <button
                                    key={e.url}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setPreview({ name: e.name, url: e.url });
                                    }}
                                    title={`Preview ${e.name}`}
                                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-border-light bg-white p-1.5 pr-3 text-left transition-colors hover:border-blue-primary"
                                  >
                                    <EvidenceThumb file={e} />
                                    <span className="min-w-0">
                                      <span className="block max-w-[190px] truncate text-[11.5px] font-semibold text-text-primary">
                                        {e.name}
                                      </span>
                                      <span className="block text-[10px] text-blue-primary">
                                        Click to preview
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-[11.5px] text-text-secondary">
                                Nothing attached. A group owner can send this back and
                                ask for the contract or SOW.
                              </p>
                            )}
                          </div>

                          {a.managerNote && status === "reported" && (
                            <p className="mt-3 rounded-lg bg-[rgba(0,113,227,0.07)] px-3 py-2 text-[13px] leading-snug text-[color:#0058B0]">
                              Sent back: {a.managerNote}
                            </p>
                          )}

                          {/* YOUR OWN CLAIM IS YOURS UNTIL SOMEBODY LOCKS IT
                              (Anir, Aug 15: "if I was the one who did this, I
                              should be able to delete it"). The server has
                              always allowed this and always refused it once
                              verified; the row simply never offered it. */}
                          {canEdit && (dropFor === a.id || editFor === a.id) && (
                              <div
                                className="mt-3 flex flex-wrap items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {dropFor === a.id ? (
                                  <>
                                    <span className="text-[12.5px] text-text-secondary">
                                      Delete this entry for good?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={async () => {
                                        const okDone = await run?.(
                                          { op: "remove-actual", actualId: a.id },
                                          "Entry deleted"
                                        );
                                        if (okDone) setDropFor(null);
                                      }}
                                      className="cursor-pointer rounded-lg bg-[color:#DC2626] px-3 py-1.5 text-[12.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                                    >
                                      Delete it
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDropFor(null)}
                                      className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                                    >
                                      Keep it
                                    </button>
                                  </>
                                ) : editFor === a.id ? (
                                  <>
                                    <label className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                                      Amount
                                      <input
                                        value={draft.amount}
                                        onChange={(e) =>
                                          setDraft((d) => ({ ...d, amount: e.target.value }))
                                        }
                                        className="h-[34px] w-[110px] rounded-lg border border-border-light bg-white px-2.5 text-[13px] outline-none focus:border-blue-subtle tnum"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                                      Date
                                      <input
                                        type="date"
                                        value={draft.date}
                                        onChange={(e) =>
                                          setDraft((d) => ({ ...d, date: e.target.value }))
                                        }
                                        className="h-[34px] rounded-lg border border-border-light bg-white px-2.5 text-[13px] outline-none focus:border-blue-subtle"
                                      />
                                    </label>
                                    <label className="flex min-w-[160px] flex-1 items-center gap-1.5 text-[11.5px] text-text-secondary">
                                      Customer
                                      <input
                                        value={draft.customer}
                                        onChange={(e) =>
                                          setDraft((d) => ({ ...d, customer: e.target.value }))
                                        }
                                        className="h-[34px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[13px] outline-none focus:border-blue-subtle"
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={async () => {
                                        const parsed = parseAmountInput(draft.amount);
                                        const okDone = await run?.(
                                          {
                                            op: "update-actual",
                                            actualId: a.id,
                                            amount: parsed ?? a.amount,
                                            date: draft.date || a.date,
                                            customer: draft.customer,
                                          },
                                          "Entry updated"
                                        );
                                        if (okDone) setEditFor(null);
                                      }}
                                      className="cursor-pointer rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditFor(null)}
                                      className="cursor-pointer rounded-lg border border-border-light px-3 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            )}

                          {status === "verified" && iOwnThisPerson && undoFor === a.id && (
                            <div
                              className="mt-3 flex flex-wrap items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                value={undoNote}
                                onChange={(e) => setUndoNote(e.target.value)}
                                placeholder="What needs fixing? They see this note."
                                autoFocus
                                className="h-[36px] min-w-[240px] flex-1 rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  const ok = await run?.(
                                    {
                                      op: "send-back-actual",
                                      actualId: a.id,
                                      note: undoNote,
                                    },
                                    "Unlocked and sent back"
                                  );
                                  if (ok) {
                                    setUndoFor(null);
                                    setUndoNote("");
                                  }
                                }}
                                className="cursor-pointer rounded-lg bg-[color:#DC2626] px-3 py-2 text-[12.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                              >
                                Send it back
                              </button>
                              <button
                                type="button"
                                onClick={() => setUndoFor(null)}
                                className="cursor-pointer rounded-lg border border-border-light px-3 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {preview && (
        <EvidencePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </>
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
  const [note, setNote] = useState("");
  /**
   * ONE WAY IN: REVIEW IT, THEN DECIDE (Anir, Aug 16: "it should just be a
   * view button, and then it brings up a pop-up, and then I can decline it or
   * accept it from the pop-up... I should be able to see all the information
   * about that that I would need to verify").
   *
   * Two icons on the row let you lock money without ever opening the proof —
   * and the first thing he did with them was verify by accident. The claim is
   * read first now, in full, and both answers live in the same dialog.
   */
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  /** Twenty claims used to be twenty clicks (Anir, Aug 15: "so many features
   *  people would need that just don't exist"). Customers has select-many;
   *  this is the same idiom on the queue. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const heads = headedGroups(state, meName);
  if (heads.length === 0) return null;
  const queue = verificationQueue(state, meName);
  return (
    <Card className="overflow-hidden border-[rgba(0,113,227,0.35)] p-0">
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-text-primary">
          Waiting for your verification
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            queue.length
              ? "bg-[rgba(0,113,227,0.12)] text-[color:#0058B0]"
              : "bg-[rgba(22,163,74,0.12)] text-[color:#16A34A]"
          )}
        >
          {queue.length || "all clear"}
        </span>
        {/* ONE SENTENCE, WITH THE GROUP NAME AS A TAG INSIDE IT (Anir,
            Aug 15). Two goes at this: "you own test. Only you can lock these"
            read like a typo, and pilling the name mid-sentence just turned it
            into two fragments with the full stop gone. The name is the object
            of the sentence now, so the pill has somewhere to sit and the line
            still reads as English. Blue, like every other group tag. */}
        {picked.size > 0 ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-text-secondary tnum">
              {picked.size} selected
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                // One at a time on the wire: the server checks ownership per
                // entry, and a partial failure must not look like a success.
                for (const id of picked) {
                  await run({ op: "verify-actual", actualId: id }, "");
                }
                setPicked(new Set());
              }}
              className="cursor-pointer rounded-lg bg-blue-primary px-3 py-1.5 text-[12px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              Verify and lock {picked.size} ✓
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="cursor-pointer rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Clear
            </button>
          </span>
        ) : (
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-text-tertiary">
          Only you can lock claims from
          {heads.map((g, i) => (
            <span key={g.id} className="flex items-center gap-1.5">
              {i > 0 && <span>{i === heads.length - 1 ? "and" : ","}</span>}
              <GroupPill name={g.name} size="sm" />
            </span>
          ))}
        </span>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-text-secondary">
          Nothing pending. New claims from your people land here with their
          evidence.
        </p>
      ) : (
        /* A NUMBERED TABLE, not a stack of rows (Anir, Aug 15: "I should
           clearly see this is number one, this is number two... right now, if
           there are two things, they would be really hard to see"). Same
           column rhythm as Logged results below it, so the two read as one
           system. */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="w-9 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select every claim"
                    checked={picked.size > 0 && picked.size === queue.length}
                    ref={(el) => {
                      if (el) el.indeterminate = picked.size > 0 && picked.size < queue.length;
                    }}
                    onChange={(e) =>
                      setPicked(
                        e.target.checked ? new Set(queue.map((x) => x.id)) : new Set()
                      )
                    }
                    className="h-3.5 w-3.5 cursor-pointer accent-[color:#0071E3]"
                  />
                </th>
                <th className="w-10 px-4 py-2.5 text-right">#</th>
                <th className="px-4 py-2.5">Logged by</th>
                <th className="px-4 py-2.5">Goal</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Proof</th>
                <th className="px-4 py-2.5 text-right">Your call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {queue.map((a, i) => {
                const goal = state.goals.find((g) => g.id === a.goalId);
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        "transition-colors",
                        picked.has(a.id) ? "bg-blue-light/35" : "hover:bg-surface"
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${a.person}'s claim`}
                          checked={picked.has(a.id)}
                          onChange={(e) =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(a.id);
                              else next.delete(a.id);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5 cursor-pointer accent-[color:#0071E3]"
                        />
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-bold text-text-tertiary tnum">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={a.person} className="h-8 w-8 shrink-0 text-[11px]" />
                          <span className="truncate text-[13.5px] font-semibold text-text-primary">
                            {a.person}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">{goalChip(state, a.goalId)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                        {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerCell customer={a.customer} customerId={a.customerId} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-text-secondary tnum">
                        {a.date}
                      </td>
                      <td className="px-4 py-3.5">
                        <EvidenceLinks entry={a} onOpen={setPreview} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {/* ONE BUTTON: READ IT, THEN DECIDE. */}
                        <button
                          type="button"
                          onClick={() => {
                            setReviewId(a.id);
                            setSendingBack(false);
                            setNote("");
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(0,113,227,0.28)] bg-white px-3 py-1.5 text-[12.5px] font-bold text-blue-primary transition-all hover:bg-blue-light active:scale-[0.97]"
                        >
                          <Eye size={13} strokeWidth={2.4} /> Review
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(() => {
        const a = queue.find((x) => x.id === reviewId);
        if (!a) return null;
        const goal = state.goals.find((g) => g.id === a.goalId);
        const sub = goal?.subgoals.find((x) => x.id === a.subgoalId);
        const close = () => {
          setReviewId(null);
          setSendingBack(false);
          setNote("");
        };
        return (
          /**
           * EVERYTHING YOU NEED TO MAKE THE CALL, IN ONE PLACE (Anir, Aug 16:
           * "I should be able to see all the information about that that I
           * would need to verify. Put yourself in my position where I'm trying
           * to verify something"). Who claimed it, against which goal and
           * subgoal, for how much, for whom, when it happened, when it was
           * entered, what they wrote, and the proof big enough to judge —
           * then accept or decline without leaving.
           */
          <Modal open onClose={close} title="Review this claim" size="workflow">
            <div className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3">
              <Avatar name={a.person} className="h-10 w-10 text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-text-primary">
                  {a.person}
                </span>
                <span className="block text-[12px] text-text-secondary">
                  claimed on {a.date}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <b className="block text-[22px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
                  {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                </b>
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="Goal">{goal?.name ?? "Goal removed"}</Fact>
              <Fact label="Subgoal">
                {sub?.name ?? (
                  <span className="text-text-tertiary">logged on the goal itself</span>
                )}
              </Fact>
              <Fact label="Customer">
                <CustomerCell customer={a.customer} customerId={a.customerId} />
              </Fact>
              <Fact label="Result date">{a.date}</Fact>
              <Fact label="Entered">
                {a.addedAt.slice(0, 10)}
                {a.addedBy && a.addedBy !== a.person ? ` by ${a.addedBy}` : ""}
              </Fact>
              <Fact label="Deal">
                {a.dealLabel ?? (
                  <span className="text-text-tertiary">not tied to a deal</span>
                )}
              </Fact>
              <Fact label="Their note">
                {a.note ?? <span className="text-text-tertiary">none</span>}
              </Fact>
            </div>

            <div className="mt-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                Proof
              </span>
              {a.evidence?.length ? (
                <div className="mt-1.5 space-y-2">
                  {a.evidence.map((e) => (
                    <EvidenceInline key={e.url} file={e} />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[12.5px] text-text-secondary">
                  Nothing attached. Send it back and ask for the contract or SOW.
                </p>
              )}
            </div>

            {sendingBack && (
              <div className="tab-panel mt-4 rounded-xl border border-border-light bg-surface p-3">
                <label className="block text-[12px] font-semibold text-text-primary">
                  What needs fixing before you can verify this?
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  placeholder="They see this note"
                  className="mt-1.5 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {sendingBack ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSendingBack(false)}
                    className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(
                        { op: "send-back-actual", actualId: a.id, note },
                        "Sent back with your note"
                      );
                      if (ok) close();
                    }}
                    className="cursor-pointer rounded-lg bg-[color:#B02020] px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-[color:#8F1A1A] disabled:opacity-50"
                  >
                    Send it back
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSendingBack(true)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-4 py-2 text-[13.5px] font-semibold text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                  >
                    <RotateCcw size={14} strokeWidth={2.4} /> Send back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(
                        { op: "verify-actual", actualId: a.id },
                        "Verified and locked. It counts now"
                      );
                      if (ok) close();
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={14} strokeWidth={2.8} /> Verify and lock
                  </button>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {preview && (
        <EvidencePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </Card>
  );
}
