"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColorOption = {
  value: string;
  label: string;
  color?: string; // dot / accent colour; omit for the "all" option
  icon?: LucideIcon;
};

// A custom, color-coded dropdown to replace cheap gray <select>s (Suren: "color
// code all the dropdowns"). Each option carries a colour dot (and optional icon);
// the trigger mirrors the selected one. Click-away + Escape close it.
export function ColorSelect({
  value,
  options,
  onChange,
  className,
  minWidth = 170,
  ariaLabel,
}: {
  value: string;
  options: ColorOption[];
  onChange: (v: string) => void;
  className?: string;
  minWidth?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Dot = ({ o }: { o: ColorOption }) => {
    const Icon = o.icon;
    if (Icon)
      return (
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: o.color ? `${o.color}1F` : "transparent", color: o.color || "#8E98A8" }}
        >
          <Icon size={12} strokeWidth={2.1} />
        </span>
      );
    return (
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: o.color || "#C7CDD6" }}
      />
    );
  };

  return (
    <div ref={ref} className={cn("relative", className)} style={{ minWidth }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full h-10 flex items-center gap-2 bg-white border border-border-light rounded-lg px-3 text-[13px] text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-colors"
      >
        {selected && <Dot o={selected} />}
        <span className="flex-1 text-left truncate" title={selected?.label}>
          {selected?.label}
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
          className="absolute z-40 mt-1.5 min-w-full w-max max-w-[340px] max-h-[300px] overflow-y-auto rounded-xl border border-border-light bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] p-1.5"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value || "__all"}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                title={o.label}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-left transition-colors",
                  on ? "bg-blue-light font-semibold" : "hover:bg-surface"
                )}
                style={on && o.color ? { color: o.color } : undefined}
              >
                <Dot o={o} />
                <span className="flex-1 truncate">{o.label}</span>
                {on && <Check size={15} strokeWidth={2.5} className="shrink-0" style={{ color: o.color || "#0071E3" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
