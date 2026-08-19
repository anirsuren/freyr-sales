"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A piece of UI state that survives leaving the page, per person and per
 * browser (Anir, Aug 13: "whatever I last had on the gold master page... that
 * should save"; Aug 19, on the drill-down's height: "this should be
 * customizable and, obviously, saved per user").
 *
 * Lived inside PerformanceModule until the drill-down needed it too. Same
 * implementation, moved out rather than copied: two copies of a storage key
 * convention drift, and then one screen forgets what the other remembered.
 */
export function useStickyValue<T>(
  key: string,
  initial: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* first visit or bad JSON — keep the default */
    }
  }, [key]);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* private mode */
        }
        return resolved;
      });
    },
    [key]
  );
  return [value, set];
}
