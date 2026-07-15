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

export function isOfferingsOnly(dataMode: DataMode): boolean {
  return dataMode === "live" || RELEASE_MODE === "offerings";
}

export function isReleased(href: string, dataMode: DataMode): boolean {
  if (!isOfferingsOnly(dataMode)) return true;
  return href === "/offerings" || href.startsWith("/offerings/");
}

// Where the logo / default redirects should land per mode.
export function getHomePath(dataMode: DataMode): "/dashboard" | "/offerings" {
  return isOfferingsOnly(dataMode) ? "/offerings" : "/dashboard";
}
