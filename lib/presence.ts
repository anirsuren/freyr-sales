/**
 * WHO IS ACTUALLY ONLINE.
 *
 * The Member directory used to print "Active" on every row, because `active`
 * is the account-enabled flag — it says the account has not been suspended,
 * not that the person is at their desk. Eight identical green pills told a
 * reader nothing (Anir, Aug 7: "You have to know who is online... obviously
 * they're not all online, this is bullshit").
 *
 * Presence here is derived from ONE real fact: `app_users.last_seen_at`, which
 * the app stamps while a signed-in tab is open (see /api/presence). No
 * simulation, no random seeding — if nobody has the app open, everybody reads
 * Offline, which is the truth.
 *
 * The windows are deliberately forgiving of the one-minute heartbeat: a tab
 * that pinged 90 seconds ago is still online, and a laptop lid closed ten
 * minutes ago reads Away rather than jumping straight to Offline.
 */

export type PresenceKey = "online" | "away" | "offline" | "never";

/** A heartbeat lands every 60s, so 5 minutes survives a couple of misses. */
export const ONLINE_WINDOW_MS = 5 * 60_000;
/** Signed in recently but not right now — stepped away, screen locked. */
export const AWAY_WINDOW_MS = 30 * 60_000;

export function presenceOf(
  lastSeenAt: string | null | undefined,
  now: number = Date.now()
): PresenceKey {
  if (!lastSeenAt) return "never";
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return "never";
  const age = now - seen;
  // A clock skewed slightly into the future still means "here right now".
  if (age < ONLINE_WINDOW_MS) return "online";
  if (age < AWAY_WINDOW_MS) return "away";
  return "offline";
}

export const PRESENCE_META: Record<
  PresenceKey,
  {
    label: string;
    /** What the state means, for the hover title. */
    title: string;
    color: string;
    /** Offline and Never are drawn as an OUTLINE dot, so the two quiet states
     *  are told apart by shape and not by a shade of the same colour. */
    hollow: boolean;
  }
> = {
  online: {
    label: "Online",
    title: "Using the app right now",
    color: "#16A34A",
    hollow: false,
  },
  away: {
    label: "Away",
    title: "Was in the app within the last half hour",
    color: "#D97706",
    hollow: false,
  },
  offline: {
    label: "Offline",
    title: "Not in the app right now",
    color: "#64748B",
    hollow: true,
  },
  never: {
    label: "Never signed in",
    title: "This account has never been used",
    color: "#64748B",
    hollow: true,
  },
};
