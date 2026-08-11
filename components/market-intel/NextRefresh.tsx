"use client";

import { useEffect, useState } from "react";

/**
 * The clock part of the live chip: when the feed last refreshed and when the
 * next of the two daily runs lands. Rendered in the browser so the times are
 * in the viewer's own timezone (the server runs on UTC in production).
 */
const REFRESH_EVERY_MS = 11 * 60 * 60 * 1000;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RefreshClock({ updatedAt }: { updatedAt: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!updatedAt) return;
    const last = Date.parse(updatedAt);
    if (Number.isNaN(last)) return;
    const next = last + REFRESH_EVERY_MS;
    setLabel(
      next <= Date.now()
        ? `last ${clock(last)} · refreshing now`
        : `last ${clock(last)} · next ~${clock(next)}`
    );
  }, [updatedAt]);

  if (!label) return null;
  return <> · {label}</>;
}
