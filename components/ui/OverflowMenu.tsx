"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useEscapeToClose } from "@/components/ui/useDismissable";
import { floatingMenuStyle, type FloatingMenuStyle } from "@/components/ui/ColorSelect";
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
  const ref = useRef<HTMLDivElement>(null);

  /**
   * PORTALLED, LIKE EVERY OTHER MENU IN THIS APP.
   *
   * Anir, Sep 1, looking straight through it: "Come on, fucking fix this
   * shit." The panel had bg-white and z-50 and was still see-through — z-index
   * is scoped to a stacking context, and this menu lives inside the record
   * header while the chips it was overlapping live in a sibling that paints
   * later. No z-50 inside the header can ever beat them.
   *
   * ColorSelect solved this long ago by rendering to document.body and
   * positioning from the trigger's rect, which escapes every ancestor. Same
   * helper, same behaviour, so this menu flips above the trigger near the
   * bottom of the window exactly like the app's other dropdowns.
   */
  const [menuStyle, setMenuStyle] = useState<FloatingMenuStyle | null>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setMenuStyle(floatingMenuStyle(rect, 232, 220));
    setOpen(true);
  };

  /* A scroll or a resize moves the trigger out from under a menu that is
     pinned to the viewport, so the menu closes rather than hanging in space. */
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
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
      {open &&
        menuStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* A click anywhere else closes it. Below the panel, so a click on
                a row still reaches the row. */}
            <button
              type="button"
              className="fixed inset-0 z-[999] cursor-default"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              /* Any click inside closes it: every row here either fires an
                 action or opens a dialog, and either way the menu is done. */
              onClick={() => setOpen(false)}
              style={menuStyle}
              className="z-[1000] flex flex-col gap-0.5 overflow-y-auto rounded-xl border border-border-light bg-white p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
            >
              {children}
            </div>
          </>,
          document.body
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
