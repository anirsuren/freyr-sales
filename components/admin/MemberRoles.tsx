"use client";

import { RolesGuide } from "@/components/admin/RolesGuide";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, UserRound, UsersRound, PencilRuler } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { ROLE_META, RoleTag, roleKey } from "@/components/ui/RoleTag";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PrivilegeCards } from "./PrivilegeCards";
import { privilegeColor, ROLE_PRIVILEGE, type PrivilegeState } from "@/lib/privileges";
import { KeyRound, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * WHO IS WHAT, AND WHO GETS TO SAY SO.
 *
 * Changing a teammate's role lived in Settings, next to theme and notification
 * preferences (Anir, Aug 15: "It should not be in the settings. It doesn't
 * make any sense"). Settings is what one person chooses for themselves;
 * deciding that someone is now a Manager is running the workspace, which is
 * what this page is for and why User groups already live here.
 *
 * Admin only, and enforced on the server too: the API refuses a role change
 * from anyone else, so this control being on an admin page is the convenience,
 * not the security.
 */

const ROLE_OPTIONS: ColorOption[] = [
  { value: "bd_member", label: "BD Member", color: "#0071E3", icon: UserRound },
    /* "BD OWNER", NOT "OWNER" (Anir, Aug 31: "it says she's an owner, I don't
     understand"). A bare "Owner" reads as "owns things" — so an Offering Owner
     who held it looked correctly configured while the privilege table was
     refusing her every write. It is the Business DEVELOPMENT owner; the one
     that owns an offering is BO Owner, and lives in the privileges below. */
  { value: "bd_owner", label: "BD Owner", color: "#7C3AED", icon: UsersRound },
  /* THE FOURTH ROLE (Suren, Aug 24: "It is a new role"): fulfils solutioning
     requests, sees the Solutioning module, and nothing an Owner-only module. */
  {
    value: "sol_member",
    label: "Solutioning Member",
    color: "#DB2777",
    icon: PencilRuler,
  },
  { value: "admin", label: "Admin", color: "#0F766E", icon: ShieldCheck },
];

/** Least power to most, so the dialog can say "promoting" or "reducing"
 *  instead of the useless "changing". Keyed on the roles as they are stored
 *  now; the pre-024 words are still listed because a row written before the
 *  migration reads back as `rep` or `manager` and an unranked role would make
 *  every change read as a demotion. */
const RANK: Record<string, number> = {
  bd_member: 0,
  sol_member: 0,
  bd_owner: 1,
  admin: 2,
  rep: 0,
  solutions: 0,
  manager: 1,
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  accountType?: string;
};

export function MemberRoles({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const me = useCurrentUserOrNull();

  /* Email first because it is the one thing that is unique — two people can
     share a name, and this list has several Anirs on it. */
  const isMe = (m: Member) => {
    if (!me) return false;
    const mine = (me.email ?? "").trim().toLowerCase();
    if (mine && m.email.trim().toLowerCase() === mine) return true;
    return !mine && m.name.trim().toLowerCase() === me.name.trim().toLowerCase();
  };
  const [members, setMembers] = useState<Member[] | null>(null);
  /* A SEARCH BOX, BECAUSE THIS IS A DIRECTORY (Anir, Aug 31: "why is there no
     search bar here to search for users"). Forty-one people today and every
     new hire adds one; finding somebody by scrolling stops working long before
     anybody decides to fix it. */
  const [query, setQuery] = useState("");
  /* THE PRIVILEGES, EDITABLE FROM HERE TOO. Table view could only set the
     four-value role, so the ten privileges were reachable only from Split. */
  const [privState, setPrivState] = useState<PrivilegeState | null>(null);
  const [privFor, setPrivFor] = useState<Member | null>(null);
  const [pendingPriv, setPendingPriv] = useState<{
    person: string;
    privId: string;
    privLabel: string;
    to: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The role change waiting on a yes. Nothing is sent until it gets one. */
  const [pending, setPending] = useState<{
    member: Member;
    nextRole: string;
  } | null>(null);
  /** null when the last load worked; otherwise why it did not. */
  const [failed, setFailed] = useState<null | "forbidden" | "error">(null);

  /**
   * A DIRECTORY THAT FAILED TO LOAD IS NOT AN EMPTY WORKSPACE (found Aug 16,
   * opening Admin with no access grant). Every failure — a 403 from an expired
   * grant, a 500, a dropped connection — used to land in the same setMembers([])
   * as a genuinely empty list, and the page then announced "Nobody in the
   * workspace yet." On the one screen whose job is showing who has access,
   * that reads as everybody being gone.
   */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/access", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.members)) {
        /* 403 IS NOT A BROKEN PAGE (Anir, Aug 16: "Can you ever stop this?",
           on the Admin screen telling him his sign-in may have expired). The
           endpoint answers 403 to anyone who is not a workspace owner, which
           is a normal, permanent answer for most people — saying "your sign-in
           expired" sent them to log in again to fix something logging in
           cannot fix. */
        setFailed(res.status === 403 ? "forbidden" : "error");
        setMembers(null);
        return;
      }
      setFailed(null);
      setMembers(data.members);
    } catch {
      setFailed("error");
      setMembers(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(member: Member, nextRole: string) {
    if (member.role === nextRole || busy) return;
    setBusy(member.id);
    try {
      const res = await fetch("/api/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_role",
          memberId: member.id,
          role: nextRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change the role");
      if (Array.isArray(data.directory?.members)) {
        setMembers(data.directory.members);
      } else {
        await load();
      }
      const label = ROLE_OPTIONS.find((o) => o.value === nextRole)?.label ?? nextRole;
      toast(`${member.name} is now ${label}`);
      setPending(null);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not change the role",
        "error"
      );
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/privileges", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.state) setPrivState(d.state as PrivilegeState);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** Write the whole table back, the way the Privileges screen does. */
  async function savePrivileges(next: PrivilegeState) {
    const before = privState;
    setPrivState(next);
    try {
      const res = await fetch("/api/privileges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "That did not save.");
      if (data.state) setPrivState(data.state as PrivilegeState);
    } catch (error) {
      setPrivState(before);
      toast(
        error instanceof Error ? error.message : "Could not change the privilege",
        "error"
      );
    }
  }

  function applyPendingPriv() {
    if (!pendingPriv || !privState) return;
    const { person, privId, to } = pendingPriv;
    setPendingPriv(null);
    const key =
      Object.keys(privState.peoplePrivileges).find(
        (n) => n.trim().toLowerCase() === person.trim().toLowerCase()
      ) ?? person;
    const held = new Set(privState.peoplePrivileges[key] ?? []);
    if (to) held.add(privId);
    else held.delete(privId);
    const nextMap = { ...privState.peoplePrivileges };
    if (held.size) nextMap[key] = [...held];
    else delete nextMap[key];
    void savePrivileges({ ...privState, peoplePrivileges: nextMap });
  }

  /**
   * EVERY PRIVILEGE A PERSON HOLDS, FOR THE ROW BADGES (Anir, Aug 31: "without
   * even clicking on it, I want icons... for these 10 roles"). Their role's
   * badge counts — it is held, it simply cannot be unticked here. The mark is
   * the initials of the label, so a rename carries through on its own.
   */
  function badgesFor(m: Member) {
    if (!privState) return [];
    const direct = heldFor(m.name);
    const viaRole = ROLE_PRIVILEGE[m.role];
    if (viaRole) direct.add(viaRole);
    return privState.privileges
      .filter((p) => direct.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        short: p.label.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      }));
  }

  /** What one person holds by direct grant. */
  function heldFor(name: string): Set<string> {
    const key = Object.keys(privState?.peoplePrivileges ?? {}).find(
      (n) => n.trim().toLowerCase() === name.trim().toLowerCase()
    );
    return new Set(key ? privState!.peoplePrivileges[key] : []);
  }

  const all = (members ?? []).filter((m) => m.accountType !== "demo");
  /* Name or email, because an admin looking for somebody has one or the other
     and rarely both. */
  const q = query.trim().toLowerCase();
  const people = q
    ? all.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q)
      )
    : all;

  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <ShieldCheck size={16} strokeWidth={2} className="text-blue-primary" />
          Member roles
          {/* THE GUIDE SITS WHERE THE ROLES ARE SET (Anir, Aug 30: "I need a
              guide for these roles... when I click it, it should have a pop-up
              that explains the roles"). Beside the heading, so the question
              gets answered at the moment somebody is about to change one. */}
          <RolesGuide />
          <InfoHint
            text={
              "BD Member, Owner, Solutioning Member or Admin. What each person may open and change.\nOnly an admin can change a role, and the server refuses it from anyone else."
            }
          />
        </p>
        {members && (
          <span className="text-[11.5px] text-text-tertiary tnum">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        )}
      </div>

      {failed === "forbidden" ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Only a workspace owner can see who has access. Everything else on
          this page still works.
        </p>
      ) : failed === "error" ? (
        <div className="mt-3 rounded-lg bg-surface px-4 py-4 text-center">
          <p className="text-[12.5px] text-text-secondary">
            The member directory could not be loaded, so this is not a list of
            who has access.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
          >
            Try again
          </button>
        </div>
      ) : members === null ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Loading the directory…
        </p>
      ) : people.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Nobody in the workspace yet.
        </p>
      ) : (
        <div className="mt-3">
          {/* SEARCH, BECAUSE THIS IS A DIRECTORY (Anir, Aug 31). */}
          <div className="relative mb-2.5">
            <Search
              size={15}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name or email…"
              aria-label="Search people"
              className="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
          {q && (
            <p className="mb-2 text-[12px] text-text-tertiary">
              {people.length} of {all.length} people
            </p>
          )}
          {people.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
              Nobody matches “{query}”.
            </p>
          ) : (
          <div className="space-y-2">
          {people.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border-light bg-white px-3.5 py-2.5"
            >
              <Avatar name={m.name} className="h-8 w-8 shrink-0 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-text-primary">
                    {m.name}
                  </span>
                  {/* WHICH ONE OF THESE IS ME (Anir, Aug 29: "whoever I am
                      needs to have a proper label on this page, like it should
                      say You, just like it does on the other pages"). Forty
                      rows of names and one of them decides what he himself can
                      do — the same pill the performance pickers and the
                      offering owners use, so it reads as the app's one way of
                      saying this rather than a new one invented here. */}
                  {isMe(m) && (
                    <span className="shrink-0 rounded-full bg-blue-light px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                      You
                    </span>
                  )}
                  {!m.active && (
                    <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                      Suspended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-text-secondary">
                  {m.email}
                </span>
              </span>
              {/*
                THE DROPDOWN STAYS (Anir, Aug 29: "you can keep the dropdown...
                keep whatever dropdown you had before, it's fine").

                I had replaced it with read-only chips on the reading that four
                options could not express ten privileges. They are two different
                facts, though: this is the ROLE somebody joined as — one value,
                which is what an invite sets and what lib/privileges falls back
                to for anyone nobody has ticked yet. The ten privileges are the
                ticks table below, where a person can hold several.

                So both, and each one editable where it belongs.
              */}
              {canEdit ? (
                <div className="w-[170px] shrink-0">
                  <ColorSelect
                    value={
                      ROLE_OPTIONS.some((o) => o.value === m.role) ? m.role : "bd_member"
                    }
                    onChange={(next) => setPending({ member: m, nextRole: next })}
                    ariaLabel={`${m.name}'s workspace role`}
                    options={ROLE_OPTIONS}
                  />
                </div>
              ) : (
                <RoleTag role={m.role} size="sm" className="w-fit shrink-0" />
              )}
              {/* WHAT THEY HOLD, AT A GLANCE. Same badges the split roster
                  draws, so a person reads the same on both screens. Capped so
                  somebody with six does not push the controls off the row. */}
              {(() => {
                const b = badgesFor(m);
                if (!b.length) return null;
                const shown = b.slice(0, 4);
                return (
                  <span className="flex shrink-0 items-center gap-1">
                    {shown.map((p) => (
                      <span
                        key={p.id}
                        title={p.label}
                        aria-label={p.label}
                        style={{
                          backgroundColor: `${privilegeColor(p.id)}1F`,
                          color: privilegeColor(p.id),
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold"
                      >
                        {p.short}
                      </span>
                    ))}
                    {b.length > shown.length && (
                      <span className="text-[10px] font-semibold text-text-tertiary">
                        +{b.length - shown.length}
                      </span>
                    )}
                  </span>
                );
              })()}
              {/* THE SAME POWER SPLIT VIEW HAS (Anir, Aug 31: "why in split
                  view is it different from the table view? That's a huge
                  problem"). The role dropdown sets the one value the database
                  allows; this opens the ten privileges, which is where BO
                  Owner — the one an offering owner actually needs — lives. */}
              <button
                type="button"
                onClick={() => setPrivFor(m)}
                aria-label={`Privileges for ${m.name}`}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
              >
                <KeyRound size={13} strokeWidth={2.2} />
                {(() => {
                  const n = heldFor(m.name).size;
                  return n ? `${n} privilege${n === 1 ? "" : "s"}` : "Privileges";
                })()}
              </button>
            </div>
          ))}
          </div>
          )}
        </div>
      )}

      {/* ONE PERSON'S PRIVILEGES, THE SAME GRID SPLIT VIEW DRAWS. */}
      <Modal
        open={privFor !== null}
        onClose={() => setPrivFor(null)}
        title={privFor ? `Privileges for ${privFor.name}` : "Privileges"}
        size="wide"
        tall
        dialogClassName="!h-[min(560px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        {privFor && privState && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-[12.5px] text-text-secondary">
              Tick as many as they need. What they may do in a module is the most
              generous of everything they hold.
            </p>
            <PrivilegeCards
              privileges={privState.privileges}
              held={heldFor(privFor.name)}
              fromRole={ROLE_PRIVILEGE[privFor.role] ?? null}
              active={privFor.active}
              personName={privFor.name}
              onToggle={({ privId, privLabel, to }) =>
                setPendingPriv({ person: privFor.name, privId, privLabel, to })
              }
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingPriv !== null}
        onClose={() => setPendingPriv(null)}
        onConfirm={applyPendingPriv}
        title={pendingPriv?.to ? "Give this privilege?" : "Take this privilege away?"}
        body={
          pendingPriv && (
            <>
              <b>{pendingPriv.person}</b> {pendingPriv.to ? "gets" : "loses"}{" "}
              <b>{pendingPriv.privLabel}</b>. It changes what they can do the next
              time they load a page.
            </>
          )
        }
      />

      {/* A ROLE CHANGE ASKS FIRST (Anir, Aug 15: "whenever I'm changing
          someone from rep to admin, or maybe from admin to rep... it should
          ask me for confirmation... show their profile picture, show their
          name, show the tag and the colour and the pill"). Picking in the
          dropdown no longer writes anything; it opens this, and only the
          confirm sends. Handing someone Admin, or taking it away, changes
          what a real colleague can do the next time they sign in. */}
      <RoleChangeDialog
        pending={pending}
        busy={busy !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) void changeRole(pending.member, pending.nextRole);
        }}
      />
    </div>
  );
}

function RoleChangeDialog({
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  pending: { member: Member; nextRole: string } | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const member = pending?.member;
  const fromKey = roleKey(member?.role);
  const toKey = roleKey(pending?.nextRole);
  const promoting = RANK[toKey] > RANK[fromKey];
  const first = member?.name.trim().split(/\s+/)[0] || "They";
  /** "an Admin", "an Owner", "a BD Member" — the article follows the word. */
  const a = (label: string) => (/^[AEIOU]/i.test(label) ? "an" : "a");
  const toLabel = ROLE_META[toKey].label;
  const fromLabel = ROLE_META[fromKey].label;

  return (
    <Modal
      open={pending !== null}
      onClose={onClose}
      title={promoting ? "Give them more access?" : "Reduce their access?"}
    >
      {member && (
        <>
          <div className="rounded-xl border border-border-light bg-surface px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Avatar name={member.name} className="h-11 w-11 shrink-0 text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-text-primary">
                  {member.name}
                </span>
                {/* Not truncated: the whole point of this dialog is being sure
                    WHO you are about to change, and half an address does not
                    tell you that. It wraps instead. */}
                <span className="mt-0.5 block break-all text-[12px] text-text-secondary">
                  {member.email}
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 border-t border-border-light pt-2.5">
              <RoleTag role={fromKey} size="sm" />
              <ArrowRight
                size={15}
                strokeWidth={2.4}
                aria-label="becomes"
                className="text-text-tertiary"
              />
              <RoleTag role={toKey} size="sm" />
            </div>
          </div>

          <p className="mt-3.5 text-[13.5px] leading-relaxed text-text-primary">
            {promoting
              ? `${first} gets everything ${a(toLabel)} ${toLabel} can do.`
              : `${first} loses what ${a(fromLabel)} ${fromLabel} can do.`}{" "}
            As {a(toLabel)} {toLabel}, {ROLE_META[toKey].what.toLowerCase()}.
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
            It takes effect the next time they load a page. You can change it
            back here at any time.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onConfirm} loading={busy}>
              {promoting
                ? `Make ${first} ${a(toLabel)} ${toLabel}`
                : `Move ${first} to ${toLabel}`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
