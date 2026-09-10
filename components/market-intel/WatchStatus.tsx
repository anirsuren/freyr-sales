"use client";

import { PauseCircle, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WHY A COMPANY IS ON THE WATCH, said on its card and its briefing (Anir,
 * Sep 10, and "speak normally"): tracked for everyone (the team's list,
 * admins control it), on somebody's own list (the star), or neither, in
 * which case it is paused: nothing new is collected until somebody adds it
 * to their list again.
 */
export type WatchState = { standing: boolean; followers: number };

export function watchLabel(state: WatchState): string {
  if (state.standing && state.followers > 0)
    return `For everyone · on ${state.followers} ${state.followers === 1 ? "list" : "lists"}`;
  if (state.standing) return "For everyone";
  if (state.followers > 0)
    return `On ${state.followers} ${state.followers === 1 ? "person's list" : "people's lists"}`;
  return "Paused";
}

export function isPaused(state: WatchState): boolean {
  return !state.standing && state.followers === 0;
}

export function WatchStatus({
  state,
  size = "sm",
  className,
}: {
  state: WatchState;
  size?: "sm" | "md";
  className?: string;
}) {
  const paused = isPaused(state);
  const Icon = paused ? PauseCircle : state.standing ? ShieldCheck : Star;
  const color = paused ? "#5B6B8C" : state.standing ? "var(--ink-bright-blue)" : "#B45309";
  return (
    <span
      title={
        paused
          ? "Nobody has this company on their list, so nothing new is collected. Add it to your list to bring it back."
          : state.standing
            ? "Tracked for the whole team. Keeps updating no matter who has it on their list."
            : "On somebody's own list. Keeps updating as long as someone has it on their list."
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]",
        className
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      <Icon size={size === "md" ? 13 : 11} strokeWidth={2.2} fill={!paused && !state.standing ? "currentColor" : "none"} />
      {watchLabel(state)}
    </span>
  );
}
