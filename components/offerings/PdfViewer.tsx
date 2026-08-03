"use client";

import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  Menu,
  Minus,
  PanelLeftClose,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";

// Keep proposal bytes and the matching PDF worker on Freyr's own origin.
// A public URL also avoids Next/Webpack rewriting `new URL(import.meta.url)`
// into an invalid constructor call in the client bundle.
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type RenderTask = { cancel: () => void; promise: Promise<void> };

function PdfThumbnail({
  document,
  pageNumber,
  active,
  root,
  onSelect,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  root: HTMLDivElement | null;
  onSelect: () => void;
}) {
  const holder = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 3);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root, rootMargin: "240px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const node = holder.current;
    if (!active || !root || !node) return;
    const rootBox = root.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    if (nodeBox.top < rootBox.top) {
      root.scrollTo({ top: Math.max(0, root.scrollTop + nodeBox.top - rootBox.top - 10), behavior: "smooth" });
    } else if (nodeBox.bottom > rootBox.bottom) {
      root.scrollTo({ top: root.scrollTop + nodeBox.bottom - rootBox.bottom + 10, behavior: "smooth" });
    }
  }, [active, root]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    let renderTask: RenderTask | null = null;
    (async () => {
      const page = await document.getPage(pageNumber);
      if (!live || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = 116 / base.width;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.floor(viewport.width * outputScale);
      target.height = Math.floor(viewport.height * outputScale);
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      const context = target.getContext("2d");
      if (!context) return;
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
      }) as unknown as RenderTask;
      try {
        await renderTask.promise;
      } catch {
        // Expected when a thumbnail moves outside the virtualised sidebar.
      }
    })().catch(() => undefined);
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, visible]);

  return (
    <button
      ref={holder}
      type="button"
      onClick={onSelect}
      aria-label={`Open page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      className={`mx-auto block w-[142px] rounded-xl border p-2 text-left transition-all ${
        active
          ? "border-blue-primary bg-blue-light shadow-sm"
          : "border-transparent hover:border-[var(--pdf-border)] hover:bg-[var(--pdf-control)]"
      }`}
    >
      <span className="flex min-h-[76px] items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_2px_8px_rgba(15,23,42,0.12)]">
        {visible ? (
          <canvas ref={canvas} className="block max-w-full" />
        ) : (
          <span className="h-[76px] w-[58px] animate-pulse rounded bg-[#EEF2F7]" />
        )}
      </span>
      <span className={`mt-1.5 block text-center text-[11px] font-semibold ${active ? "text-blue-primary" : "text-[var(--pdf-muted)]"}`}>
        {pageNumber}
      </span>
    </button>
  );
}

function PdfPage({
  document,
  pageNumber,
  zoom,
  availableWidth,
  root,
  register,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  availableWidth: number;
  root: HTMLDivElement | null;
  register: (page: number, node: HTMLDivElement | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(16 / 9);
  const [rendering, setRendering] = useState(true);
  const pageWidth = Math.max(300, Math.min(1180, availableWidth - 56)) * zoom;

  useEffect(() => {
    register(pageNumber, holder.current);
    return () => register(pageNumber, null);
  }, [pageNumber, register]);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root, rootMargin: "900px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible || availableWidth <= 0) return;
    let live = true;
    let renderTask: RenderTask | null = null;
    setRendering(true);
    (async () => {
      const page = await document.getPage(pageNumber);
      if (!live || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.width / base.height);
      const viewport = page.getViewport({ scale: pageWidth / base.width });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.floor(viewport.width * outputScale);
      target.height = Math.floor(viewport.height * outputScale);
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      const context = target.getContext("2d");
      if (!context) return;
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
      }) as unknown as RenderTask;
      await renderTask.promise;
      if (live) setRendering(false);
    })().catch((reason) => {
      if (live && !String(reason).includes("Rendering cancelled")) {
        setRendering(false);
      }
    });
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [availableWidth, document, pageNumber, pageWidth, visible, zoom]);

  return (
    <div
      ref={holder}
      data-pdf-page={pageNumber}
      className="relative mx-auto shrink-0 scroll-mt-5 overflow-hidden rounded-lg bg-white shadow-[0_10px_32px_rgba(15,23,42,0.16)]"
      style={{ width: `${pageWidth}px`, aspectRatio: ratio }}
    >
      {visible && <canvas ref={canvas} className="block h-auto max-w-none bg-white" />}
      {(!visible || rendering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <LoaderCircle size={24} className="animate-spin text-blue-primary" />
        </div>
      )}
    </div>
  );
}

export function PdfViewer({ src, label }: { src: string; label: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pageNodes = useRef(new Map<number, HTMLDivElement>());
  const scrollFrame = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setViewportWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sidebarOpen]);

  useEffect(() => {
    let live = true;
    let task: { destroy: () => void } | null = null;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDocument(null);
    setPageNumber(1);
    (async () => {
      const response = await fetch(src, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not read this PDF");
      const data = await response.arrayBuffer();
      if (!live) return;
      const request = getDocument({ data });
      task = request;
      const next = await request.promise;
      if (!live) {
        await next.destroy();
        return;
      }
      setDocument(next);
      setLoading(false);
    })().catch((reason) => {
      if (!live) return;
      console.error("Freyr PDF preview failed", reason);
      setError("This PDF could not be opened here. Download the original to view it.");
      setLoading(false);
    });
    return () => {
      live = false;
      controller.abort();
      task?.destroy();
    };
  }, [src]);

  const pageCount = document?.numPages || 0;
  const registerPage = useCallback(
    (page: number, node: HTMLDivElement | null) => {
      if (node) pageNodes.current.set(page, node);
      else pageNodes.current.delete(page);
    },
    []
  );

  const goTo = useCallback(
    (next: number) => {
      if (!pageCount) return;
      const target = Math.max(1, Math.min(pageCount, next));
      setPageNumber(target);
      const root = viewport.current;
      const node = pageNodes.current.get(target);
      if (root && node) {
        const rootBox = root.getBoundingClientRect();
        const nodeBox = node.getBoundingClientRect();
        const nextScrollTop = root.scrollTop + nodeBox.top - rootBox.top - 20;
        root.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
      }
    },
    [pageCount]
  );

  const syncPageFromScroll = useCallback(() => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const root = viewport.current;
      if (!root || pageNodes.current.size === 0) return;
      const rootBox = root.getBoundingClientRect();
      let closestPage = pageNumber;
      let greatestVisibleArea = -1;
      for (const [number, node] of pageNodes.current) {
        const box = node.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(box.bottom, rootBox.bottom) - Math.max(box.top, rootBox.top)
        );
        const visibleArea = visibleHeight * Math.min(box.width, rootBox.width);
        if (visibleArea > greatestVisibleArea) {
          greatestVisibleArea = visibleArea;
          closestPage = number;
        }
      }
      setPageNumber((current) => (current === closestPage ? current : closestPage));
    });
  }, [pageNumber]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    []
  );

  const fullscreen = useCallback(() => {
    const box = stage.current;
    if (!box) return;
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
    else void box.requestFullscreen();
  }, []);

  return (
    <div ref={stage} className="pdf-viewer relative flex h-full min-h-[520px] overflow-hidden rounded-xl bg-[var(--pdf-stage)] text-[var(--pdf-text)]">
      <aside
        className={`shrink-0 overflow-hidden border-r border-[var(--pdf-border)] bg-[var(--pdf-sidebar)] transition-[width] duration-200 ${
          sidebarOpen ? "w-[180px]" : "w-0 border-r-0"
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="border-b border-[var(--pdf-border)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pdf-muted)]">
            Pages
          </p>
        </div>
        <div ref={sidebar} className="material-scroll h-[calc(100%-41px)] space-y-2 overflow-y-scroll py-3 pr-1">
          {sidebarOpen && document &&
            Array.from({ length: pageCount }, (_, index) => (
              <PdfThumbnail
                key={index + 1}
                document={document}
                pageNumber={index + 1}
                active={pageNumber === index + 1}
                root={sidebar.current}
                onSelect={() => goTo(index + 1)}
              />
            ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--pdf-border)] bg-[var(--pdf-chrome)] px-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? "Hide page thumbnails" : "Show page thumbnails"}
              title={sidebarOpen ? "Hide page thumbnails" : "Show page thumbnails"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pdf-muted)] transition-colors hover:bg-[var(--pdf-control)] hover:text-blue-primary"
            >
              {sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}
            </button>
            <span className="hidden min-w-0 truncate text-[12px] font-semibold text-[var(--pdf-muted)] lg:block">
              {label}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[var(--pdf-border)] bg-[var(--pdf-control)] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => goTo(pageNumber - 1)}
              disabled={pageNumber <= 1}
              aria-label="Previous page"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--pdf-muted)] hover:bg-[var(--pdf-chrome)] disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <label className="flex items-center gap-1 text-[12px] tabular-nums text-[var(--pdf-muted)]">
              <input
                key={pageNumber}
                defaultValue={pageNumber}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  goTo(Number(event.currentTarget.value));
                  event.currentTarget.blur();
                }}
                aria-label="Page number"
                className="h-6 w-10 rounded-md bg-[var(--pdf-chrome)] text-center font-semibold text-[var(--pdf-text)] outline-none ring-blue-primary focus:ring-1"
              />
              <span>/ {pageCount || "—"}</span>
            </label>
            <button
              type="button"
              onClick={() => goTo(pageNumber + 1)}
              disabled={!pageCount || pageNumber >= pageCount}
              aria-label="Next page"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--pdf-muted)] hover:bg-[var(--pdf-chrome)] disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}
              disabled={zoom <= 0.6}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pdf-muted)] hover:bg-[var(--pdf-control)] disabled:opacity-30"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Fit page width"
              className="min-w-[54px] rounded-lg px-1.5 py-1 text-[12px] font-semibold tabular-nums text-[var(--pdf-text)] hover:bg-[var(--pdf-control)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(2.2, value + 0.1))}
              disabled={zoom >= 2.2}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pdf-muted)] hover:bg-[var(--pdf-control)] disabled:opacity-30"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={fullscreen}
              aria-label="Fullscreen"
              title="Fullscreen"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pdf-muted)] hover:bg-[var(--pdf-control)]"
            >
              <Maximize2 size={15} />
            </button>
          </div>
        </div>

        <div
          ref={viewport}
          onScroll={syncPageFromScroll}
          className="material-scroll relative min-h-0 flex-1 overflow-y-scroll overflow-x-auto bg-[var(--pdf-stage)] px-7 py-6"
        >
          {document && viewportWidth > 0 && (
            <div className="flex min-w-max flex-col gap-6 pb-8">
              {Array.from({ length: pageCount }, (_, index) => (
                <PdfPage
                  key={index + 1}
                  document={document}
                  pageNumber={index + 1}
                  zoom={zoom}
                  availableWidth={viewportWidth}
                  root={viewport.current}
                  register={registerPage}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[var(--pdf-chrome)]">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-primary/10" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-primary" />
            <LoaderCircle size={21} className="text-blue-primary" />
          </span>
          <span className="text-center">
            <span className="block text-[13.5px] font-semibold text-[var(--pdf-text)]">
              Opening {label}
            </span>
            <span className="mt-1 block text-[12px] text-[var(--pdf-muted)]">
              Preparing the document preview
            </span>
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--pdf-stage)] p-8">
          <div className="max-w-[420px] rounded-xl border border-[var(--pdf-border)] bg-[var(--pdf-chrome)] p-5 text-center text-[13px] text-[var(--pdf-muted)] shadow-sm">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
