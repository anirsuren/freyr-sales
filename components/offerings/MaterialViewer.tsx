"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Download,
  ExternalLink,
  Link2,
  FileText,
  Info,
  FileWarning,
  Maximize2,
  Minus,
  Plus,
  FolderArchive,
  Table2,
  Presentation,
  Video,
  File,
  Image as ImageIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { PdfViewer } from "@/components/offerings/PdfViewer";
import { VideoPlayer } from "@/components/offerings/VideoPlayer";
import { askFreyrAgent } from "@/lib/agentEvents";
import {
  ACCESS_LEVEL_META,
  JOURNEY_STAGE_META,
  MATERIAL_FORMAT_META,
  materialFormat,
  materialJourneyStages,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

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

type SheetCell = string | number | boolean | null;
type Sheets = {
  name: string;
  rows: SheetCell[][];
  /** The workbook's own formatting, sent by the preview route: a sparse map
   *  keyed "row:col" plus column widths and merged ranges (Anir, Aug 25). */
  styles?: Record<
    string,
    {
      bg?: string;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right";
    }
  >;
  widths?: (number | null)[];
  merges?: [number, number, number, number][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}[];
type Listing = { name: string; size: string }[];

function spreadsheetColumnLabel(index: number): string {
  let label = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function extensionOf(path: string): string {
  return (path.split(".").pop() || "").toLowerCase();
}

export function MaterialViewer({
  offeringId,
  offeringName,
  material,
  path,
  label,
  downloadUrl,
  openInNewTabUrl,
  onClose,
  standalone = false,
  embed = false,
  initialMember = null,
}: {
  offeringId: string;
  offeringName: string;
  material: OfferingMaterial;
  path: string;
  label: string;
  downloadUrl: string;
  openInNewTabUrl: string;
  onClose: () => void;
  /** Render as the content of a dedicated material route, not inside a dialog. */
  standalone?: boolean;
  /**
   * BARE DOCUMENT MODE, for the hover peek. Same renderers as a click —
   * docx-preview, pptx-preview drawing real slides, the native PDF viewer —
   * with no header, no metadata, no toolbar. The peek must look exactly like
   * opening the file (Anir, Aug 8: "it has to look the same as if I clicked
   * on it, show the actual file"), and the only way to guarantee that is to
   * BE the same component.
   */
  embed?: boolean;
  /** Open straight onto this file inside the archive — how "Open in a new
   *  tab" keeps showing the MEMBER you were reading, not the ZIP manifest. */
  initialMember?: string | null;
}) {
  /** The ZIP remains the material of record. Opening a row swaps only the
   * bytes rendered in this dialog; Back returns to the archive manifest. */
  const [archiveMember, setArchiveMember] = useState<string | null>(initialMember);
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheets | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [archiveKnowledge, setArchiveKnowledge] = useState<
    "idle" | "loading" | "ready"
  >("idle");
  const [archiveKnowledgeFiles, setArchiveKnowledgeFiles] = useState(0);
  const [sheet, setSheet] = useState(0);
  /** The renderer gave up entirely and we are reading the deck instead. */
  const [fellBack, setFellBack] = useState(false);
  /** Two seconds of "copied", so the click is acknowledged. */
  const [copied, setCopied] = useState(false);
  /**
   * THE SERVER'S PDF OF AN OFFICE FILE, when LibreOffice printed one (Anir,
   * Aug 25: "the way it looks when I download and open it is the exact way it
   * has to look in the app"). A blob URL: fetched once here, handed to the
   * same PdfViewer a native PDF uses, so a deck pages and zooms exactly like
   * a PDF because it IS one.
   */
  const [convertedPdf, setConvertedPdf] = useState<string | null>(null);
  /**
   * The link is THIS page with ?material=<id> on it, which the materials
   * section reads on load and opens straight into the viewer. Built from the
   * live location so it carries the right host — localhost while reviewing,
   * the real domain in production — instead of a guessed origin.
   */
  const copyShareLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("material", material.id);
    if (archiveMember) url.searchParams.set("member", archiveMember);
    else url.searchParams.delete("member");
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // Clipboard refused (no permission, insecure origin): select it instead
      // so the keyboard still works rather than the button doing nothing.
      const box = document.createElement("input");
      box.value = url.toString();
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  /** It drew some slides and then failed; what is on screen is incomplete. */
  const [partial, setPartial] = useState(false);
  const [slides, setSlides] = useState<{ title: string; lines: string[] }[] | null>(null);

  /**
   * ZOOM THAT BELONGS TO THE DOCUMENT, NOT THE BROWSER.
   *
   * Cmd-+ inside the dialog zoomed the whole tab — the sidebar, the offering
   * page behind the dialog, everything — which is exactly what you do not want
   * when the thing you cannot read is a table inside a Word file (Anir, Jul 30:
   * "please let me zoom in… when I zoom in, it zooms in the entire tab").
   *
   * The CSS `zoom` property, not `transform: scale()`, on purpose: `zoom`
   * relayouts, so the scroll height and the scrollbar stay honest at 200%.
   * A transform would leave the page scrollable to its 100% height and clip
   * everything past it.
   */
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  /** The page/slide elements the renderer produced, for the position readout. */
  const pageEls = useRef<HTMLElement[]>([]);
  /**
   * A WORD FILE WITH NO PAGE BREAKS IS STILL A DOCUMENT WITH PAGES.
   *
   * docx-preview only starts a new <section> at an EXPLICIT page break, so a
   * file that just runs on — most of Eswar's outreach templates — renders as
   * one very tall section and the counter had nothing to count (Anir, Jul 30:
   * "I still don't see any page numbers here"). Word itself knows the page
   * height, and docx-preview writes it onto the section as min-height, so we
   * number the flow by the document's own page size. Same numbers Word would
   * print in the corner.
   */
  const flow = useRef<{ el: HTMLElement; pxPerPage: number } | null>(null);

  /**
   * WHICH ELEMENT ACTUALLY SCROLLS.
   *
   * pptx-preview builds its own scrolling viewport sized to one slide and puts
   * every slide inside it, so for a deck the outer box has scrollHeight ===
   * clientHeight and never fires a scroll event. That is why the slide counter
   * sat on 1 forever, and why the deck looked like it "stopped" at slide one
   * (Anir, Jul 30: "why are you stopping the demo there?"). Word documents
   * scroll in the outer box as normal.
   */
  const scrollBox = useCallback((): HTMLElement | null => {
    const outer = scroller.current;
    if (!outer) return null;
    // In embed the pptx wrapper is UNLOCKED (height auto) so the OUTER box is
    // what scrolls — reading the wrapper there left the slide counter stuck on
    // whatever it last saw (Anir, Aug 8: "I was on slide 13 and it was saying
    // slide 5").
    if (embed) return outer;
    return (
      outer.querySelector<HTMLElement>(".pptx-preview-wrapper") ?? outer
    );
  }, [embed]);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  /** Embed only: true while the reader is actively scrolling, so the page
   *  number can show itself and get out of the way again (Anir, Aug 8: "the
   *  page numbers... shouldn't always show up — when I'm scrolling"). */
  const [peekScrolling, setPeekScrolling] = useState(false);
  const peekScrollTimer = useRef<number | null>(null);
  /** Embed only: the archive back button shows itself when the pointer nears
   *  the top-left corner, and stays out of the way otherwise (Anir, Aug 8:
   *  "the back arrow should only appear when my cursor approaches the top
   *  left"). */
  const [backHot, setBackHot] = useState(false);

  const currentPath = archiveMember || path;
  const currentLabel = archiveMember
    ? archiveMember.split("/").pop() || archiveMember
    : label;
  const memberUrl = archiveMember
    ? `/api/offerings/${offeringId}/materials/archive?path=${encodeURIComponent(path)}&member=${encodeURIComponent(archiveMember)}`
    : null;
  const currentDownloadUrl = memberUrl || downloadUrl;
  const ext = extensionOf(currentPath);
  const inlineUrl = `${currentDownloadUrl}${currentDownloadUrl.includes("?") ? "&" : "?"}view=1`;
  const isNative = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov", "txt", "md", "csv"].includes(ext);
  // Video gets a cinema treatment: documents and decks FILL the tall viewer,
  // but a 16:9 video pinned to the top of it left a big dead white block
  // underneath (Anir: "it's taking up an awkward amount of space"). Centre the
  // player on black instead, like every native video lightbox.
  const isVideo = isNative && ["mp4", "webm", "mov"].includes(ext);
  const isText = isNative && ["txt", "md", "csv"].includes(ext);

  // Keep the assistant aware of the exact file on screen without forcing the
  // chat panel open. The dock remains available above this full-screen viewer;
  // when the rep opens it, the first question starts a clean material-focused
  // conversation rather than inheriting an unrelated offering thread.
  useEffect(() => {
    askFreyrAgent({
      open: false,
      newConversation: true,
      offering: {
        id: offeringId,
        name: offeringName,
        material: {
          id: material.id,
          label: currentLabel,
          kind: material.kind,
          folder: material.folder,
          accessLevel: material.accessLevel,
          journeyStages: materialJourneyStages(material),
          description: material.description,
        },
      },
    });
  }, [currentLabel, material, offeringId, offeringName]);

  useEffect(
    () => () => {
      // If no material conversation was started, closing the viewer must not
      // leave the unopened dock silently focused on a file that is no longer
      // on screen. An active conversation keeps its own saved context.
      askFreyrAgent({
        open: false,
        newConversation: false,
        offering: { id: offeringId, name: offeringName },
      });
    },
    [offeringId, offeringName]
  );

  useEffect(() => {
    setStatus("loading");
    setMessage(null);
    setConvertedPdf(null);
    setSheets(null);
    setListing(null);
    setSlides(null);
    setSheet(0);
    setFellBack(false);
    setPartial(false);
    setZoom(1);
    setPage(1);
    setPageCount(0);
    pageEls.current = [];
    flow.current = null;
    if (host.current) host.current.innerHTML = "";

    if (isNative) {
      // The custom PDF viewer owns its loading state. Plain text still uses a
      // frame, so keep the shared loading state until that frame says it is
      // ready instead of showing a large, unexplained white rectangle.
      if (isText) return;
      setStatus("ready");
      return;
    }
    let live = true;

    // Spreadsheets and archives have no visual layout worth reproducing — a
    // table and a file list ARE the document. Also the safety net when a deck
    // defeats the renderer.
    const loadServerPreview = async () => {
      const res = await fetch(
        `/api/offerings/${offeringId}/materials/preview?path=${encodeURIComponent(path)}${archiveMember ? `&member=${encodeURIComponent(archiveMember)}` : ""}`,
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
        /* THE REAL RENDERER FIRST. LibreOffice on the server prints the file
           to PDF — the only rendering that survives real designers' decks —
           and the in-browser reconstructions below become the fallback for
           hosts without it (the route answers 501 there). Files inside ZIP
           archives keep the old path: the route converts stored files, not
           archive members. */
        if (!archiveMember && ["pptx", "ppt", "docx", "doc"].includes(ext)) {
          try {
            const pdfUrl = `/api/offerings/${offeringId}/materials/pdf?path=${encodeURIComponent(path)}`;
            /* HEAD first: it runs the same conversion and warms the cache,
               but answers with headers only — so the bytes travel once, when
               PdfViewer fetches the URL itself. The page's CSP does not allow
               connecting to blob: URLs, which is why this is a URL handoff
               and not a blob. */
            const probe = await fetch(pdfUrl, { method: "HEAD", cache: "no-store" });
            if (probe.ok) {
              if (!live) return;
              setConvertedPdf(pdfUrl);
              setStatus("ready");
              return;
            }
          } catch {
            /* conversion unreachable: the old renderers still work */
          }
        }

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
            /**
             * A SLIDE SHOULD FILL THE DIALOG, TOP TO BOTTOM.
             *
             * Sizing from width alone left a 16:9 slide short of the bottom of
             * a tall dialog, with a band of empty grey under every one (Anir,
             * Jul 30: "why are you stopping the demo there? … It should go all
             * the way up until the bottom, almost"). A slide is constrained by
             * BOTH edges, so take whichever binds: on a wide dialog that is the
             * height, on a narrow one the width.
             */
            const box = scroller.current;
            const availW = box?.clientWidth || container.clientWidth || 900;
            const availH = box?.clientHeight || 700;
            const width = embed
              ? Math.max(200, availW)
              : Math.max(560, Math.min(availW, Math.floor((availH * 16) / 9)));
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
            /**
             * A DECK THAT DREW NOTHING READABLE IS A FAILED RENDER, even when
             * the renderer did not throw (Anir, Aug 25: "she uploaded this PPT
             * which I was able to download but I wasn't able to view. It's just
             * fully black").
             *
             * Reproduced on Freya.Label's Label Change deck: pptx-preview
             * returned cleanly, painted 38 black slide backgrounds and no text,
             * so the old guard — which only fell back when it THREW and had
             * drawn zero elements — sat there showing a black rectangle. The
             * honest test is the OUTPUT: a deck with almost no rendered text is
             * not a deck anybody can read, whatever the renderer claims. Fall
             * back to the server's slide outline, which is text and works.
             */
            let renderFailed = false;
            try {
              await previewer.preview(buffer);
            } catch {
              const drawn = container.querySelectorAll(".pptx-preview-wrapper > div").length;
              if (drawn === 0) renderFailed = true;
              else if (live) setPartial(true);
            }
            if (!renderFailed) {
              const drawn = container.querySelectorAll(
                ".pptx-preview-wrapper > div"
              ).length;
              // ~8 characters per drawn slide is a very low bar: a title-only
              // slide clears it. Nothing at all does not.
              const rendered = (container.innerText || "").replace(/\s+/g, "");
              if (drawn === 0 || rendered.length < Math.max(24, drawn * 8)) {
                renderFailed = true;
              }
            }
            if (renderFailed) {
              container.innerHTML = "";
              if (live) setFellBack(true);
              await loadServerPreview();
              return;
            }
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
  }, [archiveMember, embed, ext, inlineUrl, isNative, isText, offeringId, path]);

  useEffect(() => {
    setArchiveMember(null);
  }, [path]);

  /**
   * OLDER ARCHIVES NEED THE SAME AI INDEX AS NEW UPLOADS.
   *
   * The original proposal ZIPs pre-date archive extraction. Opening an
   * archive is the natural, explicit moment for its owner to refresh the
   * private knowledge index: the original file is untouched, cached archives
   * return immediately, and non-owners simply keep the normal viewer.
   */
  useEffect(() => {
    if (extensionOf(path) !== "zip" || archiveMember) return;
    let live = true;
    setArchiveKnowledge("loading");
    setArchiveKnowledgeFiles(0);

    fetch(`/api/offerings/${offeringId}/materials/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!live) return;
        if (!response.ok) {
          // Viewing still works for every authorised seller. Only an offering
          // owner may change the shared AI index, so do not turn a permissions
          // boundary into a scary viewer error.
          setArchiveKnowledge("idle");
          return;
        }
        setArchiveKnowledgeFiles(
          Array.isArray(body.archiveMembers) ? body.archiveMembers.length : 0
        );
        setArchiveKnowledge("ready");
      })
      .catch(() => {
        if (live) setArchiveKnowledge("idle");
      });

    return () => {
      live = false;
    };
  }, [archiveMember, offeringId, path]);

  /**
   * A LIBRARY DEFECT MUST NOT LOOK LIKE AN APP CRASH.
   *
   * pptx-preview rejects a promise per slide it cannot draw, and the 68-slide
   * master deck produces several. We already catch the one we await, but the
   * others surface as unhandled rejections — which is what Next's overlay was
   * counting when it said "3 issues" on a deck that had rendered fine. Only
   * this one known message is swallowed, and only while a deck is open, so a
   * genuine error anywhere else still shouts.
   */
  useEffect(() => {
    if (ext !== "pptx") return;
    const swallow = (e: PromiseRejectionEvent) => {
      const m = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "");
      if (m.includes("reading 'target'")) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", swallow);
    return () => window.removeEventListener("unhandledrejection", swallow);
  }, [ext]);

  /**
   * EMBED = FIT WIDTH, ALWAYS. A Word page renders at its own ~816px and a
   * 560px peek showed the top-left corner of it with dead space elsewhere
   * (Anir, Aug 8: "the pptx are supposed to take up the entire dimensions...
   * this applies to all the popups"). Measure the rendered document once and
   * zoom it to the frame; CSS `zoom` keeps scroll height honest.
   */
  useEffect(() => {
    if (!embed || status !== "ready" || ext !== "docx") return;
    const box = scroller.current;
    const doc = host.current;
    if (!box || !doc) return;
    const natural = doc.scrollWidth;
    if (natural > 0 && box.clientWidth > 0) {
      setZoom(Math.min(3, Math.max(0.2, box.clientWidth / natural)));
    }
  }, [embed, status, ext]);

  /**
   * TELL THE PEEK HOW TALL THE DOCUMENT REALLY IS. A one-slide deck is ~315px
   * in a 420px frame, and the difference rendered as dead white space under
   * the slide (Anir, Aug 8: "no empty space, since it's small already"). The
   * embed posts its content height up to the parent, which shrinks the card
   * to fit. Same-origin on both sides; the parent verifies the source.
   */
  useEffect(() => {
    if (!embed || status !== "ready") return;
    const box = scroller.current;
    if (!box) return;
    const onScroll = () => {
      setPeekScrolling(true);
      if (peekScrollTimer.current !== null)
        window.clearTimeout(peekScrollTimer.current);
      peekScrollTimer.current = window.setTimeout(
        () => setPeekScrolling(false),
        900
      );
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      if (peekScrollTimer.current !== null)
        window.clearTimeout(peekScrollTimer.current);
    };
  }, [embed, status]);

  /** The peek forwards wheel deltas from the parent page — scrolling with the
   *  pointer still on the row must scroll the DOCUMENT, not the page under it
   *  (Anir, Aug 8: "it does that when I scroll in the preview"). */
  useEffect(() => {
    if (!embed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; deltaY?: number };
      if (data?.type !== "freyr-embed-scroll" || typeof data.deltaY !== "number") return;
      scroller.current?.scrollBy({ top: data.deltaY });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embed]);

  useEffect(() => {
    if (!embed || status !== "ready") return;
    const box = scroller.current;
    if (!box) return;
    const report = () => {
      window.parent?.postMessage(
        { type: "freyr-embed-size", height: box.scrollHeight },
        window.location.origin
      );
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [embed, status, zoom]);

  const changeZoom = useCallback((next: number) => {
    // 50%–300%. Below 50% a Word page is unreadable anyway; above 300% one
    // rendered page is taller than any screen and scrolling loses its place.
    setZoom(Math.min(3, Math.max(0.5, Math.round(next * 100) / 100)));
  }, []);

  /** Cmd/Ctrl + wheel zooms the DOCUMENT. Registered natively because React's
   *  synthetic wheel listener is passive, and a passive listener cannot
   *  preventDefault — so the browser would zoom the tab regardless. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) =>
        Math.min(3, Math.max(0.5, Math.round((z - e.deltaY * 0.01) * 100) / 100))
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [status]);

  /** Cmd-+ / Cmd-- / Cmd-0, intercepted so they land on the document. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * WHICH PAGE AM I ON. A 60-page contract with no position readout is a wall
   * of text you cannot navigate or talk about (Anir: "it doesn't say page
   * numbers, anything"). Both renderers emit one element per page or slide, so
   * the count is real — not an estimate from scroll height.
   */
  useEffect(() => {
    if (status !== "ready") return;
    const el = scrollBox();
    if (!el) return;
    const selector =
      ext === "docx"
        ? ".docx-wrapper > section, .docx > section, section.docx"
        : ext === "pptx"
          ? ".pptx-preview-wrapper > div"
          : ".viewer-page";
    // The renderers finish writing to the DOM a tick after they resolve.
    const measure = () => {
      const found = Array.from(el.querySelectorAll<HTMLElement>(selector));
      if (found.length > 1) {
        pageEls.current = found;
        flow.current = null;
        setPageCount(found.length);
        return;
      }
      // One long section: derive the pages from the page height Word stored.
      const sec = found[0];
      if (sec) {
        const declared = parseFloat(getComputedStyle(sec).minHeight);
        // `zoom` scales what is on screen but not the computed CSS length, so
        // the on-screen page height has to be scaled to match the rects below.
        const pxPerPage = declared * zoom;
        const rendered = sec.getBoundingClientRect().height;
        if (pxPerPage > 100 && rendered > pxPerPage * 1.2) {
          flow.current = { el: sec, pxPerPage };
          pageEls.current = [];
          setPageCount(Math.max(1, Math.round(rendered / pxPerPage)));
          return;
        }
      }
      pageEls.current = found;
      flow.current = null;
      setPageCount(found.length);
    };
    measure();
    const t = setTimeout(measure, 400);

    const sync = () => {
      if (flow.current) {
        const { el: sec, pxPerPage } = flow.current;
        // How far into the section the top of the viewport has travelled.
        const into = el.getBoundingClientRect().top - sec.getBoundingClientRect().top;
        setPage(Math.max(1, Math.floor(into / pxPerPage) + 1));
        return;
      }
      const pages = pageEls.current;
      if (pages.length === 0) return;
      // The page that owns the top third of the viewport is the page you are
      // reading — not the one that happens to touch the very top edge.
      const mark = el.getBoundingClientRect().top + el.clientHeight / 3;
      let current = 1;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].getBoundingClientRect().top <= mark) current = i + 1;
        else break;
      }
      setPage(current);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      clearTimeout(t);
      el.removeEventListener("scroll", sync);
    };
  }, [status, ext, slides, zoom, scrollBox]);

  const unit = ext === "pptx" || slides ? "Slide" : "Page";

  /** Jump to a page the way a PDF viewer does — the same control reads the
   *  position and sets it. */
  const goToPage = useCallback(
    (n: number) => {
      const box = scrollBox();
      if (flow.current && box) {
        const { el: sec, pxPerPage } = flow.current;
        const into = box.getBoundingClientRect().top - sec.getBoundingClientRect().top;
        const want = (Math.max(1, Math.min(pageCount, n)) - 1) * pxPerPage;
        box.scrollBy({ top: want - into, behavior: "smooth" });
        return;
      }
      const pages = pageEls.current;
      if (pages.length === 0) return;
      const target = pages[Math.min(pages.length, Math.max(1, n)) - 1];
      // scrollIntoView would move the OUTER box for a deck, which is not the
      // element that scrolls — scroll the real one by the measured offset.
      const box2 = scrollBox();
      if (box2 && box2 !== scroller.current) {
        box2.scrollTo({
          top: target.offsetTop - (pages[0]?.offsetTop ?? 0),
          behavior: "smooth",
        });
        return;
      }
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [pageCount, scrollBox]
  );

  const viewerActions = (
    <>
          {archiveMember && (
            <button
              type="button"
              onClick={() => setArchiveMember(null)}
              title="Back to archive"
              aria-label="Back to archive"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
            >
              <ArrowLeft size={16} strokeWidth={1.9} />
            </button>
          )}
          {/* COPY THE LINK TO THIS FILE (Anir, Aug 25: "if you don't have it
              where you can share it, you should probably add that. I should
              just be able to copy the URL, and then that URL takes me directly
              to open the thing"). The address bar already carries it now, but
              nobody should have to know that — this hands it over, and says so
              for two seconds. */}
          {!standalone && (
            <button
              type="button"
              onClick={copyShareLink}
              title="Copy a link to this file"
              aria-label="Copy a link to this file"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
            >
              {copied ? (
                <Check size={16} strokeWidth={2.2} className="text-[color:var(--green-verified,#16a34a)]" />
              ) : (
                <Link2 size={16} strokeWidth={1.9} />
              )}
            </button>
          )}
          <a
            href={currentDownloadUrl}
            title={`Download ${currentLabel}`}
            aria-label={`Download ${currentLabel}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
          >
            <Download size={16} strokeWidth={1.9} />
          </a>
          {!standalone && (
            // The href tracks WHAT IS ON SCREEN: reading a file inside a ZIP
            // and opening a new tab used to land on the archive manifest
            // instead of the file (Anir, Aug 8: "it's opening the entire zip,
            // not the file").
            <a
              href={
                archiveMember
                  ? `${openInNewTabUrl}${openInNewTabUrl.includes("?") ? "&" : "?"}member=${encodeURIComponent(archiveMember)}`
                  : openInNewTabUrl
              }
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              aria-label="Open in a new tab"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-blue-primary"
            >
              <ExternalLink size={16} strokeWidth={1.9} />
            </a>
          )}
          {!standalone && <span className="mx-1 h-5 w-px bg-border-light" />}
    </>
  );

  const viewerBody = (
      <div
        className={
          standalone
            ? "flex h-full min-h-0 flex-col"
            : "flex h-[calc(100vh-6.75rem)] flex-col"
        }
      >
        {(fellBack || partial) && (
          /* A NOTE, NOT AN ERROR. This line was burnt orange across the top of
             a deck that had just been read successfully, and the first thing
             anyone took from it was that something had broken. Nothing has:
             the deck opened, every slide is there, it is simply text instead
             of the designed layout. It wears the app's info blue now, which is
             what blue means everywhere else here. */
          <p className="mb-2 flex shrink-0 items-start gap-2 rounded-lg bg-blue-light px-3 py-2 text-[12px] font-medium text-text-secondary">
            <Info
              size={14}
              strokeWidth={2.2}
              aria-hidden="true"
              className="mt-px shrink-0 text-blue-primary"
            />
            <span>
              {fellBack
                ? "Every slide is here as text. This deck uses shapes the in-app viewer cannot draw, so download the original for the designed version."
                : "The rest of this deck uses shapes the in-app viewer cannot draw. Download the original for the whole thing."}
            </span>
          </p>
        )}
        <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className={`material-scroll h-full rounded-xl border border-border-light ${
            isVideo
              ? "overflow-auto bg-black"
              : ext === "pdf"
                ? "overflow-hidden bg-[#202124]"
                : sheets
                  ? // A workbook scrolls INSIDE itself (frozen headers, sticky
                    // row/column counts), so this pane is a plain flex column
                    // that hands the sheet its full height.
                    "flex flex-col overflow-hidden bg-[var(--surface)]"
                  : "overflow-auto bg-[var(--surface)]"
          }`}
        >
          {status === "loading" && (
            <div className="flex h-full min-h-[420px] items-center justify-center p-6">
              {/* Keep archive loading quiet and structural. The old pinging
                  file-logo looked detached from the viewer and especially odd
                  for a ZIP, as though the archive itself were the document.
                  This card previews the manifest layout that is about to
                  appear and uses a restrained progress line instead. */}
              <div className="w-full max-w-[430px] rounded-2xl border border-border-light bg-white p-5 shadow-[0_12px_36px_rgba(16,24,40,0.08)] dark:bg-[var(--surface-elevated)]">
                <div className="flex items-center gap-3.5">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
                    {extensionOf(currentPath) === "zip" ? (
                      <FolderArchive size={20} strokeWidth={1.85} />
                    ) : (
                      <FileText size={20} strokeWidth={1.85} />
                    )}
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-blue-primary bg-white dark:border-[var(--surface-elevated)] dark:bg-[var(--surface-elevated)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                      {extensionOf(currentPath) === "zip" ? "Opening archive" : `Opening ${currentLabel}`}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-secondary">
                      {extensionOf(currentPath) === "zip"
                        ? "Reading the files inside without unpacking them"
                        : "Preparing the original file preview"}
                    </span>
                  </span>
                </div>
                <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-blue-primary/10">
                  <span className="block h-full w-2/5 animate-[materialsLoading_1.15s_ease-in-out_infinite] rounded-full bg-blue-primary" />
                </span>
                {extensionOf(currentPath) === "zip" && (
                  <div className="mt-4 space-y-2" aria-hidden="true">
                    {["72%", "88%", "61%"].map((width) => (
                      <span key={width} className="flex items-center gap-2.5 rounded-lg border border-border-light px-3 py-2">
                        <span className="h-6 w-6 shrink-0 rounded-md bg-blue-light" />
                        <span className="h-2.5 rounded-full bg-[var(--surface)]" style={{ width }} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {status === "error" && (
            <p className="flex items-start gap-2 py-8 text-[13px] text-text-secondary">
              <FileWarning size={16} className="mt-0.5 shrink-0 text-[color:#C2410C]" />
              {message}
            </p>
          )}

          {/* EVERYTHING BELOW SCALES TOGETHER. `zoom` rather than a transform,
              so the scroll height grows with the content and the scrollbar
              keeps telling the truth about how much document is left.
              A PDF and a video are excluded: the PDF plugin has its own zoom
              and its own page counter, and nobody zooms a video. */}
          <div
            style={{ zoom: (isNative && ext === "pdf") || convertedPdf ? 1 : zoom }}
            className={
              isVideo
                ? "flex h-full items-center justify-center"
                : listing || ext === "pdf" || convertedPdf
                  ? "h-full"
                  : sheets
                    ? // A workbook is a full-height surface like the PDF and
                      // video panes. Without this the zoom wrapper shrinks to
                      // the rows it happens to hold, so a short sheet floated
                      // in a half-empty modal.
                      "flex h-full flex-col"
                    : undefined
            }
          >

          {/* Exact by definition: the browser's own PDF, video and image
              rendering of the very bytes that were uploaded. */}
          {isNative && ext === "pdf" && (
            <PdfViewer src={inlineUrl} label={currentLabel} bare={embed} />
          )}
          {convertedPdf && (
            <PdfViewer src={convertedPdf} label={currentLabel} bare={embed} />
          )}
          {isText && (
            <iframe
              src={inlineUrl}
              title={currentLabel}
              onLoad={() => setStatus("ready")}
              className="h-full min-h-[calc(100vh-8rem)] w-full rounded-lg bg-white"
            />
          )}
          {isVideo && <VideoPlayer src={inlineUrl} label={currentLabel} showTitle={!embed} />}
          {isNative && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inlineUrl} alt={currentLabel} className="mx-auto max-h-[68vh] rounded-lg" />
          )}

          {/* Word and PowerPoint reconstructions — only for hosts where the
              server could not print a real PDF. */}
          {!convertedPdf && (ext === "docx" || ext === "pptx") && (
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
                // `viewer-page` is what the position readout counts, so the
                // text fallback gets the same "Slide 12 of 68" the real
                // renderer does.
                <div key={i} className="viewer-page rounded-xl border border-border-light bg-white p-4">
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
            <div className="material-workbook flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
              <div className="material-sheet-tabs flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border-light px-2 pt-2">
                {sheets.map((currentSheet, i) => (
                  <button
                    key={currentSheet.name}
                    type="button"
                    onClick={() => setSheet(i)}
                    aria-pressed={i === sheet}
                    className={`inline-flex h-9 max-w-[240px] shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3 text-[12px] font-semibold transition-all ${
                      i === sheet
                        ? "border-border-light bg-white text-blue-primary shadow-[0_-1px_2px_rgba(16,24,40,0.04)]"
                        : "border-transparent text-text-secondary hover:bg-white/70 hover:text-text-primary"
                    }`}
                  >
                    <Table2 size={14} strokeWidth={1.9} aria-hidden="true" />
                    <span className="truncate">{currentSheet.name}</span>
                  </button>
                ))}
              </div>
              {(() => {
                const currentSheet = sheets[sheet];
                if (!currentSheet) return null;
                const columnCount = Math.max(
                  1,
                  Math.min(
                    currentSheet.totalColumns,
                    currentSheet.rows.reduce(
                      (largest, row) => Math.max(largest, row.length),
                      0
                    )
                  )
                );
                /**
                 * THE WORKBOOK'S OWN LOOK, CARRIED THROUGH (Anir, Aug 25:
                 * "somebody uploads an Excel and in view mode it looks
                 * completely unformatted, but when I download it, it actually
                 * has formatting, colours, alignment... hard to understand
                 * without any formatting").
                 *
                 * The preview route now sends fills, text colours, bold,
                 * italic, alignment, column widths and merged ranges. Three
                 * lookups build from that: which cells a merge swallows (they
                 * render as nothing), the span the anchor cell carries, and the
                 * inline style for any cell that has one.
                 */
                const merges = currentSheet.merges ?? [];
                const swallowed = new Set<string>();
                const spanAt = new Map<string, { rows: number; cols: number }>();
                for (const [sr, sc, er, ec] of merges) {
                  spanAt.set(`${sr}:${sc}`, {
                    rows: er - sr + 1,
                    cols: ec - sc + 1,
                  });
                  for (let r = sr; r <= er; r++)
                    for (let c = sc; c <= ec; c++)
                      if (!(r === sr && c === sc)) swallowed.add(`${r}:${c}`);
                }
                const styleFor = (r: number, c: number) => {
                  const st = currentSheet.styles?.[`${r}:${c}`];
                  if (!st) return undefined;
                  return {
                    background: st.bg,
                    color: st.color,
                    fontWeight: st.bold ? 700 : undefined,
                    fontStyle: st.italic ? "italic" : undefined,
                    textAlign: st.align,
                  } as React.CSSProperties;
                };
                return (
                  <>
                    <div className="material-sheet-grid material-scroll min-h-0 flex-1 overflow-auto">
                      <table aria-label={`${currentSheet.name} spreadsheet`}>
                        {/* Excel's character units, ~7px each, clamped so one
                            very wide column cannot push everything else off
                            the screen. */}
                        {currentSheet.widths && (
                          <colgroup>
                            <col />
                            {Array.from({ length: columnCount }, (_, column) => {
                              const w = currentSheet.widths?.[column];
                              return (
                                <col
                                  key={column}
                                  style={
                                    w
                                      ? {
                                          width: `${Math.min(
                                            Math.max(Math.round(w * 7), 56),
                                            420
                                          )}px`,
                                        }
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </colgroup>
                        )}
                        <thead>
                          <tr>
                            <th className="material-sheet-corner" aria-label="Row numbers" />
                            {Array.from({ length: columnCount }, (_, column) => (
                              <th key={column} scope="col">
                                {spreadsheetColumnLabel(column)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentSheet.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              <th scope="row">{rowIndex + 1}</th>
                              {Array.from({ length: columnCount }, (_, column) => {
                                if (swallowed.has(`${rowIndex}:${column}`))
                                  return null;
                                const span = spanAt.get(`${rowIndex}:${column}`);
                                return (
                                  <td
                                    key={column}
                                    colSpan={span?.cols}
                                    rowSpan={span?.rows}
                                    style={styleFor(rowIndex, column)}
                                  >
                                    {row[column] ?? ""}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="material-sheet-status flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-3 py-2 text-[11px] text-text-tertiary">
                      <span>
                        {currentSheet.totalRows.toLocaleString()} rows ·{" "}
                        {currentSheet.totalColumns.toLocaleString()} columns
                      </span>
                      {currentSheet.truncated && (
                        <span>Preview limited for performance · download for the full workbook</span>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* An archive can't render page-by-page, so the honest view is its
              MANIFEST — but a two-line list floating on an ocean of empty
              looked broken (Anir: "what the hell happened here?"). Centre a
              compact card: per-file type icons, sizes, and the download as a
              real button rather than a hint. */}
          {listing && (
            <div className="flex min-h-full p-6">
              <div className="m-auto w-full max-w-[560px] rounded-2xl border border-border-light bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
                    <FolderArchive size={19} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary">
                      Archive with {listing.length} {listing.length === 1 ? "file" : "files"} inside
                    </p>
                    <p className="text-[12px] text-text-secondary">
                      Select a file to open it here without downloading or unpacking the archive.
                    </p>
                    {archiveKnowledge === "loading" && (
                      <p className="mt-1 text-[12px] font-medium text-blue-primary">
                        Preparing these files for Freyr AI…
                      </p>
                    )}
                    {archiveKnowledge === "ready" && archiveKnowledgeFiles > 0 && (
                      <p className="mt-1 text-[12px] font-medium text-green-700">
                        Freyr AI can search {archiveKnowledgeFiles}{" "}
                        {archiveKnowledgeFiles === 1 ? "file" : "files"} inside this archive.
                      </p>
                    )}
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-border-light rounded-lg border border-border-light">
                  {listing.map((e) => {
                    const ext = e.name.split(".").pop()?.toLowerCase() || "";
                    const Icon =
                      ext === "pdf" || ext === "docx" || ext === "doc" || ext === "txt"
                        ? FileText
                        : ext === "xlsx" || ext === "xls" || ext === "csv"
                        ? Table2
                        : ext === "pptx" || ext === "ppt"
                        ? Presentation
                        : ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif"
                        ? ImageIcon
                        : ext === "mp4" || ext === "mov" || ext === "webm"
                        ? Video
                        : File;
                    return (
                      <li
                        key={e.name}
                      >
                        <button
                          type="button"
                          onClick={() => setArchiveMember(e.name)}
                          className="group flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-blue-light/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-primary"
                          aria-label={`Open ${e.name}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary transition-colors group-hover:bg-white group-hover:text-blue-primary">
                            <Icon size={14} strokeWidth={1.9} />
                          </span>
                          <span className="min-w-0 flex-1 break-words text-text-primary">{e.name}</span>
                          <span className="shrink-0 tnum text-[12px] text-text-tertiary">{e.size}</span>
                          <ChevronRight
                            size={14}
                            strokeWidth={2}
                            className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <a
                  href={downloadUrl}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-primary px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
                >
                  <Download size={15} strokeWidth={2} />
                  Download the archive
                </a>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* THE FLOATING CONTROL BAR, THE WAY A PDF VIEWER DOES IT.
            It sits over the document, bottom centre, and it is LIVE: the page
            number is recomputed on every scroll from the real page elements,
            so it always says where you actually are (Anir: "you can't just say
            the slide number at the top… you have to know what slide I'm on
            currently — do it like a native PDF viewer"). Typing a number or
            using the arrows scrolls there, and the same bar carries zoom, so
            everything you do to the document is in one place. */}
        {/* Embed = the document and a scrollbar, nothing floating over it
            (Anir, Aug 8: "you don't need zoom or anything"). */}
        {/* A converted deck pages inside PdfViewer, which brings its own
            controls — this bar would say "1 of 0" over it. */}
        {!embed && !convertedPdf && status === "ready" && (pageCount > 1 || !isNative) && !listing && (
          // z-10 because a Word table renders positioned cells that otherwise
          // paint over the bar and swallow its clicks.
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-[#1D1D1F]/90 px-1.5 py-1 text-white shadow-[0_6px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
              {pageCount > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label={`Previous ${unit.toLowerCase()}`}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
                  >
                    <ChevronUp size={15} strokeWidth={2.2} />
                  </button>
                  <span className="flex items-center gap-1.5 px-1 text-[12px] tabular-nums">
                    <input
                      // Typing a page number and pressing Enter jumps there —
                      // the one thing every PDF reader has and no in-app
                      // viewer ever bothers to add.
                      key={page}
                      defaultValue={page}
                      // INLINE, NOT A CLASS. As a Tailwind class this field
                      // computed to an OPAQUE white background with white text
                      // — an invisible page number in a white pill (Anir, Jul
                      // 30: "why is that field white? It's probably white on
                      // white"). Inline wins over whatever was setting it, and
                      // -webkit-text-fill-color is set too because that is what
                      // actually paints the glyphs in a text input.
                      style={{
                        background: "rgba(255,255,255,0.22)",
                        color: "#fff",
                        WebkitTextFillColor: "#fff",
                        caretColor: "#fff",
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const n = Number((e.target as HTMLInputElement).value);
                        if (Number.isFinite(n)) goToPage(n);
                        (e.target as HTMLInputElement).blur();
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${unit} number`}
                      className="w-9 rounded-md bg-white/20 px-1 py-0.5 text-center font-semibold text-white outline-none focus:bg-white/30"
                    />
                    <span className="text-white/60">
                      of <span className="font-semibold text-white/90">{pageCount}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= pageCount}
                    aria-label={`Next ${unit.toLowerCase()}`}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
                  >
                    <ChevronDown size={15} strokeWidth={2.2} />
                  </button>
                  <span className="mx-1 h-4 w-px bg-white/20" />
                </>
              )}
              <button
                type="button"
                onClick={() => changeZoom(zoom - 0.1)}
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
              >
                <Minus size={15} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Back to 100%"
                className="min-w-[3.2rem] cursor-pointer rounded-full px-1 py-0.5 text-[12px] font-semibold tabular-nums transition-colors hover:bg-white/20"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => changeZoom(zoom + 0.1)}
                disabled={zoom >= 3}
                aria-label="Zoom in"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30"
              >
                <Plus size={15} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Fit the page"
                aria-label="Fit the page"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20"
              >
                <Maximize2 size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
  );

  if (embed) {
    return (
      <section
        aria-label={currentLabel}
        className="material-embed relative h-full min-h-0 bg-white"
        onMouseMove={
          archiveMember
            ? (event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const hot =
                  event.clientX - box.left < 130 && event.clientY - box.top < 90;
                setBackHot((current) => (current === hot ? current : hot));
              }
            : undefined
        }
        onMouseLeave={archiveMember ? () => setBackHot(false) : undefined}
      >
        {viewerBody}
        {/* Inside an archive member the embed had NO way back — the toolbar
            that carries the back arrow is exactly what embed mode strips
            (Anir, Aug 8: "if it's a zip and I click a file in the zip, it
            doesn't let me go back"). One floating control, top-left, back to
            the archive's file list. */}
        {archiveMember && (
          <button
            type="button"
            onClick={() => setArchiveMember(null)}
            aria-label="Back to the archive's file list"
            title="Back to the archive"
            className={`absolute left-2 top-2 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#1D1D1F]/85 text-white shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-[#1D1D1F] ${
              backHot ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
          </button>
        )}
        {pageCount > 1 && (
          <div
            aria-hidden={!peekScrolling}
            className={`pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center transition-opacity duration-300 ${
              peekScrolling ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="tabular-nums rounded-full bg-[#1D1D1F]/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)] backdrop-blur-sm">
              {unit} {page} / {pageCount}
            </span>
          </div>
        )}
      </section>
    );
  }

  if (standalone) {
    const format = MATERIAL_FORMAT_META[materialFormat(material.kind)];
    const stages = materialJourneyStages(material);
    const access = material.accessLevel
      ? ACCESS_LEVEL_META[material.accessLevel]
      : null;
    return (
      <section
        aria-label={currentLabel}
        className="flex h-full min-h-0 flex-col bg-white"
      >
        <header className="shrink-0 border-b border-border-light bg-white px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                {offeringName} · Sales material
              </p>
              <h1 className="mt-0.5 truncate text-[17px] font-semibold text-text-primary">
                {currentLabel}
              </h1>
              {material.description && (
                <p className="mt-1 line-clamp-2 text-[12.5px] text-text-secondary">
                  {material.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">{viewerActions}</div>
          </div>

          {/* Facts divided by hairlines — five label/value pairs in a row
              read as one unbroken sentence without them. */}
          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <dt className="font-medium text-text-tertiary">Format</dt>
              <dd className="font-semibold text-text-primary">{format.label}</dd>
            </div>
<span aria-hidden="true" className="h-4 w-px bg-border-light" />
            <div className="flex items-center gap-1.5">
              <dt className="font-medium text-text-tertiary">Added by</dt>
              <dd className="flex items-center gap-1.5 font-semibold text-text-primary">
                {material.addedBy && (
                  <Avatar name={material.addedBy} className="h-5 w-5 text-[8px]" />
                )}
                {material.addedBy || "Not recorded"}
              </dd>
            </div>
            {material.folder && (
              <>
              <span aria-hidden="true" className="h-4 w-px bg-border-light" />
              <div className="flex items-center gap-1.5">
                <dt className="font-medium text-text-tertiary">Folder</dt>
                <dd className="font-semibold text-text-primary">{material.folder}</dd>
              </div>
              </>
            )}
<span aria-hidden="true" className="h-4 w-px bg-border-light" />
            <div className="flex items-center gap-1.5">
              <dt className="font-medium text-text-tertiary">Buyer stage</dt>
              <dd className="flex flex-wrap gap-1">
                {stages.length ? (
                  stages.map((stage) => {
                    const meta = JOURNEY_STAGE_META[stage];
                    return (
                      <span
                        key={stage}
                        className="rounded-full px-2 py-0.5 font-semibold"
                        style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
                      >
                        {meta.short}
                      </span>
                    );
                  })
                ) : (
                  <span className="font-semibold text-text-primary">Not recorded</span>
                )}
              </dd>
            </div>
<span aria-hidden="true" className="h-4 w-px bg-border-light" />
            <div className="flex items-center gap-1.5">
              <dt className="font-medium text-text-tertiary">Access</dt>
              <dd>
                {access ? (
                  <span
                    className="rounded-full px-2 py-0.5 font-semibold"
                    style={{ color: access.color, backgroundColor: `${access.color}14` }}
                  >
                    {access.short}
                  </span>
                ) : (
                  <span className="font-semibold text-text-primary">Not recorded</span>
                )}
              </dd>
            </div>
            {/* WHAT THE ASSISTANT HAS FOR THIS ONE. It read "Cannot watch
                video" until Anir corrected the direction on Aug 14: Freyr
                transcribes the recording itself, and an owner's own transcript
                is an optional second source to reconcile against, not the only
                way in. Stated here, on the material, so it is answerable after
                the upload and not only during it. */}
            {materialFormat(material.kind) === "video" && (
              <>
                <span aria-hidden="true" className="h-4 w-px bg-border-light" />
                <div className="flex items-center gap-1.5">
                  <dt className="font-medium text-text-tertiary">Freyr AI</dt>
                  <dd className="font-semibold text-text-primary">
                    Transcribed automatically. Add your own transcript to
                    reconcile it against.
                  </dd>
                </div>
              </>
            )}
          </dl>
        </header>
        <div className="min-h-0 flex-1 p-3">{viewerBody}</div>
      </section>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={currentLabel}
      // The widest dialog the app has: a slide rendered small in a narrow box
      // is a slide nobody reads.
      size="viewer"
      actions={viewerActions}
    >
      {viewerBody}
    </Modal>
  );
}
