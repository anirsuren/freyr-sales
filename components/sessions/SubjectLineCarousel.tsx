"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubjectLineCarousel({
  subjects,
  selected,
  onSelect,
}: {
  subjects: string[];
  selected: string;
  onSelect: (subject: string) => void;
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, subjects.indexOf(selected));

  const moveTo = (index: number) => {
    if (!subjects.length) return;
    const nextIndex = Math.max(0, Math.min(subjects.length - 1, index));
    onSelect(subjects[nextIndex]);
    optionRefs.current[nextIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };

  useEffect(() => {
    optionRefs.current[selectedIndex]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedIndex]);

  if (!subjects.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-border-light bg-surface/45 p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => moveTo(selectedIndex - 1)}
          disabled={selectedIndex === 0}
          aria-label="Previous subject line"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <div
          role="listbox"
          aria-label="Subject line options"
          className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {subjects.map((subject, index) => {
            const isSelected = selected === subject;
            return (
              <button
                key={`${subject}-${index}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => moveTo(index)}
                className={cn(
                  "flex min-h-14 w-[280px] max-w-[calc(100%-16px)] shrink-0 snap-center items-center gap-2.5 rounded-md border bg-white px-3 py-2 text-left transition-[border-color,background-color,box-shadow,transform] duration-150",
                  isSelected
                    ? "border-blue-primary bg-blue-light/55 shadow-[0_1px_3px_rgba(0,113,227,0.14)]"
                    : "border-border-light hover:-translate-y-px hover:border-blue-subtle hover:shadow-sm"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
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
                    "line-clamp-2 text-[12.5px] leading-snug",
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

        <button
          type="button"
          onClick={() => moveTo(selectedIndex + 1)}
          disabled={selectedIndex === subjects.length - 1}
          aria-label="Next subject line"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] font-medium text-text-tertiary tnum">
        {selectedIndex + 1} of {subjects.length}
      </p>
    </div>
  );
}
