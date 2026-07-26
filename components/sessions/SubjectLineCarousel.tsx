"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A real left/right carousel: ONE subject on screen at a time, arrows page
// through them (wrap-around), and whichever subject is showing IS the one that
// gets sent (Anir, Jul 26: "these have to be carousels, left to right — I press
// a left arrow and it cycles left. It's not a number 1, 2, 3 thing"). Only the
// active subject renders, so nothing ever clips mid-word at the edges; the
// change is a quick directional slide so it reads smooth. Component keeps its
// old name so call sites don't churn.
export function SubjectLineCarousel({
  subjects,
  selected,
  onSelect,
}: {
  subjects: string[];
  selected: string;
  onSelect: (subject: string) => void;
}) {
  const startIndex = Math.max(0, subjects.indexOf(selected));
  const [view, setView] = useState(startIndex);
  // +1 = new card slides in from the right (we paged forward), -1 from the left.
  const [dir, setDir] = useState<1 | -1>(1);
  const lastEmitted = useRef(selected);

  // Follow an external selection change (regenerate, template swap) so the
  // visible card and the parent's chosen subject never drift apart.
  useEffect(() => {
    const i = subjects.indexOf(selected);
    if (i >= 0 && i !== view) setView(i);
    lastEmitted.current = selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, subjects.length]);

  if (!subjects.length) return null;
  const count = subjects.length;
  const current = subjects[view] ?? subjects[0];

  // Browsing IS choosing — land on a subject and it's the one to send.
  const move = (delta: 1 | -1) => {
    if (count < 2) return;
    setDir(delta);
    const next = (view + delta + count) % count;
    setView(next);
    if (subjects[next] !== lastEmitted.current) {
      lastEmitted.current = subjects[next];
      onSelect(subjects[next]);
    }
  };
  const jump = (i: number) => {
    if (i === view) return;
    setDir(i > view ? 1 : -1);
    setView(i);
    if (subjects[i] !== lastEmitted.current) {
      lastEmitted.current = subjects[i];
      onSelect(subjects[i]);
    }
  };

  return (
    <div
      className="mb-4"
      role="group"
      aria-label="Subject line options"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        }
      }}
      tabIndex={0}
    >
      <style>{`
        @keyframes slcInR{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slcInL{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      <div className="flex items-stretch gap-2">
        <CarouselArrow
          dir="left"
          disabled={count < 2}
          onClick={() => move(-1)}
        />

        {/* The active subject — a single card, fully readable, selected-to-send. */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-blue-primary bg-blue-light/55 shadow-[0_1px_3px_rgba(0,113,227,0.14)]">
          <div
            key={view}
            style={{
              animation: `${dir === 1 ? "slcInR" : "slcInL"} 200ms ease`,
            }}
            className="flex min-h-[46px] items-center gap-2.5 px-4 py-2.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-primary text-white">
              <Check size={12} strokeWidth={2.5} />
            </span>
            <span className="min-w-0 text-[13px] font-semibold leading-snug text-blue-primary">
              {current}
            </span>
          </div>
        </div>

        <CarouselArrow
          dir="right"
          disabled={count < 2}
          onClick={() => move(1)}
        />
      </div>

      {/* Position dots — the filled one is where you are (and what will send). */}
      {count > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {subjects.map((s, i) => (
            <button
              key={`${s}-${i}`}
              type="button"
              aria-label={`Show subject ${i + 1} of ${count}`}
              aria-current={i === view}
              onClick={() => jump(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === view
                  ? "w-5 bg-blue-primary"
                  : "w-1.5 bg-border hover:bg-blue-subtle"
              )}
            />
          ))}
          <span className="ml-1.5 text-[11px] font-medium tabular-nums text-text-tertiary">
            {view + 1} / {count}
          </span>
        </div>
      )}
    </div>
  );
}

function CarouselArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Previous subject line" : "Next subject line"}
      className={cn(
        "flex w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
        disabled
          ? "cursor-default border-border-light text-text-tertiary/40"
          : "border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/50 hover:text-blue-primary active:scale-[0.97]"
      )}
    >
      <Icon size={17} strokeWidth={2.2} />
    </button>
  );
}
