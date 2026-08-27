"use client";

import { useEffect } from "react";

/**
 * ESCAPE CLOSES IT, WHATEVER "IT" IS.
 *
 * Anir has said this about menus more than once ("when I click outside these
 * dropdowns, it's supposed to toggle off"), and the click-away half was
 * always built. Escape was the half that kept getting forgotten — a
 * backdrop-and-panel menu is hand-rolled each time, and the keyboard is easy
 * to leave out when the mouse works.
 *
 * So it stops being a thing to remember. One hook: pass whether the thing is
 * open and how to shut it, and Escape works. Found by the loop's own sweep,
 * which now fails when a menu opens and Escape does not close it.
 *
 * stopImmediatePropagation, because these menus nest inside pages that also
 * listen for Escape (a modal behind a dropdown must not close too — the
 * dropdown is what the key was for).
 */
export function useEscapeToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // `close` is a setState wrapper at every call site; re-subscribing on a
    // new identity each render would thrash the listener for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
