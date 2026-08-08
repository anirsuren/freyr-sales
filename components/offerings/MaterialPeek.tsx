"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2 } from "lucide-react";
import { HOVER_DELAY_MS } from "@/lib/hoverPreferences";
import type { OfferingMaterial } from "@/lib/offeringMaterials";

/**
 * SEE THE FILE BEFORE YOU OPEN IT.
 *
 * Resting on a material's name shows the actual document — not an icon, not a
 * description someone typed (Anir, Aug 8: "if I hover over the name, you show
 * me a preview of the file"). It renders the same server-converted preview the
 * full viewer uses, so a .docx or .pptx previews as readable HTML rather than
 * downloading, and nothing internal is handed to a third-party viewer.
 *
 * A PASTED LINK GETS NO FAKE PREVIEW. Four of Freya.Register's materials are
 * SharePoint Stream and Minerva pages: they need a Microsoft login and refuse
 * to be embedded at all, so the card says where the link goes instead of
 * showing an empty frame that looks broken.
 */

/** The app-wide second of rest before the first open (Anir, Aug 8: "0.5
 *  seconds is too much", later "every single hover pop-up should be set to
 *  1 second") — every accidental open costs a document render. Reopening an
 *  already-rendered card stays near-instant below. */
const OPEN_DELAY_MS = HOVER_DELAY_MS;
/** A card that is already rendered reopens almost immediately. */
const REOPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 140;
const PANEL_WIDTH = 560;
const FRAME_HEIGHT = 420;

type Position = { left: number; top?: number; bottom?: number; above: boolean };

function positionFor(anchor: DOMRect): Position {
  const gap = 8;
  const edge = 12;
  const roomAbove = anchor.top - edge;
  const roomBelow = window.innerHeight - anchor.bottom - edge;
  const needed = FRAME_HEIGHT + 96;
  const above = roomAbove >= needed || roomAbove >= roomBelow;
  // CENTRED ON THE ROW, not hung off its left edge (Anir, Aug 8: "why is it
  // on top of the thing, but it's not centered").
  const left = Math.min(
    Math.max(edge, anchor.left + anchor.width / 2 - PANEL_WIDTH / 2),
    window.innerWidth - PANEL_WIDTH - edge
  );
  return above
    ? { left, bottom: window.innerHeight - anchor.top + gap, above }
    : { left, top: anchor.bottom + gap, above };
}


export function MaterialPeek({
  material,
  previewUrl,
  children,
}: {
  material: OfferingMaterial;
  /** App-owned preview URL. Null for a pasted link — there is nothing to render. */
  previewUrl: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** Once opened, the iframe STAYS MOUNTED. Closing only hides it, so any
   *  close — intended or not — costs nothing: reopening is instant, with the
   *  document already rendered and at the same scroll position (Anir, Aug 8:
   *  "when it's loading, it should load everything, and I should be able to
   *  scroll"). */
  const [everOpened, setEverOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const unmountTimer = useRef<number | null>(null);
  /** The document's real height, reported by the embed — the card fits the
   *  file instead of padding a short one with dead space. */
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  /** Reading the document must survive scrolling it. */
  const overPanel = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const clear = useCallback((ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    clear(closeTimer);
    clear(unmountTimer);
    if (openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      // MEASURE THE CHILD, NOT THE WRAPPER. The wrapper is `display: contents`
      // so it does not disturb the table cell's layout — but an element with
      // `contents` generates no box, so its getBoundingClientRect() is all
      // zeros and the card pinned itself to the top-left of the window (Anir,
      // Aug 8: "the pop-up is in the top left"). The first element child is
      // the row button, which has a real box.
      const host = wrapRef.current;
      const anchor = (host?.firstElementChild as HTMLElement | null) ?? host;
      const rect = anchor?.getBoundingClientRect();
      // A zero-sized rect means we still measured nothing; showing a panel
      // parked in the corner is worse than not showing one.
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      setPosition(positionFor(rect));
      setEverOpened(true);
      setOpen(true);
    }, everOpened ? REOPEN_DELAY_MS : OPEN_DELAY_MS);
  }, [clear, everOpened]);

  // Memory, not correctness: a hidden iframe holding a rendered deck is kept
  // for quick re-peeks, then released once it is clearly not coming back.
  useEffect(() => {
    if (open || !everOpened) return;
    unmountTimer.current = window.setTimeout(() => {
      unmountTimer.current = null;
      setEverOpened(false);
      setLoaded(false);
      setContentHeight(null);
    }, 45_000);
    return () => clear(unmountTimer);
  }, [open, everOpened, clear]);

  const scheduleClose = useCallback(() => {
    clear(openTimer);
    clear(closeTimer);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clear]);

  useEffect(
    () => () => {
      clear(openTimer);
      clear(closeTimer);
    },
    [clear]
  );

  useEffect(() => {
    if (!everOpened) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number };
      if (data?.type !== "freyr-embed-size" || typeof data.height !== "number") return;
      setContentHeight(Math.max(80, Math.ceil(data.height)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [everOpened]);

  /**
   * WHILE THE CARD IS OPEN, THE WHEEL BELONGS TO THE DOCUMENT. The pointer is
   * usually still on the row name when someone starts scrolling; the wheel
   * was scrolling the PAGE, which closed the card and restarted the load.
   * A native non-passive listener (React's are passive and cannot
   * preventDefault) eats the wheel over the row or the card and forwards the
   * delta into the embed, which scrolls the document itself.
   */
  useEffect(() => {
    if (!open || !previewUrl) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target as Node;
      const inWrap = wrapRef.current?.contains(target) ?? false;
      const inPanel = panelRef.current?.contains(target) ?? false;
      if (!inWrap && !inPanel) return;
      event.preventDefault();
      frameRef.current?.contentWindow?.postMessage(
        { type: "freyr-embed-scroll", deltaY: event.deltaY },
        window.location.origin
      );
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () =>
      window.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, [open, previewUrl]);

  useEffect(() => {
    if (!open) return;
    // Close when the PAGE scrolls under the card — it would drift away from
    // its row — but never while the pointer is on the card itself: scrolling
    // the document you are reading closed it and re-hovering restarted the
    // load from zero (Anir, Aug 8: "I scrolled and it went back to loading").
    const close = () => {
      if (overPanel.current) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="contents"
      onMouseEnter={reveal}
      onMouseLeave={scheduleClose}
    >
      {children}
      {everOpened &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Preview of ${material.label}`}
            onMouseEnter={() => {
              overPanel.current = true;
              clear(closeTimer);
            }}
            onMouseLeave={() => {
              overPanel.current = false;
              scheduleClose();
            }}
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: PANEL_WIDTH,
              // Hidden, not unmounted: the document survives the close.
              ...(open
                ? null
                : { visibility: "hidden" as const, pointerEvents: "none" as const }),
              ["--menu-origin" as string]: position.above
                ? "bottom left"
                : "top left",
              ["--menu-dir" as string]: position.above ? -1 : 1,
            }}
            className={`fixed z-[75] overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_16px_40px_rgba(16,24,40,0.18)] ${
              open ? "menu-in" : ""
            }`}
          >
            {/* No header. The file IS the preview. */}
            {previewUrl ? (
              /* THE REAL VIEWER, chrome stripped. ?embed=1 renders the same
                 docx-preview / pptx-preview / native-PDF pipeline a click
                 opens — actual drawn slides, not extracted text. */
              <div
                className="relative bg-white transition-[height] duration-150"
                style={{
                  height: contentHeight
                    ? Math.min(FRAME_HEIGHT, contentHeight)
                    : FRAME_HEIGHT,
                }}
              >
                <iframe
                  ref={frameRef}
                  src={previewUrl}
                  title={`Preview of ${material.label}`}
                  onLoad={() => setLoaded(true)}
                  className="block h-full w-full border-0 bg-white"
                />
                {!loaded && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white">
                    <Loader2
                      size={14}
                      strokeWidth={2.2}
                      className="animate-spin text-blue-primary"
                      aria-hidden="true"
                    />
                    <span className="text-[12px] font-medium text-text-secondary">
                      Loading preview…
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* A pasted link has no file to render, so the card shows the
                 one thing a rep wants from it: the address, and a one-click
                 copy (Anir, Aug 8: "show the link right on top, and a button
                 with the copy icon"). */
              <div className="flex items-start gap-2 bg-white p-3">
                <p className="min-h-0 max-h-32 min-w-0 flex-1 overflow-y-auto break-all font-mono text-[11.5px] leading-snug text-text-secondary">
                  {material.url}
                </p>
                <button
                  type="button"
                  aria-label="Copy the link"
                  title={copied ? "Copied" : "Copy the link"}
                  onClick={() => {
                    void navigator.clipboard.writeText(material.url).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-light text-text-tertiary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
                >
                  {copied ? (
                    <Check size={14} strokeWidth={2.4} className="text-success" />
                  ) : (
                    <Copy size={14} strokeWidth={2} />
                  )}
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
