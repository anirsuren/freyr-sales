"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";

/**
 * THE PROOF, OPENABLE — an attachment nobody can look at is not evidence
 * (Anir, Aug 15: "it's not letting me open that thing… there should be a
 * preview of that, just like offerings and sales materials").
 *
 * Images and PDFs render in place; anything else gets the two things a browser
 * can actually do with it. Same idea as the material viewer, at the size this
 * surface needs.
 */
export function EvidencePreview({
  file,
  onClose,
}: {
  file: { name: string; url: string };
  onClose: () => void;
}) {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
  const isPdf = ext === "pdf";
  return (
    <Modal
      open
      onClose={onClose}
      title={file.name}
      size="wide"
      tall
      actions={
        <span className="flex items-center gap-1">
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            title="Open in a new tab"
            aria-label="Open in a new tab"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <ExternalLink size={15} strokeWidth={2.1} />
          </a>
          <a
            href={file.url}
            download={file.name}
            title="Download"
            aria-label="Download"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <Download size={15} strokeWidth={2.1} />
          </a>
        </span>
      }
    >
      <div className="flex min-h-[420px] items-center justify-center">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url}
            alt={file.name}
            className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
          />
        ) : isPdf ? (
          <iframe src={file.url} title={file.name} className="h-[72vh] w-full rounded-lg bg-white" />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText size={34} strokeWidth={1.6} className="text-text-tertiary" />
            <p className="text-[13px] text-text-secondary">
              {ext ? `.${ext} files` : "This file type"} open in their own app.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * THE PROOF, ALREADY OPEN (Anir, Aug 16: "If I click on 'Review this claim,'
 * I shouldn't even have to open up the proof. The proof should just show up
 * automatically in its own rendered thing. Now, whatever is a PDF or a
 * contract, it should show up here underneath").
 *
 * Same three cases as the modal above, rendered in place at the size the host
 * gives it. Anything a browser cannot draw still offers the two things it can
 * do: open it, or download it.
 */
export function EvidenceInline({
  file,
  height = 380,
}: {
  file: { name: string; url: string };
  height?: number;
}) {
  /** Reserved height with nothing in it reads as broken (Anir, Aug 16: "if ur
   *  showing it's loading then show that its loading but before this it was
   *  just blank so i was confused"). */
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
  const isPdf = ext === "pdf";
  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-surface">
      <div className="flex items-center gap-2 border-b border-border-light bg-white px-3 py-2">
        <FileText size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-primary">
          {file.name}
        </span>
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          className="flex items-center gap-1 text-[11.5px] font-semibold text-blue-primary hover:underline"
        >
          <ExternalLink size={12} strokeWidth={2.2} /> Open
        </a>
        <a
          href={file.url}
          download={file.name}
          title="Download"
          className="flex items-center gap-1 text-[11.5px] font-semibold text-text-secondary hover:text-text-primary"
        >
          <Download size={12} strokeWidth={2.2} /> Save
        </a>
      </div>
      {isImage ? (
        /* The frame keeps its height while the file loads, so the dialog does
           not jump the moment the image arrives. */
        <div
          className="relative flex items-center justify-center p-2"
          style={{ minHeight: Math.min(height, 240) }}
        >
          {state !== "ready" && (
            <span className="absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-lg bg-white">
              {state === "loading" ? (
                <>
                  <span className="skeleton-shimmer h-full w-full rounded-lg" />
                  <span className="absolute text-[11.5px] text-text-tertiary">
                    Loading the proof…
                  </span>
                </>
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-center">
                  <FileText size={22} strokeWidth={1.8} className="text-text-tertiary" />
                  <span className="text-[12px] text-text-secondary">
                    This one would not display here. Use Open or Save above.
                  </span>
                </span>
              )}
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.name}
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
            style={{ maxHeight: height }}
            className={cn(
              "w-auto max-w-full object-contain transition-opacity",
              state === "ready" ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      ) : isPdf ? (
        <div className="relative" style={{ height }}>
          {state === "loading" && (
            <span className="absolute inset-0 flex items-center justify-center bg-white text-[11.5px] text-text-tertiary">
              Loading the proof…
            </span>
          )}
          <iframe
            src={file.url}
            title={file.name}
            onLoad={() => setState("ready")}
            className="h-full w-full bg-white"
          />
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-[12.5px] text-text-secondary">
          {ext ? `.${ext} files` : "This file type"} open in their own app — use
          Open or Save above.
        </p>
      )}
    </div>
  );
}

/** A real thumbnail for an image, a typed tile for anything else. */
export function EvidenceThumb({ file }: { file: { name: string; url: string } }) {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
      <FileText size={16} strokeWidth={1.9} className="text-text-tertiary" />
    </span>
  );
}

