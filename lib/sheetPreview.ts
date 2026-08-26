/**
 * READING AN EXCEL WORKBOOK THE WAY EXCEL DRAWS IT.
 *
 * Anir, Aug 26: "if a cell is coloured it's showing up, but everything else
 * isn't. If text is bold or if the text within a cell is centre-aligned, all
 * that is not showing up. Can we make it fully in sync with the formatting of
 * the Excel file?" — and then: "it's not just for that file, it's for every
 * other file."
 *
 * That was never a rendering bug. The reader was the SheetJS COMMUNITY build,
 * which does not parse cell fonts or alignment at all — style support is a Pro
 * feature there — so the viewer was faithfully drawing the nothing it was
 * handed. ExcelJS parses the whole style record, and this module is the single
 * place that turns a workbook into what the viewer draws.
 *
 * It lives here rather than inline in the preview route so it can be tested
 * against a spread of deliberately awkward workbooks, cell by cell, and the
 * route provably runs the same code the test does. That is also why this one
 * server library carries no `import "server-only"`: the guard resolves through
 * Next's alias and not through plain node, and it would put the module out of
 * reach of tests/sheet-fidelity.test.mjs. Nothing but the preview route
 * imports it, and it does so dynamically, inside a route handler.
 */

export type SheetStyle = {
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Points, straight from the workbook. */
  size?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  strike?: boolean;
  /** Ready-to-use CSS shorthand per edge, e.g. "2px solid #C9CDD6". */
  border?: { top?: string; right?: string; bottom?: string; left?: string };
};

export type SheetPreview = {
  name: string;
  rows: (string | number | boolean | null)[][];
  styles?: Record<string, SheetStyle>;
  widths?: (number | null)[];
  merges?: [number, number, number, number][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
};

/** Big enough for a real report, small enough that one request cannot exhaust
 *  the container's memory. */
export const MAX_SHEET_ROWS = 500;
export const MAX_SHEET_COLUMNS = 80;


/* ------------------------------------------------------------------ *
 * COLOUR
 *
 * A workbook names a colour in three different ways and Excel draws all
 * three. Reading only the first (a literal RGB) is why a themed heading
 * came through as plain black text: every one of Anir's three live
 * spreadsheets colours its body text as theme 1 and its links as theme
 * 10, and neither carries an RGB anywhere in the file.
 * ------------------------------------------------------------------ */

/** The legacy 56-entry palette, for workbooks old enough to use it. */
const INDEXED_PALETTE = [
  "#000000","#FFFFFF","#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF",
  "#000000","#FFFFFF","#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF",
  "#800000","#008000","#000080","#808000","#800080","#008080","#C0C0C0","#808080",
  "#9999FF","#993366","#FFFFCC","#CCFFFF","#660066","#FF8080","#0066CC","#CCCCFF",
  "#000080","#FF00FF","#FFFF00","#00FFFF","#800080","#800000","#008080","#0000FF",
  "#00CCFF","#CCFFFF","#CCFFCC","#FFFF99","#99CCFF","#FF99CC","#CC99FF","#FFCC99",
  "#3366FF","#33CCCC","#99CC00","#FFCC00","#FF9900","#FF6600","#666699","#969696",
  "#003366","#339966","#003300","#333300","#993300","#993366","#333399","#333333",
];

/**
 * The theme palette, read from the workbook's own theme part rather than
 * assumed. A customer's corporate template overrides the Office defaults,
 * and guessing Office blue for their brand navy is exactly the kind of
 * "close enough" that makes the preview visibly not the file.
 *
 * The one trap: a spreadsheet's theme index is NOT the order the theme
 * lists its colours in. theme1.xml writes dk1, lt1, dk2, lt2, then the
 * accents; a cell's theme="0" means lt1 and theme="1" means dk1. The
 * first two pairs are swapped, and only the first two pairs.
 */
function themePalette(themeXml: string | undefined): string[] {
  const OFFICE_DEFAULT = [
    "#FFFFFF","#000000","#E7E6E6","#44546A","#4472C4","#ED7D31",
    "#A5A5A5","#FFC000","#5B9BD5","#70AD47","#0563C1","#954F72",
  ];
  if (!themeXml) return OFFICE_DEFAULT;
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(themeXml)?.[0];
  if (!scheme) return OFFICE_DEFAULT;

  const readSlot = (slot: string): string | undefined => {
    const block = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(scheme)?.[1];
    if (!block) return undefined;
    /* A slot holds either a literal colour or a system colour, and a
       system colour carries the resolved value in lastClr. */
    const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(block)?.[1];
    if (srgb) return `#${srgb.toUpperCase()}`;
    const sys = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1];
    if (sys) return `#${sys.toUpperCase()}`;
    return undefined;
  };

  const order = ["lt1","dk1","lt2","dk2","accent1","accent2","accent3",
                 "accent4","accent5","accent6","hlink","folHlink"];
  return order.map((slot, i) => readSlot(slot) ?? OFFICE_DEFAULT[i]);
}

/**
 * Excel stores a shade of a theme colour as that colour plus a tint in
 * [-1, 1] — negative darkens, positive lightens — applied to the HSL
 * luminance. "Accent 1, 40% lighter" is one theme index and one tint, so
 * ignoring the tint renders every shade of a band as the same flat colour.
 */
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  let l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rgb[0]) h = ((rgb[1] - rgb[2]) / d + (rgb[1] < rgb[2] ? 6 : 0)) / 6;
    else if (max === rgb[1]) h = ((rgb[2] - rgb[0]) / d + 2) / 6;
    else h = ((rgb[0] - rgb[1]) / d + 4) / 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;

  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let out: number[];
  if (sat === 0) out = [l, l, l];
  else {
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    out = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  }
  return (
    "#" +
    out
      .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * Excel's "Automatic" font colour: no colour at all, the window-text theme
 * slot, or the legacy palette's automatic entry. A cell that says black
 * *deliberately* is a different thing and is left alone.
 */
function isAutomaticColour(value: unknown): boolean {
  const v = value as
    | { argb?: string; theme?: number; tint?: number; indexed?: number }
    | undefined;
  if (!v) return true;
  if (typeof v.theme === "number") return v.theme === 1 && !v.tint;
  if (typeof v.indexed === "number") return v.indexed === 64;
  return false;
}

/** Excel's border weights, in the CSS the browser draws them with. */
const BORDER_CSS: Record<string, string> = {
  hair: "1px solid",
  thin: "1px solid",
  medium: "2px solid",
  thick: "3px solid",
  double: "3px double",
  dotted: "1px dotted",
  dashed: "1px dashed",
  dashDot: "1px dashed",
  dashDotDot: "1px dashed",
  mediumDashed: "2px dashed",
  mediumDashDot: "2px dashed",
  mediumDashDotDot: "2px dashed",
  slantDashDot: "2px dashed",
};

export async function readWorkbook(buffer: Buffer): Promise<SheetPreview[]> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);


/* The workbook's own theme, so a corporate template resolves to the
   customer's brand colours rather than to Office's defaults. */
const palette = themePalette(
  /* ExcelJS types themes as an array; at runtime it is keyed by part
     name ("theme1"), which is what actually carries the palette. */
  (book.model as unknown as { themes?: Record<string, string> }).themes
    ?.theme1
);

/** Excel colours arrive as an ARGB ("FF1F3864"), a theme index with an
 *  optional tint, or a legacy palette index. All three are drawn by
 *  Excel, so all three are resolved here. */
const argb = (value: unknown): string | undefined => {
  const v = value as
    | { argb?: string; theme?: number; tint?: number; indexed?: number }
    | undefined;
  if (!v) return undefined;

  if (typeof v.argb === "string") {
    const hex = v.argb.length === 8 ? v.argb.slice(2) : v.argb;
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : undefined;
  }
  if (typeof v.theme === "number") {
    const base = palette[v.theme];
    return base ? applyTint(base, v.tint ?? 0) : undefined;
  }
  if (typeof v.indexed === "number") {
    const base = INDEXED_PALETTE[v.indexed];
    return base ? applyTint(base, v.tint ?? 0) : undefined;
  }
  return undefined;
};

const MAX_ROWS = MAX_SHEET_ROWS;
const MAX_COLUMNS = MAX_SHEET_COLUMNS;

const sheets = book.worksheets.slice(0, 12).map((worksheet) => {
  const name = worksheet.name;
  const lastRow = Math.min(worksheet.rowCount, MAX_ROWS) - 1;
  const lastColumn = Math.min(worksheet.columnCount, MAX_COLUMNS) - 1;

  const rows: (string | number | boolean | null)[][] = [];
  const styles: Record<string, Record<string, unknown>> = {};

  for (let r = 0; r <= lastRow; r++) {
    const row = worksheet.getRow(r + 1);
    const out: (string | number | boolean | null)[] = [];
    for (let c = 0; c <= lastColumn; c++) {
      const cell = row.getCell(c + 1);

      /* THE VALUE AS EXCEL SHOWS IT. A formula cell carries both the
         formula and its last computed result; the result is what the
         sheet displays. Rich text is a run array, and a hyperlink is an
         object — both would otherwise stringify to "[object Object]". */
      /**
       * A DATE MUST READ THE WAY THE SHEET WRITES IT (Anir, Aug 26:
       * "make it fully in sync with the formatting of the Excel file").
       * Excel stores 2026-02-01 and displays "Feb-26" because the cell
       * carries a number format. Showing the ISO date is technically the
       * same instant and visibly a different document, so the format is
       * applied for the handful of patterns that actually appear in
       * these workbooks. Anything unrecognised falls back to the ISO
       * date rather than being guessed at.
       */
      const numFmt = (cell.numFmt || "").toLowerCase();
      const formatDateCell = (d: Date): string => {
        const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const yy = String(d.getUTCFullYear()).slice(2);
        const yyyy = String(d.getUTCFullYear());
        const mon = MON[d.getUTCMonth()];
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        if (!numFmt) return `${yyyy}-${mm}-${dd}`;
        /* mmm-yy → "Feb-26"; mmm yyyy → "Feb 2026"; the rest keep a
           full date in the order the format asks for. */
        if (/^mmm+[-\s]yy(?!y)/.test(numFmt)) return `${mon}-${yy}`;
        if (/^mmm+[-\s]yyyy/.test(numFmt)) return `${mon} ${yyyy}`;
        if (/^mmm+$/.test(numFmt)) return mon;
        if (numFmt.includes("mmm")) return `${dd} ${mon} ${yyyy}`;
        if (numFmt.startsWith("dd/mm") || numFmt.startsWith("d/m"))
          return `${dd}/${mm}/${yyyy}`;
        if (numFmt.startsWith("mm/dd") || numFmt.startsWith("m/d"))
          return `${mm}/${dd}/${yyyy}`;
        return `${yyyy}-${mm}-${dd}`;
      };

      const v = cell.value as unknown;
      let text: string | number | boolean | null = null;
      if (v === null || v === undefined) text = null;
      else if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("result" in o) text = (o.result as never) ?? null;
        else if ("richText" in o)
          text = (o.richText as { text: string }[])
            .map((t) => t.text)
            .join("");
        else if ("text" in o) text = String(o.text);
        else if (v instanceof Date) text = formatDateCell(v);
        else if ("error" in o) text = String(o.error);
        else text = null;
      } else text = v as never;
      if (v instanceof Date) text = formatDateCell(v);
      out.push(text === "" ? null : text);

      const entry: Record<string, unknown> = {};
      const font = cell.font;
      const fill = cell.fill as { type?: string; fgColor?: unknown } | undefined;
      const alignment = cell.alignment;

      if (fill?.type === "pattern") {
        const bg = argb(fill.fgColor);
        /* Excel writes white as an explicit fill on many sheets; the
           grid is already white, and painting it hides the gridlines. */
        if (bg && bg !== "#FFFFFF") entry.bg = bg;
      }
      const color = argb(font?.color);
      if (color) entry.color = color;
      /* Excel's "Automatic" is not a colour the author picked, it is the
         system's window-text colour — which is why a workbook can be read on
         a dark desktop without every sheet going black-on-black. Every cell
         carries it, so it has to be told apart from a deliberate black. */
      const automatic = isAutomaticColour(font?.color);
      if (font?.bold) entry.bold = true;
      if (font?.italic) entry.italic = true;
      if (font?.underline) entry.underline = true;
      if (typeof font?.size === "number" && font.size > 0)
        entry.size = font.size;

      const h = alignment?.horizontal;
      if (h === "center" || h === "right" || h === "left") entry.align = h;
      const vAlign = alignment?.vertical;
      if (vAlign === "middle" || vAlign === "bottom" || vAlign === "top")
        entry.valign = vAlign;
      if (alignment?.wrapText) entry.wrap = true;
      if (font?.strike) entry.strike = true;

      /* RULED LINES ARE PART OF THE PICTURE. Every one of the live
         spreadsheets rules its header band and its table body, and a
         preview with no rules reads as a different document even when
         every value and colour is right. */
      const cellBorder = cell.border as
        | Record<string, { style?: string; color?: unknown } | undefined>
        | undefined;
      if (cellBorder) {
        const edges: Record<string, string> = {};
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const edge = cellBorder[side];
          const css = edge?.style ? BORDER_CSS[edge.style] : undefined;
          if (!css) continue;
          /* Excel's automatic border colour is black. */
          edges[side] = `${css} ${argb(edge?.color) ?? "#000000"}`;
        }
        if (Object.keys(edges).length > 0) entry.border = edges;
      }

      /* A DARK BAND NEEDS LIGHT TEXT. Excel keeps a header row's white
         font in the theme palette, which is not resolved to an RGB here,
         so a #0D1233 fill would render black-on-navy. When the fill is
         dark and no explicit colour survived, pick white — the call
         Excel itself makes. */
      if (entry.bg && (!entry.color || automatic)) {
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
    rows.push(out);
  }

  /* Trim trailing rows and columns that carry neither value nor style,
     so a sheet with a stale declared range does not render a field of
     empty cells. */
  const hasSomething = (r: number, c: number) =>
    rows[r]?.[c] !== null && rows[r]?.[c] !== undefined
      ? true
      : !!styles[`${r}:${c}`];
  let lastUsedRow = -1;
  let lastUsedColumn = -1;
  for (let r = 0; r <= lastRow; r++)
    for (let c = 0; c <= lastColumn; c++)
      if (hasSomething(r, c)) {
        if (r > lastUsedRow) lastUsedRow = r;
        if (c > lastUsedColumn) lastUsedColumn = c;
      }
  const usedRows = rows
    .slice(0, lastUsedRow + 1)
    .map((row) => row.slice(0, lastUsedColumn + 1));

  /* Column widths in Excel's character units, which is what the viewer
     multiplies by ~7px. */
  const widths =
    lastUsedColumn >= 0
      ? Array.from({ length: lastUsedColumn + 1 }, (_, c) => {
          const col = worksheet.getColumn(c + 1);
          if (col.hidden) return null;
          return typeof col.width === "number" ? col.width : null;
        })
      : [];

  /* Merged ranges, clipped to the trimmed grid. A merged title spanning
     A1:E1 must render as one wide cell, not five. */
  const merges: [number, number, number, number][] = [];
  const modelMerges =
    ((worksheet as unknown as { model?: { merges?: string[] } }).model
      ?.merges ?? []) as string[];
  for (const range of modelMerges) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
    if (!m) continue;
    const colOf = (letters: string) =>
      letters
        .split("")
        .reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    const sr = Number(m[2]) - 1;
    const sc = colOf(m[1]);
    const er = Number(m[4]) - 1;
    const ec = colOf(m[3]);
    if (sr > lastUsedRow || sc > lastUsedColumn) continue;
    merges.push([
      sr,
      sc,
      Math.min(er, lastUsedRow),
      Math.min(ec, lastUsedColumn),
    ]);
  }

  return {
    name,
    rows: usedRows,
    styles: Object.keys(styles).length ? (styles as never) : undefined,
    widths: widths.some((w) => w != null) ? widths : undefined,
    merges: merges.length ? merges : undefined,
    totalRows: lastUsedRow >= 0 ? lastUsedRow + 1 : 1,
    totalColumns: lastUsedColumn >= 0 ? lastUsedColumn + 1 : 1,
    truncated:
      worksheet.rowCount > MAX_ROWS || worksheet.columnCount > MAX_COLUMNS,
  };
});

  return sheets;
}
