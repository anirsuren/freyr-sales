"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Plus, Trash2, UsersRound, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { PersonSelect } from "@/components/performance/bits";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import type { PerfGroup } from "@/lib/performanceShared";

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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [head, setHead] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PerfGroup | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/performance", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setGroups(data.state?.groups ?? []);
      else setGroups([]);
    } catch {
      setGroups([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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

  async function create() {
    const ok = await run(
      { op: "add-group", name, head, members },
      `${name.trim()} created`
    );
    if (ok) {
      setName("");
      setHead("");
      setMembers([]);
      setCreating(false);
    }
  }

  const freeMembers = memberNames.filter((m) => !members.includes(m));

  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <UsersRound size={16} strokeWidth={2} className="text-blue-primary" />
          User groups
          <InfoHint text="A group is a department with an owner. The owner sees their group on Performance; members' goals add up into the group automatically. Goals are never attached to a group — only to its people." />
        </p>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} strokeWidth={2.2} /> New group
          </Button>
        )}
      </div>

      {/* Creating a group is its own popup (Anir, Aug 12: "when I create a
          new group, it should be a pop-up"). */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New user group"
        size="wide"
        tall
      >
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          A group is a department with an owner. Its members&apos; goals add up
          into the group automatically — goals are never attached to a group,
          only to its people.
        </p>
        <div className="mt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-semibold text-text-primary">
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
              <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
                Group owner
                <Crown size={12} strokeWidth={2.4} className="text-[color:#7C3AED]" />
                <InfoHint text="The owner runs this group's performance — they see their people's numbers and can verify them." />
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
            <label className="text-[12px] font-semibold text-text-primary">
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
            onClick={create}
            disabled={!name.trim() || !head || members.length === 0}
            loading={busy}
          >
            Create group
          </Button>
        </div>
      </Modal>

      <div className="mt-3 space-y-2">
        {groups === null ? (
          <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
            Loading groups…
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
            No groups yet — create the first department and crown its owner.
          </p>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl border border-border-light bg-white px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-text-primary">
                  {g.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                  <Crown size={10} strokeWidth={2.6} className="text-[color:#7C3AED]" />
                  {g.head} · {g.members.length}{" "}
                  {g.members.length === 1 ? "person" : "people"}
                </span>
              </span>
              <span className="flex shrink-0 -space-x-1.5">
                {g.members.slice(0, 6).map((m) => (
                  <Avatar
                    key={m}
                    name={m}
                    tooltip={m}
                    className="h-6 w-6 border-2 border-white text-[9px]"
                  />
                ))}
              </span>
              <button
                type="button"
                title={`Remove ${g.name}`}
                aria-label={`Remove ${g.name}`}
                onClick={() => setConfirmRemove(g)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
              >
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))
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
          confirmRemove
            ? `${confirmRemove.name} disappears from Performance. Its people and their goals are untouched — only the grouping goes.`
            : ""
        }
        confirmLabel="Remove group"
      />
    </div>
  );
}
