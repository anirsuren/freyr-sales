"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

/**
 * PICK MANY FROM A LONG LIST WITHOUT A CHIP WALL.
 *
 * Born on the opportunity form (Anir, Aug 16: "whateven is this fix it" — 60
 * flat chips pushed the fields off screen) and now shared: selections sit as
 * removable chips, one search box finds the next one, the match list stays
 * inside its own scroll. Anywhere the app offers "several of these", this is
 * the control.
 */
export function MultiPicker({
  options,
  selected,
  onToggle,
  placeholder,
  emptyLabel,
}: {
  options: { id: string; label: string; sub?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      options
        .filter((o) => !selected.includes(o.id))
        .filter(
          (o) =>
            !q ||
            o.label.toLowerCase().includes(q) ||
            (o.sub ?? "").toLowerCase().includes(q)
        )
        .slice(0, 40),
    [options, selected, q]
  );

  return (
    <div className="rounded-lg border border-border-light bg-white p-2">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              title="Remove"
              className="group inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-primary px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[color:#0058B0]"
            >
              {byId.get(id)?.label ?? id}
              <X size={11} strokeWidth={2.8} className="opacity-70 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={selected.length ? "Add another…" : placeholder}
        className="h-[34px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
      />
      {open && (
        <div className="mt-1.5 max-h-[168px] overflow-y-auto rounded-lg border border-border-light">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">{emptyLabel}</p>
          ) : matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">
              {q ? `Nothing matches "${query.trim()}".` : "All of them are already on this deal."}
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onToggle(o.id);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-text-primary transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && (
                  <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                    {o.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
