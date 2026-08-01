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
  return RELEASED_MODULE_PREFIXES.some(
    (m) => href === m || href.startsWith(`${m}/`)
  );
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
// CUSTOMERS SHIPS WITH THE THIRD ROLLOUT (Saras, Jul 30: "The next module to
// be made will be a 'Customers' module — details on it will come in down the
// line"; unhidden by Anir the same day). In real mode it renders the honest
// empty module — no demo companies — which is the point: Freyr sees the real
// thing it is about to fill, not a mock (same "bare bones" rule as the
// offering Reports tab). Suren's customer-offering heat map lands here.
// REPORTS SHIPS WITH THE CUSTOMER × OFFERING HEAT MAP. It reads the same live
// customer and offering records as those released modules and keeps a full
// version trail inside each customer's existing offering_usage document.
const RELEASED_MODULE_PREFIXES = [
  "/offerings",
  "/agent",
  "/customers",
  "/reports",
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
  return role === "admin" || role === "editor" || role === "sales";
}

// Where the logo / default redirects should land per mode.
export function getHomePath(dataMode: DataMode): "/dashboard" | "/offerings" {
  return isOfferingsOnly(dataMode) ? "/offerings" : "/dashboard";
}
