import { PencilRuler, ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * THE ROLES, SAID THE SAME WAY EVERYWHERE — AND THEY ARE PRIVILEGES NOW.
 *
 * Suren, Aug 29: "these are the roles from now on. I need this executed… we
 * are removing sales rep. Sales rep is now BD member. Owner is the new
 * manager." And: "literally everywhere has to be up to date now, a full
 * transformation."
 *
 * So Rep and Manager are gone from the product. The stored value against each
 * account is unchanged — renaming a column every auth path reads is a
 * migration with a lockout at the end of it — but what it MEANS, and what it
 * is called in front of anybody, is the privilege vocabulary from
 * lib/privileges:
 *
 *   rep       -> BD Member
 *   manager   -> Owner
 *   admin     -> Admin
 *   solutions -> Solutioning Member
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

export type WorkspaceRoleKey = "admin" | "bd_owner" | "bd_member" | "sol_member";

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
  bd_owner: {
    label: "Owner",
    color: "#7C3AED",
    icon: UsersRound,
    what: "Runs a group and the numbers inside it. What used to be Manager.",
  },
  bd_member: {
    label: "BD Member",
    color: "#0071E3",
    icon: UserRound,
    what: "Works accounts and opportunities in a business development group.",
  },
  /* THE FOURTH ROLE (Suren, Aug 24: "It is a new role"). The solution team
     picks up presentation, submission and meeting requests and builds the
     deliverables. Pink is identity, not status, and none of the other three
     wear it. */
  sol_member: {
    label: "Solutioning Member",
    color: "#DB2777",
    icon: PencilRuler,
    what: "Picks up solutioning requests and builds the deliverables",
  },
};

/** Anything stored (or typed) that is not one of the four reads as BD Member —
 *  the least privilege, never the most. */
export function roleKey(role: string | null | undefined): WorkspaceRoleKey {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "editor" || r === "bd_owner") return "bd_owner";
  if (r === "sol_member" || r === "solution") return "sol_member";
  return "bd_member";
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
  /**
   * AN UNKNOWN ROLE IS NOT "REP" (bug, Anir, Aug 15: "in user groups, it says
   * I'm a rep. What the fuck? That can be very misleading").
   *
   * roleKey() falls back to "bd_member" so callers always get a key, which is right
   * for logic and wrong for a label: a directory lookup that misses — a name
   * that does not match, a directory that has not loaded — then printed a
   * confident "BD Member" next to an admin. Nothing is better than wrong here.
   */
  if (!role || !role.trim()) return null;
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
