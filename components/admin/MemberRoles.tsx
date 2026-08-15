"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { RoleTag } from "@/components/ui/RoleTag";
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

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/access", { cache: "no-store" });
      const data = await res.json();
      setMembers(res.ok && Array.isArray(data.members) ? data.members : []);
    } catch {
      setMembers([]);
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
              "Rep, Manager or Admin — what each person may open and change.\nOnly an admin can change a role, and the server refuses it from anyone else."
            }
          />
        </p>
        {members && (
          <span className="text-[11.5px] text-text-tertiary tnum">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        )}
      </div>

      {members === null ? (
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
                    onChange={(next) => changeRole(m, next)}
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
    </div>
  );
}
