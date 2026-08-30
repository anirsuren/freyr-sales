"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  X,
  Loader2,
  Plus,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonFan } from "@/components/ui/PersonFan";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SmartBack } from "@/components/ui/BackButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { cn } from "@/lib/utils";
import { GROUP_TYPE_META } from "@/lib/privileges";
import {
  PersonProgress,
  TypeChip,
  TypeIconTile,
  typeMeta,
} from "@/components/performance/bits";
import { actualValue } from "@/lib/performanceShared";
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
  /** Which goal is unfolded to show what each person carries on it. */
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  /** The person about to be taken out of the group, held until confirmed. */
  const [confirmDropPerson, setConfirmDropPerson] = useState<string | null>(null);
  /* WHICH TARGET IS BEING EDITED, and in a popup (Anir, Aug 29: "I think
     editing should still be a pop-up, so just keep that part. I don't like just
     entering it in right here"). One piece of state for both kinds, because the
     dialog is the same question either way — a number, for this goal, for the
     group or for one person. */
  const [editingTarget, setEditingTarget] = useState<{
    kind: "group" | "person";
    goalId: string;
    goalName: string;
    person?: string;
    current: number;
  } | null>(null);
  const [targetDraft, setTargetDraft] = useState("");

  /** Seed the box from whatever the target is now, each time it opens. */
  function openTarget(next: NonNullable<typeof editingTarget>) {
    setTargetDraft(String(next.current || ""));
    setEditingTarget(next);
  }

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

  /* One save for both kinds. The op differs, the question does not. */
  async function saveTarget() {
    const t = editingTarget;
    if (!t) return;
    const n = Number(targetDraft.replace(/[^0-9.]/g, ""));
    setEditingTarget(null);
    if (!Number.isFinite(n) || n === t.current) return;
    await run(
      t.kind === "group"
        ? { op: "assign-goal-group", goalId: t.goalId, groupId, target: n }
        : { op: "assign-goal", goalId: t.goalId, person: t.person, target: n },
      t.kind === "group" ? "Target set" : `${t.person}'s target set`
    );
  }

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
      {/* ONE LINE (Anir, Aug 30: "I want the group owner itself to be in line
          with that name, where you say group owner and then my name, and then
          two people can all be on the same line — that will help everything
          move up"). The name sat alone on its own row with a second row of
          facts under it, which cost 24px to say three short things that fit
          beside each other. It wraps on a narrow screen and nowhere else. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1
            className={
              embedded
                ? "text-[17px] font-semibold tracking-[-0.01em] text-text-primary"
                : "text-[22px] font-semibold tracking-[-0.01em] text-text-primary"
            }
          >
            {group.name}
          </h1>
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
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
            <Crown size={11} strokeWidth={2.6} className="text-[color:#7C3AED]" />
            Group owner
            <Avatar name={group.head} className="h-5 w-5 text-[7.5px]" />
            <b className="font-semibold text-text-primary">{group.head}</b>
          </span>
          <span className="text-[12.5px] text-text-tertiary">·</span>
          <span className="text-[12.5px] text-text-secondary">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        </div>
        {busy && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* --------------------------------------------------------- the people */}
      <section className="mb-4 rounded-2xl border border-border-light bg-white px-5 pb-5 pt-3.5">
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
          {/* A BLUE PLUS, NOT A SENTENCE (Anir, Aug 29: "I don't like that
              button that says Add or Remove People... it should bring up a
              pop-up when I press the blue plus"). Adding and removing are two
              different actions and the button named both, so it did neither
              obviously. The plus adds; the X on each person removes. */}
          {canManagePeople ? (
            <button
              type="button"
              title="Add people to this group"
              aria-label="Add people to this group"
              onClick={() => {
                setRoster(people);
                setEditingPeople(true);
              }}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-primary text-white transition-colors hover:bg-blue-hover"
            >
              <Plus size={16} strokeWidth={2.6} />
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
              {m === group.head ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[10px] font-semibold text-[color:#7C3AED]">
                  <Crown size={9} strokeWidth={2.6} />
                  Group owner
                </span>
              ) : (
                /* AN X PER PERSON (Anir, Aug 29: "there should be an X on each
                   person"). It asks first, because taking somebody out of a
                   group takes their goals in it with them and the standing rule
                   is that a removal is red and confirmed. The owner has no X:
                   a group with no owner is not a group. */
                canManagePeople && (
                  <button
                    type="button"
                    title={`Take ${m} out of ${group.name}`}
                    aria-label={`Take ${m} out of ${group.name}`}
                    onClick={() => setConfirmDropPerson(m)}
                    className="shrink-0 cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-[rgba(220,38,38,0.10)] hover:text-[color:#DC2626]"
                  >
                    <X size={13} strokeWidth={2.4} />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- the goals */}
      <section className="rounded-2xl border border-border-light bg-white px-5 pb-5 pt-3.5">
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
                {/* The gap before Actions was 32% of the table holding two
                    avatars (Anir, Aug 29: "look how much space there is between
                    the people column and the actions column"). Who-is-on-it
                    only ever holds a handful of faces; the goal name is what
                    wanted the room. */}
                <col style={{ width: "44%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "16%" }} />
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
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
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
                  const isOpen = openGoal === g.id;
                  const accent = typeMeta(g.type).color;
                  return (
                    <Fragment key={g.id}>
                    {/* EVERY GOAL IS A DROPDOWN (Anir, Aug 29: "I still want
                        those dropdowns for each of those goals, it shouldn't
                        just be this. When I hit the goal it should still be a
                        dropdown"). The flat row said who was on it and stopped;
                        opening it says what each of those people is actually
                        carrying, and lets you set it there — in the context of
                        the goal, rather than in a separate grid somewhere else
                        on the page. */}
                    <tr
                      onClick={() => setOpenGoal(isOpen ? null : g.id)}
                      style={{ ["--goal-accent" as string]: accent }}
                      className={cn(
                        "cursor-pointer align-middle transition-all",
                        isOpen
                          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                          : "hover:bg-surface",
                        openGoal !== null && !isOpen && "opacity-45 hover:opacity-100"
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-2.5">
                          <ChevronRight
                            size={14}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "shrink-0 text-text-tertiary transition-transform duration-200",
                              isOpen && "rotate-90 text-[color:var(--goal-accent)]"
                            )}
                          />
                          <TypeIconTile type={g.type} className="h-8 w-8 rounded-lg" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {g.name}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-text-tertiary tnum">
                              {g.year}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <GroupTargetInput
                          value={targetFor(g)}
                          disabled={busy}
                          onOpen={() =>
                            openTarget({
                              kind: "group",
                              goalId: g.id,
                              goalName: g.name,
                              current: targetFor(g),
                            })
                          }
                        />
                      </td>
                      {/* FACES ONLY (Anir, Aug 29: "there are 100 people,
                          right? This is not going to look good, so you got to
                          show profile pictures. I don't need to see the names —
                          obviously when I open it I'll see the names"). Name
                          chips were fine at two people and unusable at fifty.
                          PersonFan is the app's existing answer: overlapped
                          avatars that fan apart on hover, each naming itself,
                          and the fold below lists everyone properly. */}
                      <td className="px-4 py-3.5">
                        {on.length === 0 ? (
                          <span className="text-[12px] text-text-tertiary">
                            Nobody
                          </span>
                        ) : (
                          <PersonFan
                            people={on.map((p) => ({
                              name: p,
                              role: p === group.head ? "Group owner" : "In this group",
                              context: g.name,
                            }))}
                            avatarClassName="h-6 w-6 text-[9px]"
                          />
                        )}
                      </td>
                      {/* MORE THAN ONE THING TO DO (Anir, Aug 29: "why is
                          there only one action?"). A column headed Actions with
                          a single bin in it is a column pretending to be a set.
                          Open the goal where it is edited, unfold it here, and
                          take it off the group. */}
                      <td className="py-3.5 pl-2 pr-4">
                        <span className="flex items-center justify-start gap-0.5">
                          <Link
                            href="/admin/goal-master"
                            title={`Open ${g.name} on the Goal Master`}
                            aria-label={`Open ${g.name} on the Goal Master`}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <ArrowUpRight size={13} strokeWidth={2.2} />
                          </Link>
                          <button
                            type="button"
                            title={isOpen ? "Hide who carries it" : "Show who carries it"}
                            aria-label={
                              isOpen
                                ? `Hide who carries ${g.name}`
                                : `Show who carries ${g.name}`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenGoal(isOpen ? null : g.id);
                            }}
                            className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <ChevronDown
                              size={13}
                              strokeWidth={2.2}
                              className={cn(
                                "transition-transform duration-200",
                                isOpen && "rotate-180"
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            title={`Take ${g.name} off this group`}
                            aria-label={`Take ${g.name} off this group`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDrop(g);
                            }}
                            className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                          >
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} className="bg-surface p-0">
                          <div
                            style={{ ["--goal-accent" as string]: accent }}
                            className="tab-panel border-t border-border-light px-4 py-3 [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
                          >
                            <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                              What each person carries on this goal
                            </p>
                            {/* ONE PERSON PER ROW (Anir, Aug 29: "when I click
                                on the goal, I expect it to be like one person
                                and then the next person on the next row"). Two
                                across meant reading in a zig-zag to compare
                                targets, which is the one thing you open this to
                                do. */}
                            <div className="mt-2 space-y-1.5">
                              {on.length === 0 ? (
                                <p className="text-[12px] text-text-secondary">
                                  Nobody in this group is on it.
                                </p>
                              ) : (
                                on.map((person) => {
                                  const mine = (g.assignments ?? []).find(
                                    (a) =>
                                      a.person.trim().toLowerCase() ===
                                      person.trim().toLowerCase()
                                  );
                                  const logged = actualValue(
                                    state.actuals.filter(
                                      (a) =>
                                        a.goalId === g.id && a.person === person
                                    ),
                                    g,
                                    { rates: state.rates }
                                  );
                                  return (
                                    <div
                                      key={person}
                                      className="flex items-center gap-2.5 rounded-lg border border-border-light bg-white px-2.5 py-2"
                                    >
                                      <Avatar
                                        name={person}
                                        className="h-7 w-7 shrink-0 text-[9px]"
                                      />
                                      <span className="min-w-[110px] flex-1">
                                        <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                                          {person}
                                        </span>
                                      </span>
                                      {/* WHERE THEY STAND, NOT JUST WHAT THEY
                                          LOGGED (Anir, Aug 30: "why am I not
                                          seeing a progress bar that says
                                          100%? There can't be any holes
                                          here"). The row said "4,567 logged"
                                          beside a target of 450 and left the
                                          arithmetic to the reader. Same block
                                          the goal panel draws, so the two
                                          screens cannot disagree. */}
                                      <span className="block min-w-[150px] flex-[1.4]">
                                        <PersonProgress
                                          goal={g}
                                          done={logged}
                                          target={mine?.target ?? 0}
                                          caption={false}
                                          noTargetLabel="No target yet"
                                        />
                                      </span>
                                      <span className="w-[120px] shrink-0">
                                        <GroupTargetInput
                                          value={mine?.target ?? 0}
                                          disabled={busy}
                                          label={`target for ${person}`}
                                          onOpen={() =>
                                            openTarget({
                                              kind: "person",
                                              goalId: g.id,
                                              goalName: g.name,
                                              person,
                                              current: mine?.target ?? 0,
                                            })
                                          }
                                        />
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* THE PER-PERSON GRID IS GONE, because it moved INTO the goals above
          (Anir, Aug 29: "when I hit the goal it should still be a dropdown").
          It used to be a second table under this one — people down, goals
          across — and once a goal's dropdown sets the same numbers, keeping
          both means two editors for one value and a reader who cannot tell
          which is authoritative. Suren's ask is still met: "set the target for
          the goals for the group AND set the target for the people in the
          group, and it should be inside one screen." It is, one fold deeper
          and in the context of the goal it belongs to. */}

      {/* ------------------------------------------------------- pick a goal */}
      <Modal
        open={picking}
        onClose={() => {
          setPicking(false);
          setChosen([]);
        }}
        title="Assign goals to this group"
        /* NOT A SKINNY POPUP (Anir, Aug 30: "never do those skinny popups").
           A 440px column with nineteen goals in it truncated every name that
           mattered and made the list feel like a straw. Same frame as the Goal
           Master's own group picker: wide, and a fixed height so ticking a row
           does not resize the dialog under the cursor. */
        size="wide"
        tall
        dialogClassName="!h-[min(720px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Pick from the Goal Master. Tick as many as you need.
        </p>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
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
        </div>
      </Modal>

      {/* ------------------------------------------------------ set a target */}
      <Modal
        open={editingTarget !== null}
        onClose={() => setEditingTarget(null)}
        title={
          editingTarget?.kind === "person"
            ? `Set ${editingTarget.person}'s target`
            : "Set the group's target"
        }
      >
        {editingTarget && (
          <>
            <p className="mb-3 text-[12.5px] text-text-secondary">
              On <b className="text-text-primary">{editingTarget.goalName}</b>
              {editingTarget.kind === "group"
                ? ` for ${group.name}.`
                : ` for ${editingTarget.person}.`}
            </p>
            <input
              autoFocus
              value={targetDraft}
              onChange={(e) => setTargetDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTarget();
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Target"
              className="w-full rounded-lg border border-border-light px-3 py-2 text-[14px] font-semibold text-text-primary tnum outline-none focus:border-blue-primary"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Leave it at 0 to take the number off and leave them on the goal
              without one.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingTarget(null)}>
                Cancel
              </Button>
              <Button onClick={saveTarget} loading={busy}>
                Save
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ---------------------------------------------------- edit the people */}
      <Modal
        open={editingPeople}
        onClose={() => setEditingPeople(false)}
        title="Who is in this group"
        size="wide"
        tall
        dialogClassName="!h-[min(720px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Tick everyone who belongs here. The group owner is always in.
        </p>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
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
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDropPerson !== null}
        onClose={() => setConfirmDropPerson(null)}
        onConfirm={() => {
          const who = confirmDropPerson;
          setConfirmDropPerson(null);
          if (!who) return;
          void run(
            {
              op: "update-group",
              groupId,
              name: group.name,
              head: group.head,
              members: people.filter((m) => m !== who && m !== group.head),
            },
            `${who} taken out of ${group.name}`
          );
        }}
        title="Take them out of this group?"
        body={
          confirmDropPerson ? (
            <>
              <b>{confirmDropPerson}</b> comes out of <b>{group.name}</b>.
            </>
          ) : (
            ""
          )
        }
        detail="Any target they carry on this group's goals goes with them. Their own account and everything outside this group is untouched."
        confirmLabel="Take them out"
        busy={busy}
      />

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
/**
 * THE TARGET AT REST. Editing happens in a popup, not here.
 *
 * Anir, Aug 29: "I think editing should still be a pop-up, bro, so just keep
 * that part. I don't like just entering it in right here." The inline editor
 * before it committed on blur, which he also rejected — "they're not going to
 * know if it's saved" — so this is the third shape and the one that keeps both
 * properties: nothing is typed into the table, and saving is an explicit act
 * with its own dialog.
 *
 * At rest it is the number, or the Goal Master's own "Set the target" prompt
 * when there is none.
 */
function GroupTargetInput({
  value,
  disabled,
  onOpen,
  label = "target",
}: {
  value: number;
  disabled: boolean;
  onOpen: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`Set the ${label}`}
      className={
        value > 0
          ? "cursor-pointer rounded-lg border border-border-light px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-text-primary tnum transition-colors hover:border-blue-primary hover:text-blue-primary"
          : "cursor-pointer text-left text-[11.5px] font-semibold text-blue-primary hover:underline"
      }
    >
      {value > 0 ? value.toLocaleString() : "Set the target \u2192"}
    </button>
  );
}
