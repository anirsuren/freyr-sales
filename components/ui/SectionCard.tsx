"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A titled panel: an icon + a header band with a divider, then the body.
// Gives every section a clear top and clear edges so the eye can tell where
// one section ends and the next begins (Anir: "can't tell what is what / where
// each section ends") — without a harsh black outline.
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  onHeaderClick,
  expanded,
  emphasis = false,
  chevron = false,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /**
   * THE WHOLE HEADER IS THE TOGGLE, not just the chevron.
   *
   * On a collapsible card, aiming for a 28px chevron is work, and clicking the
   * title did nothing except select the words (Anir, Jul 30: "it shouldn't just
   * be that when I click on it… when I just click on the entire dropdown").
   * Passing this makes the whole band behave like the disclosure control it
   * looks like. Cards that don't pass it are untouched, so every server-rendered
   * SectionCard in the app keeps rendering exactly as before.
   */
  onHeaderClick?: () => void;
  /** Drives aria-expanded when the header is a toggle. */
  expanded?: boolean;
  /**
   * A LOUDER HEADER BAND. On a page of six stacked sections the default
   * near-white band did not separate them enough to scan (Freyr, Aug 7, after
   * filling the Roadmap tab with Eswar's content: "can you make the section
   * headings stand out more visually"). Opt-in, so the quieter cards
   * elsewhere in the app are untouched.
   */
  emphasis?: boolean;
  /** Render the disclosure chevron. Callers that draw their own leave this off. */
  chevron?: boolean;
}) {
  return (
    <section
      className={cn(
        "bg-white border border-border rounded-xl shadow-card overflow-hidden",
        className
      )}
    >
      <header
        {...(onHeaderClick
          ? {
              onClick: onHeaderClick,
              role: "button" as const,
              tabIndex: 0,
              "aria-expanded": expanded,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onHeaderClick();
              },
            }
          : {})}
        className={cn(
          "flex items-center gap-2 px-5 py-3 border-b",
          emphasis
            ? "bg-blue-light/60 border-blue-subtle/60"
            : "bg-surface/70 border-border-light",
          // select-none because the first thing a click on a non-interactive
          // header does is highlight the title, which reads as "nothing
          // happened".
          onHeaderClick &&
            "cursor-pointer select-none transition-colors hover:bg-surface"
        )}
      >
        {Icon && (
          <span className="w-6 h-6 rounded-md bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
            <Icon size={13} strokeWidth={2} />
          </span>
        )}
        <h2
          className={cn(
            "text-[12.5px] font-semibold uppercase tracking-[0.05em]",
            emphasis ? "text-blue-primary" : "text-text-secondary"
          )}
        >
          {title}
        </h2>
        {action && (
          <div
            className="ml-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
        {chevron && (
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className={cn(
              "shrink-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              action ? "ml-2" : "ml-auto",
              emphasis ? "text-blue-primary" : "text-text-tertiary",
              expanded === false && "-rotate-90"
            )}
          />
        )}
      </header>
      <SectionBody expanded={expanded} bodyClassName={bodyClassName}>
        {children}
      </SectionBody>
    </section>
  );
}

/** Matches the dropdown motion — same expo-out curve, same family of feel. */
const OPEN_MS = 260;

/**
 * THE SECTION ACTUALLY OPENS INSTEAD OF APPEARING.
 *
 * A collapsible card used to swap its body in and out with no transition at
 * all, so a page of six sections snapped between two layouts on every click
 * (Anir, Aug 8, on the Edit offering page: "there is still no animation on any
 * of these drop-downs"). The body now expands on a grid-rows 0fr → 1fr
 * transition, which animates real height without anyone measuring it, and
 * fades in as it goes.
 *
 * It still UNMOUNTS when closed, just one beat later — Sales materials holds
 * twenty-five rows, and keeping every closed section mounted to get a smoother
 * close would cost more than the close is worth.
 *
 * Cards that never collapse (`expanded` undefined) render exactly as before.
 */
function SectionBody({
  expanded,
  bodyClassName,
  children,
}: {
  expanded?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const collapsed = expanded === false;
  const [mounted, setMounted] = useState(!collapsed);
  // Separate from `mounted`: the body has to be in the DOM at 0fr for one
  // frame before it grows, or there is nothing for the browser to animate
  // from and it snaps open exactly like it used to.
  const [grown, setGrown] = useState(!collapsed);

  useEffect(() => {
    if (!collapsed) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setGrown(true));
      return () => cancelAnimationFrame(frame);
    }
    setGrown(false);
    const timer = window.setTimeout(() => setMounted(false), OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [collapsed]);

  if (expanded === undefined) {
    return <div className={cn("p-5", bodyClassName)}>{children}</div>;
  }
  if (!mounted) return null;

  return (
    <div
      aria-hidden={collapsed}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        grown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">
        <div className={cn("p-5", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
