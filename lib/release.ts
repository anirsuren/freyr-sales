// Production release gating (Suren, Jul 3): "when you roll out to Freyr, I
// don't want them to see any tabs which are not production ready. First
// version — only the Offerings tab. After customers and contacts are done,
// those get released."
//
// Flip with NEXT_PUBLIC_RELEASE_MODE (build-time, set it in Vercel + redeploy):
//   unset / "all"  → the full experience (demo + dev default)
//   "offerings"    → first Freyr rollout: Offerings (+ Settings) only
export const RELEASE_MODE: "all" | "offerings" =
  process.env.NEXT_PUBLIC_RELEASE_MODE === "offerings" ? "offerings" : "all";

export function isReleased(href: string): boolean {
  if (RELEASE_MODE === "all") return true;
  return href === "/offerings" || href.startsWith("/offerings/");
}

// Where the logo / default redirects should land per mode.
export const HOME_PATH = RELEASE_MODE === "all" ? "/dashboard" : "/offerings";
