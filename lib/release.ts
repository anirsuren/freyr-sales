// Production release gating (Suren, Jul 3): "when you roll out to Freyr, I
// don't want them to see any tabs which are not production ready. First
// version — only the Offerings tab. After customers and contacts are done,
// those get released."
//
// Flip with NEXT_PUBLIC_RELEASE_MODE (build-time, set it in Vercel + redeploy):
//   unset / "all"  → the full experience (demo + dev default)
//   "offerings"    → first Freyr rollout: Offerings (+ Settings) only
import type { DataMode } from "./dataMode";

export const RELEASE_MODE: "all" | "offerings" =
  process.env.NEXT_PUBLIC_RELEASE_MODE === "offerings" ? "offerings" : "all";

// Visibility follows the MODE, never the person (Suren): mock mode is the
// end-goal demo — everything under construction shows, for anyone who flips
// to it. Real/live mode is the current released app — Offerings only. As
// modules finish, they graduate from mock into real.
export function isOfferingsOnly(dataMode: DataMode): boolean {
  return dataMode === "live" || RELEASE_MODE === "offerings";
}

export function isReleased(href: string, dataMode: DataMode): boolean {
  if (!isOfferingsOnly(dataMode)) return true;
  // Defer to the one path answer below — this used to check only the module
  // prefixes, so a NON_MODULE path (Admin) rendered fine when you typed the
  // URL but never appeared in the sidebar. Exactly the drift the comment on
  // isReleasedPath warns about (Anir, Aug 12: "where the fuck is the admin
  // page").
  return isOfferingsReleasePath(href);
}

// The released modules. Everything under each one travels with it (detail,
// edit, and the master lists that define customer types / markets / types).
//
// AGENT SHIPPED WITH THE SECOND ROLLOUT (Wajeed, Jul 29, via Anir: Freyr asked
// for "an AI chat layer where end users can ask queries and get responses based
// on all the content and materials available in the app"). The agent was built
// and working, it was simply still behind this gate — so releasing it is the
// feature. It answers grounded in the offerings catalogue itself (see
// lib/knowledgeBase), which is exactly the content real mode carries.
// CUSTOMERS SHIPS WITH THE REAL ACCOUNTS (Anir, Aug 8: "if those are real
// customers, I think we can add the customers page… since those are real
// customers, let's add the customers page"). Sixteen real Freyr accounts are in
// the live workspace and already reachable from FDL Components, so hiding the
// module only meant there was no way to open one. This reverses Saras's Aug 4
// request to hide it temporarily — she asked for that when the module was
// empty, and Anir owns the call.
//
// Reports stays in mock mode: it aggregates revenue across customers and there
// is no revenue recorded yet, so it would open on zeroes.
const RELEASED_MODULE_PREFIXES = [
  "/offerings",
  // The bell's own "View all notifications" link points here. Without this the
  // gate bounced it straight back to /offerings, so the link looked broken
  // (Anir, Aug 13: "pressing 'View all notifications' doesn't even work").
  // Safe to release: in the live workspace this page shows the same account
  // setup rows the bell shows and nothing data-derived.
  "/notifications",
  // FDL Components travels with Offerings — offerings are packages of these
  // components, so the pilot needs both (Anir, Aug 8).
  "/components",
  "/agent",
  // The Team page ships with honest zeros: real workspace members as the
  // roster, every pipeline number 0 until deals exist (Anir, Aug 6).
  "/team",
  "/customers",
  // OPPORTUNITIES ships with Performance: the goal drill-down's fourth level
  // reads these records, so hiding the module would leave line items with no
  // page to manage them from (Suren, Aug 16: "first you start with this then
  // we'll go to a manage opportunity").
  "/opportunities",
  // REPORTS SHIPS WITH THE REAL ACCOUNTS (Suren, Aug 9, via Anir: "you want
  // the reports module in the real mode, correct, with the data from the
  // spreadsheet, with all this data"). It reads getDb(), so in real mode it
  // reports on the real customers and their real offering activity, and the
  // customer-by-offering matrix underneath it is the "everything together"
  // view he was looking for. Nothing here invents numbers: an account with no
  // activity logged shows as empty rather than as a guess.
  "/reports",
  // ONLY the per-rep profile pages travel with Team — clicking a teammate
  // must open them, not bounce to Offerings. The /analytics module root
  // stays unreleased and hidden from navigation.
  "/analytics/reps",
  // PERFORMANCE MANAGEMENT ships with the real goal master (Suren, Aug 11:
  // his goals.xlsx entered as the master list; "do it"). Real mode carries
  // his goal types and goals with no invented numbers — targets and actuals
  // stay empty until the team fills them.
  "/performance",
  // MARKET INTELLIGENCE ships as a DESIGN MOCKUP with sample data (Anir,
  // Aug 10, from Anant's ask; "do this in both real mode and mock mode, I'm
  // wiring it up actually today anyway"). Every page labels itself as a
  // sample-data preview until the real feeds land.
  "/market-intel",
] as const;

// Pages that are not a MODULE and therefore survive the gate: signing in,
// waiting for approval, your own workspace settings, and the product tour.
// Keep this list tiny — anything added here is something a sales member can
// reach during the offerings-only rollout.
const NON_MODULE_PATHS: ReadonlySet<string> = new Set([
  "/login",
  // The confirmation landing carries the sign-in tokens in its URL.
  "/auth/confirm",
  // The password-recovery email lands here before the app session exists.
  "/auth/reset-password",
  "/access-pending",
  "/settings",
  // Running the workspace — user groups and system status. Its own page, not
  // a Settings tab (Anir, Aug 12: "there should be a separate admin page").
  // Without this the page 307s in live mode, so the admin who needs it can
  // never open it; the sections inside are still role-gated.
  "/admin",
  "/onboarding",
]);

/**
 * The one answer to "may this PATH render in the offerings-only release?".
 * Middleware, the app shell and the sidebar all defer to it so the gate can
 * never drift between the server redirect and the client chrome (they used to
 * carry three hand-maintained copies of this list — /access-pending was in two
 * of them and missing from the third).
 */
export function isReleasedPath(pathname: string, dataMode: DataMode): boolean {
  if (!isOfferingsOnly(dataMode)) return true;
  return isOfferingsReleasePath(pathname);
}

/** Mode-free variant for callers that already know they are gated. */
export function isOfferingsReleasePath(pathname: string): boolean {
  if (NON_MODULE_PATHS.has(pathname)) return true;
  return RELEASED_MODULE_PREFIXES.some(
    (m) => pathname === m || pathname.startsWith(`${m}/`)
  );
}

/** Every signed-in workspace role may temporarily preview Mock mode. */
export function canSwitchWorkspaceMode(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "rep";
}

// Where the logo / default redirects should land per mode.
export function getHomePath(dataMode: DataMode): "/dashboard" | "/offerings" {
  return isOfferingsOnly(dataMode) ? "/offerings" : "/dashboard";
}
