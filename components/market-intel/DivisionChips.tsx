"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  DIVISIONS,
  DIVISION_META,
  type Division,
} from "@/lib/offeringMaterials";
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
              size === "md"
                ? "px-2 py-0.5 text-[11px]"
                : "px-1.5 py-0.5 text-[10px]",
            )}
            style={{ color: meta.color, background: tint(meta.color, 10) }}
          >
            <Icon size={size === "md" ? 11 : 10} strokeWidth={2.4} />{" "}
            {meta.short}
          </span>
        );
      })}
    </span>
  );
}

/** Equal-width rows keep multi-selection clear at every screen size. */
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
    <div className="grid gap-2" role="group" aria-label="Divisions">
      {DIVISIONS.map((d) => {
        const meta = DIVISION_META[d];
        const Icon = meta.icon;
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            onClick={() =>
              onChange(
                on
                  ? value.filter((v) => v !== d)
                  : DIVISIONS.filter((v) => v === d || value.includes(v)),
              )
            }
            className={cn(
              "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
              on
                ? "border-blue-primary/40 bg-blue-light/50"
                : "border-border-light bg-white hover:border-blue-subtle hover:bg-surface",
            )}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ color: meta.color, background: tint(meta.color, 10) }}
            >
              <Icon size={18} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-5 text-text-primary">
                {meta.label}
              </span>
              <span className="block text-[11px] leading-4 text-text-tertiary">
                {meta.short}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                on
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border-light bg-white",
              )}
            >
              {on && <Check size={13} strokeWidth={2.5} />}
            </span>
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
        body: JSON.stringify({
          kind: "divisions",
          id: companyId,
          divisions: draft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`${companyName} is tagged ${draft.join(", ")}.`);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not save.",
        "error",
      );
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

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Edit divisions"
      >
        <p className="break-words text-[15px] font-semibold leading-6 text-text-primary">
          {companyName}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          Select all divisions that apply.
        </p>
        <div className="mt-5">
          <DivisionPicker value={draft} onChange={setDraft} disabled={busy} />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border-light pt-4">
          <p
            className="mr-auto text-[12px] text-text-secondary"
            aria-live="polite"
          >
            {draft.length === 0
              ? "Select at least one"
              : `${draft.length} selected`}
          </p>
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
            disabled={
              busy ||
              draft.length === 0 ||
              (draft.length === divisions.length &&
                draft.every((d) => divisions.includes(d)))
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
