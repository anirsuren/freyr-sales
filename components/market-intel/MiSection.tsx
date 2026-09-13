"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * WHICH MARKET INTEL ROOM A COMPANY PAGE BELONGS TO (Anir, Sep 11: "It says go
 * back to competitor intelligence, but it says I'm selected customer
 * intelligence").
 *
 * A company lives at /market-intel/<id> with no ?tab=, so the sidebar cannot
 * tell a competitor from a customer by the address. The page knows, and says
 * so by rendering the marker; the sidebar reads it.
 */
export type MiSection = "customers" | "competitors" | "market";

let current: MiSection | null = null;
const listeners = new Set<() => void>();

function publish(next: MiSection | null) {
  if (current === next) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useMiSection(): MiSection | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => null
  );
}

export function MiSectionMarker({ section }: { section: MiSection }) {
  useEffect(() => {
    publish(section);
    return () => publish(null);
  }, [section]);
  return null;
}
