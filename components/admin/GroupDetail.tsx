"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Crown,
  Loader2,
  Plus,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SmartBack } from "@/components/ui/BackButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { cn } from "@/lib/utils";
import { GROUP_TYPE_META } from "@/lib/privileges";
import {
  TypeChip,
  TypeIconTile,
  typeMeta,
} from "@/components/performance/bits";
import type { PerformanceState, PrimaryGoal } from "@/lib/performanceShared";

/**
 * INSIDE ONE GROUP: its people, its goals, and each person's number.
 *
 * Suren, Aug 29: "I've created the group, I'm seeing a bunch of people, and for
 * those people — let me go inside the group and do what needs to be done. I
 * don't want to see all the other group guys... have a mechanism for the group
 * to be assigned goals. From the goal master let's pick what our goals is for
 * the group, let the goals come, and then set the target for the goals for the
 * group and set the target for the people in the group, and it should be inside
 * one screen."
 *
 * Three blocks, in that order, and nothing else on the page. The assigning that
 * used to live on Performance happens here — "this is an execution screen, this
 * is an admin screen... no more assigning should happen there."
 */

type Props = {
  state: PerformanceState;
  groupId: string;
  memberNames: string[];
  groupTypeLabel: string | null;
  /**
   * Rendered as the right-hand pane of the split view rather than as its own
   * page (Anir, Aug 29: "when you click on the right side, the group details
   * show up... the right-side pane keeps changing based on what I'm clicking
   * here"). Drops the back link and the big title, because the list beside it
   * already says which group this is and there is nothing to go back to.
   */
  embedded?: boolean;
  /** Split view fetches its own state, so it needs telling when to re-read. */
  onChanged?: () => void;
};

const money = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}K`
      : `$${n}`;

export function GroupDetail({
  state,
  groupId,
  memberNames,
  groupTypeLabel,
  embedded = false,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const me = useCurrentUserOrNull();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [editingPeople, setEditingPeople] = useState(false);
  const [roster, setRoster] = useState<string[]>([]);
  const [confirmDrop, setConfirmDrop] = useState<PrimaryGoal | null>(null);

  const group = state.groups.find((g) => g.id === groupId);

  /* The owner belongs in the roster whether or not they were also added as a
     member: they are the one person guaranteed to be in the group. */
  const people = useMemo(() => {
    if (!group) return [];
    return [
      ...new Set(
        [group.head, ...group.members].map((m) => m.trim()).filter(Boolean)
      ),
    ];
  }, [group]);

  /** Goals already handed to this group. */
  const carried = useMemo(
    () =>
      state.goals.filter((g) =>
        (g.groupAssignments ?? []).some((a) => a.groupId === groupId)
      ),
    [state.goals, groupId]
  );

  const available = useMemo(
    () => state.goals.filter((g) => !carried.some((c) => c.id === g.id)),
    [state.goals, carried]
  );

  if (!group) return null;

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data?.warning) toast(data.warning, "error");
      else toast(ok);
      if (onChanged) onChanged();
      else router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ASSIGNING GOALS IS A MULTI-PICK (Anir, Aug 29: "you should have a check box
     man, you cannot do one by one, that doesn't make sense UI point of view").
     Same reason the people editor below is checkboxes. */
  async function assignChosen() {
    for (const goalId of chosen) {
      const ok = await run(
        { op: "assign-goal-group", goalId, groupId },
        "Goal assigned"
      );
      if (!ok) break;
    }
    setChosen([]);
    setPicking(false);
  }

  async function savePeople() {
    const ok = await run(
      {
        op: "update-group",
        groupId,
        name: group!.name,
        head: group!.head,
        members: roster.filter((m) => m !== group!.head),
      },
      "People updated"
    );
    if (ok) setEditingPeople(false);
  }

  /* The signed-in person, for the owner check above. Null outside a provider,
     which the admin page always has. */
  const isOwner =
    !!me &&
    me.name.trim().toLowerCase() === group.head.trim().toLowerCase();
  const canManagePeople = isOwner || me?.role === "admin";

  const targetFor = (g: PrimaryGoal) =>
    (g.groupAssignments ?? []).find((a) => a.groupId === groupId)?.target ?? 0;

  return (
    <div>
      {!embedded && (
        <SmartBack
          fallback="/admin"
          className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          All groups
        </SmartBack>
      )}

      {/* ---------------------------------------------------------- the group */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={
              embedded
                ? "text-[17px] font-semibold tracking-[-0.01em] text-text-primary"
                : "text-[22px] font-semibold tracking-[-0.01em] text-text-primary"
            }
          >
            {group.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-text-secondary">
            {groupTypeLabel && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                {GROUP_TYPE_META[
                  groupTypeLabel as keyof typeof GROUP_TYPE_META
                ]?.label ?? groupTypeLabel}
              </span>
            )}
            {/* HIS WORD IS "GROUP OWNER" (Suren, Aug 29: "don't say admin, you
                say owner for the group... no, he's a group owner"). The head
                used to wear their workspace role here, so the person running
                the group read as "Admin" — which is a different fact about a
                different thing. */}
            <span className="inline-flex items-center gap-1.5">
              <Crown size={11} strokeWidth={2.6} className="text-[color:#7C3AED]" />
              Group owner
              <Avatar name={group.head} className="h-5 w-5 text-[7.5px]" />
              <b className="font-semibold text-text-primary">{group.head}</b>
            </span>
            <span>·</span>
            <span>
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          </p>
        </div>
        {busy && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* --------------------------------------------------------- the people */}
      <section className="mb-6 rounded-2xl border border-border-light bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <UsersRound size={15} strokeWidth={2.2} className="text-[color:#7C3AED]" />
            In this group
          </h2>
          {/* ONLY THE GROUP OWNER PUTS PEOPLE IN (Suren, Aug 29: "when you
              see a group, the group owner is basically this box. Only the group
              owner can add"). Admins keep it too — they are the ones who create
              the group and crown its owner in the first place, and a group
              whose owner has left would otherwise be unmaintainable.

              The button going away is the courtesy; the API is the rule. This
              is a client component and cannot be the gate. */}
          {canManagePeople ? (
            <button
              type="button"
              onClick={() => {
                setRoster(people);
                setEditingPeople(true);
              }}
              className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
            >
              Add or remove people
            </button>
          ) : (
            <span className="text-[11.5px] text-text-tertiary">
              Only {group.head} can change who is in this group.
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((m) => (
            <div
              key={m}
              className="flex items-center gap-2.5 rounded-lg border border-border-light bg-white px-2.5 py-2"
            >
              <Avatar name={m} className="h-7 w-7 shrink-0 text-[10px]" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                {m}
              </span>
              {m === group.head && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[10px] font-semibold text-[color:#7C3AED]">
                  <Crown size={9} strokeWidth={2.6} />
                  Group owner
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- the goals */}
      <section className="rounded-2xl border border-border-light bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Target size={15} strokeWidth={2.2} className="text-blue-primary" />
            Goals this group carries
          </h2>
          <Button onClick={() => setPicking(true)}>
            <Plus size={14} strokeWidth={2.4} />
            Assign goals
          </Button>
        </div>

        {carried.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-8 text-center text-[12.5px] text-text-secondary">
            No goals on this group yet. Assign one from the Goal Master and set
            what this group is carrying.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full min-w-[720px] table-fixed">
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border-light bg-surface">
                  {["Goal", "Group target", "Who is on it"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {carried.map((g) => {
                  const assignment = (g.groupAssignments ?? []).find(
                    (a) => a.groupId === groupId
                  );
                  const excluded = new Set(assignment?.excludedPeople ?? []);
                  const on = people.filter((p) => !excluded.has(p));
                  return (
                    <tr key={g.id} className="align-middle">
                      <td className="px-4 py-3.5">
                        <span className="block text-[13px] font-semibold text-text-primary">
                          {g.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-text-tertiary tnum">
                          {g.year}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <GroupTargetInput
                          value={targetFor(g)}
                          disabled={busy}
                          onSave={(target) =>
                            void run(
                              {
                                op: "assign-goal-group",
                                goalId: g.id,
                                groupId,
                                target,
                              },
                              "Target set"
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex flex-wrap items-center gap-1">
                          {on.length === 0 ? (
                            <span className="text-[12px] text-text-tertiary">
                              Nobody
                            </span>
                          ) : (
                            on.map((p) => (
                              <span
                                key={p}
                                title={p}
                                className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5"
                              >
                                <Avatar name={p} className="h-4 w-4 text-[6.5px]" />
                                <span className="text-[11px] font-medium text-text-secondary">
                                  {p.split(" ")[0]}
                                </span>
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 pl-2 pr-4">
                        <span className="flex items-center justify-end">
                          <button
                            type="button"
                            title={`Take ${g.name} off this group`}
                            aria-label={`Take ${g.name} off this group`}
                            onClick={() => setConfirmDrop(g)}
                            className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                          >
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --------------------------------------------- each person's number */}
      {/*
        THE OTHER HALF OF WHAT HE ASKED FOR (Suren, Aug 29: "set the target for
        the goals for the group AND set the target for the people in the group,
        and it should be inside one screen").

        A grid rather than a fold under each goal. People down, this group's
        goals across, one box per cell — the same shape as the privilege table
        he approved ("that table is better, right?"), and it answers "what is
        Suren carrying" by reading a row instead of opening seven goals. Folding
        would also have put an expansion back on a screen where he had just
        finished saying "I don't need expansion at all".
      */}
      {carried.length > 0 && people.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border-light bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Target size={15} strokeWidth={2.2} className="text-[color:#0F766E]" />
            Each person&rsquo;s target
          </h2>
          <p className="mb-3 mt-0.5 text-[12.5px] text-text-tertiary">
            What each person in this group is carrying on each goal. Leave a box
            empty and they are on the goal without a number of their own.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full border-collapse text-left">
              <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-4 py-3">
                    Person
                  </th>
                  {carried.map((g) => (
                    <th key={g.id} className="min-w-[130px] px-3 py-3">
                      <span className="block truncate" title={g.name}>
                        {g.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {people.map((person) => (
                  <tr key={person}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={person} className="h-7 w-7 shrink-0 text-[9px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                            {person}
                          </span>
                          {person === group.head && (
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:#7C3AED]">
                              Group owner
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    {carried.map((g) => (
                      <td key={g.id} className="px-3 py-2.5">
                        <GroupTargetInput
                          value={
                            (g.assignments ?? []).find(
                              (a) =>
                                a.person.trim().toLowerCase() ===
                                person.trim().toLowerCase()
                            )?.target ?? 0
                          }
                          disabled={busy}
                          onSave={(target) =>
                            void run(
                              {
                                op: "assign-goal",
                                goalId: g.id,
                                person,
                                target,
                              },
                              `${person}'s target set`
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- pick a goal */}
      <Modal
        open={picking}
        onClose={() => {
          setPicking(false);
          setChosen([]);
        }}
        title="Assign goals to this group"
      >
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Pick from the Goal Master. Tick as many as you need.
        </p>
        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto">
          {available.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-6 text-center text-[12.5px] text-text-secondary">
              Every goal in the master is already on this group.
            </p>
          ) : (
            available.map((g) => {
              const on = chosen.includes(g.id);
              const accent = typeMeta(g.type).color;
              return (
                /* COLOUR AND AN ICON, LIKE EVERY OTHER GOAL IN THE APP (Anir,
                   Aug 29: "this is a bad UI, there are no colors, no icons,
                   nothing"). It was a stack of grey rows with a system
                   checkbox, which broke the standing rule that a category
                   never appears plain — and made a picker of nineteen goals
                   impossible to scan, because the only thing distinguishing
                   them was the words.

                   The row wears the goal type's tile and its own colour when
                   ticked, so picking is a matter of recognising a shape rather
                   than reading every line. */
                <label
                  key={g.id}
                  style={{ ["--goal-accent" as string]: accent }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all",
                    on
                      ? "border-[color:var(--goal-accent)] bg-[color:var(--goal-accent)]/[0.07] [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                      : "border-border-light hover:border-[color:var(--goal-accent)]/50 hover:bg-surface"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setChosen((c) =>
                        c.includes(g.id)
                          ? c.filter((x) => x !== g.id)
                          : [...c, g.id]
                      )
                    }
                    className="sr-only"
                  />
                  {/* The tick box is drawn rather than native, so it can take
                      the goal's colour; the real input stays for the keyboard
                      and for screen readers. */}
                  <span
                    aria-hidden="true"
                    style={
                      on
                        ? { borderColor: accent, backgroundColor: accent }
                        : undefined
                    }
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      on ? "text-white" : "border-border-light text-transparent"
                    )}
                  >
                    <Check size={12} strokeWidth={3.2} />
                  </span>
                  <TypeIconTile type={g.type} className="h-8 w-8 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-text-primary">
                      {g.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <TypeChip type={g.type} size="sm" />
                      <span className="text-[11px] text-text-tertiary tnum">
                        {g.year}
                        {g.target > 0 && ` · org target ${money(g.target)}`}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setPicking(false);
              setChosen([]);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void assignChosen()}
            disabled={chosen.length === 0}
            loading={busy}
          >
            {chosen.length <= 1
              ? "Assign goal"
              : `Assign ${chosen.length} goals`}
          </Button>
        </div>
      </Modal>

      {/* ---------------------------------------------------- edit the people */}
      <Modal
        open={editingPeople}
        onClose={() => setEditingPeople(false)}
        title="Who is in this group"
      >
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Tick everyone who belongs here. The group owner is always in.
        </p>
        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto">
          {memberNames.map((m) => {
            const isHead = m === group.head;
            const on = isHead || roster.includes(m);
            return (
              <label
                key={m}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                  isHead
                    ? "cursor-not-allowed border-border-light bg-surface"
                    : on
                      ? "cursor-pointer border-blue-primary bg-blue-light/40"
                      : "cursor-pointer border-border-light hover:border-blue-primary/50"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isHead}
                  onChange={() =>
                    setRoster((r) =>
                      r.includes(m) ? r.filter((x) => x !== m) : [...r, m]
                    )
                  }
                  className="sr-only"
                />
                {/* Drawn, not native, so it matches the goal picker beside it
                    and can carry the app's blue rather than the OS accent. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                    on
                      ? "border-blue-primary bg-blue-primary text-white"
                      : "border-border-light text-transparent"
                  )}
                >
                  <Check size={12} strokeWidth={3.2} />
                </span>
                <Avatar name={m} className="h-6 w-6 shrink-0 text-[8.5px]" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                  {m}
                </span>
                {isHead && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:#7C3AED]">
                    Group owner
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditingPeople(false)}>
            Cancel
          </Button>
          <Button onClick={() => void savePeople()} loading={busy}>
            Save
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDrop !== null}
        onClose={() => setConfirmDrop(null)}
        onConfirm={() => {
          const g = confirmDrop;
          setConfirmDrop(null);
          if (g)
            void run(
              { op: "unassign-goal-group", goalId: g.id, groupId },
              `${g.name} taken off`
            );
        }}
        title="Take this goal off the group?"
        body={
          confirmDrop ? (
            <>
              <b>{confirmDrop.name}</b> comes off {group.name}. The goal itself
              stays in the Goal Master, and anything already logged against it
              is untouched.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Take it off"
        busy={busy}
      />
    </div>
  );
}

/**
 * The group's number for one goal.
 *
 * Typed and committed on blur or Enter rather than on every keystroke, so
 * setting 1500000 does not fire six saves and leave the store on whichever one
 * happened to land last.
 */
function GroupTargetInput({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled: boolean;
  onSave: (target: number) => void;
}) {
  const [draft, setDraft] = useState(String(value || ""));
  const commit = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n === value) {
      setDraft(String(value || ""));
      return;
    }
    onSave(n);
  };
  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value || ""));
      }}
      inputMode="numeric"
      placeholder="Set the target"
      aria-label="Group target"
      className="w-full rounded-lg border border-border-light px-2.5 py-1.5 text-[12.5px] font-semibold text-text-primary tnum transition-colors focus:border-blue-primary focus:outline-none"
    />
  );
}
