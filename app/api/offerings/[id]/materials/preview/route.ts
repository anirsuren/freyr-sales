import { NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usageCounters";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import {
  listMaterialArchive,
  MaterialArchiveError,
  readMaterialArchiveMember,
} from "@/lib/materialArchive";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canViewOfferingMaterial } from "@/lib/materialAccess";

/**
 * READ A SALES MATERIAL WITHOUT DOWNLOADING IT.
 *
 * Serving the bytes with `Content-Disposition: inline` was only ever half an
 * answer: a browser renders PDF, images, video and text, and has no viewer at
 * all for Word, PowerPoint or Excel — so a .docx downloads no matter what
 * header it arrives with. Nine of Eswar's files are .docx and four are .pptx,
 * which is why "open in a new tab" still put a file in Downloads (Anir,
 * Jul 30: "There has to be some sort of native viewer inside the app").
 *
 * So the conversion happens HERE, on our own server, and the viewer receives
 * HTML it can simply show:
 *
 *   .docx  → mammoth, which keeps headings, lists, tables and bold
 *   .xlsx  → SheetJS, one HTML table per sheet
 *   .pptx  → unzipped, one panel per slide with that slide's text in order
 *   .zip   → the file listing, so at least you can see what is inside
 *
 * Server-side on purpose, twice over: these documents are internal to a
 * regulatory business and must not be handed to Microsoft's or Google's
 * embedded viewers to render, and converting here keeps several megabytes of
 * conversion libraries out of the browser bundle.
 *
 * PDF, images and video are NOT converted — the browser does those better than
 * any library would. The viewer embeds the inline URL for those directly.
 */

export const dynamic = "force-dynamic";

/** Big enough for a long deck, small enough that one request cannot exhaust
 *  the container's memory. Anything larger is offered as a download. */
const MAX_CONVERT_BYTES = 25 * 1024 * 1024;

type Preview =
  | { kind: "html"; html: string; note?: string }
  | {
      kind: "sheets";
      sheets: {
        name: string;
        rows: (string | number | boolean | null)[][];
        /**
         * THE WORKBOOK'S OWN FORMATTING, CELL BY CELL (Anir, Aug 25, looking
         * at a Freyr sheet in the viewer next to the same file in Excel: "in
         * view mode it looks completely unformatted, but when I download it,
         * it actually has some formatting, some colours, alignment... hard to
         * understand without any formatting. If that format is also visible in
         * view mode it will be much better for the end user").
         *
         * A sparse map keyed "r:c" so an unstyled sheet costs nothing on the
         * wire, and only the handful of things that carry meaning are read:
         * fill, text colour, bold/italic, horizontal alignment. Not a
         * rendering engine — the point is that a header band still looks like
         * a header band.
         */
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
        /** Column widths in Excel's character units, so a Title column stays
         *  wide and a "#" column stays narrow. */
        widths?: (number | null)[];
        /** Merged ranges as [startRow, startCol, endRow, endCol], relative to
         *  the trimmed grid: a merged title row must not repeat its text. */
        merges?: [number, number, number, number][];
        totalRows: number;
        totalColumns: number;
        truncated: boolean;
      }[];
    }
  | { kind: "slides"; slides: { title: string; lines: string[] }[] }
  | { kind: "listing"; entries: { name: string; size: string }[] }
  | { kind: "native"; url: string; contentType: string }
  | { kind: "unsupported"; reason: string };

function extensionOf(path: string): string {
  return (path.split(".").pop() || "").toLowerCase();
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strip the XML tags PowerPoint wraps around every run of text, keeping the
 *  reading order. Not a renderer — a way to read a deck without leaving. */
function slideTextFromXml(xml: string): string[] {
  const lines: string[] = [];
  // <a:p> is a paragraph; <a:t> holds the actual characters.
  for (const para of xml.split("<a:p>").slice(1)) {
    const runs = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    const text = runs
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (text) lines.push(text);
  }
  return lines;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to open sales materials" },
      { status: 403 }
    );

  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  const member = search.get("member");
  if (!path) return NextResponse.json({ error: "Which file?" }, { status: 400 });
  if (!path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );
  const material = offering.materials.find((m) => m.docsPath === path);
  if (!material || !canViewOfferingMaterial(
      offering,
      material,
      actor.userId,
      actor.role === "admin"
    ))
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );
  if (member && extensionOf(path) !== "zip")
    return NextResponse.json(
      { error: "That material is not a ZIP archive" },
      { status: 400 }
    );

  // Counted for the monthly note to reps: the rep opened this file to read it.
  // After the permission checks, so a refused request never inflates anyone's
  // number, and NOT for a `member` fetch — that is browsing inside an archive
  // already open, and counting it would report one ZIP as twenty opens.
  if (!member) bumpUsage(actor.userId, "open");

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const contentPath = member || path;
  const ext = extensionOf(contentPath);
  const inlineUrl = `/api/offerings/${id}/materials/download?path=${encodeURIComponent(path)}&view=1`;

  // The browser renders these natively and better than we could.
  if (!member && ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov", "txt", "md", "csv"].includes(ext)) {
    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ["mp4", "webm", "mov"].includes(ext)
          ? "video"
          : ["txt", "md", "csv"].includes(ext)
            ? "text"
            : "image";
    return NextResponse.json({
      preview: { kind: "native", url: inlineUrl, contentType } satisfies Preview,
      label: material.label,
    });
  }

  try {
    if (!member && ext === "zip") {
      const entries = (await listMaterialArchive(path)).map((entry) => ({
        name: entry.name,
        size: humanSize(entry.size),
      }));
      return NextResponse.json({
        preview: { kind: "listing", entries } satisfies Preview,
        label: material.label,
      });
    }

    if (member && ext === "zip") {
      return NextResponse.json({
        preview: {
          kind: "unsupported",
          reason:
            "This is another ZIP inside the archive. Download it to open the nested archive.",
        } satisfies Preview,
        label: member.split("/").pop() || member,
      });
    }

    let buffer: Buffer;
    if (member) {
      const extracted = await readMaterialArchiveMember(path, member);
      buffer = Buffer.from(extracted.bytes);
    } else {
      const { presignUrl } = await docsStorage.getDownloadUrl(path);
      const upstream = await fetch(presignUrl);
      if (!upstream.ok)
        return NextResponse.json(
          { error: "Could not read that file" },
          { status: 502 }
        );
      buffer = Buffer.from(await upstream.arrayBuffer());
    }

    if (buffer.byteLength > MAX_CONVERT_BYTES) {
      return NextResponse.json({
        preview: {
          kind: "unsupported",
          reason: `This file is ${humanSize(buffer.byteLength)}, too large to open in the browser. Download it instead.`,
        } satisfies Preview,
        label: member ? member.split("/").pop() || member : material.label,
      });
    }

    if (ext === "docx" || ext === "doc") {
      const mammoth = await import("mammoth");
      const { value, messages } = await mammoth.convertToHtml({ buffer });
      const images = messages.filter((m) => /image/i.test(m.message)).length;
      return NextResponse.json({
        preview: {
          kind: "html",
          html: value,
          // Honest about fidelity rather than letting someone assume they are
          // looking at the document exactly as Word lays it out.
          note:
            images > 0
              ? "Text and tables are shown here. Download the file for the original layout and images."
              : undefined,
        } satisfies Preview,
        label: material.label,
      });
    }

    if (ext === "xlsx" || ext === "xls") {
      const XLSX = await import("xlsx");
      /* cellStyles asks SheetJS to keep each cell's `s` (style) record — it is
         dropped by default, which is why the preview had nothing to show. */
      const book = XLSX.read(buffer, { type: "buffer", cellStyles: true });

      /** Excel colours arrive as ARGB ("FF1F3864"), a theme index, or an
       *  indexed palette entry. Only a real RGB is trusted; anything else is
       *  left alone rather than guessed at, because a wrong colour is worse
       *  than none. */
      const rgb = (value: unknown): string | undefined => {
        const raw = (value as { rgb?: string } | undefined)?.rgb;
        if (typeof raw !== "string") return undefined;
        const hex = raw.length === 8 ? raw.slice(2) : raw;
        return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : undefined;
      };
      // Send cell values, not SheetJS's unstyled HTML. The client builds a
      // proper workbook surface with row/column headers, sticky coordinates,
      // grid lines and two-directional scrolling. The old HTML output was a
      // loose wall of text that did not look or behave like a spreadsheet.
      const MAX_ROWS = 500;
      const MAX_COLUMNS = 80;
      const sheets = book.SheetNames.slice(0, 12).map((name) => {
        const worksheet = book.Sheets[name];
        const decoded = worksheet["!ref"]
          ? XLSX.utils.decode_range(worksheet["!ref"])
          : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        const totalRows = Math.max(1, decoded.e.r - decoded.s.r + 1);
        const totalColumns = Math.max(1, decoded.e.c - decoded.s.c + 1);
        const rawRows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true,
          range: {
            s: decoded.s,
            e: {
              r: Math.min(decoded.e.r, decoded.s.r + MAX_ROWS - 1),
              c: Math.min(decoded.e.c, decoded.s.c + MAX_COLUMNS - 1),
            },
          },
        }) as unknown[][];
        const rows = rawRows.map((row) =>
          row.slice(0, MAX_COLUMNS).map((cell) => {
            if (cell == null) return null;
            if (
              typeof cell === "string" ||
              typeof cell === "number" ||
              typeof cell === "boolean"
            )
              return cell;
            return String(cell);
          })
        );
        /**
         * TRIM TO WHAT IS ACTUALLY THERE. Excel keeps a stale "!ref" range —
         * cells once touched or merely formatted — so a 6×5 sheet arrived
         * declaring columns out to Z and a thousand rows, and the preview
         * dutifully drew the emptiness (Anir, Aug 8: "if the source file does
         * not have that many columns, that's a problem... if there's nothing,
         * why are you filling the space?"). Only TRAILING emptiness goes: a
         * gap between B and Z with content on both sides is kept, because
         * dropping interior columns would misalign every row.
         */
        const emptyCell = (cell: unknown) =>
          cell == null || (typeof cell === "string" && cell.trim() === "");
        let lastRow = -1;
        let lastColumn = -1;
        rows.forEach((row, r) => {
          row.forEach((cell, c) => {
            if (emptyCell(cell)) return;
            if (r > lastRow) lastRow = r;
            if (c > lastColumn) lastColumn = c;
          });
        });
        const usedRows =
          lastRow >= 0
            ? rows.slice(0, lastRow + 1).map((row) => {
                const trimmed = row.slice(0, lastColumn + 1);
                // Pad short rows so every row has the same column count.
                while (trimmed.length < lastColumn + 1) trimmed.push(null);
                return trimmed;
              })
            : [[null]];
        /* Styles for the cells that survived the trim, addressed in the
           TRIMMED grid's coordinates so the client never has to know where the
           sheet's used range began. */
        const styles: Record<string, Record<string, unknown>> = {};
        if (lastRow >= 0) {
          for (let r = 0; r <= lastRow; r++) {
            for (let c = 0; c <= lastColumn; c++) {
              const address = XLSX.utils.encode_cell({
                r: decoded.s.r + r,
                c: decoded.s.c + c,
              });
              const cell = worksheet[address] as
                | { s?: Record<string, unknown> }
                | undefined;
              /**
               * TWO SHAPES, ONE READER. SheetJS's community build (0.20.x)
               * puts the fill FLAT on `s` — `{ patternType, fgColor, bgColor }`
               * — while other readers nest it as `s.fill.fgColor`. My first
               * pass only understood the nested shape, so a Freyr sheet whose
               * header band is solid #0D1233 came back with zero styles and
               * the viewer stayed flat. Read both.
               */
              const style = cell?.s as
                | {
                    patternType?: string;
                    fgColor?: unknown;
                    fill?: { fgColor?: unknown; patternType?: string };
                    font?: {
                      color?: unknown;
                      bold?: boolean;
                      italic?: boolean;
                      sz?: number;
                    };
                    color?: unknown;
                    bold?: boolean;
                    italic?: boolean;
                    alignment?: { horizontal?: string };
                    horizontal?: string;
                  }
                | undefined;
              if (!style) continue;
              const entry: Record<string, unknown> = {};
              const pattern = style.fill?.patternType ?? style.patternType;
              // "none" is Excel's way of saying no fill at all.
              if (pattern && pattern !== "none") {
                const bg = rgb(style.fill?.fgColor ?? style.fgColor);
                // White on white is the default, not a decision worth sending.
                if (bg && bg !== "#FFFFFF") entry.bg = bg;
              }
              const color = rgb(style.font?.color ?? style.color);
              if (color && color !== "#000000") entry.color = color;
              if (style.font?.bold ?? style.bold) entry.bold = true;
              if (style.font?.italic ?? style.italic) entry.italic = true;
              const align = style.alignment?.horizontal ?? style.horizontal;
              if (align === "center" || align === "right" || align === "left")
                entry.align = align;
              /* A DARK BAND NEEDS LIGHT TEXT. Excel stores the header row's
                 white font in the theme, which this build does not resolve, so
                 a #0D1233 fill would have rendered black-on-navy. When the fill
                 is dark and no explicit colour survived, pick white — the same
                 call Excel itself makes. */
              if (entry.bg && !entry.color) {
                const hex = String(entry.bg).slice(1);
                const luminance =
                  (0.299 * parseInt(hex.slice(0, 2), 16) +
                    0.587 * parseInt(hex.slice(2, 4), 16) +
                    0.114 * parseInt(hex.slice(4, 6), 16)) /
                  255;
                if (luminance < 0.5) entry.color = "#FFFFFF";
              }
              if (Object.keys(entry).length > 0) styles[`${r}:${c}`] = entry;
            }
          }
        }

        /* Column widths, in Excel's character units. `wch` is what the file
           stores; `wpx` appears when a reader has already converted. */
        const cols = (worksheet["!cols"] ?? []) as {
          wch?: number;
          wpx?: number;
          hidden?: boolean;
        }[];
        const widths =
          lastColumn >= 0
            ? Array.from({ length: lastColumn + 1 }, (_, c) => {
                const col = cols[decoded.s.c + c];
                if (!col || col.hidden) return null;
                if (typeof col.wch === "number") return col.wch;
                if (typeof col.wpx === "number") return col.wpx / 7;
                return null;
              })
            : [];

        /* Merged ranges, clipped to the trimmed grid and rebased onto it. A
           merged title spanning A1:E1 must render as one wide cell, not five. */
        const merges: [number, number, number, number][] = [];
        for (const m of (worksheet["!merges"] ?? []) as {
          s: { r: number; c: number };
          e: { r: number; c: number };
        }[]) {
          const sr = m.s.r - decoded.s.r;
          const sc = m.s.c - decoded.s.c;
          const er = m.e.r - decoded.s.r;
          const ec = m.e.c - decoded.s.c;
          if (sr < 0 || sc < 0 || sr > lastRow || sc > lastColumn) continue;
          merges.push([
            sr,
            sc,
            Math.min(er, lastRow),
            Math.min(ec, lastColumn),
          ]);
        }

        return {
          name,
          rows: usedRows,
          styles: Object.keys(styles).length ? (styles as never) : undefined,
          widths: widths.some((w) => w != null) ? widths : undefined,
          merges: merges.length ? merges : undefined,
          totalRows: lastRow >= 0 ? lastRow + 1 : 1,
          totalColumns: lastRow >= 0 ? lastColumn + 1 : 1,
          // Truncated only when CONTENT hits the window edge — a stale declared
          // range reaching Z is not a reason to claim the preview is limited.
          truncated: lastRow + 1 >= MAX_ROWS || lastColumn + 1 >= MAX_COLUMNS,
        };
      });
      return NextResponse.json({
        preview: { kind: "sheets", sheets } satisfies Preview,
        label: material.label,
      });
    }

    if (ext === "pptx") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        // slide2 must not sort before slide10.
        .sort((a, b) => {
          const n = (s: string) => Number(s.match(/slide(\d+)\.xml/)?.[1] || 0);
          return n(a) - n(b);
        });
      const slides = [];
      for (const file of slideFiles) {
        const xml = await zip.files[file].async("string");
        const lines = slideTextFromXml(xml);
        slides.push({
          title: lines[0] || `Slide ${slides.length + 1}`,
          lines: lines.slice(1),
        });
      }
      return NextResponse.json({
        preview: { kind: "slides", slides } satisfies Preview,
        label: material.label,
      });
    }

    return NextResponse.json({
      preview: {
        kind: "unsupported",
        reason: `There is no in-app viewer for .${ext} files yet. Download it to open it.`,
      } satisfies Preview,
      label: material.label,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not open that file" },
      { status: e instanceof MaterialArchiveError ? e.status : 502 }
    );
  }
}
