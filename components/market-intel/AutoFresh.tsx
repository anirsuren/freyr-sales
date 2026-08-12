"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * A briefing tab left open goes quietly stale: the Past-day filter runs on
 * the browser clock while the data stays frozen at page-load, so an old tab
 * drains to "Nothing matches" even after the feed was refreshed (Anir,
 * Aug 12: "there's nothing for the past day still"). Re-pull the server data
 * whenever the tab comes back into focus, plus a slow heartbeat while it
 * stays open. router.refresh() keeps client state (chosen range, search) —
 * only the data behind it updates.
 */
export function AutoFresh({ everyMs = 10 * 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, everyMs);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [router, everyMs]);
  return null;
}
