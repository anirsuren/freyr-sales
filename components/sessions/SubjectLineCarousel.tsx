"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A stacked list of the subject options — every choice fully readable at a
// glance. The previous peek-carousel clipped the neighbouring subjects
// mid-word at the edges ("ort for…"), which read as broken UI (Anir, Jul 25:
// "the ugliest thing I've ever seen — it's supposed to be smooth"). Three
// short lines don't need paging; selection is one click, with a soft
// transition instead of a scroll animation. The component keeps its old name
// so call sites don't churn.
export function SubjectLineCarousel({
  subjects,
  selected,
  onSelect,
}: {
  subjects: string[];
  selected: string;
  onSelect: (subject: string) => void;
}) {
  if (!subjects.length) return null;

  return (
    <div
      role="listbox"
      aria-label="Subject line options"
      className="mb-4 space-y-1.5"
    >
      {subjects.map((subject, index) => {
        const isSelected = selected === subject;
        return (
          <button
            key={`${subject}-${index}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(subject)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border bg-white px-3.5 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
              isSelected
                ? "border-blue-primary bg-blue-light/55 shadow-[0_1px_3px_rgba(0,113,227,0.14)]"
                : "border-border-light hover:border-blue-subtle hover:bg-surface/60"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                isSelected
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border text-text-tertiary"
              )}
            >
              {isSelected ? (
                <Check size={12} strokeWidth={2.5} />
              ) : (
                <span className="text-[9px] font-semibold tnum">{index + 1}</span>
              )}
            </span>
            <span
              className={cn(
                "min-w-0 text-[12.5px] leading-snug",
                isSelected
                  ? "font-semibold text-blue-primary"
                  : "font-medium text-text-secondary"
              )}
            >
              {subject}
            </span>
          </button>
        );
      })}
    </div>
  );
}
