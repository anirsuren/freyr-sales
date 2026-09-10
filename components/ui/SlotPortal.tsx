"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render children into an element elsewhere on the page, found by id after
 * mount. A tab's buttons live with the tab's own state but show on the tab
 * row above it (the same idea as components/customers/TabActions). Rendering
 * nothing on the first frame is correct: the target only exists once the row
 * has painted.
 */
export function SlotPortal({ target, children }: { target: string; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.getElementById(target));
  }, [target]);
  if (!host) return null;
  return createPortal(children, host);
}
