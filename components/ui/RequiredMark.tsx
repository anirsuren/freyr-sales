import { cn } from "@/lib/utils";

/** One accessible mandatory-field marker for every form and dialog. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span
      aria-label="required"
      title="Required"
      className={cn("ml-0.5 font-semibold text-[color:var(--status-red)]", className)}
    >
      *
    </span>
  );
}

/** The matching explicit state for fields that creation may leave empty. */
export function OptionalMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "ml-1 font-normal normal-case tracking-normal text-text-tertiary",
        className
      )}
    >
      (optional)
    </span>
  );
}
