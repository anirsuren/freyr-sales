"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageTab {
  key: string;
  label: string;
  icon: LucideIcon;
  /** The tab's identity colour, painted on its icon when it is the open one. */
  color: string;
}

/**
 * THE SEGMENTED SELECTOR THAT IS ALSO THE PAGE TITLE.
 *
 * Performance has had it since Aug 14 and Anir wants the same control on every
 * module that holds more than one screen (Aug 15: "I need the selector instead
 * of the drop-down at the top for the three pages"). A dropdown hides its
 * siblings behind a click; this shows all of them at once, so you can see
 * where else you can go without going there first.
 *
 * The visible h1 is deliberately absent: the pills carry the page name, and a
 * heading above them would say it twice. Callers keep an `sr-only` h1 for the
 * document outline.
 */
export function PageTabs({
  tabs,
  active,
  onSelect,
  /** Shown with a spinner while its screen loads (server-routed tabs). */
  pending,
  className,
}: {
  tabs: PageTab[];
  active: string;
  onSelect: (key: string) => void;
  pending?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full bg-surface p-1",
        className
      )}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        const isPending = pending === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(t.key)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold tracking-[-0.01em] transition-all",
              isActive
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {isPending ? (
              <Loader2
                size={16}
                strokeWidth={2.2}
                aria-hidden="true"
                className="animate-spin text-blue-primary"
              />
            ) : (
              <Icon
                size={16}
                strokeWidth={2.2}
                aria-hidden="true"
                style={isActive ? { color: t.color } : undefined}
              />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
