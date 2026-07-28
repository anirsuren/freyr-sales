"use client";

import { useEffect, useState } from "react";

export const HOVER_PREFERENCE_KEY = "freyr.hover-preference.v1";
export const HOVER_PREFERENCE_EVENT = "freyr:hover-preference-change";
/** THE hover delay for this entire app. Every popup, on every page, waits
 *  exactly this long before it opens. There is no per-component override and no
 *  user setting any more (Anir, Jul 28: "we need it where it's 0.5 seconds on
 *  every single graph. There should not be any point where, as soon as I hover
 *  over it, it does the popup. Remove that setting, straight up 0.5 seconds.
 *  End of story on every single page"). */
export const DEFAULT_HOVER_DELAY_MS = 500;
export const MAX_HOVER_DELAY_MS = 2000;

export type HoverPreference = {
  enabled: boolean;
  delayMs: number;
};

const DEFAULT_PREFERENCE: HoverPreference = {
  enabled: true,
  delayMs: DEFAULT_HOVER_DELAY_MS,
};

function normalize(value: Partial<HoverPreference> | null): HoverPreference {
  // The delay is FIXED. Anything stored from the old slider is discarded so a
  // previously-saved 0ms cannot resurrect instant popups.
  return {
    enabled: value?.enabled !== false,
    delayMs: DEFAULT_HOVER_DELAY_MS,
  };
}

export function readHoverPreference(): HoverPreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const stored = localStorage.getItem(HOVER_PREFERENCE_KEY);
    return stored ? normalize(JSON.parse(stored)) : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function saveHoverPreference(value: HoverPreference) {
  const next = normalize(value);
  try {
    localStorage.setItem(HOVER_PREFERENCE_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(
    new CustomEvent<HoverPreference>(HOVER_PREFERENCE_EVENT, { detail: next })
  );
}

export function useHoverPreference(): HoverPreference {
  const [preference, setPreference] = useState(DEFAULT_PREFERENCE);

  useEffect(() => {
    setPreference(readHoverPreference());

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<HoverPreference>).detail;
      setPreference(detail ? normalize(detail) : readHoverPreference());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === HOVER_PREFERENCE_KEY) {
        setPreference(readHoverPreference());
      }
    };

    window.addEventListener(HOVER_PREFERENCE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOVER_PREFERENCE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return preference;
}

export function formatHoverDelay(delayMs: number) {
  if (delayMs === 0) return "Instant";
  const seconds = delayMs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)} seconds`;
}
