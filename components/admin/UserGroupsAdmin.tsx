"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
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
import { PersonSelect } from "@/components/performance/bits";
import { InfoHint } from "@/components/ui/InfoHint";
import { RoleTag, roleLabel } from "@/components/ui/RoleTag";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { PerformanceState, PerfGroup } from "@/lib/performanceShared";
import { actualValue, isPending } from "@/lib/performanceShared";

/**
 * USER GROUPS LIVE IN ADMIN, NOT IN PERFORMANCE (Suren, Aug 12: "creating
 * user groups and people typically should not be a function in the
 * performance side"). Create a department here, crown its owner, add its
 * people — the Performance module only READS these: the owner sees their
 * group's numbers, members' goals roll up automatically.
 */
export function UserGroupsAdmin({ memberNames }: { memberNames: string[] }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<PerfGroup[] | null>(null);
  /** The same performance state the rooms read, for the glance chips. */
  const [perf, setPerf] = useState<PerformanceState | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [head, setHead] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PerfGroup | null>(null);
  /** Set while editing an existing group — the same popup, prefilled. */
  const [editing, setEditing] = useState<PerfGroup | null>(null);
  /** Which group is unfolded to show who is actually in it (Anir, Aug 15:
   *  "it's not even showing me the groups, like who's in this group"). A row
   *  that only counts heads makes you open the editor to answer that. */
  // Several groups open at once (Anir, Aug 17: "I should be able to open up
  // multiple of these — it shouldn't close").
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
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
          // No role recorded means no role shown — coercing to "rep" is how
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
    const people = new Set(
      [g.head, ...g.members].map((n) => n.trim().toLowerCase())
    );
    const inGroup = (name: string) => people.has(name.trim().toLowerCase());
    const held = perf.goals.filter(
      (goal) =>
        goal.pickedForOrg !== false &&
        (goal.subgoals.some((s) => s.people.some((p) => inGroup(p.name))) ||
          (goal.assignments ?? []).some((a) => inGroup(a.person)))
    );
    let target = 0;
    let achieved = 0;
    for (const goal of held) {
      if (goal.unit !== "currency") continue;
      for (const sub of goal.subgoals)
        for (const p of sub.people) if (inGroup(p.name)) target += p.target || 0;
      for (const a of goal.assignments ?? [])
        if (inGroup(a.person)) target += a.target || 0;
      for (const name of [g.head, ...g.members]) {
        achieved += actualValue(perf.actuals, goal, { person: name });
      }
    }
    const waiting = perf.actuals.filter(
      (a) => inGroup(a.person) && isPending(a)
    ).length;
    return { held: held.length, target, achieved, waiting };
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
      toast(error instanceof Error ? error.message : "That didn't save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Neither field fills the other in. Adding a person used to quietly crown
  // them when no owner was set yet — the same surprise as the owner adding
  // themselves to the roster. Two questions, two answers, both his.
  function addMember(m: string) {
    const clean = m.trim();
    if (!clean || members.includes(clean)) return;
    setMembers((prev) => [...prev, clean]);
  }

  function openCreate() {
    setEditing(null);
    setName("");
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
          { op: "update-group", groupId: editing.id, name, head, members },
          `${name.trim()} saved`
        )
      : await run({ op: "add-group", name, head, members }, `${name.trim()} created`);
    if (ok) {
      setName("");
      setHead("");
      setMembers([]);
      closeEditor();
    }
  }

  const freeMembers = memberNames.filter((m) => !members.includes(m));

  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <UsersRound size={16} strokeWidth={2} className="text-blue-primary" />
          User groups
          <InfoHint text={"A group is a department with an owner.\nThe owner sees their group on Performance; members' goals add up into the group automatically.\nGoals are never attached to a group, only to its people."} />
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
            {/* THE PICKER SITS ABOVE WHAT IT BUILDS (Anir, Aug 12: "when I add
                a person, why do the people show up on top? That doesn't make
                any sense. It should be below."). You reach for the same
                control every time, and the group grows downward under it. */}
            <div className="mt-1.5">
              <PersonSelect
                value=""
                onChange={(next) => next && addMember(next)}
                people={freeMembers}
                placeholder="Add a person…"
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
          groups.map((g) => {
            const open = openIds.has(g.id);
            // The owner belongs in the roster whether or not they were also
            // added as a member; they are the one person guaranteed to be in
            // the group.
            const roster = [
              ...new Set(
                [g.head, ...g.members].map((m) => m.trim()).filter(Boolean)
              ),
            ];
            return (
            <div
              key={g.id}
              className="overflow-hidden rounded-xl border border-border-light bg-white"
            >
            {/* More air top and bottom: the faces were grazing the card's own
                edge (Anir, Aug 19: "my profile picture is kind of hitting the
                top, give a little bit more gap"). */}
            <div className="flex items-center gap-3 px-3.5 py-4">
              {/* The whole left side is the toggle: the row answers "who is in
                  here" without sending you into the editor to find out. */}
              <button
                type="button"
                onClick={() =>
                  setOpenIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.id)) next.delete(g.id);
                    else next.add(g.id);
                    return next;
                  })
                }
                aria-expanded={open}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg text-left"
              >
                <ChevronDown
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-text-tertiary transition-transform",
                    open && "rotate-180 text-blue-primary"
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">
                    {g.name}
                  </span>
                  {/* Say the word "owner" (Anir, Aug 14: "where is the fucking
                      owner"). A crown next to a name reads as just another
                      member unless it is spelled out. */}
                  {/* The owner wears their own face (Anir, Aug 15: "when you
                      say owner, put my profile picture of whoever the owner
                      is"). A name in bold reads like any other name. */}
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                    <Crown size={10} strokeWidth={2.6} className="shrink-0 text-[color:#7C3AED]" />
                    Owner
                    <Avatar name={g.head} className="h-5 w-5 shrink-0 text-[7.5px]" />
                    <b className="font-semibold text-text-primary">{g.head}</b> ·{" "}
                    {roster.length}{" "}
                    {roster.length === 1 ? "person" : "people"}
                    {(() => {
                      const r = rollup(g);
                      if (!r) return null;
                      return (
                        <>
                          {" · "}
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-primary">
                            <ClipboardList size={10} strokeWidth={2.4} />
                            {r.held} {r.held === 1 ? "goal" : "goals"}
                          </span>
                          {r.target > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-[color:#0F766E] tnum">
                                {chipMoney(r.achieved)} of {chipMoney(r.target)}
                              </span>
                            </>
                          )}
                          {r.waiting > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-[color:#B45309] tnum">
                                {r.waiting} to verify
                              </span>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </span>
                </span>
              </button>
              {/* The faces fan apart on hover, the same mechanic as Offerings
                  and the campaigns row (Anir, Aug 15: "do the same thing with
                  the profile pictures... that animation I like"). */}
              <Link
                /* The tab picks a group by ID, so linking the NAME landed on
                   the page with the first group selected instead of this one
                   (Anir, Aug 19: "make sure it actually takes me to that
                   group, not just the page"). */
                href={`/performance/groups?group=${encodeURIComponent(g.id)}`}
                title="See group performance"
                aria-label={`See ${g.name} on Group performance`}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
              >
                <ArrowUpRight size={14} strokeWidth={2.2} />
              </Link>
              <span className="shrink-0">
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
              </span>
              <button
                type="button"
                title={`Edit ${g.name}`}
                aria-label={`Edit ${g.name}`}
                onClick={() => openEdit(g)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
              >
                <Pencil size={13} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                title={`Remove ${g.name}`}
                aria-label={`Remove ${g.name}`}
                onClick={() => setConfirmRemove(g)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[color:#DC2626] transition-colors hover:bg-error/10 hover:text-error"
              >
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </div>
            {open && (
              <div className="tab-panel border-t border-border-light px-3.5 py-3">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  In this group
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {roster.map((m) => (
                    <div
                      key={m}
                      className="flex items-center gap-2.5 rounded-lg border border-border-light bg-white px-2.5 py-2"
                    >
                      <Avatar name={m} className="h-7 w-7 shrink-0 text-[10px]" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                        {m}
                      </span>
                      {m === g.head && (
                        <Crown
                          size={11}
                          strokeWidth={2.6}
                          aria-label="Group owner"
                          className="shrink-0 text-[color:#7C3AED]"
                        />
                      )}
                      <RoleTag role={roles[m]} size="sm" className="shrink-0" />
                    </div>
                  ))}
                </div>
                {/* No "Add or remove people" link: the pencil on the row above
                    already opens the editor (Anir, Aug 15: "we don't need the
                    add or remove people because there's already an edit
                    button"). */}
              </div>
            )}
            </div>
            );
          })
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
              Performance. Its people and their goals are untouched. Only the
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
