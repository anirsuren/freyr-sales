"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColorOption = {
  value: string;
  label: string;
  color?: string; // dot / accent colour; omit for the "all" option
  icon?: LucideIcon;
  description?: string;
  badge?: string;
  badgeColor?: string;
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
  const detailed = options.some((o) => o.description);

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

  const Dot = ({ o, prominent = false }: { o: ColorOption; prominent?: boolean }) => {
    const Icon = o.icon;
    if (Icon)
      return (
        <span
          className={cn(
            "rounded-md flex items-center justify-center shrink-0",
            prominent ? "w-8 h-8" : "w-5 h-5"
          )}
          style={{ background: o.color ? `${o.color}1F` : "transparent", color: o.color || "#8E98A8" }}
        >
          <Icon size={prominent ? 16 : 12} strokeWidth={2.1} />
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
        className={cn(
          "w-full flex items-center bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,background-color]",
          detailed ? "h-12 gap-2.5 px-2.5" : "h-10 gap-2 px-3 text-[13px]"
        )}
      >
        {selected && <Dot o={selected} prominent={detailed} />}
        <span className="flex-1 min-w-0 text-left">
          <span className={cn("block truncate", detailed && "text-[12.5px] font-semibold leading-tight")}>
            {selected?.label}
          </span>
          {detailed && selected?.description && (
            <span className="mt-0.5 block truncate text-[9.5px] leading-tight text-text-tertiary">
              {selected.description}
            </span>
          )}
        </span>
        {selected?.badge && (
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{
              color: selected.badgeColor || selected.color || "#59616E",
              background: `${selected.badgeColor || selected.color || "#8E98A8"}14`,
            }}
          >
            {selected.badge}
          </span>
        )}
        <span className={cn("flex items-center justify-center shrink-0", detailed && "w-7 h-7 rounded-md bg-surface")}>
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={cn("text-text-tertiary transition-transform duration-150", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute right-0 z-40 mt-1.5 min-w-full w-max max-h-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] hovercard-in",
            detailed ? "w-[304px] p-2" : "p-1.5"
          )}
          style={{ maxWidth: "min(360px, calc(100vw - 24px))" }}
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
                className={cn(
                  "relative w-full flex items-center rounded-lg text-left transition-[background-color,box-shadow,transform]",
                  detailed ? "min-h-[54px] gap-3 px-2.5 py-2" : "gap-2.5 px-2.5 py-2 text-[13px]",
                  on
                    ? "bg-blue-light shadow-[inset_3px_0_0_#0071E3]"
                    : "hover:bg-surface active:scale-[0.99]"
                )}
              >
                <Dot o={o} prominent={detailed} />
                <span className="flex-1 min-w-0">
                  <span className={cn("block truncate", on && "font-semibold", detailed && "text-[13px] leading-tight")}>
                    {o.label}
                  </span>
                  {detailed && o.description && (
                    <span className="mt-1 block truncate text-[10.5px] font-normal leading-tight text-text-tertiary">
                      {o.description}
                    </span>
                  )}
                </span>
                {o.badge && (
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: o.badgeColor || o.color || "#59616E",
                      background: `${o.badgeColor || o.color || "#8E98A8"}14`,
                    }}
                  >
                    {o.badge}
                  </span>
                )}
                {on && (
                  <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <Check size={14} strokeWidth={2.6} className="text-blue-primary" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
