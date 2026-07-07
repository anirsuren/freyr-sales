import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// A small "?" with a plain-English explanation on hover/focus. Used to demystify
// jargon and metrics for non-technical users without cluttering the page.
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("group relative inline-flex items-center align-middle", className)}>
      <HelpCircle
        size={13}
        strokeWidth={1.8}
        tabIndex={0}
        role="button"
        aria-label={text}
        className="text-text-tertiary hover:text-blue-primary focus:text-blue-primary outline-none cursor-help"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 hidden group-hover:block group-focus-within:block w-max max-w-[260px] rounded-lg bg-text-primary text-white text-[12px] font-normal normal-case tracking-normal leading-snug px-2.5 py-1.5 shadow-lg text-left"
      >
        {text}
      </span>
    </span>
  );
}
