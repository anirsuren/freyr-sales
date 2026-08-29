"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Crown,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  X,
  ClipboardList,
  ArrowUpRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NamePill } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PersonFan } from "@/components/ui/PersonFan";
import { InfoHint } from "@/components/ui/InfoHint";
import { PersonSelect } from "@/components/performance/bits";
import { roleLabel } from "@/components/ui/RoleTag";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MultiPicker } from "@/components/ui/MultiPicker";
import { GROUP_TYPES, GROUP_TYPE_META } from "@/lib/privileges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PerformanceState, PerfGroup } from "@/lib/performanceShared";
import {
  actualValue,
  isPending,
  scopeStateToPeople,
} from "@/lib/performanceShared";

/**
 * USER GROUPS LIVE IN ADMIN, NOT IN PERFORMANCE (Suren, Aug 12: "creating
 * user groups and people typically should not be a function in the
 * performance side"). Create a department here, crown its owner, add its
 * people — the Performance module only READS these: the owner sees their
 * group's numbers, members' goals roll up automatically.
 */
export function UserGroupsAdmin({ memberNames }: { memberNames: string[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [groups, setGroups] = useState<PerfGroup[] | null>(null);
  /** The same performance state the rooms read, for the glance chips. */
  const [perf, setPerf] = useState<PerformanceState | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  /* WHAT KIND OF GROUP IT IS (Suren, Aug 29: "a group already always has a
     group type"). Empty means nobody has classified it yet, which is what
     every group created before today is. */
  const [groupType, setGroupType] = useState("");
  const [head, setHead] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PerfGroup | null>(null);
  /** Set while editing an existing group — the same popup, prefilled. */
  const [editing, setEditing] = useState<PerfGroup | null>(null);
  /** name → workspace role, so the unfolded list can say what each person is
   *  rather than just who they are. Same directory the Team members tab reads. */
  const [roles, setRoles] = useState<Record<string, string>>({});
  /** True when the last group load failed, so the page can say so. */
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/settings/access", { cache: "no-store" });
        const data = await res.json();
        if (!alive || !res.ok || !Array.isArray(data.members)) return;
        const map: Record<string, string> = {};
        for (const m of data.members as { name?: string; role?: string }[]) {
          // No role recorded means no role shown — coercing to a role is how
          // an admin ended up labelled Rep in their own group.
          if (m.name?.trim() && m.role) map[m.name.trim()] = m.role;
        }
        setRoles(map);
      } catch {
        /* no roles is not a reason for the page to fail; names still show */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Same rule as the member directory: a load that failed must not be drawn
  // as "No groups yet", which reads as somebody having deleted them all.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/performance", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.state) {
        setLoadFailed(true);
        setGroups(null);
        return;
      }
      setLoadFailed(false);
      setGroups(data.state.groups ?? []);
      setPerf(data.state as PerformanceState);
    } catch {
      setLoadFailed(true);
      setGroups(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** WHAT THE GROUP IS CARRYING (Anir, Aug 19: "aren't they each tied to
   *  goals or something?") — a glance, not a second dashboard: goals its
   *  people hold, the money goals' member target vs achieved, and how many
   *  results wait on the owner. Same state and same actualValue math as
   *  Group performance, so the chips can never disagree with the room. */
  function rollup(g: PerfGroup) {
    if (!perf) return null;
    /**
     * THE SAME NUMBERS THE GROUP PAGE SHOWS, from the same function (found
     * testing, Aug 19: Admin said this group carried 2 goals while Group
     * performance said 4).
     *
     * The comment above has always claimed the two agree; they did not. This
     * counted goals held by the head OR a member, only if tracked on the org
     * plan, and ignored goals assigned to the group itself. Group performance
     * scopes by MEMBERS (an owner carries no target unless they joined the
     * roster), counts tracked and untracked alike, and does include a goal
     * given to the group. Three differences, one of them enough to disagree.
     *
     * Deriving both from scopeStateToPeople means the chips cannot drift from
     * the room again, whichever way that function changes.
     */
    const members = [...new Set(g.members.map((m) => m.trim()).filter(Boolean))];
    const scoped = scopeStateToPeople(perf, members, g.id);
    const inGroup = (name: string) =>
      members.some((m) => m.toLowerCase() === name.trim().toLowerCase());
    let target = 0;
    let achieved = 0;
    const present = new Set(scoped.goals.map((x) => x.id));
    for (const goal of scoped.goals) {
      if (goal.unit !== "currency") continue;
      // A rollup and its components are both in this list, and the rollup IS
      // the components — adding both counted the same money and the same
      // target twice. Skip the rollup when what it sums is already here.
      const parts = goal.componentGoalIds ?? [];
      if (parts.length > 0 && parts.some((id) => present.has(id))) continue;
      target += goal.target || 0;
      achieved += actualValue(scoped.actuals, goal, { rates: scoped.rates });
    }
    const waiting = perf.actuals.filter(
      (a) => inGroup(a.person) && isPending(a)
    ).length;
    return { held: scoped.goals.length, target, achieved, waiting };
  }

  function chipMoney(n: number): string {
    if (n >= 1_000_000) {
      const m = n / 1_000_000;
      return `$${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
    }
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
  }

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      setGroups(data.state?.groups ?? []);
      toast(ok);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Neither field fills the other in. Adding a person used to quietly crown
  // them when no owner was set yet — the same surprise as the owner adding
  // themselves to the roster. Two questions, two answers, both his.

  function openCreate() {
    setEditing(null);
    setName("");
    setGroupType("");
    setHead("");
    setMembers([]);
    setCreating(true);
  }

  /** A group used to be frozen once created: no way to add the person who
   *  joined the team in March, hand it to a new owner, or fix a typo. Since
   *  only a group owner can verify their people's numbers, that left later
   *  joiners with claims nobody could sign off. */
  function openEdit(g: PerfGroup) {
    setEditing(g);
    setName(g.name);
    setGroupType(g.groupType ?? "");
    setHead(g.head);
    setMembers([...g.members]);
    setCreating(true);
  }

  function closeEditor() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    const ok = editing
      ? await run(
          { op: "update-group", groupId: editing.id, name, groupType, head, members },
          `${name.trim()} saved`
        )
      : await run(
          { op: "add-group", name, groupType, head, members },
          `${name.trim()} created`
        );
    if (ok) {
      /* ONE STORE AGAIN. Saving a group used to write to /api/performance and
         then to /api/privileges, because a group carried privileges of its
         own. Suren corrected the direction on Aug 29 — the people bring their
         privileges with them and the group grants nothing — so there is no
         second write to keep in step with the first. */
      setName("");
      setGroupType("");
      setHead("");
      setMembers([]);
      closeEditor();
    }
  }


  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <UsersRound size={16} strokeWidth={2} className="text-blue-primary" />
          User groups
          <InfoHint text={"A group is a department with an owner.\nThe owner sees their group on Goals; members' goals add up into the group automatically.\nGoals are never attached to a group, only to its people."} />
        </p>
        {/* Always here. It used to unmount while the popup was open, so
            opening the editor made the button vanish from the page behind it
            (Anir, Aug 15: "it looks like you're disappearing the button"). */}
        <Button onClick={openCreate}>
          <Plus size={14} strokeWidth={2.2} /> New group
        </Button>
      </div>

      {/* Creating a group is its own popup (Anir, Aug 12: "when I create a
          new group, it should be a pop-up"). */}
      <Modal
        open={creating}
        onClose={closeEditor}
        title={editing ? `Edit ${editing.name}` : "New user group"}
        size="workflow"
      >
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          A group is a department with an owner. Its members&apos; goals add up
          into the group automatically — goals are never attached to a group,
          only to its people.
        </p>
        <div className="mt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="flex h-[18px] items-center text-[12px] font-semibold text-text-primary">
                Group name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Growth Accounts"
                className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-primary"
              />
            </div>
            <div>
              <label className="flex h-[18px] items-center gap-1 text-[12px] font-semibold text-text-primary">
                Group type
                <InfoHint text={"What kind of work this group can be given, not what its people may do.\nA business development group can be given customers, contracts and opportunities. A solutioning group can be given solution requests, submissions, presentations and meetings.\nEverybody keeps whatever privileges they already hold."} />
              </label>
              <div className="mt-1">
                <ColorSelect
                  value={groupType}
                  ariaLabel="Group type"
                  collapsible={false}
                  className="w-full"
                  onChange={setGroupType}
                  options={[
                    { value: "", label: "Not classified yet", color: "#C7CDD6" },
                    ...GROUP_TYPES.map((t) => ({
                      value: t,
                      label: GROUP_TYPE_META[t].label,
                      color: GROUP_TYPE_META[t].color,
                    })),
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="flex h-[18px] items-center gap-1 text-[12px] font-semibold text-text-primary">
                Group owner
                <Crown size={12} strokeWidth={2.4} className="text-[color:#7C3AED]" />
                <InfoHint text="The owner runs this group's performance. They see their people's numbers and can verify them." />
              </label>
              <div className="mt-1">
                {/* PICKING THE OWNER PICKS ONLY THE OWNER (Anir, Aug 12: "I
                    don't know why you're automatically adding people in the
                    group when I add the owner"). A manager who runs a group
                    is not necessarily carrying a number inside it — that is
                    his call to make, one person at a time, below. */}
                <PersonSelect
                  value={head}
                  onChange={setHead}
                  people={memberNames}
                  placeholder="Pick the owner…"
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="flex h-[18px] items-center text-[12px] font-semibold text-text-primary">
              People in the group
            </label>
            {/* TICK THEM, DO NOT ADD THEM ONE AT A TIME (Anir, Aug 29: "I
                think you should have a check box man, you cannot do one by
                one, that's not — doesn't make sense UI point of view"). A
                group is usually built in one sitting from a list you are
                reading anyway, and the old control made that N trips through
                the same menu.

                THE PICKER STILL SITS ABOVE WHAT IT BUILDS (Anir, Aug 12: "when
                I add a person, why do the people show up on top? It should be
                below."). */}
            <div className="mt-1.5">
              <MultiPicker
                options={memberNames.map((m) => ({ id: m, label: m }))}
                selected={members}
                onToggle={(id) =>
                  setMembers((prev) => {
                    if (!prev.includes(id)) return [...prev, id];
                    /* Taking out the person who was crowned leaves a group
                       with no owner, so the crown comes off with them. */
                    if (head === id) setHead("");
                    return prev.filter((x) => x !== id);
                  })
                }
                placeholder="Tick everyone in this group…"
                emptyLabel="Nobody to add"
                ariaLabel="People in the group"
              />
            </div>
            {members.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {members.map((m) => (
                  <span
                    key={m}
                    className="flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2 text-[12px] font-medium text-text-primary"
                  >
                    <Avatar name={m} className="h-5 w-5 text-[8px]" />
                    {m}
                    {m === head && (
                      <Crown size={10} strokeWidth={2.6} className="text-[color:#7C3AED]" />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${m}`}
                      onClick={() => {
                        setMembers((prev) => prev.filter((x) => x !== m));
                        if (head === m) setHead("");
                      }}
                      className="cursor-pointer text-text-tertiary hover:text-error"
                    >
                      <X size={11} strokeWidth={2.4} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <Button
            onClick={save}
            disabled={
              !name.trim() ||
              !head ||
              members.length === 0 ||
              // Editing but nothing changed → nothing to save (Anir, Aug 18:
              // "That should be greyed out unless I change anything").
              (editing !== null &&
                name.trim() === editing.name &&
                head === editing.head &&
                JSON.stringify(members) === JSON.stringify(editing.members))
            }
            loading={busy}
          >
            {editing ? "Save changes" : "Create group"}
          </Button>
        </div>
      </Modal>

      <div className="mt-3 space-y-2">
        {loadFailed ? (
          <div className="rounded-lg bg-surface px-4 py-4 text-center">
            <p className="text-[12.5px] text-text-secondary">
              The groups could not be loaded, so this is not a list of your
              departments.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
            >
              Try again
            </button>
          </div>
        ) : groups === null ? (
          <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
            Loading groups…
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
            No groups yet. Create the first department and pick who owns it.
          </p>
        ) : (
          /* THE SAME TABLE GOAL MASTER USES (Anir, Aug 29: "you need to fix
             this screen, make it look like goal master").

             It was a stack of loose cards, each one packing owner, headcount,
             goal count, money and the verify warning into a single run-on line
             of interpuncts. Goal Master answers the same shape of question with
             real columns and a headed Actions cluster, so the eye goes down a
             column instead of parsing a sentence per row — and two screens that
             list things in one product should not be two different designs.

             Same colgroup-and-thead structure, same row hover, same expand, and
             the same action buttons at the same sizes. */
          <div className="overflow-hidden rounded-2xl border border-border-light bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border-light bg-surface">
                    {["Group", "Owner", "People", "Goals", "Progress"].map((h) => (
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
                  {groups.map((g) => {
                    // The owner belongs in the roster whether or not they were
                    // also added as a member; they are the one person
                    // guaranteed to be in the group.
                    const roster = [
                      ...new Set(
                        [g.head, ...g.members].map((m) => m.trim()).filter(Boolean)
                      ),
                    ];
                    const r = rollup(g);
                    return (
                      <Fragment key={g.id}>
                        {/* CLICKING A GROUP GOES INTO IT (Suren, Aug 29: "I
                            don't want expansion, I don't like this, I don't
                            need expansion at all... he clicks on the group,
                            this screen goes away"). Unfolding a row here meant
                            reading this group's people and goals with nine
                            other groups still on screen: "when I'm not
                            focusing on other things I'm seeing all the other
                            things and I'm getting lost." */}
                        <tr
                          onClick={() => router.push(`/admin/groups/${g.id}`)}
                          className="cursor-pointer transition-colors hover:bg-surface"
                        >
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-2.5">
                              <ChevronRight
                                size={15}
                                strokeWidth={2.2}
                                aria-hidden="true"
                                className="shrink-0 text-text-tertiary"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-semibold text-text-primary">
                                  {g.name}
                                </span>
                                {g.groupType && (
                                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                    {GROUP_TYPE_META[
                                      g.groupType as keyof typeof GROUP_TYPE_META
                                    ]?.label ?? g.groupType}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          {/* Say the word "owner" (Anir, Aug 14: "where is the
                              fucking owner"), and wear their face (Aug 15:
                              "put my profile picture of whoever the owner
                              is") — but in a column of its own now, so it is
                              not competing with four other facts. */}
                          <td className="px-4 py-3.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Crown
                                size={11}
                                strokeWidth={2.6}
                                className="shrink-0 text-[color:#7C3AED]"
                              />
                              <Avatar
                                name={g.head}
                                className="h-5 w-5 shrink-0 text-[7.5px]"
                              />
                              <span className="truncate text-[12.5px] font-semibold text-text-primary">
                                {g.head}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {/* The faces still fan apart on hover (Anir, Aug
                                15: "that animation I like"). */}
                            <PersonFan
                              people={roster.map((m) => ({
                                name: m,
                                role:
                                  m === g.head
                                    ? `Group owner · ${roleLabel(roles[m])}`
                                    : roleLabel(roles[m]),
                                context: g.name,
                              }))}
                              avatarClassName="h-6 w-6 text-[9px]"
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            {r ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-blue-primary">
                                  <ClipboardList size={11} strokeWidth={2.4} />
                                  {r.held} {r.held === 1 ? "goal" : "goals"}
                                </span>
                                {r.waiting > 0 && (
                                  <span className="whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:#B45309] tnum">
                                    {r.waiting} to verify
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[12.5px] text-text-tertiary">.</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {r && r.target > 0 ? (
                              <span className="whitespace-nowrap text-[12.5px] font-semibold text-[color:#0F766E] tnum">
                                {chipMoney(r.achieved)} of {chipMoney(r.target)}
                              </span>
                            ) : (
                              <span className="text-[12.5px] text-text-tertiary">.</span>
                            )}
                          </td>
                          <td className="py-3.5 pl-2 pr-4">
                            <span className="flex items-center justify-end gap-0.5">
                              <Link
                                /* The tab picks a group by ID, so linking the
                                   NAME landed on the page with the first group
                                   selected instead of this one (Anir, Aug 19:
                                   "make sure it actually takes me to that
                                   group, not just the page"). */
                                href={`/performance/groups?group=${encodeURIComponent(g.id)}`}
                                title="See group performance"
                                aria-label={`See ${g.name} on Group performance`}
                                onClick={(e) => e.stopPropagation()}
                                className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                              >
                                <ArrowUpRight size={13} strokeWidth={2.2} />
                              </Link>
                              <button
                                type="button"
                                title={`Edit ${g.name}`}
                                aria-label={`Edit ${g.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(g);
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                              >
                                <Pencil size={13} strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                title={`Remove ${g.name}`}
                                aria-label={`Remove ${g.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRemove(g);
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                              >
                                <Trash2 size={13} strokeWidth={2.2} />
                              </button>
                            </span>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          const g = confirmRemove;
          setConfirmRemove(null);
          if (g) void run({ op: "remove-group", groupId: g.id }, `${g.name} removed`);
        }}
        title="Remove this group?"
        body={
          confirmRemove ? (
            <>
              {/* The name is a blue pill, not bare text in the sentence
                  (Anir, Aug 15: "again, group name has to be in the pill,
                  and blue"). */}
              <NamePill>{confirmRemove.name}</NamePill> disappears from
              Goals. Its people and their goals are untouched. Only the
              grouping goes.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Remove group"
      />
    </div>
  );
}
