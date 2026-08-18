"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { ROLE_META, RoleTag, roleKey } from "@/components/ui/RoleTag";
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
  { value: "rep", label: "Rep", color: "#0071E3", icon: UserRound },
  { value: "manager", label: "Manager", color: "#7C3AED", icon: UsersRound },
  { value: "admin", label: "Admin", color: "#0F766E", icon: ShieldCheck },
];

/** Least power to most, so the dialog can say "promoting" or "reducing"
 *  instead of the useless "changing". */
const RANK: Record<string, number> = { rep: 0, manager: 1, admin: 2 };

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
  const [members, setMembers] = useState<Member[] | null>(null);
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

  const people = (members ?? []).filter((m) => m.accountType !== "demo");

  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <ShieldCheck size={16} strokeWidth={2} className="text-blue-primary" />
          Member roles
          <InfoHint
            text={
              "Rep, Manager or Admin. What each person may open and change.\nOnly an admin can change a role, and the server refuses it from anyone else."
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
        <div className="mt-3 space-y-2">
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
              {canEdit ? (
                <div className="w-[170px] shrink-0">
                  <ColorSelect
                    value={
                      ROLE_OPTIONS.some((o) => o.value === m.role) ? m.role : "rep"
                    }
                    onChange={(next) => setPending({ member: m, nextRole: next })}
                    ariaLabel={`${m.name}'s workspace role`}
                    options={ROLE_OPTIONS}
                  />
                </div>
              ) : (
                <RoleTag role={m.role} size="sm" className="w-fit shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

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
  /** "an Admin", "a Manager" — the article follows the word, not the role. */
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
