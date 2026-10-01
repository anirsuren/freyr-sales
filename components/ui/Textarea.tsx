import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      /* Same box as Input, only taller: white, light border, 12px corners,
         13px text. The two drifted apart together and come back together. */
      "w-full bg-white border border-border-light rounded-lg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-blue-primary focus:shadow-input-focus resize-y",
      className
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
