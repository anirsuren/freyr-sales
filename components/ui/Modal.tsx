"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "default",
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // "wide" for content-heavy dialogs (editors, recipient pickers) — 640px.
  size?: "default" | "wide" | "workflow" | "chart";
  /** Actions that belong to the whole dialog — rendered in the header, left of
   *  the close button. Document controls (download, open elsewhere) live here
   *  rather than floating above the content they act on. */
  actions?: React.ReactNode;
}) {
  // Portal to <body> so the fixed overlay always covers the whole viewport —
  // if a parent has a CSS transform (e.g. a tab animation), a non-portaled
  // fixed element gets trapped inside it and only dims part of the screen
  // (Suren: "the fade/opacity is only getting restricted to that").
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Whatever opened the dialog gets the focus back when it closes, so a
  // keyboard user lands exactly where they left off.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = returnFocusRef.current;
      returnFocusRef.current = null;
      if (el && document.contains(el)) el.focus();
    };
  }, [open]);

  // Move focus INTO the dialog on open — unless a child (e.g. a form's first
  // field) already claimed it; child effects run before this one.
  useEffect(() => {
    if (!open || !mounted) return;
    const node = dialogRef.current;
    if (node && !node.contains(document.activeElement)) node.focus();
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap: Tab cycles within the dialog instead of wandering into the page
      // behind the backdrop.
      const node = dialogRef.current;
      if (!node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter(
        (el) =>
          el === document.activeElement ||
          el.offsetWidth > 0 ||
          el.offsetHeight > 0
      );
      const active = document.activeElement as HTMLElement | null;
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !active || !node.contains(active) || active === node;
      if (e.shiftKey ? active === first || outside : active === last || outside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 backdrop-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full outline-none ${
          size === "chart"
            ? "max-w-[1180px]"
            : size === "workflow"
            ? "max-w-[980px]"
            : size === "wide"
            ? "max-w-[640px]"
            : "max-w-[440px]"
        } max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl border border-border-light shadow-[0_24px_64px_-16px_rgba(0,0,0,0.30)] modal-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-light shrink-0">
          <h2 className="min-w-0 truncate text-[16px] font-semibold text-text-primary">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
          </div>
        </div>
        <div className={`overflow-y-auto ${size === "chart" ? "p-3" : "p-5"}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
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
