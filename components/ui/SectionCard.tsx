import type { KeyboardEvent, ReactNode } from "react";
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
              "shrink-0 transition-transform duration-200",
              action ? "ml-2" : "ml-auto",
              emphasis ? "text-blue-primary" : "text-text-tertiary",
              expanded === false && "-rotate-90"
            )}
          />
        )}
      </header>
      {expanded === false ? null : (
        <div className={cn("p-5", bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
