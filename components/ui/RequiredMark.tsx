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
