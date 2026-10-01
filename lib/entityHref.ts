import { repSlug } from "@/lib/team";

/**
 * EVERY NAME IS A DOOR.
 *
 * Anir, Sep 28, on the deal's People band, where the owner and the people on
 * the deal were faces with no way in: "why can't I click on these guys? I
 * already told you. Throughout the entire app, I should be able to click on
 * these guys and any other assets. Look at every page."
 *
 * So there is ONE place that knows where each kind of record lives, and every
 * face and every logo in the app asks it. A teammate opens the same profile
 * the Team roster opens, a contact opens their contact page, a company opens
 * its account, and so on. Server-safe on purpose: no React in here, so a page
 * rendered on the server can compute the door as easily as a client list can.
 */

/** Names that mean nobody. A placeholder never gets a door, the same list the
 *  deal's People band and lib/recordScope keep. */
const NOBODY = new Set([
  "",
  "unassigned",
  "none",
  "nobody",
  "nobody yet",
  "-",
  "—",
  "·",
  "?",
  "n/a",
  "tbd",
  "unknown",
  "someone",
  "you",
  "system",
]);

export function isSomebody(name: string | null | undefined): name is string {
  return typeof name === "string" && !NOBODY.has(name.trim().toLowerCase());
}

/**
 * A TEAMMATE'S OWN PAGE: the rep profile the Team roster opens. Real mode
 * resolves the slug against the workspace directory and sends an unknown name
 * to /team, so a stale owner name on an imported deal is never a dead end.
 */
export function teammateHref(name: string | null | undefined): string | null {
  return isSomebody(name) ? `/analytics/reps/${repSlug(name.trim())}` : null;
}

/**
 * A CONTACT'S PAGE when the record is known; otherwise the app's search, which
 * is the one door that finds a person from nothing but their name.
 */
export function contactHref(
  id: string | null | undefined,
  name?: string | null
): string | null {
  if (id) return `/contacts/${encodeURIComponent(id)}`;
  return isSomebody(name) ? `/search?q=${encodeURIComponent(name.trim())}` : null;
}

/**
 * A CUSTOMER ACCOUNT by id, or by name through /companies/<name>, which looks
 * the account up and lands on it. Only for names that ARE accounts (a deal's
 * customer, a contract's customer, a meeting's customer): the lookup will open
 * an account for a name it does not know, which is right for those callers and
 * wrong for a competitor or a Market Intel company, so those use their own
 * doors below.
 */
export function customerHref(
  id: string | null | undefined,
  name?: string | null
): string | null {
  if (id) return `/customers/${encodeURIComponent(id)}`;
  const clean = (name ?? "").trim();
  return clean && !NOBODY.has(clean.toLowerCase())
    ? `/companies/${encodeURIComponent(clean)}`
    : null;
}

export function dealHref(id: string): string {
  return `/opportunities/${encodeURIComponent(id)}`;
}
export function offeringHref(id: string): string {
  return `/offerings/${encodeURIComponent(id)}`;
}
export function componentHref(id: string): string {
  return `/components/${encodeURIComponent(id)}`;
}
export function goalHref(id: string): string {
  return `/performance/goal/${encodeURIComponent(id)}`;
}
export function groupHref(id: string): string {
  return `/admin/groups/${encodeURIComponent(id)}`;
}
export function solutioningHref(id: string): string {
  return `/solutioning/${encodeURIComponent(id)}`;
}
export function meetingHref(id: string): string {
  return `/meetings/${encodeURIComponent(id)}`;
}
export function marketCompanyHref(id: string | null | undefined): string | null {
  return id ? `/market-intel/${encodeURIComponent(id)}` : null;
}
export function sessionHref(id: string): string {
  return `/sessions/${encodeURIComponent(id)}`;
}
export function campaignHref(id: string): string {
  return `/campaigns/${encodeURIComponent(id)}`;
}
export function accrualHref(id: string): string {
  return `/revenue-accruals/${encodeURIComponent(id)}`;
}
