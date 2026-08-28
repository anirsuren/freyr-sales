"use client";

import { useEffect, useState } from "react";

/**
 * A VIEW TOGGLE THAT REMEMBERS.
 *
 * Every list in this app offers tiles or rows, and until now most of them
 * forgot the answer the moment you navigated away (Anir, Aug 9: "you're not
 * saving my preferences for all of these views, like if I choose tiles or
 * rows, etc. You have to save my preferences and apply this everywhere").
 * Choosing a layout is a statement about how you read, not about this one
 * page, so it belongs in storage rather than in a component that unmounts.
 *
 * Reading happens in an effect rather than in the initial state, on purpose:
 * the server renders without localStorage, so seeding state from it directly
 * would hand React a different first paint than the HTML it is hydrating.
 * Starting on the default and correcting immediately after mount is the only
 * version of this that does not warn.
 *
 * Storage failures are swallowed. Private browsing throwing on setItem is not
 * a reason for a page to stop working; it just means this browser will not
 * remember, which is exactly what happened before.
 */
export function useStoredView<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[]
): [T, (next: T) => void, boolean] {
  const [view, setView] = useState<T>(fallback);
  /* The third slot answers "have we actually read storage yet?". The first
   * paint cannot know the saved choice (it lives in the browser), so a page
   * that renders the default view and then swaps LOOKS broken (Anir, Aug 10:
   * "if I'm selecting timeline view only, show me the timeline view... it's
   * glitching"). A caller that gates on this renders one quiet beat instead
   * of one wrong view. Existing two-element destructurings are untouched. */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && (allowed as readonly string[]).includes(saved)) {
        setView(saved as T);
      }
    } catch {
      /* no storage: the default stands */
    }
    setHydrated(true);
    // `allowed` is a literal at every call site, so re-running on its identity
    // would loop; the key is what actually identifies this preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function choose(next: T) {
    setView(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* nothing to remember, the page still works */
    }
  }

  return [view, choose, hydrated];
}

/**
 * THE SAME PREFERENCE, BUT A LIST OF THEM.
 *
 * Which grouped cards somebody has folded shut is a view preference exactly
 * like the view mode above, and it was being thrown away on every navigation
 * (Anir, Aug 28: "also ur not saving if I had it closed or opened"). Folding
 * eleven customer groups to look at the twelfth, then coming back to all
 * eleven open again, is the kind of small forgetting that makes a page feel
 * like it is not listening.
 *
 * Values are opaque strings — a customer name, an offering id — so nothing is
 * validated against an allow-list the way a view mode is. A stale entry for a
 * group that no longer exists is harmless: it matches nothing and is dropped
 * the next time the set is written.
 */
export function useStoredSet(
  key: string
): [string[], (next: string[]) => void, boolean] {
  const [items, setItems] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed))
          setItems(parsed.filter((v): v is string => typeof v === "string"));
      }
    } catch {
      /* no storage, or something wrote junk here: start empty */
    }
    setHydrated(true);
  }, [key]);

  function remember(next: string[]) {
    setItems(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* nothing to remember, the page still works */
    }
  }

  return [items, remember, hydrated];
}
