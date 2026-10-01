import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";
import { OptionalMark, RequiredMark } from "@/components/ui/RequiredMark";

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
      /* AND THE SAME BOX AS EVERY DROPDOWN (Anir, Oct 1, on Add a contact:
         "a lot of inconsistencies with the size of the dropdown and the text
         boxes... It should all be the same"). This was 44px, grey, 15px text
         with a darker border, beside ColorSelect triggers that are 40px,
         white, 13px with the light border. One shape now: the trigger's, the
         one CLAUDE.md fixes at 40px. Callers cannot shrink this with a plain
         h-10 (cn does not merge and .h-11 sorts later), so the default has
         to be right. */
      "h-10 min-w-0 w-full bg-white border border-border-light rounded-lg px-3 py-0 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-blue-primary focus:shadow-input-focus",
      className
    )}
    {...rest}
  />
));
Input.displayName = "Input";

export function Field({
  label,
  required,
  requirement,
  children,
  hint,
}: {
  /** A node, not just a string, so a caller can mark a field required
   *  (Manoj's sheet stars the mandatory ones). */
  label: React.ReactNode;
  required?: boolean;
  /** Popup fields default to optional; use none for action rows or read-only labels. */
  requirement?: "required" | "optional" | "none";
  children: React.ReactNode;
  hint?: string;
}) {
  const labelAlreadySaysOptional =
    typeof label === "string" && /\(optional\)/i.test(label);
  const state = requirement ?? (required ? "required" : "optional");
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
        {state === "required" ? (
          <RequiredMark />
        ) : state === "optional" && !labelAlreadySaysOptional ? (
          <OptionalMark />
        ) : null}
        {hint && <InfoHint text={hint} />}
      </span>
      {children}
    </label>
  );
}
