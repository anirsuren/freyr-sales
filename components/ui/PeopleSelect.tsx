"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { OpenInNewTab } from "@/components/ui/ColorSelect";
import { cn } from "@/lib/utils";
import { repSlug } from "@/lib/team";

// A custom people-picker dropdown — shows each teammate's profile photo, both in
// the trigger and in every option (Suren: "the dropdown should not look this
// cheap — custom coded with the person's profile picture"). Replaces the native
// <select> for owner/assignee pickers.
//
// Options may be plain names, or `{ name, sub }` when a second line matters —
// the contact picker keeps each person's job title that way instead of losing
// it in the swap away from <select> (Anir, Jul 30 dropdown sweep).
export type PersonOption = string | { name: string; sub?: string; href?: string };

export function PeopleSelect({
  value,
  options,
  onChange,
  placeholder = "Unassigned",
  allowUnassigned = true,
  className,
  ariaLabel,
  hrefForPerson,
}: {
  value: string;
  options: PersonOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Defaults to the teammate profile; contact pickers can provide a contact URL. */
  hrefForPerson?: (name: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
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

  const normalized = options.map((o) =>
    typeof o === "string" ? { name: o, sub: undefined, href: undefined } : o
  );
  const items = allowUnassigned
    ? [{ name: "", sub: undefined, href: undefined }, ...normalized]
    : normalized;
  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.sub ?? "").toLowerCase().includes(q)
      )
    : items;
  const enterPick =
    visibleItems.find((item) => item.name.trim().toLowerCase() === q) ??
    visibleItems[0];

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
          className="menu-in absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]"
        >
          <div className="flex items-center gap-2 border-b border-border-light px-2.5 py-2">
            <Search size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  return;
                }
                if (event.key !== "Enter" || !enterPick) return;
                event.preventDefault();
                event.stopPropagation();
                event.nativeEvent.stopImmediatePropagation();
                onChange(enterPick.name);
                setOpen(false);
              }}
              placeholder="Search people…"
              aria-label="Search people"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1.5">
          {visibleItems.map((m) => {
            const on = m.name === value;
            return (
              <button
                key={m.name || "__none"}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(m.name);
                  setOpen(false);
                }}
                className={cn(
                  "group/opt w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-left transition-colors",
                  on
                    ? "bg-blue-light text-blue-primary font-semibold"
                    : "text-text-primary hover:bg-surface"
                )}
              >
                {m.name ? (
                  <Avatar name={m.name} className="w-7 h-7 text-[11px] shrink-0" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-surface border border-border-light shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name || placeholder}</span>
                  {m.sub && (
                    <span className={cn("block truncate text-[11px] font-normal", on ? "text-blue-primary/70" : "text-text-tertiary")}>
                      {m.sub}
                    </span>
                  )}
                </span>
                {on && <Check size={15} strokeWidth={2.5} className="text-blue-primary shrink-0" />}
                {m.name && (
                  <OpenInNewTab
                    href={m.href ?? hrefForPerson?.(m.name) ?? `/team?member=${encodeURIComponent(repSlug(m.name))}`}
                    label={m.name}
                  />
                )}
              </button>
            );
          })}
          {visibleItems.length === 0 && (
            <p className="px-2 py-2 text-[12px] text-text-tertiary">
              Nobody matches that.
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
