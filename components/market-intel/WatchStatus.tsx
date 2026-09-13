"use client";

import { CircleSlash, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { isInactive, watchLabel, type WatchState } from "@/lib/marketIntelWatchState";

/**
 * ACTIVE OR INACTIVE, AND NOTHING ELSE (Anir, Sep 10: "I should clearly be
 * able to distinguish which ones are active, which means someone has it in
 * their list, and which ones are inactive, which means no one has it in their
 * list").
 *
 * Active: collected every day, because the company is on the standing list
 * (Anir, Sep 11: "all of these current ones are active by default") or
 * because at least one person has it on their list. Inactive: a company added
 * later that nobody has, so nothing new is collected. Everything already
 * collected stays, and the first person to tick it starts it again.
 */
export { isInactive, watchLabel };
export type { WatchState };

export function WatchStatus({
  state,
  size = "sm",
  className,
}: {
  state: WatchState;
  size?: "sm" | "md";
  className?: string;
}) {
  const off = isInactive(state);
  const Icon = off ? CircleSlash : Radio;
  /* Status colours, used for a real status: collecting or not. */
  const color = off ? "#5B6B8C" : "var(--ink-green)";
  return (
    <span
      title={
        off
          ? "Nobody has this company on their list, so nothing new is being collected. Everything collected so far is kept. Tick it in Manage companies to start it again."
          : state.followers > 0
            ? `${state.followers} ${state.followers === 1 ? "person has" : "people have"} this on their list, so it is collected every day.`
            : "Active by default, so it is collected every day even when nobody has it on their list."
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]",
        className
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon size={size === "md" ? 13 : 11} strokeWidth={2.2} />
      {watchLabel(state)}
    </span>
  );
}
