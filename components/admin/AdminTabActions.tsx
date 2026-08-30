"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * PUT A SCREEN'S CONTROLS ON THE TAB ROW (Anir, Aug 29: "the new group and the
 * table and the split should go up to the top right, so you can clear the
 * space"; and "apply this to all the other pages too").
 *
 * AdminTabs renders one slot beside the tabs and every panel portals its own
 * buttons into it. Each panel owns its controls' state, so lifting them into
 * AdminTabs would mean lifting the state too; portalling keeps the state where
 * it belongs and moves only the pixels.
 *
 * The slot is looked up in an effect because it does not exist until AdminTabs
 * has committed, and re-looked-up whenever `active` changes: switching tabs
 * unmounts one panel and mounts another, and a stale node captured on the way
 * past renders into a span nobody can see.
 */
export function AdminTabActions({
  active,
  children,
}: {
  /** The tab this panel belongs to, so the lookup re-runs when it changes. */
  active: string;
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("admin-tab-actions"));
  }, [active]);
  if (!slot) return null;
  return createPortal(
    <span className="flex items-center gap-2">{children}</span>,
    slot
  );
}
