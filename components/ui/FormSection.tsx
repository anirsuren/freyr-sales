"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { sectionId } from "@/lib/sectionId";
import { cn } from "@/lib/utils";

/**
 * ONE SECTION CARD, USED BY EVERY EDIT SCREEN.
 *
 * Anir, Sep 1: "the edit deal is actually not supposed to be a pop-up...
 * it should be like the offerings page. We look at the offerings pages, just
 * copy that."
 *
 * Copying it by eye would have produced a lookalike that drifts the first time
 * the offerings card changes, so this IS that card, lifted out of OfferingForm
 * unchanged and imported back into it. One definition, so the two screens
 * cannot diverge.
 */
export function FormSection({
  icon: Icon,
  title,
  hint,
  count,
  action,
  alwaysShowAction = false,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  count?: number;
  action?: React.ReactNode;
  /**
   * Keep the action visible while the section is CLOSED too.
   *
   * Offerings only shows it open, which is right there: the action edits what
   * you are already looking at. A deal's sections each hold a different kind
   * of record, and Anir asked for the add button on the strip itself ("maybe
   * also have a blue square with the white plus on it for each of those
   * sections so I can quickly create one just like that") — someone who
   * knows they want a new submission should not have to open a list of the
   * ones that exist to find the way to make one.
   */
  alwaysShowAction?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionSlug = sectionId(title);
  const panelId = `${sectionSlug}-panel`;

  return (
    // NO overflow-hidden. It clipped every dropdown that opened inside the
    // card, which is why the POC picker's search bar was cut off (Anir, Jul
    // 28). The header carries its own top radius instead.
    <section
      id={sectionSlug}
      className={cn(
        /* THE RAIL RUNS THE WHOLE OPEN SECTION (Anir, Aug 27: "that line,
           whatever you did on the goals page, demarcates exactly where it
           starts and where it ends — every single dropdown throughout the
           entire app"). It was a 3px sliver on the header only, so an open
           section's body had no left edge saying it still belonged. A real
           border, reserved in both states, so toggling never nudges. */
        "scroll-mt-24 rounded-2xl border border-l-[3px] bg-white shadow-[0_3px_14px_rgba(15,23,42,0.055)] transition-[border-color,box-shadow] duration-200",
        open
          ? "border-blue-primary/25 border-l-blue-primary shadow-[0_5px_20px_rgba(15,23,42,0.075)] ring-1 ring-blue-primary/5"
          : "border-[#D9E2EC] border-l-[#D9E2EC]"
      )}
    >
      <header
        className={cn(
          "relative flex items-center gap-3 px-5 py-4 transition-colors",
          open
            ? "rounded-t-[15px] bg-blue-light/25"
            : "rounded-[15px] bg-[#FAFBFC] hover:bg-blue-light/15"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left outline-none"
        >
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
              open
                ? "border-blue-primary/15 bg-white text-blue-primary shadow-sm"
                : "border-blue-primary/10 bg-blue-light text-blue-primary group-hover:bg-white"
            )}
          >
            <Icon size={16} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span role="heading" aria-level={2} className="text-[14.5px] font-semibold text-text-primary">
                {title}
              </span>
              {typeof count === "number" && (
                <span className="tnum inline-flex min-w-6 items-center justify-center rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary">
                  {count}
                </span>
              )}
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-text-tertiary">
              {hint}
            </span>
          </span>
          <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors group-hover:bg-white group-hover:text-blue-primary">
            <ChevronDown
              size={17}
              strokeWidth={2}
              className={cn("transition-transform duration-200", open && "rotate-180")}
            />
          </span>
        </button>
        {(open || alwaysShowAction) && action && (
          <div className="shrink-0">{action}</div>
        )}
      </header>
      {open && (
        <div
          id={panelId}
          className="space-y-4 rounded-b-2xl border-t border-[#DCE5EE] bg-[#FBFCFE] p-5"
        >
          {children}
        </div>
      )}
    </section>
  );
}
