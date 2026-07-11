"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

// A custom people-picker dropdown — shows each teammate's profile photo, both in
// the trigger and in every option (Suren: "the dropdown should not look this
// cheap — custom coded with the person's profile picture"). Replaces the native
// <select> for owner/assignee pickers.
export function PeopleSelect({
  value,
  options,
  onChange,
  placeholder = "Unassigned",
  allowUnassigned = true,
  className,
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = allowUnassigned ? ["", ...options] : options;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 bg-white border border-border-light rounded-lg pl-1.5 pr-2 py-1.5 text-[13px] text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-colors"
      >
        {value ? (
          <Avatar name={value} className="w-6 h-6 text-[10px] shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-surface border border-border-light shrink-0" />
        )}
        <span className={cn("flex-1 text-left truncate", !value && "text-text-tertiary")}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={cn("text-text-tertiary transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-40 mt-1.5 w-full max-h-[280px] overflow-y-auto rounded-xl border border-border-light bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] p-1.5"
        >
          {items.map((m) => {
            const on = m === value;
            return (
              <button
                key={m || "__none"}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-left transition-colors",
                  on
                    ? "bg-blue-light text-blue-primary font-semibold"
                    : "text-text-primary hover:bg-surface"
                )}
              >
                {m ? (
                  <Avatar name={m} className="w-7 h-7 text-[11px] shrink-0" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-surface border border-border-light shrink-0" />
                )}
                <span className="flex-1 truncate">{m || placeholder}</span>
                {on && <Check size={15} strokeWidth={2.5} className="text-blue-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
