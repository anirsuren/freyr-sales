"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { HOVER_DELAY_MS } from "@/lib/hoverPreferences";
import {
  MATERIAL_FORMAT_META,
  MATERIAL_ICON,
  childFolders,
  countUnder,
  materialFileType,
  materialFolderLabel,
  materialFormat,
  materialsInFolder,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

/**
 * LOOK INSIDE A FOLDER WITHOUT OPENING IT.
 *
 * Twelve folder cards say how many files they hold and nothing about which
 * ones, so finding a deck means clicking in, reading, and clicking back out —
 * twelve times (Anir, Aug 7: "when I hover over a folder, I'll be able to see
 * the files... I move my mouse up to the pop-up, and I can scroll through").
 *
 * The panel is a real destination, not a tooltip: the pointer can travel into
 * it, a sub-folder row drills DOWN inside the panel, and a file row opens the
 * file. Everything is a peek — nothing here changes what folder the page is
 * actually showing until you click through.
 */

/** Roughly six rows before it scrolls. Eight was too many to take in at once. */
const MAX_VISIBLE_ROWS = 6;
const ROW_HEIGHT = 38;
const PANEL_WIDTH = 300;
/** Grace while the pointer crosses the gap between card and panel. */
const CLOSE_DELAY_MS = 140;
/**
 * Deliberate hover, not a passing cursor. Sweeping across a twelve-card grid
 * used to fire a panel per card. Originally half a second, raised to the
 * app-wide second (Anir, Aug 8: "every single hover pop-up should be set to
 * 1 second").
 */
const OPEN_DELAY_MS = HOVER_DELAY_MS;

type PanelPosition = {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  above: boolean;
};

/**
 * ABOVE THE CARD, like every other hover panel in the app — it scales UP off
 * the thing you are pointing at instead of dropping below it (standing rule,
 * and Anir again on Aug 8: "it should be right above. It's okay if it covers
 * something from another folder"). Covering the row above is the point: the
 * folder you are reading stays visible underneath the panel.
 *
 * Only the top row of cards, where there is genuinely no room overhead, drops
 * below — a panel clipped to a 40px sliver would be worse than the flip.
 */
function positionFor(anchor: DOMRect): PanelPosition {
  const gap = 8;
  const edge = 12;
  const roomAbove = anchor.top - edge;
  const roomBelow = window.innerHeight - anchor.bottom - edge;
  const above = roomAbove >= 180 || roomAbove >= roomBelow;
  const maxHeight = Math.max(
    160,
    Math.min(360, (above ? roomAbove : roomBelow) - gap)
  );
  const left = Math.min(
    Math.max(edge, anchor.left),
    window.innerWidth - PANEL_WIDTH - edge
  );
  return above
    ? { left, bottom: window.innerHeight - anchor.top + gap, maxHeight, above }
    : { left, top: anchor.bottom + gap, maxHeight, above };
}

export function FolderPeek({
  path,
  materials,
  folderPaths,
  onOpenMaterial,
  onOpenFolder,
  children,
}: {
  /** The folder this card represents — where a peek always starts. */
  path: string;
  /** Every material a member may see, with its folder already resolved. */
  materials: OfferingMaterial[];
  folderPaths: string[];
  onOpenMaterial: (material: OfferingMaterial) => void;
  onOpenFolder: (path: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [peekPath, setPeekPath] = useState(path);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const cancelOpen = useCallback(() => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelOpen();
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      // Next hover starts at the folder again, not wherever the last peek
      // wandered to.
      setPeekPath(path);
    }, CLOSE_DELAY_MS);
  }, [cancelClose, cancelOpen, path]);

  // Measured at FIRE time, not at hover time — the page may have moved in the
  // half second the pointer was resting there.
  const reveal = useCallback(() => {
    cancelClose();
    if (openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(positionFor(rect));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, [cancelClose]);

  useEffect(
    () => () => {
      cancelClose();
      cancelOpen();
    },
    [cancelClose, cancelOpen]
  );

  // A page that scrolls under a floating panel leaves it stranded beside the
  // wrong card, so the peek closes rather than following.
  useEffect(() => {
    if (!open) return;
    // The capture-phase listener also hears the panel's OWN list scrolling —
    // which closed the peek the moment anyone scrolled the files inside it.
    // Only a scroll OUTSIDE the panel (the page moving under it) closes.
    const close = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeAlways = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", closeAlways);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", closeAlways);
    };
  }, [open]);

  const nested = childFolders(folderPaths, peekPath);
  const files = materialsInFolder(materials, peekPath);
  const drilled = peekPath !== path;
  const rowCount = nested.length + files.length;

  return (
    // h-full, because THIS is the grid cell now. Wrapping the folder button in
    // a plain div made the div the grid item and left the button sizing itself
    // from its own text, so every card came out a different width and the rows
    // stopped lining up (Anir, Aug 8: "you broke how the folders look").
    <div
      ref={wrapRef}
      className="relative h-full"
      onMouseEnter={reveal}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Inside ${materialFolderLabel(peekPath)}`}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: PANEL_WIDTH,
              maxHeight: position.maxHeight,
              // Grows out of the card's edge, the same gesture the dropdowns use.
              ["--menu-origin" as string]: position.above
                ? "bottom left"
                : "top left",
              ["--menu-dir" as string]: position.above ? -1 : 1,
            }}
            className="menu-in fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
          >
            <div className="flex items-center gap-2 border-b border-border-light bg-surface/60 px-3 py-2">
              {drilled && (
                <button
                  type="button"
                  onClick={() =>
                    setPeekPath(peekPath.split("/").slice(0, -1).join("/") || path)
                  }
                  aria-label="Back"
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-white hover:text-blue-primary"
                >
                  <ChevronLeft size={14} strokeWidth={2.2} />
                </button>
              )}
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[12px] font-semibold text-text-primary">
                  {materialFolderLabel(peekPath).split(" · ").pop()}
                </span>
                <span className="block text-[10.5px] text-text-secondary">
                  <span className="tnum">{countUnder(materials, peekPath)}</span>{" "}
                  {countUnder(materials, peekPath) === 1 ? "file" : "files"}
                  {nested.length > 0 && (
                    <>
                      {" · "}
                      <span className="tnum">{nested.length}</span>{" "}
                      {nested.length === 1 ? "folder" : "folders"}
                    </>
                  )}
                </span>
              </span>
            </div>

            {rowCount === 0 ? (
              <p className="px-3 py-4 text-[12px] text-text-secondary">
                Nothing filed here yet.
              </p>
            ) : (
              <div
                className="min-h-0 flex-1 overflow-y-auto p-1"
                style={{ maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT }}
              >
                {/* Folders first — they are the way further in, and burying
                    them under a file list would make a nested branch invisible. */}
                {nested.map((child) => (
                  <button
                    key={child}
                    type="button"
                    onClick={() => setPeekPath(child)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-blue-light/50"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      style={{ background: "#2563EB14", color: "#2563EB" }}
                    >
                      <Folder size={13} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1 break-words text-[12px] font-semibold text-text-primary">
                      {materialFolderLabel(child).split(" · ").pop()}
                    </span>
                    <span className="tnum shrink-0 text-[10.5px] text-text-tertiary">
                      {countUnder(materials, child)}
                    </span>
                    <ChevronRight
                      size={13}
                      strokeWidth={2}
                      className="shrink-0 text-text-tertiary"
                    />
                  </button>
                ))}
                {files.map((material) => {
                  const format = materialFormat(material.kind);
                  const Icon =
                    MATERIAL_ICON[material.kind] ?? MATERIAL_FORMAT_META[format].icon;
                  const fileType = materialFileType(material);
                  return (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => onOpenMaterial(material)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-blue-light/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                        <Icon size={13} strokeWidth={1.9} />
                      </span>
                      {/* Names WRAP. The one thing a seller cannot guess from
                          the rest of the row is the file's own name. */}
                      <span className="min-w-0 flex-1 break-words text-[12px] leading-snug text-text-primary">
                        {material.label}
                      </span>
                      {fileType && (
                        <span className="shrink-0 text-[10px] font-semibold text-blue-primary">
                          {fileType}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          </div>,
          document.body
        )}
    </div>
  );
}
