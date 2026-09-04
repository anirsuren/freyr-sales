import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      /* ONE HEIGHT FOR EVERY KIND OF BOX (Anir, Sep 4: "make sure the text
         field boxes are same size"). Padding alone let the browser decide: a
         `type="month"` or `type="date"` control carries its own picker glyph
         and renders a couple of pixels taller than a plain text box, so three
         fields in a row lined up at the top and not at the bottom. A fixed
         height settles it for every variant. */
      "h-11 min-w-0 w-full bg-surface border border-border rounded-md px-3.5 py-0 text-[15px] text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-blue-primary focus:shadow-focus",
      className
    )}
    {...rest}
  />
));
Input.displayName = "Input";

export function Field({
  label,
  required,
  children,
  hint,
}: {
  /** A node, not just a string, so a caller can mark a field required
   *  (Manoj's sheet stars the mandatory ones). */
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      {/* THE EXPLANATION GOES BEHIND A QUESTION MARK, NOT UNDER THE BOX
          (Anir, Sep 4, looking at three fields each carrying a paragraph:
          "so much fucking text, bro. If it can be put in a question mark, put
          it in a question mark").

          A sentence printed under every input is read once and then becomes
          furniture that pushes the actual form off the screen — and these
          three sat above a month table he then had to scroll to reach. The
          hint is one hover away instead, which is how the rest of this form
          already explains itself. */}
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-text-primary">
        {label}
        {required && <span className="text-error">*</span>}
        {hint && <InfoHint text={hint} />}
      </span>
      {children}
    </label>
  );
}
