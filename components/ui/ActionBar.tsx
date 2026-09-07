"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OverflowMenu, OVERFLOW_ITEM, OVERFLOW_ITEM_DANGER } from "./OverflowMenu";

/**
 * TWO BUTTONS, THEN THE THREE DOTS.
 *
 * Anir, Sep 6: "I don't like how all the buttons are in these three dots. I
 * think you should have two buttons and then the three dots, and the three
 * dots will have the three other buttons... Anywhere you have a ton of buttons
 * there in the top right, I would probably do that."
 *
 * A header that hides everything behind one glyph makes the common action cost
 * two clicks and a read; a header that shows eight buttons is a wall. This is
 * the middle: the actions come in priority order, the first couple are drawn
 * as real buttons, and the rest go in the menu.
 *
 * The destructive one is never promoted, whatever its position — a delete that
 * sits in the header next to Edit is a delete that gets pressed by accident.
 */

export type BarAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Filled blue, and always first. At most one. */
  primary?: boolean;
  /** Red, and never promoted out of the menu. */
  danger?: boolean;
  /**
   * WHAT THIS ACTION MEANS, IN THE COLOUR THE APP RESERVES FOR IT (Anir,
   * Sep 7: "have a colour for 'mark completed' and 'hand back' and 'cancel
   * it', associated colours, like red for example"). A menu of four grey
   * rows makes finishing something and stopping it look like the same act.
   * Green is done, amber is back in somebody's queue, red is stopped. The
   * icon takes the colour, the label stays readable.
   */
  tone?: "done" | "warn" | "stop";
  disabled?: boolean;
  title?: string;
};

export function ActionBar({
  actions,
  menuLabel,
  /** How many non-primary actions to draw as buttons. A primary counts as one
   *  of them, so a header is never more than three controls wide. */
  promote = 2,
  className,
}: {
  actions: BarAction[];
  menuLabel: string;
  promote?: number;
  className?: string;
}) {
  const live = actions.filter(Boolean);
  const primary = live.find((a) => a.primary) ?? null;
  const rest = live.filter((a) => a !== primary);

  const promotable = rest.filter((a) => !a.danger);
  const slots = Math.max(0, promote - (primary ? 1 : 0));
  const promoted = promotable.slice(0, slots);
  const inMenu = rest.filter((a) => !promoted.includes(a));

  if (!primary && promoted.length === 0 && inMenu.length === 0) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      {primary && (
        <button
          type="button"
          disabled={primary.disabled}
          title={primary.title}
          onClick={primary.onClick}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <primary.icon size={14} strokeWidth={2.4} />
          {primary.label}
        </button>
      )}
      {promoted.map((a) => (
        <button
          key={a.key}
          type="button"
          disabled={a.disabled}
          title={a.title}
          onClick={a.onClick}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <a.icon size={14} strokeWidth={2.2} />
          {a.label}
        </button>
      ))}
      {inMenu.length > 0 && (
        <OverflowMenu label={menuLabel}>
          {inMenu.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              title={a.title}
              onClick={a.onClick}
              className={cn(
                a.danger ? OVERFLOW_ITEM_DANGER : OVERFLOW_ITEM,
                a.tone === "done" && "hover:bg-[rgba(22,163,74,0.08)]",
                a.tone === "warn" && "hover:bg-[rgba(217,119,6,0.08)]",
                a.tone === "stop" && "hover:bg-red-50"
              )}
            >
              <a.icon
                size={14}
                strokeWidth={2.2}
                className={cn(
                  a.tone === "done" && "text-[color:#15803D]",
                  a.tone === "warn" && "text-[color:var(--ink-amber)]",
                  a.tone === "stop" && "text-[color:var(--status-red)]"
                )}
              />
              {a.label}
            </button>
          ))}
        </OverflowMenu>
      )}
    </div>
  );
}
