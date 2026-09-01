"use client";

import { Plus } from "lucide-react";

/**
 * ADD ONE, FROM THE TAB THAT SAYS THERE ARE NONE.
 *
 * Anir, Aug 31: "I can add it from the edit page, or I can add it by actually
 * going to that tab and then adding it. Both ways have to be there... Pretty
 * simple, just a pop-up."
 *
 * So this button does not navigate and does not own a dialog. It reports the
 * click upward, and the page opens the same dialog the Edit screen opens —
 * one destination, two doors, no way for them to drift apart.
 */
export function AddToBandButton({
  bandKey,
  label,
  onAdd,
}: {
  bandKey: string;
  /** The band's own word, so the button says "Add submission", not "Add". */
  label: string;
  onAdd: (bandKey: string) => void;
}) {
  /* Singular, because you are adding one thing: "Add submission", not "Add
     submissions". The band labels are plural because they are counts. */
  const one = label.replace(/s$/, "").toLowerCase();

  return (
    <button
      type="button"
      onClick={() => onAdd(bandKey)}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Plus size={13} strokeWidth={2.4} />
      Add {one}
    </button>
  );
}
