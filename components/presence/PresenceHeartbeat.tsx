"use client";

import { useEffect } from "react";

/**
 * Tells the workspace this person is still here, once a minute, for as long as
 * a tab is open and visible. Renders nothing.
 *
 * Only while VISIBLE: a tab left open overnight on a locked laptop would
 * otherwise report its owner online until morning, which is exactly the lie
 * the presence work exists to remove. The dot ages to Away on its own once the
 * pings stop, so there is nothing to send on the way out.
 */
const HEARTBEAT_MS = 60_000;

export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/presence", {
        method: "POST",
        keepalive: true,
        cache: "no-store",
      }).catch(() => {
        // Offline or signed out — the next tick tries again.
      });
    };
    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    // Coming back to the tab should update the dot immediately, not on the
    // next minute boundary.
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
