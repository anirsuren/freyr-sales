"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  ROLE_PRIVILEGE,
  VIEW_ALL,
  privilegesForPerson,
  type PrivilegeState,
} from "@/lib/privileges";

/**
 * ONE PERSON AT A TIME: names down the left, everything about them on the right.
 *
 * Anir, Aug 29, having asked for this shape on User groups: "here also, as I
 * said, I would like the same concept... this has too much information, it's
 * just confusing." And on what goes where: "on the left side, just a name. The
 * right-side details, which is where I need more information."
 *
 * The wide table answers "who can do what" across forty people at once. This
 * answers "what can THIS person do" without forty rows of other people's ticks
 * in the way. Both ship; the toggle above picks.
 */

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  accountType?: string;
};

const ROLE_OPTIONS: ColorOption[] = [
  { value: "bd_member", label: "BD Member", color: "#0071E3" },
  { value: "bd_owner", label: "Owner", color: "#7C3AED" },
  { value: "sol_member", label: "Solutioning Member", color: "#DB2777" },
  { value: "admin", label: "Admin", color: "#0F766E" },
];

/** Least power to most, so a demotion can be told from a promotion. */
const ROLE_RANK: Record<string, number> = {
  bd_member: 0,
  sol_member: 0,
  bd_owner: 1,
  admin: 2,
  rep: 0,
  solutions: 0,
  manager: 1,
};

/* Same colours as the wide table, so a privilege is one colour everywhere. */
const PRIVILEGE_COLORS: Record<string, string> = {
  bd_owner: "#0071E3",
  bd_member: "#4DA3F0",
  bo_owner: "#7C3AED",
  bo_member: "#A78BFA",
  sol_owner: "#DB2777",
  sol_member: "#F472B6",
  delivery_owner: "#C2410C",
  delivery_member: "#FB923C",
  admin: "#0F766E",
  view_all: "#475569",
};

export function PeopleSplit() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [state, setState] = useState<PrivilegeState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPriv, setPendingPriv] = useState<{
    person: string;
    privId: string;
    privLabel: string;
    to: boolean;
  } | null>(null);
  const [pendingRole, setPendingRole] = useState<{
    member: Member;
    nextRole: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch("/api/settings/access", { cache: "no-store" }),
        fetch("/api/privileges", { cache: "no-store" }),
      ]);
      const mData = await mRes.json().catch(() => null);
      const pData = await pRes.json().catch(() => null);
      if (!mRes.ok || !Array.isArray(mData?.members) || !pData?.state) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setMembers(
        (mData.members as Member[])
          .filter((m) => m.accountType !== "demo")
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setState(pData.state as PrivilegeState);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Could not load the directory. Refresh and try again.
      </p>
    );

  if (!members || !state)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-surface px-4 py-4 text-[12.5px] text-text-secondary">
        <Loader2 size={13} className="animate-spin text-blue-primary" /> Loading…
      </p>
    );

  if (members.length === 0)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Nobody in the workspace yet.
      </p>
    );

  const selected =
    members.find((m) => m.id === selectedId) ?? members[0];

  async function savePrivileges(next: PrivilegeState) {
    setState(next);
    setSaving(true);
    try {
      const res = await fetch("/api/privileges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        void load();
        return;
      }
      setState(data.state as PrivilegeState);
    } catch {
      toast("That didn't save.", "error");
      void load();
    } finally {
      setSaving(false);
    }
  }

  function applyPendingPriv() {
    if (!pendingPriv || !state) return;
    const { person, privId, to } = pendingPriv;
    setPendingPriv(null);
    const key =
      Object.keys(state.peoplePrivileges).find(
        (n) => n.trim().toLowerCase() === person.trim().toLowerCase()
      ) ?? person;
    const held = new Set(state.peoplePrivileges[key] ?? []);
    if (to) held.add(privId);
    else held.delete(privId);
    const nextMap = { ...state.peoplePrivileges };
    if (held.size) nextMap[key] = [...held];
    else delete nextMap[key];
    void savePrivileges({ ...state, peoplePrivileges: nextMap });
  }

  async function applyPendingRole() {
    const p = pendingRole;
    setPendingRole(null);
    if (!p) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_role",
          memberId: p.member.id,
          role: p.nextRole,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Could not change the role", "error");
        return;
      }
      toast(
        `${p.member.name} is now ${
          ROLE_OPTIONS.find((o) => o.value === p.nextRole)?.label ?? p.nextRole
        }`
      );
      await load();
    } catch {
      toast("Could not change the role", "error");
    } finally {
      setSaving(false);
    }
  }

  const held = new Set(privilegesForPerson(state, selected.name));
  const fromRole = ROLE_PRIVILEGE[selected.role];

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        {saving && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* LEFT: JUST THE NAME (his words). A running, scrollable list. */}
        <div className="max-h-[640px] overflow-y-auto rounded-xl border border-border-light">
          {members.map((m) => {
            const on = m.id === selected.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-b-0",
                  on
                    ? "bg-blue-light/50 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                    : "hover:bg-surface"
                )}
              >
                <Avatar name={m.name} className="h-7 w-7 shrink-0 text-[9px]" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-semibold",
                      on ? "text-blue-primary" : "text-text-primary"
                    )}
                  >
                    {m.name}
                  </span>
                  {!m.active && (
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      Suspended
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* RIGHT: everything about the one person picked. Keyed on them, so
            clicking a different name replays the entrance instead of silently
            rewriting the pane (Anir, Aug 29: "and of course when I click on
            these things too"). */}
        <div
          key={selected.id}
          className="tab-panel min-w-0 rounded-xl border border-border-light p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={selected.name} className="h-11 w-11 shrink-0 text-[13px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                {selected.name}
              </p>
              <p className="truncate text-[12.5px] text-text-secondary">
                {selected.email}
              </p>
            </div>
            <div className="w-[190px] shrink-0">
              <ColorSelect
                value={
                  ROLE_OPTIONS.some((o) => o.value === selected.role)
                    ? selected.role
                    : "bd_member"
                }
                onChange={(next) =>
                  next !== selected.role &&
                  setPendingRole({ member: selected, nextRole: next })
                }
                ariaLabel={`${selected.name}'s workspace role`}
                options={ROLE_OPTIONS}
              />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              Privileges
            </p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              Tick as many as they need. What they may do in a module is the most
              generous of everything they hold.
            </p>
            <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {state.privileges.map((p) => {
                const on = held.has(p.id);
                /* The badge their ROLE already stands for is shown as held and
                   locked: taking it away here would not take it away, because
                   the role puts it back on every read. The role dropdown above
                   is where that one changes. */
                const viaRole = fromRole === p.id;
                const color = PRIVILEGE_COLORS[p.id] ?? "#0071E3";
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on || viaRole}
                    disabled={viaRole}
                    onClick={() =>
                      setPendingPriv({
                        person: selected.name,
                        privId: p.id,
                        privLabel: p.label,
                        to: !on,
                      })
                    }
                    style={
                      on || viaRole
                        ? { borderColor: `${color}59`, backgroundColor: `${color}12` }
                        : undefined
                    }
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      viaRole
                        ? "cursor-not-allowed"
                        : "cursor-pointer hover:border-blue-primary/50",
                      !on && !viaRole && "border-border-light bg-white"
                    )}
                  >
                    <span
                      style={
                        on || viaRole
                          ? { borderColor: `${color}66`, backgroundColor: `${color}1F`, color }
                          : undefined
                      }
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        !on && !viaRole && "border-border-light text-transparent"
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12.5px] font-semibold"
                        style={{ color: on || viaRole ? color : undefined }}
                      >
                        {p.label}
                      </span>
                      {viaRole && (
                        <span className="block text-[10px] text-text-tertiary">
                          From their role
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingPriv !== null}
        onClose={() => setPendingPriv(null)}
        onConfirm={applyPendingPriv}
        title={pendingPriv?.to ? "Give this privilege?" : "Take this privilege away?"}
        body={
          pendingPriv && (
            <>
              <b>{pendingPriv.person}</b> {pendingPriv.to ? "gets" : "loses"}{" "}
              <b>{pendingPriv.privLabel}</b>.
            </>
          )
        }
        detail={
          pendingPriv?.privId === VIEW_ALL && pendingPriv.to
            ? "View all lets them see every record in a module, including ones nobody assigned them. It never lets them change one. The admins are emailed."
            : "This changes what they can do as soon as you confirm. The admins are emailed."
        }
        confirmLabel={pendingPriv?.to ? "Give it" : "Take it away"}
        /* RED MEANS SOMETHING IS BEING TAKEN (Anir, Aug 29: "I don't like the
           colors here, when I'm giving a privilege the red doesn't make sense,
           it feels like I'm taking away privilege"). Handing somebody a
           privilege is an ordinary affirmative action; only the removal earns
           the destructive treatment. Same rule the app already keeps for
           delete controls. */
        tone={pendingPriv?.to ? "primary" : "destructive"}
        busy={saving}
      />

      <ConfirmDialog
        open={pendingRole !== null}
        onClose={() => setPendingRole(null)}
        onConfirm={() => void applyPendingRole()}
        title="Change their role?"
        body={
          pendingRole && (
            <>
              <b>{pendingRole.member.name}</b> becomes{" "}
              <b>
                {ROLE_OPTIONS.find((o) => o.value === pendingRole.nextRole)
                  ?.label ?? pendingRole.nextRole}
              </b>
              .
            </>
          )
        }
        detail="The role is what they joined as, and what decides their access until somebody ticks a privilege for them."
        confirmLabel="Change it"
        /* A role change is a change, not a removal — unless it demotes. */
        tone={
          pendingRole &&
          ROLE_RANK[pendingRole.nextRole] < ROLE_RANK[pendingRole.member.role]
            ? "destructive"
            : "primary"
        }
        busy={saving}
      />
    </div>
  );
}
