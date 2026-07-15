import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

// A small "?" with a plain-English explanation on hover/focus. Tooltip owns
// viewport-aware placement so hints remain fully visible beside every edge.
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip label={text} className={className}>
      <button
        type="button"
        aria-label={text}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary outline-none cursor-help",
          "hover:text-blue-primary focus-visible:text-blue-primary focus-visible:ring-2 focus-visible:ring-blue-primary/25"
        )}
      >
        <HelpCircle size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
