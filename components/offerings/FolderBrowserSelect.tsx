"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import {
  childFolders,
  countUnder,
  materialFolderLabel,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

/**
 * PICK A FOLDER THE WAY AN EXPLORER DOES (Anir, Aug 12: "like Windows
 * Explorer: you select the folder and then you have to select the subfolder
 * inside... it'll let me click on it to go in, but it won't let me select
 * that"). The trigger looks like every other select in the app; the panel is
 * a small file browser: parents open on click and cannot be chosen, leaves
 * select. That makes Saras' leaves-only rule structural instead of a
 * filtered dropdown.
 */
export function FolderBrowserSelect({
  value,
  onChange,
  folders,
  materials,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Every folder path this offering knows, parents included. */
  folders: string[];
  /** For the "N files" line under each folder. */
  materials: OfferingMaterial[];
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Where the browser is standing; "" is the top level. */
  const [browsePath, setBrowsePath] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChildren = (path: string) =>
    folders.some((other) => other !== path && other.startsWith(`${path}/`));

  const openAt = (path: string) => {
    setBrowsePath(path);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 320);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    // Below the trigger when there's room, above it otherwise.
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > 300 ? rect.bottom + 6 : undefined;
    const bottom =
      spaceBelow > 300 ? undefined : window.innerHeight - rect.top + 6;
    setMenuStyle({ position: "fixed", top, bottom, left, width, zIndex: 200 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    };
    const onScroll = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle((prev) =>
        prev
          ? {
              ...prev,
              top: prev.top !== undefined ? rect.bottom + 6 : undefined,
              bottom:
                prev.bottom !== undefined
                  ? window.innerHeight - rect.top + 6
                  : undefined,
              left: prev.left,
            }
          : prev
      );
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [open]);

  const rows = childFolders(folders, browsePath);
  const parentOf = (path: string) =>
    path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() =>
          open ? setOpen(false) : openAt(value ? parentOf(value) : "")
        }
        className={`flex h-10 w-full items-center gap-2 rounded-lg border border-border-light bg-white px-3 text-left text-[13px] text-text-primary transition-colors hover:border-blue-subtle focus:border-blue-primary focus:shadow-input-focus focus:outline-none ${className}`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            value
              ? "bg-blue-light text-blue-primary"
              : "bg-[color:#B02020]/10 text-[color:#B02020]"
          }`}
        >
          <Folder size={13} strokeWidth={2.1} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${value ? "font-medium" : "text-text-tertiary"}`}
        >
          {value ? materialFolderLabel(value) : "Choose a folder"}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={`shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label={`${ariaLabel} browser`}
            style={menuStyle ?? undefined}
            className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
          >
            {/* Where you are. The back arrow climbs one level, like any
                explorer window. */}
            <div className="flex items-center gap-2 border-b border-border-light bg-surface px-3 py-2.5">
              {browsePath ? (
                <button
                  type="button"
                  onClick={() => setBrowsePath(parentOf(browsePath))}
                  aria-label="Back to the folder above"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white hover:text-blue-primary"
                >
                  <ChevronLeft size={15} strokeWidth={2.2} />
                </button>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                  <FolderOpen size={13} strokeWidth={2.1} />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-text-secondary">
                {browsePath ? materialFolderLabel(browsePath) : "All folders"}
              </span>
              {browsePath && hasChildren(browsePath) && (
                <span className="shrink-0 text-[10.5px] text-text-tertiary">
                  pick a subfolder
                </span>
              )}
            </div>

            <ul className="max-h-[290px] overflow-y-auto p-1.5">
              {rows.map((path, index) => {
                const parent = hasChildren(path);
                const name = path.split("/").pop() || path;
                const files = countUnder(materials, path);
                const kids = childFolders(folders, path).length;
                const selected = value === path;
                return (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() =>
                        parent ? setBrowsePath(path) : (onChange(path), setOpen(false))
                      }
                      className={`step-in flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        selected
                          ? "bg-blue-light"
                          : "hover:bg-surface"
                      }`}
                      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          parent
                            ? "bg-[color:#7C3AED]/10 text-[color:#7C3AED]"
                            : "bg-blue-light text-blue-primary"
                        }`}
                      >
                        {parent ? (
                          <FolderOpen size={15} strokeWidth={2} />
                        ) : (
                          <Folder size={15} strokeWidth={2} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13px] ${selected ? "font-semibold text-blue-primary" : "font-medium text-text-primary"}`}
                        >
                          {name}
                        </span>
                        <span className="block text-[10.5px] text-text-tertiary">
                          {parent
                            ? `${kids} ${kids === 1 ? "subfolder" : "subfolders"} inside. Open to pick one`
                            : `${files} ${files === 1 ? "file" : "files"}`}
                        </span>
                      </span>
                      {parent ? (
                        <ChevronRight
                          size={15}
                          strokeWidth={2.1}
                          className="shrink-0 text-text-tertiary"
                        />
                      ) : selected ? (
                        <Check
                          size={15}
                          strokeWidth={2.4}
                          className="shrink-0 text-blue-primary"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
