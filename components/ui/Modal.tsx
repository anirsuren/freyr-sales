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
  tall = false,
  actions,
  dialogClassName,
  stacked = false,
  dock = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // "wide" for content-heavy dialogs (editors, recipient pickers) — 640px.
  size?: "default" | "wide" | "workflow" | "chart" | "viewer";
  /** Reserve real height. Dialogs whose fields open big dropdowns were
   *  shorter than the menus they host, so every pick fought the bottom edge
   *  (Anir, Aug 12: "these pop-ups with the big drop-downs have to be
   *  significantly bigger — just make them all a certain size"). */
  tall?: boolean;
  /** Actions that belong to the whole dialog — rendered in the header, left of
   *  the close button. Document controls (download, open elsewhere) live here
   *  rather than floating above the content they act on. */
  actions?: React.ReactNode;
  /** Optional sizing for a specific workflow that should not resize as its
   *  internal panels open and close. */
  dialogClassName?: string;
  /** A focused dialog opened from another dialog. It stays above the parent
   *  and owns keyboard handling until it closes. */
  stacked?: boolean;
  /**
   * Dock the dialog to the RIGHT edge instead of centring it, with no
   * backdrop, so the surface underneath stays visible and clickable. Built
   * for the heat map's full-screen popup: opening a cell there used to raise
   * this dialog BEHIND the popup, where it was invisible (Anir, Aug 13: "it's
   * like toggling in the background, but the background is not visible…
   * right side OF THE POPUP"). Table on the left, editor on the right, and
   * clicking another cell swaps the editor in place.
   */
  dock?: boolean;
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
      if (stacked) e.stopImmediatePropagation();
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
    window.addEventListener("keydown", onKey, stacked);
    return () => window.removeEventListener("keydown", onKey, stacked);
  }, [open, onClose, stacked]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className={
        dock
          ? // No backdrop and no pointer capture: the popup behind stays live.
            "pointer-events-none fixed inset-0 z-[230] flex items-stretch justify-end p-6"
          : `fixed inset-0 ${stacked ? "z-[105] bg-black/25" : "z-[95] bg-black/40"} flex items-center justify-center backdrop-blur-sm p-4 backdrop-in`
      }
      /**
       * A CLICK ON THE BACKDROP CLOSES THE DIALOG AND STOPS THERE.
       *
       * Anir, Aug 13: "when I'm on the popup and I click the background to
       * untoggle it… it thinks I'm opening it. When I'm on a popup I'm
       * technically on a completely separate page." Exactly right, and the
       * portal is what broke the illusion.
       *
       * This overlay renders through createPortal, so in the DOM it sits at
       * the end of <body>, far away from the row underneath. But React does
       * not bubble synthetic events along the DOM tree — it bubbles them along
       * the REACT tree. A <Modal> written inside a clickable row is still a
       * React child of that row, so dismissing the dialog delivered the same
       * click to the row's onClick and the row opened behind it.
       *
       * stopPropagation ends the click here. One line, and it fixes every
       * dialog in the app at once, because they all render through this file.
       *
       * ONLY the click. An earlier version of this also swallowed mousedown
       * and mouseup "for good measure" and broke every dropdown in the app:
       * ColorSelect, the folder picker, DateField and PersonSelect all close
       * themselves from a native `document` mousedown listener, and React's
       * stopPropagation halts the native event before it ever reaches
       * document. So click-away stopped working and two menus could sit open
       * at once (Anir, Aug 13: "why are there two dropdowns lol. this should
       * never be possible"). Do not add those handlers back.
       */
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full outline-none ${
          size === "viewer"
            ? // A 16:9 slide in a 1180px box is only ~660px tall, so a third of
              // the dialog was empty grey under every slide (Anir, Jul 30: "why
              // are you stopping the demo there? … it should go all the way up
              // until the bottom"). The document viewer takes the window.
              "max-w-[min(1900px,96vw)]"
            : size === "chart"
            ? "max-w-[1180px]"
            : size === "workflow"
            ? "max-w-[980px]"
            : size === "wide"
            ? "max-w-[640px]"
            : "max-w-[440px]"
        } ${tall ? "min-h-[min(640px,calc(100vh-4rem))] " : ""}max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl border border-border-light shadow-[0_24px_64px_-16px_rgba(0,0,0,0.30)] ${
          dock
            ? "pointer-events-auto h-full !max-w-[min(680px,calc(100vw-3rem))] slide-in-right shadow-[-16px_0_48px_-12px_rgba(15,23,42,0.35)]"
            : "modal-in"
        } ${dialogClassName || ""}`}
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
        <div className={`min-h-0 flex-1 overflow-y-auto ${size === "chart" || size === "viewer" ? "p-3" : "p-5"}`}>
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
      <div className="flex justify-end">
        <Button variant="destructive" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
