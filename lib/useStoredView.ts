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
