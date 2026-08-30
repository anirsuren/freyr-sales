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

/** Two columns side by side: the categories, and the options in one of them. */
const LEFT_W = 168;
const PANEL_W = 430;
const PANEL_H = 300;

export function FilterMenu({
  groups,
  onClearAll,
  ariaLabel = "Filter offerings",
}: {
  groups: FilterGroup[];
  onClearAll: () => void;
  /** What this particular button filters. The default is the page this
   *  control started on; every other caller says its own noun, so a screen
   *  reader on the Goal Master does not hear "offerings". */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  /** The category whose options are showing on the right. Set by hover as
   *  well as click — see the panel below. */
  const [layer, setLayer] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const active = groups.reduce((n, g) => n + g.values.length, 0);
  const chosenGroups = groups.filter((g) => g.values.length > 0).length;
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
      const width = PANEL_W;
      /* CENTRED ON THE BUTTON THAT OPENED IT (Anir, Aug 24: "this is ugly...
         it's too much to the right. The entire thing should be centred —
         centred around the original filter button").

         It used to be left-ALIGNED to the button, which on a 430px two-pane
         panel threw the whole thing 350px out to the right of a 90px button,
         so the panel looked like it belonged to whatever control happened to
         sit further along the toolbar. Centring anchors it to its own trigger.
         Still clamped to the viewport, so a Filter button near the right edge
         gets a panel that stops at the edge rather than one that hangs off it. */
      const centred = r.left + r.width / 2 - width / 2;
      setBox({
        top: r.bottom + 6,
        left: Math.min(
          Math.max(8, centred),
          Math.max(8, window.innerWidth - width - 8)
        ),
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
          setOpen((prev) => {
            /* OPEN ON A CATEGORY, NOT ON A HINT. The right pane started blank
               with "hover a category to see what you can filter by", so the
               first thing the menu showed was an instruction rather than the
               filters (Saras, Aug 24, asked for the options to be "showing up
               on the right side itself"). Landing on the first group means the
               menu is useful the instant it opens, and hovering still switches
               groups exactly as before. */
            if (!prev) setLayer(groups[0]?.key ?? null);
            else setLayer(null);
            return !prev;
          });
        }}
        aria-expanded={open}
        aria-label={ariaLabel}
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
            aria-label={ariaLabel}
            style={{ top: box.top, left: box.left, width: PANEL_W }}
            className="menu-in fixed z-[130] overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            {/* CATEGORIES LEFT, THEIR OPTIONS RIGHT (Saras, Aug 24 call,
                with a shopping site as the reference: "currently we click the
                filter button, then click category, then see all the options
                within category. If we can have the options within category
                showing up on the right side itself, if someone hovers").

                Drilling meant one category at a time and a trip back through
                a chevron to reach the next, so choosing across three
                categories was six clicks and two of them were undo. Both
                columns are on screen at once now; hovering a category swaps
                the right-hand pane, clicking still works for touch and for
                the keyboard, and nothing is ever more than one move away. */}
            <div className="flex" style={{ height: PANEL_H }}>
              <div
                /* A REAL EDGE BETWEEN THE PANES, and a rule between each
                   group (Anir, Aug 26: "I'm not able to really tell the
                   separations in the section... especially really complex
                   dropdowns, it's just impossible to tell which section is
                   which"). One hairline against white was doing all of the
                   work; the pane now carries its own tint as well, so the two
                   halves read as two halves. */
                className="shrink-0 divide-y divide-border-light overflow-y-auto border-r-2 border-border-light bg-surface/40"
                style={{ width: LEFT_W }}
                onMouseLeave={() => undefined}
              >
                {groups.map((group) => {
                  const on = group.key === layer;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onMouseEnter={() => setLayer(group.key)}
                      onFocus={() => setLayer(group.key)}
                      onClick={() => setLayer(group.key)}
                      aria-expanded={on}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 px-2.5 py-2.5 text-left text-[12.5px] transition-colors",
                        /* THE RAIL HAS TO TURN THE CORNER (Anir, Aug 28: "you
                           can see the issue with the left side blue line").
                           The menu is rounded and clips to it, but the top row
                           underneath was square, so the straight blue rail ran
                           past the curve and read as a stray tick sitting
                           outside the panel.

                           15px, measured rather than assumed: `rounded-xl` is
                           16px in this config, not the stock 12, and the row
                           sits inside the menu's 1px border. A tighter radius
                           looks identical to no radius at all, because the
                           rail still crosses the panel's wider arc.

                           Only the FIRST row. The group list is shorter than
                           the menu — the values pane and the footer make the
                           menu taller — so the last group sits mid-panel, and
                           rounding it would put a curve where there is no
                           corner. */
                        "first:rounded-tl-[15px]",
                        on
                          /* The open group is white, like the pane it opens,
                             with a rail down its left: the two panes read as
                             one shape rather than a highlight beside a list. */
                          ? "bg-white font-semibold text-blue-primary [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          : "text-text-secondary hover:bg-white/70 hover:text-text-primary"
                      )}
                    >
                      <span className="min-w-0 flex-1 break-words">{group.label}</span>
                      {group.values.length > 0 && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 text-[10.5px] font-bold tnum",
                            on
                              ? "bg-blue-primary text-white"
                              : "bg-blue-light text-blue-primary"
                          )}
                        >
                          {group.values.length}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        strokeWidth={2.2}
                        className={cn(
                          "shrink-0",
                          on ? "text-blue-primary" : "text-text-tertiary"
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                {current ? (
                  <>
                    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b-2 border-border-light bg-white px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                        {current.label}
                      </span>
                      {current.values.length > 0 && (
                        <button
                          type="button"
                          onClick={() => current.onChange([])}
                          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-text-tertiary transition-colors hover:text-blue-primary"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto py-1">
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
                            {/* A CHECKBOX, NOT A DOT (Saras, Aug 24: "can we
                                replace these colour buttons, dots, whatever
                                you want to call them, with just checkboxes
                                for each of these, everywhere").

                                The dot carried the category's colour and the
                                tick sat at the far right, so whether a row
                                was chosen had to be read at the opposite end
                                from where the eye starts — and the dot itself
                                looked like decoration rather than a control.
                                A checkbox says both things in one mark, in
                                the place people look for it. Logos and faces
                                stay: they identify the thing, which a colour
                                dot never did. */}
                            <span
                              aria-hidden="true"
                              className={cn(
                                "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors",
                                on
                                  ? "border-blue-primary bg-blue-primary text-white"
                                  : "border-border bg-white"
                              )}
                            >
                              {on && <Check size={11} strokeWidth={3} />}
                            </span>
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
                            ) : null}
                            <span className="min-w-0 flex-1 break-words">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="flex h-full items-center justify-center px-4 text-center text-[12px] text-text-tertiary">
                    Hover a category to see what you can filter by.
                  </p>
                )}
              </div>
            </div>

            {/* THE RUNNING COUNT, IN WORDS (Saras, Aug 24: "at the end it
                should show somewhere that you've chosen three filters, or
                however many they've checked"). The trigger carries a number
                and each category carries its own, but nothing said the total
                in a sentence — so a reader with two categories part-filled
                had to add up the pills themselves. */}
            <div className="flex items-center gap-2 border-t border-border-light px-2.5 py-2">
              <span className="min-w-0 flex-1 text-[12px] text-text-secondary">
                {active === 0 ? (
                  "No filters chosen"
                ) : (
                  <>
                    <b className="font-semibold text-text-primary tnum">{active}</b>{" "}
                    {active === 1 ? "filter" : "filters"} chosen
                    {chosenGroups > 1 && (
                      <span className="text-text-tertiary">
                        {" "}across {chosenGroups} categories
                      </span>
                    )}
                  </>
                )}
              </span>
              {active > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setOpen(false);
                  }}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-[color:#DC2626]"
                >
                  <X size={13} strokeWidth={2.4} />
                  Clear all
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
