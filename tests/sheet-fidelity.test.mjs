import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { readWorkbook } from "../lib/sheetPreview.ts";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

/**
 * THE PREVIEW HAS TO BE THE FILE.
 *
 * Anir, Aug 26: "if a cell is coloured it's showing up, but everything else
 * isn't. If text is bold or if the text within a cell is centre-aligned, all
 * that is not showing up... it's not just for that file, it's for every other
 * file. It has to look the exact same."
 *
 * Three separate things had to be true for that, and each one is a section
 * below: the reader has to see the formatting at all (the old SheetJS
 * community build could not see fonts or alignment), it has to resolve the
 * three different ways a workbook names a colour, and it has to carry the
 * ruled lines that make a table look like a table.
 *
 * Workbooks are built in memory and read back through the same function the
 * preview route calls, so nothing here touches a database, a server or a file
 * on disk.
 *
 *   npm run test:sheet
 */

/** Build a one-sheet workbook from a callback and read it back. */
async function roundTrip(build) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  build(ws, wb);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const sheets = await readWorkbook(buffer);
  return sheets[0];
}

const styleAt = (sheet, row, column) => sheet.styles?.[`${row}:${column}`] ?? {};

/* ------------------------------------------------------------------ *
 * 1. THE FORMATTING THE OLD READER COULD NOT SEE
 * ------------------------------------------------------------------ */

test("bold, italic, underline and strikethrough each survive", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "plain";
    ws.getCell("A2").value = "bold";
    ws.getCell("A2").font = { bold: true };
    ws.getCell("A3").value = "italic";
    ws.getCell("A3").font = { italic: true };
    ws.getCell("A4").value = "underline";
    ws.getCell("A4").font = { underline: true };
    ws.getCell("A5").value = "struck";
    ws.getCell("A5").font = { strike: true };
    ws.getCell("A6").value = "all four";
    ws.getCell("A6").font = {
      bold: true,
      italic: true,
      underline: true,
      strike: true,
    };
  });

  assert.equal(styleAt(sheet, 0, 0).bold, undefined, "plain text stays plain");
  assert.equal(styleAt(sheet, 1, 0).bold, true);
  assert.equal(styleAt(sheet, 2, 0).italic, true);
  assert.equal(styleAt(sheet, 3, 0).underline, true);
  assert.equal(styleAt(sheet, 4, 0).strike, true);
  const all = styleAt(sheet, 5, 0);
  assert.deepEqual(
    [all.bold, all.italic, all.underline, all.strike],
    [true, true, true, true]
  );
});

test("font size comes through in points, and the 11pt default is left alone", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "default";
    ws.getCell("A2").value = "big";
    ws.getCell("A2").font = { size: 20 };
    ws.getCell("A3").value = "small";
    ws.getCell("A3").font = { size: 8 };
  });

  assert.equal(styleAt(sheet, 0, 0).size, undefined);
  assert.equal(styleAt(sheet, 1, 0).size, 20);
  assert.equal(styleAt(sheet, 2, 0).size, 8);
});

test("horizontal and vertical alignment and wrapping come through", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "centre";
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell("A2").value = "right, bottom";
    ws.getCell("A2").alignment = { horizontal: "right", vertical: "bottom" };
    ws.getCell("A3").value = "wrapped";
    ws.getCell("A3").alignment = { wrapText: true };
    ws.getCell("A4").value = "top";
    ws.getCell("A4").alignment = { vertical: "top" };
  });

  assert.equal(styleAt(sheet, 0, 0).align, "center");
  // Excel calls it "middle" once ExcelJS has normalised it; CSS agrees.
  assert.equal(styleAt(sheet, 0, 0).valign, "middle");
  assert.equal(styleAt(sheet, 1, 0).align, "right");
  assert.equal(styleAt(sheet, 2, 0).wrap, true);
  assert.equal(styleAt(sheet, 3, 0).valign, "top");
});

/* ------------------------------------------------------------------ *
 * 2. COLOUR, ALL THREE WAYS A WORKBOOK NAMES IT
 * ------------------------------------------------------------------ */

test("a literal RGB fill and font colour are kept exactly", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "banded";
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F6F8" },
    };
    ws.getCell("A1").font = { color: { argb: "FF222222" } };
  });

  assert.equal(styleAt(sheet, 0, 0).bg, "#F5F6F8");
  assert.equal(styleAt(sheet, 0, 0).color, "#222222");
});

test("a theme colour resolves against the workbook's own palette", async () => {
  // Every live spreadsheet in the workspace colours its body text as theme 1
  // and its links as theme 10, and neither carries an RGB anywhere in the
  // file. Reading only literal RGBs rendered both as default black.
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "accent";
    ws.getCell("A1").font = { color: { theme: 4 } };
    ws.getCell("A2").value = "link";
    ws.getCell("A2").font = { color: { theme: 10 } };
  });

  const accent = styleAt(sheet, 0, 0).color;
  const link = styleAt(sheet, 1, 0).color;
  assert.match(accent ?? "", /^#[0-9A-F]{6}$/, "accent resolved to an RGB");
  assert.match(link ?? "", /^#[0-9A-F]{6}$/, "hyperlink colour resolved");
  assert.notEqual(accent, link, "different theme slots are different colours");
  assert.notEqual(accent, "#000000", "an accent is not plain black");
});

test("a tint shades the theme colour rather than being ignored", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "base";
    ws.getCell("A1").font = { color: { theme: 4 } };
    ws.getCell("A2").value = "lighter";
    ws.getCell("A2").font = { color: { theme: 4, tint: 0.6 } };
    ws.getCell("A3").value = "darker";
    ws.getCell("A3").font = { color: { theme: 4, tint: -0.5 } };
  });

  const base = styleAt(sheet, 0, 0).color;
  const lighter = styleAt(sheet, 1, 0).color;
  const darker = styleAt(sheet, 2, 0).color;
  assert.notEqual(lighter, base, "40% lighter is not the same colour");
  assert.notEqual(darker, base, "50% darker is not the same colour");

  const brightness = (hex) =>
    parseInt(hex.slice(1, 3), 16) +
    parseInt(hex.slice(3, 5), 16) +
    parseInt(hex.slice(5, 7), 16);
  assert.ok(brightness(lighter) > brightness(base), "a positive tint lightens");
  assert.ok(brightness(darker) < brightness(base), "a negative tint darkens");
});

test("a legacy indexed colour resolves", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "red";
    ws.getCell("A1").font = { color: { indexed: 2 } };
  });
  assert.equal(styleAt(sheet, 0, 0).color, "#FF0000");
});

test("a white fill does not paint over the grid", async () => {
  // Plenty of sheets set an explicit white background on every cell. The grid
  // is already white, and painting it hides the gridlines.
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "white";
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFF" },
    };
  });
  assert.equal(styleAt(sheet, 0, 0).bg, undefined);
});

test("a dark band gets light text even when the font colour is a theme", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "HEADER";
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D1233" },
    };
  });
  const st = styleAt(sheet, 0, 0);
  assert.equal(st.bg, "#0D1233");
  assert.equal(st.color, "#FFFFFF", "navy header is not left as black on navy");
});

/* ------------------------------------------------------------------ *
 * 3. THE RULED LINES
 * ------------------------------------------------------------------ */

test("each border edge is carried with its own weight and colour", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "ruled";
    ws.getCell("A1").border = {
      top: { style: "medium", color: { argb: "FFC9CDD6" } },
      bottom: { style: "thin" },
      left: { style: "double", color: { argb: "FF0D1233" } },
      right: { style: "dashed", color: { argb: "FFB45309" } },
    };
  });

  const border = styleAt(sheet, 0, 0).border ?? {};
  assert.equal(border.top, "2px solid #C9CDD6");
  // Excel's automatic border colour is black.
  assert.equal(border.bottom, "1px solid #000000");
  assert.equal(border.left, "3px double #0D1233");
  assert.equal(border.right, "1px dashed #B45309");
});

test("an unruled cell carries no border at all", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "bare";
  });
  assert.equal(styleAt(sheet, 0, 0).border, undefined);
});

/* ------------------------------------------------------------------ *
 * 4. VALUES AS THE SHEET WRITES THEM
 * ------------------------------------------------------------------ */

test("a date reads in the cell's own number format", async () => {
  // Excel stores 2026-02-01 and shows "Feb-26". Showing the ISO date is the
  // same instant and a visibly different document.
  const sheet = await roundTrip((ws) => {
    const cases = [
      ["mmm-yy", "Feb-26"],
      ["mmm yyyy", "Feb 2026"],
      ["dd/mm/yyyy", "01/02/2026"],
      ["mm/dd/yyyy", "02/01/2026"],
    ];
    cases.forEach(([format], i) => {
      const cell = ws.getCell(i + 1, 1);
      cell.value = new Date(Date.UTC(2026, 1, 1));
      cell.numFmt = format;
    });
  });

  assert.deepEqual(
    sheet.rows.map((row) => row[0]),
    ["Feb-26", "Feb 2026", "01/02/2026", "02/01/2026"]
  );
});

test("a formula shows its computed result, not the formula", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = 40;
    ws.getCell("A2").value = 2;
    ws.getCell("A3").value = { formula: "SUM(A1:A2)", result: 42 };
  });
  assert.equal(sheet.rows[2][0], 42);
});

/* ------------------------------------------------------------------ *
 * 5. THE SHAPE OF THE GRID
 * ------------------------------------------------------------------ */

test("merged ranges come through as spans", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "One wide title";
    ws.mergeCells("A1:E1");
    ws.getCell("A2").value = "block";
    ws.mergeCells("A2:B3");
  });

  const merges = sheet.merges ?? [];
  assert.ok(
    merges.some(([sr, sc, er, ec]) => sr === 0 && sc === 0 && er === 0 && ec === 4),
    "A1:E1 spans five columns"
  );
  assert.ok(
    merges.some(([sr, sc, er, ec]) => sr === 1 && sc === 0 && er === 2 && ec === 1),
    "A2:B3 spans two by two"
  );
});

test("column widths are carried, and a hidden column is not", async () => {
  // Only widths the workbook actually states: Excel omits a column whose
  // width is the default, and the viewer draws the default for those.
  const sheet = await roundTrip((ws) => {
    ws.getColumn(1).width = 42;
    ws.getColumn(2).width = 6;
    ws.getColumn(3).width = 20;
    ws.getColumn(3).hidden = true;
    ws.getCell("A1").value = "wide";
    ws.getCell("B1").value = "narrow";
    ws.getCell("C1").value = "hidden";
  });

  assert.equal(sheet.widths?.[0], 42);
  assert.equal(sheet.widths?.[1], 6);
  assert.equal(sheet.widths?.[2], null, "a hidden column has no width to draw");
});

test("every sheet in the workbook is read, in order", async () => {
  const wb = new ExcelJS.Workbook();
  for (const name of ["Summary", "Detail", "Notes"]) {
    const ws = wb.addWorksheet(name);
    ws.getCell("A1").value = name;
  }
  const sheets = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["Summary", "Detail", "Notes"]
  );
});

test("a trailing band of empty cells is trimmed away", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "only cell";
    // Touch a far cell and clear it, the way a stale declared range happens.
    ws.getCell("H40").value = "";
  });
  assert.equal(sheet.totalRows, 1);
  assert.equal(sheet.totalColumns, 1);
});

/* ------------------------------------------------------------------ *
 * 6. THE WHOLE PICTURE
 * ------------------------------------------------------------------ */

test("a report sheet keeps title, header band and body together", async () => {
  const sheet = await roundTrip((ws) => {
    ws.getCell("A1").value = "Quarterly summary";
    ws.getCell("A1").font = { bold: true, size: 16 };
    ws.mergeCells("A1:C1");

    ["Month", "Deals", "Value"].forEach((label, i) => {
      const cell = ws.getCell(2, i + 1);
      cell.value = label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0D1233" },
      };
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "medium" } };
    });

    const row = ws.getRow(3);
    row.getCell(1).value = new Date(Date.UTC(2026, 1, 1));
    row.getCell(1).numFmt = "mmm-yy";
    row.getCell(2).value = 7;
    row.getCell(3).value = 1250000;
    row.getCell(3).alignment = { horizontal: "right" };
  });

  const title = styleAt(sheet, 0, 0);
  assert.equal(title.bold, true);
  assert.equal(title.size, 16);
  assert.ok(
    (sheet.merges ?? []).some(([sr, sc, , ec]) => sr === 0 && sc === 0 && ec === 2)
  );

  for (let column = 0; column < 3; column++) {
    const head = styleAt(sheet, 1, column);
    assert.equal(head.bg, "#0D1233", `header ${column} keeps its band`);
    assert.equal(head.color, "#FFFFFF", `header ${column} stays readable`);
    assert.equal(head.bold, true);
    assert.equal(head.align, "center");
    assert.equal(head.border?.bottom, "2px solid #000000");
  }

  assert.equal(sheet.rows[2][0], "Feb-26");
  assert.equal(sheet.rows[2][2], 1250000);
  assert.equal(styleAt(sheet, 2, 2).align, "right");
});
