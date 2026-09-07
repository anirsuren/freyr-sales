"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerLeaveAsker } from "./unsavedGuard";

/**
 * LEAVING WITH UNSAVED WORK COSTS A CLICK, NOT A SHRUG (Anir, Sep 7: "if I
 * press back to deal and I made a change and the save button is on, then it
 * should throw a pop-up: do you really want to leave?").
 *
 * Pass `dirty` (exactly the condition that lights the Save button). While it
 * is true, three things ask before the page goes away:
 *
 * - closing or reloading the tab: the browser's own prompt (`beforeunload`);
 * - any in-app link, sidebar included: caught in the CAPTURE phase before the
 *   router sees it, held back, and released only if the person confirms;
 * - anything that navigates through the router without a link (SmartBack,
 *   the command palette): those call `askBeforeLeaving`, which reaches the
 *   asker this hook registers.
 *
 * The hook holds the navigation as `leaving`; the caller renders its own
 * ConfirmDialog with `open={leaving !== null}`, `stay` on cancel and `leave`
 * on confirm, so every screen keeps its own wording.
 */
export function useLeaveGuard(dirty: boolean): {
  leaving: (() => void) | null;
  stay: () => void;
  leave: () => void;
} {
  const router = useRouter();
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  /* Once the person has chosen to leave, everything passes: the navigation
     is asynchronous and the dirty state is still on screen for a moment. */
  const released = useRef(false);
  useEffect(() => {
    if (!dirty) released.current = false;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (released.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (released.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      /* Only in-app links going somewhere else: a new tab, another host, a
         download or an anchor on this page all pass straight through. */
      if (!href.startsWith("/") || a.target === "_blank" || a.hasAttribute("download")) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(() => () => router.push(href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, router]);

  useEffect(() => {
    if (!dirty) return;
    return registerLeaveAsker((go) => {
      if (released.current) return true;
      setLeaving(() => go);
      return false;
    });
  }, [dirty]);

  return {
    leaving,
    stay: () => setLeaving(null),
    leave: () => {
      const go = leaving;
      released.current = true;
      setLeaving(null);
      go?.();
    },
  };
}
