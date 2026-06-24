import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full bg-surface border border-border rounded-md px-3.5 py-2.5 text-[15px] text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-blue-primary focus:shadow-focus resize-y",
      className
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
