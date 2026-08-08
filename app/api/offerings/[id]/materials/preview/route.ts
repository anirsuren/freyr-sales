import { NextResponse } from "next/server";
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
  if (!material || !canViewOfferingMaterial(offering, material, actor.userId))
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );
  if (member && extensionOf(path) !== "zip")
    return NextResponse.json(
      { error: "That material is not a ZIP archive" },
      { status: 400 }
    );

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
          reason: `This file is ${humanSize(buffer.byteLength)} — too large to open in the browser. Download it instead.`,
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
      const book = XLSX.read(buffer, { type: "buffer" });
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
        return {
          name,
          rows: usedRows,
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
