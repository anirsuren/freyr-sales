"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * THE ADDRESS BAR SAYS WHICH WORKSPACE YOU ARE LOOKING AT.
 *
 * Anir, Aug 31: "when I switch to mock mode, the header has to literally be
 * like localhost 3006 slash mock mode for every single page... The second I
 * switch between real mode and mock mode, that slash mock mode has to appear
 * right after the 3006."
 *
 * WHY THIS EXISTS AT ALL. The banner across the top already says you are in
 * sample data, but the URL did not — so a screenshot, a pasted link or a tab
 * restored tomorrow carried no trace of which workspace it came from, and two
 * tabs open side by side were indistinguishable in the history menu. The mode
 * is a property of what you are looking at; it belongs in the address.
 *
 * WHY IT IS DONE HERE RATHER THAN IN EVERY LINK. There are hundreds of
 * `<Link>`s and each one writes a bare path, so a prefix added at the toggle
 * would fall off the first time anybody clicked anything. This watches the
 * path instead and corrects the address after each navigation, which covers
 * every link, every redirect and every back button without touching one of
 * them. `replaceState` writes the bar without asking the router for anything,
 * so nothing re-renders and no history entry is spent.
 *
 * THE PREFIX IS A LABEL, NOT THE SWITCH. The cookie is still what decides the
 * mode. A pasted /mock-mode/... URL therefore needs to TELL the app to switch,
 * which is the second half below — otherwise the address would promise sample
 * data and the page would quietly serve real.
 */

const PREFIX = "/mock-mode";

/** Pages that must never wear it: you are not signed in yet, so there is no
 *  workspace to be in a mode of. */
function skip(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next")
  );
}

export function ModeUrlSync({ mode }: { mode: "mock" | "live" }) {
  /* usePathname alone, deliberately: useSearchParams would force every page
     that renders the shell behind a Suspense boundary, and the query is
     already on window.location where this runs. */
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const here = window.location.pathname;
    if (skip(here)) return;

    const hasPrefix = here === PREFIX || here.startsWith(`${PREFIX}/`);
    const suffix = window.location.search;

    if (mode === "mock" && !hasPrefix) {
      window.history.replaceState(null, "", `${PREFIX}${here}${suffix}`);
      return;
    }
    if (mode === "live" && hasPrefix) {
      const bare = here.slice(PREFIX.length) || "/";
      window.history.replaceState(null, "", `${bare}${suffix}`);
    }
  }, [pathname, mode]);

  /**
   * ARRIVING ON A PREFIXED URL WITH THE COOKIE SAYING OTHERWISE — a pasted
   * link, a bookmark, a restored tab. The address is the person's stated
   * intent, so it wins: flip the workspace and reload into it. Without this
   * the URL would say sample data over a page full of live records, which is
   * the one outcome worse than having no prefix at all.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const here = window.location.pathname;
    if (skip(here)) return;
    const hasPrefix = here === PREFIX || here.startsWith(`${PREFIX}/`);
    if (!hasPrefix || mode === "mock") return;

    let cancelled = false;
    fetch("/api/settings/data-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "mock" }),
    })
      .then((r) => {
        if (!cancelled && r.ok) window.location.reload();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only on arrival: the effect above owns every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
