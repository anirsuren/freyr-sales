/**
 * A REAL WORD FILE, BUILT IN THE BROWSER.
 *
 * We used to hand Word an HTML page with a `.doc` extension and the
 * application/msword type. Word on a developer machine opens that; plenty of
 * other setups do not, and Suren's did not (Aug 9: "the document won't open…
 * where is that feature document? It just doesn't open. It will work on your
 * computer"). A file the customer cannot open is not a deliverable.
 *
 * So this writes a genuine .docx: an OOXML package with the three parts Word,
 * Pages, Google Docs and Quick Look all require. No dependency, because the
 * only hard part is a ZIP, and a ZIP with no compression is a header format.
 */

/** XML text nodes and attribute values must not carry raw markup characters. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A store-only ZIP. Every DOCX reader accepts method 0, and skipping DEFLATE
 * keeps this to arithmetic on a DataView instead of a compression library.
 * Timestamps are fixed rather than read from the clock so the same content
 * always produces the same bytes.
 */
function zip(files: { name: string; text: string }[]): Blob {
  const encoder = new TextEncoder();
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = 0x21; // 1980-01-01, the epoch the format starts at
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const sum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method: stored
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // offset of local header
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return new Blob([out.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** One run of text inside a paragraph. */
function run(text: string, opts?: { bold?: boolean; size?: number; grey?: boolean }) {
  const props = [
    opts?.bold ? "<w:b/>" : "",
    opts?.size ? `<w:sz w:val="${opts.size * 2}"/>` : "",
    opts?.grey ? '<w:color w:val="6E6E73"/>' : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(
    text
  )}</w:t></w:r>`;
}

function para(text: string, opts?: { bold?: boolean; size?: number; grey?: boolean }) {
  return `<w:p>${text ? run(text, opts) : ""}</w:p>`;
}

function cell(text: string, opts?: { bold?: boolean; grey?: boolean; width?: number }) {
  return `<w:tc><w:tcPr>${
    opts?.width ? `<w:tcW w:w="${opts.width}" w:type="dxa"/>` : ""
  }${opts?.bold ? '<w:shd w:val="clear" w:fill="F5F7FA"/>' : ""}</w:tcPr>${para(text, {
    bold: opts?.bold,
    grey: opts?.grey,
    size: 10,
  })}</w:tc>`;
}

export type DocxTable = {
  headers: string[];
  /** Each row is one cell per header. A cell may carry a second, greyed line. */
  rows: { cells: string[]; note?: string; noteAt?: number }[];
};

/**
 * Build a .docx with a title, a subtitle and one table, and hand it to the
 * browser as a download. Returns the Blob so callers can assert on it.
 */
export function downloadDocx(
  filename: string,
  title: string,
  subtitle: string,
  table: DocxTable
): Blob {
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${table.headers
    .map((h) => cell(h, { bold: true }))
    .join("")}</w:tr>`;

  const body = table.rows
    .map((row) => {
      const cells = row.cells.map((text, index) => {
        // The note rides under whichever column names the thing, so a
        // description stays with its feature instead of becoming its own
        // column that squeezes everything else.
        if (index === (row.noteAt ?? 0) && row.note) {
          return `<w:tc><w:tcPr/>${para(text, { bold: true, size: 10 })}${para(
            row.note,
            { grey: true, size: 9 }
          )}</w:tc>`;
        }
        return cell(text, { bold: index === 0 });
      });
      return `<w:tr>${cells.join("")}</w:tr>`;
    })
    .join("");

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    para(title, { bold: true, size: 16 }) +
    para(subtitle, { grey: true, size: 10 }) +
    para("") +
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D8D8DD"/>`)
      .join("") +
    `</w:tblBorders></w:tblPr>${head}${body}</w:tbl>` +
    para("") +
    para("Generated from Freyr Sales Intelligence.", { grey: true, size: 9 }) +
    `<w:sectPr/></w:body></w:document>`;

  const blob = zip([
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    },
    { name: "word/document.xml", text: documentXml },
  ]);

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return blob;
}
