"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

export type PickablePerson = { name: string; role?: string; email?: string };

/**
 * PICK PEOPLE, DON'T TYPE THEM.
 *
 * The service-delivery POC was a free-text box, so naming someone meant
 * remembering their exact spelling and there was no way to see who was even
 * available (Anir, Jul 28: "when I press Edit Offering and click on Service
 * Delivery POC, that should be a list of people, like everyone who's in the
 * software. It should be a dropdown or something with profile pictures").
 *
 * So: a real picker over the workspace's people, each row carrying their face
 * and their role, searchable, multi-select, with the chosen people shown as
 * removable chips. Typing a name that isn't on the list still works — someone
 * genuinely new should not be blocked by a picker — but it is the fallback,
 * not the default path.
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  placeholder = "Search people…",
  emptyLabel = "Nobody selected yet",
}: {
  people: PickablePerson[];
  /** Selected names, in display order. */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    return people
      .filter((p) => {
        const key = p.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return !q || key.includes(q) || (p.role || "").toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, query]);

  const has = (name: string) =>
    value.some((v) => v.toLowerCase() === name.toLowerCase());

  const toggle = (name: string) =>
    onChange(
      has(name)
        ? value.filter((v) => v.toLowerCase() !== name.toLowerCase())
        : [...value, name]
    );

  // A name nobody in the workspace carries yet. Offer it rather than refuse it.
  const typedIsNew =
    query.trim().length > 1 &&
    !people.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left transition-colors",
          open ? "border-blue-primary" : "border-border-light hover:border-blue-subtle"
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
          <UserRound size={13} strokeWidth={1.95} />
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {value.length === 0 ? (
            <span className="text-[13px] text-text-tertiary">{emptyLabel}</span>
          ) : (
            value.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] py-0.5 pl-0.5 pr-1.5"
              >
                <Avatar name={name} className="h-5 w-5 text-[7px]" />
                <span className="text-[12.5px] font-semibold text-text-primary">
                  {name}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(name);
                    }
                  }}
                  className="cursor-pointer rounded p-0.5 text-text-tertiary hover:text-[color:#B02020]"
                >
                  <X size={11} strokeWidth={2.4} />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={cn(
            "shrink-0 text-text-tertiary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-xl border border-border-light bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-border-light px-2.5 py-2">
            <Search size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
          <div className="max-h-[264px] overflow-y-auto py-1">
            {options.map((p) => {
              const on = has(p.name);
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => toggle(p.name)}
                  className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-blue-light/50"
                >
                  <Avatar name={p.name} className="h-8 w-8 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block break-words text-[13px] font-semibold text-text-primary">
                      {p.name}
                    </span>
                    {(p.role || p.email) && (
                      <span className="block break-words text-[11.5px] text-text-tertiary">
                        {p.role || p.email}
                      </span>
                    )}
                  </span>
                  {on && (
                    <Check
                      size={15}
                      strokeWidth={2.6}
                      className="shrink-0 text-blue-primary"
                    />
                  )}
                </button>
              );
            })}
            {typedIsNew && (
              <button
                type="button"
                onClick={() => {
                  toggle(query.trim());
                  setQuery("");
                }}
                className="flex w-full items-center gap-2.5 border-t border-border-light px-2.5 py-2 text-left transition-colors hover:bg-blue-light/50"
              >
                <Avatar name={query.trim()} className="h-8 w-8 shrink-0 text-[10px]" />
                <span className="text-[13px] font-semibold text-blue-primary">
                  Add &ldquo;{query.trim()}&rdquo;
                </span>
              </button>
            )}
            {options.length === 0 && !typedIsNew && (
              <p className="px-3 py-4 text-center text-[12.5px] text-text-secondary">
                Nobody matches that.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
