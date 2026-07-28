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
  return href === "/offerings" || href.startsWith("/offerings/");
}

// The released module itself. Everything under it travels with it (detail,
// edit, and the master lists that define customer types / markets / types).
const RELEASED_MODULE_PREFIX = "/offerings";

// Pages that are not a MODULE and therefore survive the gate: signing in,
// waiting for approval, your own workspace settings, and the product tour.
// Keep this list tiny — anything added here is something a sales member can
// reach during the offerings-only rollout.
const NON_MODULE_PATHS: ReadonlySet<string> = new Set([
  "/login",
  // The confirmation landing carries the sign-in tokens in its URL.
  "/auth/confirm",
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
  return (
    pathname === RELEASED_MODULE_PREFIX ||
    pathname.startsWith(`${RELEASED_MODULE_PREFIX}/`)
  );
}

/**
 * Who may flip the workspace out of the released view and into the
 * still-being-built modules. Suren, Jul 28: extra modules "should be hidden,
 * especially for the end users (sales members)" — so the switch that reveals
 * them is an admin control, not a menu item every rep can press. Sales and
 * editor accounts stay inside the released app.
 */
export function canSwitchWorkspaceMode(role: string | null | undefined): boolean {
  return role === "admin";
}

// Where the logo / default redirects should land per mode.
export function getHomePath(dataMode: DataMode): "/dashboard" | "/offerings" {
  return isOfferingsOnly(dataMode) ? "/offerings" : "/dashboard";
}
