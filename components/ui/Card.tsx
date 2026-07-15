import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  // Our lightweight cn() doesn't de-dupe Tailwind classes, so if the caller
  // passes their own padding (e.g. `p-0` on a list/table card) the default
  // `p-6` still lands in the DOM and, being defined later in the stylesheet,
  // silently WINS — leaving 24px of padding the author thought they'd removed.
  // That was the recurring "empty space in these containers" (Suren). Only apply
  // the default padding when the caller hasn't specified any.
  const hasPadding = className ? /(^|\s)p[xytrbl]?-\S/.test(className) : false;
  return (
    <div
      className={cn(
        "bg-white border border-border-light rounded-xl shadow-card",
        !hasPadding && "p-6",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
