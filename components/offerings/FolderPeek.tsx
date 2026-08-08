"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
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

type PanelPosition = { left: number; top: number; maxHeight: number };

function positionFor(anchor: DOMRect): PanelPosition {
  const gap = 8;
  const below = window.innerHeight - anchor.bottom - gap - 12;
  const above = anchor.top - gap - 12;
  // Flip above the card when there is more room up there — a folder in the
  // bottom row would otherwise open into a 40px sliver.
  const flip = below < 200 && above > below;
  const maxHeight = Math.max(160, Math.min(360, flip ? above : below));
  const left = Math.min(
    Math.max(12, anchor.left),
    window.innerWidth - PANEL_WIDTH - 12
  );
  return {
    left,
    top: flip ? anchor.top - gap - maxHeight : anchor.bottom + gap,
    maxHeight,
  };
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
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      // Next hover starts at the folder again, not wherever the last peek
      // wandered to.
      setPeekPath(path);
    }, CLOSE_DELAY_MS);
  }, [cancelClose, path]);

  const reveal = useCallback(() => {
    cancelClose();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPosition(positionFor(rect));
    setOpen(true);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // A page that scrolls under a floating panel leaves it stranded beside the
  // wrong card, so the peek closes rather than following.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const nested = childFolders(folderPaths, peekPath);
  const files = materialsInFolder(materials, peekPath);
  const drilled = peekPath !== path;
  const rowCount = nested.length + files.length;

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={reveal}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open &&
        position &&
        createPortal(
          <div
            role="dialog"
            aria-label={`Inside ${materialFolderLabel(peekPath)}`}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              left: position.left,
              top: position.top,
              width: PANEL_WIDTH,
              maxHeight: position.maxHeight,
            }}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
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

            <button
              type="button"
              onClick={() => onOpenFolder(peekPath)}
              className="shrink-0 cursor-pointer border-t border-border-light px-3 py-2 text-left text-[11.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-light/40"
            >
              Open this folder
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
