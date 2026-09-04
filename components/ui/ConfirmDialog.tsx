"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * ASKING "ARE YOU SURE" IN THE APP'S OWN VOICE.
 *
 * The browser's confirm() was standing in for this, and it announces itself as
 * "localhost:3001 says" in a system dialog that belongs to no product (Anir,
 * Jul 29: "can you please make a proper pop-up, these pop-ups are not proper").
 * It also cannot say what the consequence is, cannot show the name of the thing
 * being destroyed, and cannot colour its own dangerous button red.
 *
 * This can do all three, so a destructive action states exactly what will
 * happen before it happens.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  detail,
  confirmLabel = "Remove",
  busy = false,
  tone = "destructive",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** The sentence a person reads to decide. */
  body: React.ReactNode;
  /** The consequence they might not have thought about. Optional. */
  detail?: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  /**
   * RED MEANS DESTRUCTIVE, AND ONLY DESTRUCTIVE (Anir, Aug 21, on the
   * make-this-current confirmation: "Why is that a red button?").
   *
   * This dialog was written for deletes and hardwired the whole vocabulary of
   * one — red button, warning triangle, "Removing…" — so the first
   * non-destructive thing to ask a question through it announced itself as
   * damage. Red is a reserved colour in this app; a confirmation that nothing
   * gets destroyed by wears the ordinary primary blue.
   */
  tone?: "destructive" | "primary";
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3.5">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={
            tone === "primary"
              ? { background: "rgba(0,113,227,0.10)", color: "var(--ink-bright-blue)" }
              : { background: "rgba(176,32,32,0.10)", color: "var(--ink-red)" }
          }
        >
          {tone === "primary" ? (
            <HelpCircle size={18} strokeWidth={2} />
          ) : (
            <AlertTriangle size={18} strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-relaxed text-text-primary">
            {body}
          </p>
          {detail && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
              {detail}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {/* Red when the action destroys something, and the button says so
            before the click rather than after. Blue when it does not. */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            "inline-flex items-center justify-center rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50",
            tone === "primary"
              ? "bg-blue-primary hover:bg-[color:#0062C4]"
              : "bg-[color:#B02020] hover:bg-[color:#8F1A1A]"
          )}
        >
          {busy ? (tone === "primary" ? "Saving…" : "Removing…") : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
