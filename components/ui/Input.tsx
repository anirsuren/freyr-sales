import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full bg-surface border border-border rounded-md px-3.5 py-2.5 text-[15px] text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-blue-primary focus:shadow-focus",
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
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-text-primary mb-1.5">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="block text-[12px] text-text-tertiary mt-1">{hint}</span>
      )}
    </label>
  );
}
