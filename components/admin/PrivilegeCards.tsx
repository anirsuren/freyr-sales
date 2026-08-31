"use client";

import { Check } from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { privilegeColor, type PrivilegeDef } from "@/lib/privileges";
import { cn } from "@/lib/utils";

/**
 * THE PRIVILEGE TICK GRID, IN ONE PLACE.
 *
 * Anir, Aug 31: "why in split view is it different from the table view? That's
 * a huge problem." Split view could hand out all ten privileges and Table view
 * could only set the four-value role, so the same page had two different powers
 * depending on a toggle in the corner — and the one thing an admin actually
 * needed to fix a blocked offering owner was in the half he was not looking at.
 *
 * One component, both views. A capability cannot drift between them again
 * because there is only one of it.
 *
 * EACH TILE CARRIES ITS OWN EXPLANATION (Anir, Aug 31: "I definitely need the
 * question marks on these if I forgot what the roles are"). The blurb comes off
 * the privilege itself, so a renamed or re-described privilege explains itself
 * without anybody editing this file.
 */
export function PrivilegeCards({
  privileges,
  held,
  fromRole,
  active,
  personName,
  onToggle,
  className,
}: {
  privileges: PrivilegeDef[];
  /** Privilege ids this person holds by direct grant. */
  held: Set<string>;
  /** The one their ROLE already stands for — shown held, and locked. */
  fromRole?: string | null;
  /** A suspended person's privileges are frozen. */
  active: boolean;
  personName: string;
  onToggle: (p: { privId: string; privLabel: string; to: boolean }) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-1.5 sm:grid-cols-2",
        className
      )}
    >
      {privileges.map((p) => {
        const on = held.has(p.id);
        /* The badge their ROLE already stands for is shown as held and locked:
           taking it away here would not take it away, because the role puts it
           back on every read. The role dropdown is where that one changes. */
        const viaRole = fromRole === p.id;
        /* Nothing on a suspended person is editable — a privilege you cannot
           exercise is not a privilege (Anir, Aug 30: "if he's suspended, why
           can I change this?"). */
        const locked = viaRole || !active;
        const color = privilegeColor(p.id);
        return (
          <div key={p.id} className="relative">
            <button
              type="button"
              role="checkbox"
              aria-checked={on || viaRole}
              disabled={locked}
              title={
                active
                  ? undefined
                  : `${personName} is suspended, so this cannot change`
              }
              onClick={() =>
                onToggle({ privId: p.id, privLabel: p.label, to: !on })
              }
              /* HELD IS NOT A HINT (Anir, Aug 30: "I don't like the selected
                 thing, it looks so light"). The border is the colour itself
                 and the tint is deep enough to see against white. */
              style={
                on || viaRole
                  ? { borderColor: color, backgroundColor: `${color}1A` }
                  : undefined
              }
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border py-2 pl-2.5 pr-9 text-left",
                "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
                "motion-reduce:transition-none",
                locked
                  ? "cursor-not-allowed"
                  : "cursor-pointer hover:border-blue-primary/50 active:scale-[0.985]",
                !on && !viaRole && "border-border-light bg-white"
              )}
            >
              {/* FILLED, NOT OUTLINED. A solid block of the colour is the
                  strongest thing a small control can say. */}
              <span
                style={
                  on || viaRole
                    ? { borderColor: color, backgroundColor: color, color: "#FFFFFF" }
                    : undefined
                }
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  "transition-[background-color,border-color] duration-200 ease-out motion-reduce:transition-none",
                  !on && !viaRole && "border-border-light"
                )}
              >
                {/* The tick is drawn, not swapped: scaling it up out of nothing
                    is the part that reads as "this just happened". */}
                <Check
                  size={12}
                  strokeWidth={3}
                  aria-hidden="true"
                  className={cn(
                    "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
                    on || viaRole ? "scale-100 opacity-100" : "scale-50 opacity-0"
                  )}
                />
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
            {/* OUTSIDE THE BUTTON, not inside it: a hint nested in a checkbox
                cannot be hovered without arming the checkbox, and a control
                that explains itself must never be the control that changes
                what somebody can do. */}
            {p.blurb && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <InfoHint text={p.blurb} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
