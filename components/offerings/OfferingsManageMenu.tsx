"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, ChevronDown, Layers, Package, Users } from "lucide-react";

// The three master-list pages were three big header buttons eating the row
// (Suren, Jul 8: "those buttons take up unnecessary space"). Folded into one
// compact "Manage" menu — the stat tiles below still deep-link to the lists.
const LINKS = [
  { href: "/offerings/offering-categories", label: "Offering categories", icon: Layers, color: "#7C3AED" },
  { href: "/offerings/offering-types", label: "Offering types", icon: Package, color: "#0071E3" },
  { href: "/offerings/customer-types", label: "Customer types", icon: Users, color: "#0891B2" },
];

/**
 * THE MENU LEAVES THE PAGE TO OPEN (Anir, Aug 9: "this dropdown is all fucked
 * up, and it doesn't even have an animation thing").
 *
 * Two separate faults. The animation class sat on the CHEVRON rather than the
 * panel, so the thing that actually appeared did so with no motion at all. And
 * the panel was an absolutely-positioned child of the header, which meant that
 * however high its z-index climbed it could only rank inside the header's own
 * stacking context — the filter toolbar below makes its own, and painted a
 * select straight through the open menu. Raising z-index cannot fix that; only
 * leaving the stacking context can.
 *
 * So the panel portals to the body and positions itself from the button's rect,
 * the same escape the chart tooltips and hover cards already use. It follows
 * scroll and resize while open, and Escape closes it.
 */
export function OfferingsManageMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      // Viewport coordinates, because the portalled panel is position: fixed.
      setBox({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[14px] font-semibold rounded-md px-3.5 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
      >
        <SlidersHorizontal size={15} strokeWidth={1.8} />
        Manage
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`opacity-70 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open &&
        box &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Click-away closes the menu and goes no further. This sheet is
                portalled, and React bubbles synthetic events along the React
                tree, so without stopPropagation the dismiss click also reached
                whatever clickable row this menu was declared inside — same bug
                Anir hit on the Edit material dialog (Aug 13). */}
            <div
              className="fixed inset-0 z-[90]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
            />
            <div
              role="menu"
              style={{ top: box.top, right: box.right }}
              className="menu-in fixed z-[91] w-56 rounded-xl border border-border-light bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-1.5"
            >
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Master lists
              </p>
              {LINKS.map((l) => {
                const LIcon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${l.color}14`, color: l.color }}
                    >
                      <LIcon size={13} strokeWidth={2} />
                    </span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
