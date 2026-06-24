import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GLOSSARY } from "@/lib/glossary";

// A subtle hover tooltip. Pure CSS (no JS state) so it works in both server and
// client components and never blocks the main thread. Appears ~0.7s after the
// pointer settles — long enough not to flash annoyingly, short enough to feel
// responsive — and disappears the moment you move away.
//
// Placement: defaults above the target. Use side="bottom" for things near the
// top of a scroll container (e.g. column headers) so the popup isn't clipped.
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "left" | "right";
  className?: string;
}) {
  if (!label) return <>{children}</>;
  return (
    <span className={cn("group/tt relative inline-flex items-center", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-[260px] rounded-lg bg-text-primary text-white",
          "text-[12px] font-normal normal-case tracking-normal leading-snug px-2.5 py-1.5 shadow-lg text-left",
          "opacity-0 invisible transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-hover/tt:visible group-hover/tt:delay-700",
          "group-focus-within/tt:opacity-100 group-focus-within/tt:visible",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "left" && "left-0",
          align === "right" && "right-0"
        )}
      >
        {label}
      </span>
    </span>
  );
}

// Wrap a jargon term with a dotted underline + its glossary explanation on hover.
// Pass a glossary key; the underlined text defaults to the term's canonical label
// but you can override it with children (e.g. an abbreviation as shown on screen).
export function Term({
  k,
  children,
  side = "top",
  align = "center",
  className,
  underline = true,
}: {
  k: string;
  children?: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "left" | "right";
  className?: string;
  underline?: boolean;
}) {
  const entry = GLOSSARY[k];
  if (!entry) return <>{children}</>;
  return (
    <Tooltip label={entry.def} side={side} align={align}>
      <span
        tabIndex={0}
        className={cn(
          "outline-none cursor-help",
          underline &&
            "underline decoration-dotted decoration-text-tertiary/60 underline-offset-[3px] hover:decoration-blue-primary focus:decoration-blue-primary",
          className
        )}
      >
        {children ?? entry.term}
      </span>
    </Tooltip>
  );
}
