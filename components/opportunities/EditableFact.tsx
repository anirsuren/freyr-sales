"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ONE FACT ON THE DEAL, CHANGED WHERE IT IS READ.
 *
 * Suren, Aug 30: "this whole screen has to be editable or viewable, so it
 * should follow this" — the this being the privilege map. So every fact on the
 * opportunity page is a control when the person may write and plain text when
 * they may not, rather than a page that sends you to a dialog to change one
 * number.
 *
 * IT SAVES ONE FIELD, NOT THE RECORD. The update API merges, so posting a
 * single key leaves the other twelve alone; two people editing different facts
 * on the same deal do not overwrite each other, which a whole-record form
 * cannot promise.
 *
 * A FAILED SAVE PUTS THE VALUE BACK. Nothing here pretends: if the server
 * refuses, the field returns to what it was and says so, because a field that
 * keeps showing what you typed after a rejected write is the worst possible
 * answer — it looks saved.
 */

export type FactKind = "text" | "money" | "percent" | "date";

export function EditableFact({
  label,
  value,
  kind = "text",
  placeholder = "Not set",
  canEdit,
  options,
  onSave,
  format,
}: {
  label: string;
  /** The stored value, as a string. Empty means unset. */
  value: string;
  kind?: FactKind;
  placeholder?: string;
  canEdit: boolean;
  /** When present the field is a picker rather than a free input. */
  options?: { value: string; label: string }[];
  /** Returns nothing on success, or a message to show on failure. */
  onSave: (next: string) => Promise<string | null>;
  /** How to draw the value at rest. */
  format?: (v: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const message = await onSave(draft);
    setBusy(false);
    if (message) {
      /* Put it back. A rejected write must not leave the typed value sitting
         there looking like it landed. */
      setDraft(value);
      setError(message);
      return;
    }
    setEditing(false);
  }

  const shown = value ? (format ? format(value) : value) : placeholder;

  if (!canEdit)
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[12px] text-text-tertiary">{label}</span>
        <span
          className={cn(
            "min-w-0 truncate text-right font-semibold",
            value ? "text-text-primary" : "text-text-tertiary"
          )}
        >
          {shown}
        </span>
      </div>
    );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[12px] text-text-tertiary">{label}</span>
        {editing ? (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
            {options ? (
              <select
                ref={inputRef as React.RefObject<HTMLSelectElement>}
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-blue-primary bg-white px-2 py-1 text-right text-[12.5px] font-semibold text-text-primary outline-none"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={draft}
                disabled={busy}
                type={kind === "date" ? "date" : "text"}
                inputMode={kind === "money" || kind === "percent" ? "numeric" : undefined}
                onChange={(e) =>
                  setDraft(
                    kind === "money" || kind === "percent"
                      ? e.target.value.replace(/[^0-9]/g, "")
                      : e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit();
                  if (e.key === "Escape") {
                    setDraft(value);
                    setEditing(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-blue-primary bg-white px-2 py-1 text-right text-[12.5px] font-semibold text-text-primary outline-none"
              />
            )}
            <button
              type="button"
              onClick={() => void commit()}
              disabled={busy}
              aria-label={`Save ${label}`}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[color:#1A7A35] transition-colors hover:bg-[rgba(26,122,53,0.10)]"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} strokeWidth={2.6} />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setError(null);
                setEditing(false);
              }}
              disabled={busy}
              aria-label={`Cancel editing ${label}`}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label}`}
            className="group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-right transition-colors hover:bg-surface"
          >
            <span
              className={cn(
                "min-w-0 truncate font-semibold",
                value ? "text-text-primary" : "text-text-tertiary"
              )}
            >
              {shown}
            </span>
            <Pencil
              size={11}
              strokeWidth={2.2}
              aria-hidden="true"
              className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-right text-[11px] font-semibold text-[color:#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}
