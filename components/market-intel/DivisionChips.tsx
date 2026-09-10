"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PenLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * WHICH OF FREYR'S DIVISIONS A COMPANY BELONGS TO, worn as chips (Saras,
 * Sep 10: "each company being tagged as an MPR company, an MDV company, or a
 * CON company... it can be multiple as well"). Same colour and glyph per
 * division as the sales materials wear, so MPR looks like MPR everywhere.
 */
export function DivisionChips({
  divisions,
  size = "sm",
  className,
}: {
  divisions: Division[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (divisions.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {divisions.map((d) => {
        const meta = DIVISION_META[d];
        const Icon = meta.icon;
        return (
          <span
            key={d}
            title={meta.label}
            className={cn(
              "flex items-center gap-1 rounded-full font-bold uppercase tracking-[0.04em]",
              size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]"
            )}
            style={{ color: meta.color, background: tint(meta.color, 10) }}
          >
            <Icon size={size === "md" ? 11 : 10} strokeWidth={2.4} /> {meta.short}
          </span>
        );
      })}
    </span>
  );
}

/** Three toggles, at least one on. Used by the add form and the editor. */
export function DivisionPicker({
  value,
  onChange,
  disabled,
}: {
  value: Division[];
  onChange: (next: Division[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Divisions">
      {DIVISIONS.map((d) => {
        const meta = DIVISION_META[d];
        const Icon = meta.icon;
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() =>
              onChange(on ? value.filter((v) => v !== d) : [...DIVISIONS].filter((v) => v === d || value.includes(v)))
            }
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              on
                ? "border-transparent text-white"
                : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
            )}
            style={on ? { background: meta.color } : { color: meta.color }}
          >
            <Icon size={13} strokeWidth={2.2} />
            {meta.label}
            <span className="opacity-70">({meta.short})</span>
            {on && <Check size={13} strokeWidth={2.6} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The chips plus a pencil for whoever may change them. Saves through the
 * tracking API and refreshes the page, like every other Market Intel edit.
 */
export function DivisionEditor({
  companyId,
  companyName,
  divisions,
  canEdit,
}: {
  companyId: string;
  companyName: string;
  divisions: Division[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Division[]>(divisions);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (draft.length === 0) {
      toast("Pick at least one division.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "divisions", id: companyId, divisions: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`${companyName} is tagged ${draft.join(", ")}.`);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="flex items-center gap-1.5">
        {divisions.length > 0 ? (
          <DivisionChips divisions={divisions} size="md" />
        ) : (
          <span className="rounded-full border border-dashed border-border-light px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
            No division yet
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setDraft(divisions);
              setOpen(true);
            }}
            aria-label={`Edit ${companyName}'s divisions`}
            title="Edit divisions"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <PenLine size={12} strokeWidth={2.1} />
          </button>
        )}
      </span>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`${companyName}: divisions`}>
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          Which of Freyr&apos;s divisions this company belongs to. Pick every one
          that applies; the Customer Intelligence list filters on it.
        </p>
        <div className="mt-3">
          <DivisionPicker value={draft} onChange={setDraft} disabled={busy} />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border-light pt-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || draft.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={14} strokeWidth={2.6} /> Save
          </button>
        </div>
      </Modal>
    </>
  );
}
