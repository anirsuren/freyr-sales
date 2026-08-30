"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * THE TAB'S OWN BUTTONS, ON THE TAB ROW.
 *
 * Anir, Aug 30: "Why is the fucking add button and then the import button on
 * a separate line? Move it up. Same for all 3 of those."
 *
 * Each tab owns its actions — Import CSV and Add customer belong to the
 * customers list, New group to the groups list, Add target to targets — and
 * each one was rendering them into its own right-aligned strip directly under
 * the tab pills. Three tabs, three strips, one wasted line each, and the
 * buttons sat a whole row away from the tabs they belong to.
 *
 * Lifting the state up would mean the workspace owning an import file picker,
 * a create dialog and a target form it has no other business with. So the
 * workspace puts an empty slot on the tab row instead and each tab renders
 * ITS buttons into it, keeping its own state where that state is used.
 *
 * The portal target only exists after the workspace has painted, hence the
 * mount pass — rendering nothing on the first frame is correct, not a flash.
 */
export function TabActions({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("customers-tab-actions"));
  }, []);

  if (!host) return null;
  return createPortal(children, host);
}
