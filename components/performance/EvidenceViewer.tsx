"use client";

import { Download, ExternalLink, FileText } from "lucide-react";
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

