"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

/**
 * FIVE DROPDOWNS BECOME ONE BUTTON — now the app's filter control, not the
 * offerings page's (Anir, Aug 21: "whatever you have here on the offerings
 * page, I like that search bar — the size of it, the filter, the sort. Same
 * thing on FDL components, same thing on Opportunities, same thing on
 * Customers, same on Team. Do it for all the pages").
 *
 * From Saras on the call (Aug 21), carrying rep feedback that named this
 * twice: "should we keep the filters like that instead of each filter showing
 * up here? What we do is what these e-commerce websites do: they keep the
 * filters in two layers. First they just show a button called Filter, and only
 * when you click on that they show you filter by category, by type, by GTM
 * status... when you click on which type of filter you want, they show you the
 * options within that."
 *
 * The row was five coloured selects the width of the page, permanently on
 * screen whether or not anybody was filtering — the single biggest source of
 * the "too busy, too colourful" complaint. One button costs a click and gives
 * the search box the room back.
 *
 * No icons in here, deliberately (Saras, same call: "we can remove the icons
 * for each of the filters... you don't really need the icons for the
 * filters"). The colour dot stays, because a category with no colour at all is
 * the grey the app has spent months getting rid of, and because it is the same
 * colour that category wears everywhere else.
 */
export type FilterOption = {
  value: string;
  label: string;
  color?: string;
  /** Draw a face instead of a dot — owners are people. */
  avatarName?: string;
  /** Draw the company's mark instead of a dot — accounts are companies
   *  (Anir, Aug 22, on the Customer filter's grey dots: "why would u remove
   *  the company logos"). */
  logoName?: string;
};

export type FilterGroup = {
  key: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: FilterOption[];
};

export function FilterMenu({
  groups,
  onClearAll,
}: {
  groups: FilterGroup[];
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const active = groups.reduce((n, g) => n + g.values.length, 0);
  const current = groups.find((g) => g.key === layer) || null;

  // Portalled and positioned from the trigger's rect, the same escape every
  // other popover in this app uses: the toolbar makes its own stacking
  // context, and no z-index inside one can outrank a sibling of it.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = 264;
      setBox({
        top: r.bottom + 6,
        left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8)),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape steps BACK a layer before it closes: a menu that throws away
      // your place on the first press makes the second layer expensive.
      if (layer) setLayer(null);
      else setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, layer]);

  function toggle(group: FilterGroup, value: string) {
    const has = group.values.includes(value);
    group.onChange(
      has ? group.values.filter((v) => v !== value) : [...group.values, value]
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setLayer(null);
        }}
        aria-expanded={open}
        aria-label="Filter offerings"
        className={cn(
          "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
          active > 0 || open
            ? "border-blue-subtle bg-blue-light text-blue-primary"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        <SlidersHorizontal size={14} strokeWidth={2.1} />
        Filter
        {active > 0 && (
          <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-primary px-1 text-[10.5px] font-bold text-white tnum">
            {active}
          </span>
        )}
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Filter offerings"
            style={{ top: box.top, left: box.left, width: 264 }}
            className="menu-in fixed z-[130] overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            {current ? (
              <>
                <div className="flex items-center gap-1.5 border-b border-border-light px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setLayer(null)}
                    aria-label="Back to all filters"
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-blue-primary"
                  >
                    <ChevronLeft size={15} strokeWidth={2.2} />
                  </button>
                  <span className="text-[12.5px] font-semibold text-text-primary">
                    {current.label}
                  </span>
                  {current.values.length > 0 && (
                    <button
                      type="button"
                      onClick={() => current.onChange([])}
                      className="ml-auto cursor-pointer rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-text-tertiary transition-colors hover:text-blue-primary"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto py-1">
                  {current.options.map((option) => {
                    const on = current.values.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggle(current, option.value)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface",
                          on ? "text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {option.logoName ? (
                          <CompanyLogo
                            name={option.logoName}
                            className="h-[18px] w-[18px] shrink-0 text-[6px]"
                          />
                        ) : option.avatarName ? (
                          <Avatar
                            name={option.avatarName}
                            className="h-[18px] w-[18px] shrink-0 text-[7px]"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: option.color || "var(--text-tertiary)" }}
                          />
                        )}
                        <span className="min-w-0 flex-1 break-words">{option.label}</span>
                        {on && (
                          <Check
                            size={13}
                            strokeWidth={2.6}
                            className="shrink-0 text-blue-primary"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="py-1">
                  {groups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setLayer(group.key)}
                      className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                    >
                      <span className="min-w-0 flex-1">{group.label}</span>
                      {group.values.length > 0 && (
                        <span className="shrink-0 rounded-full bg-blue-light px-1.5 text-[10.5px] font-bold text-blue-primary tnum">
                          {group.values.length}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        strokeWidth={2.2}
                        className="shrink-0 text-text-tertiary"
                      />
                    </button>
                  ))}
                </div>
                {active > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-1.5 border-t border-border-light px-2.5 py-2 text-left text-[12px] font-medium text-text-secondary transition-colors hover:text-[color:#DC2626]"
                  >
                    <X size={13} strokeWidth={2.4} />
                    Clear all filters
                  </button>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
