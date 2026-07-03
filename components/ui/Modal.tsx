"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // "wide" for content-heavy dialogs (editors, recipient pickers) — 640px.
  size?: "default" | "wide";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 backdrop-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${
          size === "wide" ? "max-w-[640px]" : "max-w-[440px]"
        } max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl border border-border-light shadow-[0_24px_64px_-16px_rgba(0,0,0,0.30)] modal-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light shrink-0">
          <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[14px] text-text-secondary leading-relaxed mb-5">
        {message}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
