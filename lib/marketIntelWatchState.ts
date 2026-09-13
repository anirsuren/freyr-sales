/**
 * ACTIVE OR INACTIVE, AS PLAIN FUNCTIONS. They live outside the "use client"
 * chip so a server page can call them too: a function exported from a client
 * module is only a reference on the server, and calling one there throws. The
 * company page did exactly that the moment it asked whether a company was idle
 * (found Sep 11 walking the flows).
 *
 * Active: collected every day, because the company is on the standing list
 * (Anir, Sep 11: "all of these current ones are active by default") or
 * because at least one person has it on their list. Inactive: a company added
 * later that nobody has, so nothing new is collected.
 */
export type WatchState = { followers: number; byDefault?: boolean };

export function watchLabel(state: WatchState): string {
  if (state.followers > 0) return `Active · ${state.followers} ${state.followers === 1 ? "person" : "people"}`;
  return state.byDefault ? "Active" : "Inactive";
}

/** Not collected: added later, and nobody has it. */
export function isInactive(state: WatchState): boolean {
  return state.followers <= 0 && !state.byDefault;
}
