"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, FileWarning } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * THE FILE AS IT WAS UPLOADED — not a summary of it.
 *
 * Two earlier attempts were not good enough and it is worth writing down why,
 * because both looked like progress:
 *
 *   1. Serving the bytes with `Content-Disposition: inline`. A browser renders
 *      PDF, images and video that way and has NO viewer for Word, PowerPoint or
 *      Excel, so a .docx still downloaded. Nine of Eswar's files are .docx.
 *   2. Converting on the server to HTML / slide text. That reads, but it is not
 *      the document: no layout, no images, no slide design (Anir, Jul 30: "I
 *      want to be able to view it in the exact form that it was uploaded… for
 *      the slide, I can actually see the slide deck. Why are you taking
 *      shortcuts?").
 *
 * So the real file is fetched and RENDERED here: docx-preview lays out the Word
 * document page by page with its own styles, tables and images; pptx-preview
 * draws each slide. Both work on the raw bytes, in the browser, from our own
 * authenticated URL — the document never goes to Microsoft's or Google's
 * embedded viewers, which matters for a regulatory business's internal files.
 *
 * PDF, video and images are already exact, so they are simply embedded.
 */

type Sheets = { name: string; html: string }[];
type Listing = { name: string; size: string }[];

function extensionOf(path: string): string {
  return (path.split(".").pop() || "").toLowerCase();
}

export function MaterialViewer({
  offeringId,
  path,
  label,
  downloadUrl,
  onClose,
}: {
  offeringId: string;
  path: string;
  label: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheets | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [sheet, setSheet] = useState(0);
  /** How many slides a deck turned out to have — said out loud, because a
   *  second slide below the fold is a second slide nobody knows exists. */
  const [slideCount, setSlideCount] = useState(0);
  /** The renderer gave up entirely and we are reading the deck instead. */
  const [fellBack, setFellBack] = useState(false);
  /** It drew some slides and then failed; what is on screen is incomplete. */
  const [partial, setPartial] = useState(false);
  const [slides, setSlides] = useState<{ title: string; lines: string[] }[] | null>(null);

  const ext = extensionOf(path);
  const inlineUrl = `${downloadUrl}${downloadUrl.includes("?") ? "&" : "?"}view=1`;
  const isNative = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov"].includes(ext);

  useEffect(() => {
    if (isNative) {
      setStatus("ready");
      return;
    }
    let live = true;

    // Spreadsheets and archives have no visual layout worth reproducing — a
    // table and a file list ARE the document. Also the safety net when a deck
    // defeats the renderer.
    const loadServerPreview = async () => {
      const res = await fetch(
        `/api/offerings/${offeringId}/materials/preview?path=${encodeURIComponent(path)}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not open that file");
      if (!live) return;
      const p = body.preview || {};
      if (p.kind === "sheets") setSheets(p.sheets);
      else if (p.kind === "listing") setListing(p.entries);
      else if (p.kind === "slides") setSlides(p.slides);
      else if (p.kind === "unsupported") {
        setMessage(p.reason);
        setStatus("error");
        return;
      }
      setStatus("ready");
    };

    (async () => {
      try {
        if (ext === "docx" || ext === "pptx") {
          // The raw file, from our own route — same origin, already authorised.
          const res = await fetch(inlineUrl, { cache: "no-store" });
          if (!res.ok) throw new Error("Could not read that file");
          const buffer = await res.arrayBuffer();
          if (!live) return;
          const container = host.current;
          if (!container) return;
          container.innerHTML = "";

          if (ext === "docx") {
            const docx = await import("docx-preview");
            await docx.renderAsync(buffer, container, undefined, {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
              experimental: true,
            });
          } else {
            const { init } = await import("pptx-preview");
            // Sized to the dialog so slides fill it at 16:9 rather than
            // rendering at some default and sitting in a corner.
            const width = container.clientWidth || 900;
            const previewer = init(container, {
              width,
              height: Math.round((width * 9) / 16),
            });
            /**
             * ONE AWKWARD SHAPE MUST NOT COST THE WHOLE DECK.
             *
             * The renderer THROWS on decks it cannot fully handle — the 68-slide
             * Freyr master deck dies on "Cannot read properties of undefined
             * (reading 'target')" part-way through. That surfaced as "Could not
             * read that file", which was both wrong (the file downloaded fine)
             * and useless. Whatever it managed to draw is kept, and only when it
             * drew nothing at all do we fall back to reading the deck.
             */
            try {
              await previewer.preview(buffer);
            } catch {
              const drawn = container.querySelectorAll(".pptx-preview-wrapper > div").length;
              if (drawn === 0) {
                if (live) setFellBack(true);
                await loadServerPreview();
                return;
              }
              if (live) setPartial(true);
            }
            if (live) setSlideCount(container.querySelectorAll(".pptx-preview-wrapper > div").length || 0);
          }
          if (live) setStatus("ready");
          return;
        }

        await loadServerPreview();
      } catch (e) {
        if (!live) return;
        setMessage(
          e instanceof Error ? e.message : "Could not open that file"
        );
        setStatus("error");
      }
    })();

    return () => {
      live = false;
    };
  }, [ext, inlineUrl, isNative, offeringId, path]);

  return (
    <Modal
      open
      onClose={onClose}
      title={label}
      // The widest dialog the app has: a slide rendered small in a narrow box
      // is a slide nobody reads.
      size="chart"
      actions={
        <>
          <a
            href={downloadUrl}
            title="Download the original file"
            aria-label="Download the original file"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
          >
            <Download size={16} strokeWidth={1.9} />
          </a>
          <a
            href={inlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in a new tab"
            aria-label="Open in a new tab"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
          >
            <ExternalLink size={16} strokeWidth={1.9} />
          </a>
          <span className="mx-1 h-5 w-px bg-border-light" />
        </>
      }
    >
      <div className="flex h-[calc(100vh-9rem)] flex-col">
        {(fellBack || partial) && (
          <p className="mb-2 shrink-0 rounded-lg bg-[color:#C2410C]/10 px-3 py-2 text-[12px] font-medium text-[color:#C2410C]">
            {fellBack
              ? "This deck uses shapes the in-app renderer cannot draw, so it is shown as text, slide by slide. Download the original for the designed version."
              : "Part of this deck uses shapes the renderer cannot draw, so it stops early. Download the original for the whole deck."}
          </p>
        )}
        {slideCount > 1 && (
          <p className="mb-2 shrink-0 text-[12px] font-medium text-text-secondary">
            {slideCount} slides · scroll to move through the deck
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border-light bg-[var(--surface)]">
          {status === "loading" && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-20">
              {/* A ring that traces itself, over a soft page-shaped pulse. The
                  spinner used to sit in the top-left corner of an otherwise
                  empty white box, which reads as a page that failed rather than
                  one that is working (Anir: "it looks super ugly… in the middle
                  top, show a nice loading animation"). */}
              <span className="relative flex h-14 w-14 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-blue-primary/10 animate-ping" />
                <span className="absolute inset-0 rounded-full border-2 border-blue-primary/15" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-primary" />
                <FileText size={20} strokeWidth={1.8} className="text-blue-primary" />
              </span>
              <span className="text-center">
                <span className="block text-[13.5px] font-semibold text-text-primary">
                  Opening {label}
                </span>
                <span className="mt-0.5 block text-[12px] text-text-secondary">
                  Rendering the file exactly as it was uploaded
                </span>
              </span>
            </div>
          )}

          {status === "error" && (
            <p className="flex items-start gap-2 py-8 text-[13px] text-text-secondary">
              <FileWarning size={16} className="mt-0.5 shrink-0 text-[color:#C2410C]" />
              {message}
            </p>
          )}

          {/* Exact by definition: the browser's own PDF, video and image
              rendering of the very bytes that were uploaded. */}
          {isNative && ext === "pdf" && (
            <iframe src={inlineUrl} title={label} className="h-[68vh] w-full rounded-lg bg-white" />
          )}
          {isNative && ["mp4", "webm", "mov"].includes(ext) && (
            <video src={inlineUrl} controls autoPlay className="max-h-[68vh] w-full rounded-lg" />
          )}
          {isNative && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inlineUrl} alt={label} className="mx-auto max-h-[68vh] rounded-lg" />
          )}

          {/* Word and PowerPoint render into here, with their own layout. */}
          {(ext === "docx" || ext === "pptx") && (
            <div
              ref={host}
              className={
                ext === "docx"
                  ? "material-docx mx-auto bg-white"
                  : "material-pptx mx-auto"
              }
            />
          )}

          {slides && (
            <div className="space-y-3 p-3">
              {slides.map((sl, i) => (
                <div key={i} className="rounded-xl border border-border-light bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Slide {i + 1} of {slides.length}
                  </p>
                  <p className="mt-1 break-words text-[15px] font-semibold text-text-primary">
                    {sl.title}
                  </p>
                  {sl.lines.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {sl.lines.map((line, j) => (
                        <li key={j} className="break-words text-[13px] leading-relaxed text-text-secondary">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {sheets && (
            <>
              {sheets.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {sheets.map((s, i) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setSheet(i)}
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                        i === sheet
                          ? "bg-blue-light text-blue-primary"
                          : "text-text-secondary hover:bg-white"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <div
                className="material-sheet overflow-x-auto rounded-lg bg-white p-3 text-[12.5px]"
                dangerouslySetInnerHTML={{ __html: sheets[sheet]?.html || "" }}
              />
            </>
          )}

          {listing && (
            <div className="rounded-lg bg-white p-3">
              <p className="mb-2 text-[12.5px] text-text-secondary">
                {listing.length} files inside this archive. Download it to open them.
              </p>
              <ul className="divide-y divide-border-light">
                {listing.map((e) => (
                  <li
                    key={e.name}
                    className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"
                  >
                    <span className="min-w-0 break-all text-text-primary">{e.name}</span>
                    <span className="shrink-0 tnum text-text-tertiary">{e.size}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
