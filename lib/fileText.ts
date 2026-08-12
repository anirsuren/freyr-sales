import "server-only";

import { inflateRawSync, inflateSync } from "node:zlib";
import {
  MAX_ARCHIVE_DEPTH,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_TEXT_BYTES,
  safeArchiveMemberPath,
} from "./archiveSafety";
export {
  MAX_ARCHIVE_DEPTH,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_TEXT_BYTES,
  safeArchiveMemberPath,
} from "./archiveSafety";

/**
 * READ WHAT IS INSIDE AN UPLOADED FILE.
 *
 * The whole point of uploading decks and documents is that the assistant can
 * ANSWER FROM THEM (Wajeed, Jul 29: "the AI should be able to use the content
 * of each of the files uploaded and answer any query the user has"). A link in
 * a list does not do that. So the moment an owner uploads a file, we pull its
 * words out here and hand them to the knowledge base, which is what the agent
 * searches before it answers.
 *
 * Everything below is pure Node — no parser package, no service, no API key.
 * That matters for three reasons: a deck must not leave Freyr's own servers to
 * be read, prod must not gain a native build step, and extraction has to work
 * the same on a laptop as it does in ECS.
 *
 * .docx/.pptx/.xlsx are ZIP archives of XML, so one small ZIP reader plus a
 * tag-stripper covers Office entirely. PDF text lives in compressed content
 * streams, which is the one genuinely awkward format; we handle the common
 * (uncompressed-or-Flate, unencrypted) case and degrade to "" rather than
 * guessing. Plain text formats are just decoded.
 */

/** Roughly 25 pages of prose per file. Past this a single deck would crowd
 *  every other source out of the model's context for no gain in answer
 *  quality — the retriever only ever quotes a few passages anyway. */
const MAX_CHARS = 60_000;

// ---------------------------------------------------------------- zip reader

type ZipEntry = { name: string; data: Buffer };
type ArchiveBudget = {
  entries: number;
  expandedBytes: number;
  /** Bounds what is persisted/indexed independently of compressed size. */
  textChars: number;
};

export type ExtractedArchiveMember = {
  /** Safe, relative member path, including nested archive names. */
  path: string;
  text: string;
  /** Date declared by the member document itself, never the upload date. */
  contentDate?: string;
};

export type ExtractedFileContent = {
  text: string;
  /** Date declared by the document itself, if its format carries one. */
  contentDate?: string;
  archiveMembers?: ExtractedArchiveMember[];
};

/** Every file inside a ZIP, decompressed. Handles the two methods Office and
 *  every other real-world writer actually emit: stored (0) and deflate (8). */
function readZip(
  buf: Buffer,
  options: {
    include?: (name: string) => boolean;
    maxEntries?: number;
    maxBytes?: number;
    budget?: ArchiveBudget;
  } = {}
): ZipEntry[] {
  // The end-of-central-directory record is last, but a trailing comment can
  // push it back up to 64KB from the end, so scan backwards for its signature.
  let eocd = -1;
  const from = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // start of the central directory
  const out: ZipEntry[] = [];
  const maxEntries = options.maxEntries ?? MAX_ARCHIVE_ENTRIES;
  const maxBytes = options.maxBytes ?? MAX_ARCHIVE_TEXT_BYTES;
  const budget = options.budget ?? {
    entries: 0,
    expandedBytes: 0,
    textChars: 0,
  };

  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > buf.length) break;
    const unsafeName = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    if (unsafeName.endsWith("/")) continue;
    if (budget.entries >= maxEntries) break;
    budget.entries += 1;
    const name = safeArchiveMemberPath(unsafeName);
    if (!name || (options.include && !options.include(name))) continue;
    // Encrypted entries, unknown compression methods and declared bombs are
    // skipped without attempting an allocation.
    if ((flags & 0x1) !== 0 || (method !== 0 && method !== 8)) continue;
    if (uncompressedSize > maxBytes - budget.expandedBytes) continue;

    // The local header repeats the name and carries its OWN extra-field
    // length, which frequently differs from the central one — reading the
    // central value here is the classic way to land mid-file.
    if (localOffset + 30 > buf.length) continue;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    if (start < 0 || start + compressedSize > buf.length) continue;
    const raw = buf.subarray(start, start + compressedSize);

    try {
      const remaining = maxBytes - budget.expandedBytes;
      const data =
        method === 0
          ? Buffer.from(raw)
          : inflateRawSync(raw, { maxOutputLength: remaining });
      // Do not trust the central-directory size; charge the bytes actually
      // produced and reject a stored entry whose declaration lied.
      if (data.length > remaining) continue;
      budget.expandedBytes += data.length;
      out.push({ name, data });
    } catch {
      // One unreadable entry must not lose the other 200.
    }
  }
  return out;
}

// ------------------------------------------------------------ xml → sentences

/** Strip XML down to its words. `breakOn` marks tags that end a line, so a
 *  slide's bullets and a document's paragraphs do not run into each other. */
function xmlText(xml: string, breakOn: RegExp): string {
  return decodeEntities(
    xml
      .replace(breakOn, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** slide2.xml before slide10.xml — plain sort puts 10 first, which scrambles
 *  the deck's narrative order in the extracted text. */
function byNumber(a: string, b: string): number {
  const n = (s: string) => Number(s.match(/(\d+)\D*$/)?.[1] ?? 0);
  return n(a) - n(b) || a.localeCompare(b);
}

function normalizedDocumentDate(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = decodeEntities(value.replace(/<[^>]+>/g, "")).trim();
  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

/** Prefer published/issued, then authored/created, then modified metadata. */
function officeContentDate(zip: ZipEntry[]): string | undefined {
  const core = zip.find((entry) => entry.name === "docProps/core.xml");
  if (!core) return undefined;
  const xml = core.data.toString("utf8");
  for (const tag of ["dcterms:issued", "dc:date", "dcterms:created", "dcterms:modified"]) {
    const escaped = tag.replace(":", "\\:");
    const value = xml.match(
      new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i")
    )?.[1];
    const normalized = normalizedDocumentDate(value);
    if (normalized) return normalized;
  }
  return undefined;
}

// -------------------------------------------------------------- the formats

function fromDocx(zip: ZipEntry[]): string {
  const doc = zip.find((e) => e.name === "word/document.xml");
  if (!doc) return "";
  // Paragraph and explicit-break tags become newlines; everything else is
  // formatting noise around the runs.
  return xmlText(doc.data.toString("utf8"), /<\/w:p>|<w:br\b[^>]*\/?>/g);
}

function fromPptx(zip: ZipEntry[]): string {
  const slides = zip
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
    .sort((a, b) => byNumber(a.name, b.name));
  const notes = zip
    .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e.name))
    .sort((a, b) => byNumber(a.name, b.name));

  const parts: string[] = [];
  slides.forEach((s, i) => {
    // Slide numbers are worth keeping: "it's on slide 6" is the kind of answer
    // a rep can act on, and the model can only say it if we say it here.
    const body = xmlText(s.data.toString("utf8"), /<\/a:p>|<a:br\b[^>]*\/?>/g);
    if (body) parts.push(`Slide ${i + 1}: ${body}`);
  });
  notes.forEach((n, i) => {
    const body = xmlText(n.data.toString("utf8"), /<\/a:p>/g);
    if (body) parts.push(`Slide ${i + 1} speaker notes: ${body}`);
  });
  return parts.join("\n\n");
}

function fromXlsx(zip: ZipEntry[]): string {
  // Cell values are indexes into one shared string table; without it a sheet
  // reads as a wall of integers.
  const sharedXml = zip.find((e) => e.name === "xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedXml) {
    const xml = sharedXml.data.toString("utf8");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(
        decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
      );
    }
  }

  const sheets = zip
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => byNumber(a.name, b.name));

  const parts: string[] = [];
  for (const sheet of sheets) {
    const xml = sheet.data.toString("utf8");
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const isShared = /\bt="s"/.test(cell[1]);
        const v = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const inline = cell[2].match(/<is>([\s\S]*?)<\/is>/)?.[1];
        if (inline)
          cells.push(decodeEntities(inline.replace(/<[^>]+>/g, "")).trim());
        else if (v == null) continue;
        else if (isShared) cells.push(shared[Number(v)] ?? "");
        else cells.push(decodeEntities(v));
      }
      const line = cells.filter(Boolean).join(" | ");
      if (line) rows.push(line);
    }
    if (rows.length) parts.push(rows.join("\n"));
  }
  return parts.join("\n\n");
}

function archiveMembers(
  buf: Buffer,
  depth: number,
  budget: ArchiveBudget,
  prefix = ""
): ExtractedArchiveMember[] {
  if (depth > MAX_ARCHIVE_DEPTH) return [];
  const readable = readZip(buf, {
    include: (name) => isReadableFile(name),
    budget,
  });
  const members: ExtractedArchiveMember[] = [];
  for (const entry of readable) {
    const path = prefix ? `${prefix}!/${entry.name}` : entry.name;
    if (/\.zip$/i.test(entry.name)) {
      if (depth < MAX_ARCHIVE_DEPTH)
        members.push(...archiveMembers(entry.data, depth + 1, budget, path));
      continue;
    }
    const extracted = extractFileContentInternal(entry.data, entry.name, budget);
    if (!extracted.text) continue;
    const remainingText = MAX_CHARS - budget.textChars;
    if (remainingText <= 0) break;
    const memberText = extracted.text.slice(0, remainingText);
    budget.textChars += memberText.length;
    members.push({
      path,
      text: memberText,
      ...(extracted.contentDate ? { contentDate: extracted.contentDate } : {}),
    });
  }
  return members;
}

function fromPdf(buf: Buffer): string {
  const parts: string[] = [];
  let collected = 0;
  const MAX_PDF_STREAM_BYTES = 4 * 1024 * 1024;
  // Hard wall-clock stop for the whole walk. This runs synchronously on the
  // upload request path, so a slow file must degrade to "fewer words read",
  // never to a stalled request — a stalled parse blocks the event loop, which
  // fails the ECS health checks and takes the whole container down with it
  // (Inayat's deck, Aug 12).
  const deadline = Date.now() + 5_000;
  // Walk stream/endstream pairs rather than regexing the whole file: PDF
  // bodies are binary and a greedy match across them is both wrong and slow.
  let i = 0;
  while (Date.now() < deadline) {
    const s = buf.indexOf("stream", i);
    if (s < 0) break;
    const e = buf.indexOf("endstream", s);
    if (e < 0) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const header = buf.subarray(Math.max(0, s - 2_048), s).toString("latin1");
    const body = buf.subarray(start, e);
    i = e + 9;

    let text: string | null = null;
    // Proposal PDFs contain full-resolution photography. Inflating an image
    // stream that happened to have a long dictionary used to stall archive
    // indexing even though an image cannot contribute searchable words.
    if (/\/(DCTDecode|JPXDecode|CCITTFaxDecode)|\/Subtype\s*\/Image/.test(header)) {
      continue;
    }
    if (body.length > MAX_PDF_STREAM_BYTES) continue;
    if (/\/FlateDecode/.test(header)) {
      try {
        text = inflateSync(body, {
          maxOutputLength: MAX_PDF_STREAM_BYTES,
        }).toString("latin1");
      } catch {
        try {
          text = inflateRawSync(body, {
            maxOutputLength: MAX_PDF_STREAM_BYTES,
          }).toString("latin1");
        } catch {
          text = null; // encrypted or a non-text stream, skip it
        }
      }
    } else {
      text = body.toString("latin1");
    }
    if (text && /(Tj|TJ)\b/.test(text)) {
      const words = pdfOperators(text);
      if (words) {
        parts.push(words);
        collected += words.length;
        if (collected >= MAX_CHARS) break;
      }
    }
  }
  return parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n");
}

function pdfContentDate(buf: Buffer): string | undefined {
  const head = buf.subarray(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
  const raw = head.match(/\/(?:CreationDate|ModDate)\s*\((?:D:)?(\d{4})(\d{2})(\d{2})/);
  if (!raw) return undefined;
  return normalizedDocumentDate(`${raw[1]}-${raw[2]}-${raw[3]}T00:00:00Z`);
}

/** Pull the literal strings out of a PDF content stream: `(hello) Tj` and
 *  `[(hel) -20 (lo)] TJ`. Anything drawn as an image or as a hex-encoded CID
 *  font is not recoverable this way, and we would rather return less than
 *  return mojibake the model would happily quote.
 *
 *  Every repeated group in this regex MUST keep its alternatives disjoint
 *  (`\\.` first, then a class that EXCLUDES backslash). The `[...] TJ` branch
 *  once used `[^\][]`, which also matches a backslash, so glyph runs like
 *  `\a\a\a…` with no closing `] TJ` could be consumed two ways per pair —
 *  exponential backtracking that pinned the CPU for minutes on a 0.3MB deck
 *  and got the prod container killed mid-upload (Aug 12). */
function pdfOperators(stream: string): string {
  const out: string[] = [];
  for (const m of stream.matchAll(/\((?:\\.|[^\\()])*\)\s*(Tj|TJ|')|\[((?:\\.|[^\\\][])*)\]\s*TJ|\bT\*|\bTd\b|\bTD\b/g)) {
    if (m[0] === "T*" || m[0] === "Td" || m[0] === "TD") {
      out.push("\n");
      continue;
    }
    const chunk = m[2] ?? m[0];
    let line = "";
    for (const lit of chunk.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      line += lit[0]
        .slice(1, -1)
        .replace(/\\([nrtbf])/g, (_, c) =>
          c === "n" || c === "r" ? "\n" : c === "t" ? " " : ""
        )
        .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
        .replace(/\\(.)/g, "$1");
    }
    out.push(line);
  }
  return out
    .join("")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------- entry

const PLAIN = /\.(txt|md|markdown|csv|tsv|json|xml|html?|rtf|log|yml|yaml)$/i;

/** The readable words inside a file, or "" when the format carries none we can
 *  trust. Never throws: a file that cannot be read must still upload. */
function extractFileContentInternal(
  buffer: Buffer,
  filename: string,
  archiveBudget?: ArchiveBudget
): ExtractedFileContent {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  try {
    let text = "";
    let contentDate: string | undefined;
    let members: ExtractedArchiveMember[] | undefined;
    // Only a PDF can yield glyph soup: Office formats and plain text are read
    // exactly, so a two-word spreadsheet is short, not broken.
    let needsLanguageCheck = false;
    if (ext === "zip") {
      const budget = archiveBudget ?? {
        entries: 0,
        expandedBytes: 0,
        textChars: 0,
      };
      members = archiveMembers(buffer, 0, budget);
      text = members
        .map((member) => `Archive member: ${member.path}\n${member.text}`)
        .join("\n\n");
    } else if (ext === "docx" || ext === "pptx" || ext === "xlsx" || ext === "xlsm") {
      const zip = readZip(buffer, {
        ...(archiveBudget ? { budget: archiveBudget } : {}),
      });
      contentDate = officeContentDate(zip);
      text =
        ext === "docx"
          ? fromDocx(zip)
          : ext === "pptx"
            ? fromPptx(zip)
            : fromXlsx(zip);
    } else if (ext === "pdf") {
      text = fromPdf(buffer);
      contentDate = pdfContentDate(buffer);
      needsLanguageCheck = true;
    } else if (PLAIN.test(filename)) {
      text = buffer.toString("utf8");
      if (/\.rtf$/i.test(filename))
        text = text.replace(/\\[a-z]+-?\d*\s?/gi, " ").replace(/[{}]/g, " ");
      if (/\.html?$/i.test(filename))
        text = xmlText(text, /<\/(p|div|li|tr|h[1-6])>|<br\b[^>]*\/?>/gi);
    }

    text = text.replace(/\0/g, "").replace(/[ \t]+\n/g, "\n").trim();
    // A PDF of nothing but glyph soup (a scan, or CID fonts we cannot map)
    // still matches on stray letters and would poison an answer. Require that
    // it looks like language before we let the assistant quote it.
    if (needsLanguageCheck && (text.match(/[A-Za-z]{3,}/g)?.length ?? 0) < 12)
      return { text: "" };
    if (!text.trim()) return { text: "" };
    const limited = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…` : text;
    return {
      text: limited,
      ...(contentDate ? { contentDate } : {}),
      ...(members?.length ? { archiveMembers: members } : {}),
    };
  } catch {
    return { text: "" };
  }
}

export function extractFileContent(
  buffer: Buffer,
  filename: string
): ExtractedFileContent {
  return extractFileContentInternal(buffer, filename);
}

export function extractFileText(buffer: Buffer, filename: string): string {
  return extractFileContent(buffer, filename).text;
}

/** Whether we can read this kind of file at all. ZIPs contribute text only from
 *  supported embedded documents; binaries and unsupported members are skipped. */
export function isReadableFile(filename: string): boolean {
  return (
    /\.(docx|pptx|xlsx|xlsm|pdf|zip)$/i.test(filename) || PLAIN.test(filename)
  );
}
