import { ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * THE THREE ROLES, SAID THE SAME WAY EVERYWHERE.
 *
 * There are exactly three (Anir, Jul 30: "the only roles we have are Rep,
 * Manager, and Admin… in this platform, eventually, it's just those three roles
 * for now"), and the app had been calling each of them something different
 * depending on where you looked: `admin` was "Workspace Admin" in the account
 * menu and "Admin" in the directory; `editor` was "Manager" in the invite
 * picker, "Catalog editor" in the directory and "Offering Editor" in the
 * identity library; `sales` was "Sales Representative", "Sales rep" or "Rep".
 * Invite someone as a Manager, find them listed as a Catalog editor.
 *
 * One vocabulary, one colour, one icon, imported everywhere a role is shown.
 *
 * Colours are identity, not status, so nothing here borrows red, green or
 * amber — those mean something in this app.
 *
 * A personalised job title is a SEPARATE thing and already exists: the free-text
 * "Title" on the profile. That is what says "Senior RA Consultant"; this says
 * what you may do.
 */

export type WorkspaceRoleKey = "admin" | "manager" | "rep";

export const ROLE_META: Record<
  WorkspaceRoleKey,
  { label: string; color: string; icon: LucideIcon; what: string }
> = {
  admin: {
    label: "Admin",
    color: "#0F766E",
    icon: ShieldCheck,
    what: "Invites and approves teammates, and hands out offering ownership",
  },
  manager: {
    label: "Manager",
    color: "#7C3AED",
    icon: UsersRound,
    what: "Runs the catalogue day to day alongside the reps",
  },
  rep: {
    label: "Rep",
    color: "#0071E3",
    icon: UserRound,
    what: "Browses offerings, opens materials and asks the assistant",
  },
};

/** Anything stored (or typed) that is not one of the three reads as Rep — the
 *  least privilege, never the most. */
export function roleKey(role: string | null | undefined): WorkspaceRoleKey {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "editor" || r === "manager") return "manager";
  return "rep";
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_META[roleKey(role)].label;
}

/** The role as a colour + icon tag, the same in the account menu, the member
 *  directory and anywhere else a role appears. */
export function RoleTag({
  role,
  className,
  size = "md",
}: {
  role: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = ROLE_META[roleKey(role)];
  const Icon = meta.icon;
  return (
    <span
      style={
        {
          "--semantic-color": meta.color,
          "--semantic-bg": `${meta.color}1A`,
        } as CSSProperties
      }
      className={cn(
        "semantic-color-pill inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-[3px] text-[11px]" : "px-2.5 py-1 text-[12px]",
        className
      )}
      title={meta.what}
    >
      <Icon size={size === "sm" ? 11 : 13} strokeWidth={2.2} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
