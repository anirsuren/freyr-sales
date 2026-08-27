"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Folder, Search } from "lucide-react";
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
  // CENTRED OVER WHAT YOU ARE POINTING AT (Anir, Aug 15: "does that look
  // centered to you? It's not centered above the number"). It used to align
  // its LEFT edge to the trigger's, so a 300px panel hanging off a 30px count
  // pill sat almost entirely to the right of it and read as unanchored. The
  // clamp still wins at the screen edges, where centring would overflow.
  const left = Math.min(
    Math.max(edge, anchor.left + anchor.width / 2 - PANEL_WIDTH / 2),
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
  /** Folders, or every file under here in one flat list (Anir, Aug 15: "an
   *  option to see folders or just all files at once in a row").
   *
   *  FILES FIRST (Anir, Aug 27: "I do want the folders, but the default
   *  should be files"). Opening on folders answered "how is this organised"
   *  when the question a peek asks is "what is in here" — and on an offering
   *  whose files all sit at the top level it opened on an empty list saying
   *  "0 files" with the documents one tap away. Both toggles stay. */
  const [mode, setMode] = useState<"folders" | "files">("files");
  const [query, setQuery] = useState("");
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
      // Measure the THING, not the cell it sits in. This wrapper is h-full and
      // block, which is right for the folder grid where it IS the card, and
      // wrong in a table cell where it stretches far wider than the little
      // count pill inside it — centring on the wrapper then looked off-centre
      // against the number (Anir, Aug 15). The first element child is the
      // trigger itself in both cases.
      const host = wrapRef.current;
      const inner = host?.firstElementChild as HTMLElement | null;
      const rect = (inner ?? host)?.getBoundingClientRect();
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

  const q = query.trim().toLowerCase();
  // Searching implies "all files": you are looking for a name, not a place.
  const flat = mode === "files" || q.length > 0;
  const under = (m: { folder?: string }) =>
    !peekPath || m.folder === peekPath || (m.folder ?? "").startsWith(`${peekPath}/`);
  const nested = flat ? [] : childFolders(folderPaths, peekPath);
  const files = flat
    ? materials
        .filter(under)
        .filter((m) => !q || m.label.toLowerCase().includes(q))
    : materialsInFolder(materials, peekPath);
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
            /* THE PANEL EATS ITS OWN CLICKS (Anir, Aug 27: "make sure I can
               click on this stuff, because it seems like when I click on it,
               it's like clicking in the back as well"). It is portalled to
               <body>, so a click inside it does NOT bubble through the React
               tree to the row underneath — but a click that lands on the
               panel's padding, its search box or its header hits the row the
               panel is drawn over, folding it and yanking the panel away
               mid-click. Stopping it here keeps every press inside the peek
               inside the peek. */
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: PANEL_WIDTH,
              maxHeight: position.maxHeight,
              // Grows out of the card's edge, the same gesture the dropdowns use.
              ["--menu-origin" as string]: position.above
                ? "bottom center"
                : "top center",
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
              {/* Folders or everything, one tap (Anir, Aug 15). */}
              <span className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border-light bg-white">
                {(["folders", "files"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={cn(
                      "cursor-pointer px-2 py-1 text-[10.5px] font-semibold transition-colors",
                      mode === m
                        ? "bg-blue-light text-blue-primary"
                        : "text-text-secondary hover:bg-surface"
                    )}
                  >
                    {m === "folders" ? "Folders" : "All files"}
                  </button>
                ))}
              </span>
            </div>

            <div className="border-b border-border-light px-2.5 py-2">
              <span className="relative block">
                <Search
                  size={13}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files…"
                  aria-label="Search files"
                  className="w-full rounded-lg border border-border-light bg-white py-1.5 pl-7 pr-2 text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
                />
              </span>
            </div>

            {rowCount === 0 ? (
              <p className="px-3 py-4 text-[12px] text-text-secondary">
                {q ? `Nothing matches "${query.trim()}".` : "Nothing filed here yet."}
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
