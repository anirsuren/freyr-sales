"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useEscapeToClose } from "@/components/ui/useDismissable";
import { cn } from "@/lib/utils";

/**
 * ONE PRIMARY ACTION, EVERYTHING ELSE BEHIND A "···".
 *
 * Anir, Sep 1, counting the buttons on a request: "There are so many buttons
 * here. Do we need all these? Be honest."
 *
 * Each of them was correctly gated — he saw five because he happened to be the
 * admin AND the requester AND it was unowned AND not finished, so every branch
 * fired at once. Correct, and still wrong to look at: two filled blue buttons
 * competed for "the thing to do", and the destructive one sat in the same row
 * at the same weight as the everyday one.
 *
 * Nothing is REMOVED here — every action a person could reach before, they can
 * still reach. What changes is that the page states its one obvious next step
 * and puts the rest one click away, which is the difference between a header
 * that instructs and a header that presents a menu of five equals.
 */
export function OverflowMenu({
  label = "More actions",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(open, () => setOpen(false));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-colors",
          open
            ? "border-blue-primary bg-blue-light/40 text-blue-primary"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        <MoreHorizontal size={17} strokeWidth={2} />
      </button>
      {open && (
        <>
          {/* A click anywhere else closes it, and the sheet is BELOW the menu
              so a click on an item still reaches the item. */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            /* Any click inside closes it: every row in here either fires an
               action or opens a dialog, and in both cases the menu is done. */
            onClick={() => setOpen(false)}
            className="absolute right-0 z-50 mt-2 flex w-[232px] flex-col gap-0.5 rounded-xl border border-border-light bg-white p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/** The shape every row in that menu wears, so they cannot drift apart. */
export const OVERFLOW_ITEM =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-text-primary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

/** The same row, for the one that destroys something. */
export const OVERFLOW_ITEM_DANGER =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-error transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
