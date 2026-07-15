// Excel import for the offerings repository (Suren's Jun 27 video: "if this data
// can be imported into the system then Saras doesn't have to re-edit it"). Reads
// his "Digital Sales and Marketing.xlsx" structure — the Offering Category,
// Offering Type, and Offerings sheets — and upserts into the in-memory store.
// Matching is tolerant (case-insensitive headers, name-based offering match,
// dot/space-insensitive) so a lightly-reformatted sheet still imports. The Early
// Adopters column is intentionally ignored — Suren removed that field.
//
// Server-only; imported by the import API route. The parser is intentionally
// small and read-only; workbook size and row limits are enforced before data is
// allowed into the repository.
import ExcelJS from "exceljs";
import {
  listOfferings,
  createOffering,
  updateOffering,
  createOfferingType,
  createOfferingCategory,
} from "@/lib/offerings";

export interface ImportResult {
  ok: boolean;
  error?: string;
  categories: number;
  types: number;
  offeringsCreated: number;
  offeringsUpdated: number;
  sheetsSeen: string[];
}

// Normalise a header cell for matching: lowercase, collapse whitespace.
function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Normalise an offering name for matching: lowercase, strip spaces around dots
// and plus signs, collapse whitespace ("Freya. Register" == "Freya.Register").
function normName(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ");
}

// Convert a worksheet to an array of row-objects keyed by normalised header.
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function rowsOf(sheet: ExcelJS.Worksheet): Record<string, string>[] {
  if (!sheet.rowCount) return [];
  const header = sheet.getRow(1);
  const headers = Array.from({ length: header.cellCount }, (_, index) =>
    norm(cellText(header.getCell(index + 1).value))
  );
  const out: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, c) => {
      if (!h) return;
      const v = cellText(row.getCell(c + 1).value).trim();
      obj[h] = v;
      if (v) any = true;
    });
    if (any) out.push(obj);
  }
  return out;
}

// Pick the first value whose header matches any of the given substrings, in
// order — so "offering category" wins over "offering" for the category column.
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h === k);
    if (hit && row[hit]) return row[hit];
  }
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.includes(k));
    if (hit && row[hit]) return row[hit];
  }
  return "";
}

export async function importOfferingsWorkbook(
  data: ArrayBuffer | Uint8Array | Buffer
): Promise<ImportResult> {
  const buf = Buffer.from(
    data instanceof ArrayBuffer ? new Uint8Array(data) : data
  );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length > 20) throw new Error("Too many worksheets");
    if (workbook.worksheets.some((sheet) => sheet.rowCount > 5000))
      throw new Error("Too many rows");
  } catch {
    return {
      ok: false,
      error: "Couldn't read that file — is it a valid .xlsx?",
      categories: 0,
      types: 0,
      offeringsCreated: 0,
      offeringsUpdated: 0,
      sheetsSeen: [],
    };
  }

  const result: ImportResult = {
    ok: true,
    categories: 0,
    types: 0,
    offeringsCreated: 0,
    offeringsUpdated: 0,
    sheetsSeen: workbook.worksheets.map((sheet) => sheet.name),
  };

  const findSheet = (re: RegExp) =>
    workbook.worksheets.find((sheet) => re.test(sheet.name.toLowerCase()));

  // --- Offering Category sheet -> upsert categories ------------------------
  const catSheet = findSheet(/offering categor/);
  if (catSheet) {
    for (const row of rowsOf(catSheet)) {
      const name = pick(row, "offering category", "category", "name");
      if (!name) continue;
      createOfferingCategory({
        name,
        description: pick(row, "description"),
        owner: pick(row, "owner"),
      });
      result.categories++;
    }
  }

  // --- Offering Type sheet -> upsert types ---------------------------------
  const typeSheet = findSheet(/offering type/);
  if (typeSheet) {
    for (const row of rowsOf(typeSheet)) {
      const name = pick(row, "offering type", "type", "name");
      if (!name) continue;
      createOfferingType({ name, description: pick(row, "description") });
      result.types++;
    }
  }

  // --- Offerings sheet -> upsert offerings by name -------------------------
  // The offerings sheet is the one with an "offering" column that ISN'T the
  // type/category sheet.
  const offSheet =
    workbook.worksheets.find((sheet) => /^offerings?$/i.test(sheet.name.trim())) ||
    workbook.worksheets.find(
      (sheet) =>
        sheet !== catSheet &&
        sheet !== typeSheet &&
        rowsOf(sheet).some((r) =>
          Object.keys(r).some((h) => h === "offering" || h.includes("offering name"))
        )
    );
  if (offSheet) {
    const existing = listOfferings();
    for (const row of rowsOf(offSheet)) {
      const name = pick(row, "offering name", "offering", "name");
      if (!name) continue;
      const fields = {
        offering_name: name,
        offering_type: pick(row, "offering type", "type"),
        offering_category: pick(row, "offering category", "category"),
        offering_description: pick(row, "offering description", "description"),
        current_availability: pick(row, "current availability", "availability"),
        future_availability: pick(
          row,
          "availability comments",
          "comments",
          "future availability"
        ),
      };
      // Only overwrite fields the sheet actually provides (don't blank existing
      // data with empty cells).
      const patch: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) if (v) patch[k] = v;

      const match = existing.find(
        (o) => normName(o.offering_name) === normName(name)
      );
      if (match) {
        updateOffering(match.id, patch);
        result.offeringsUpdated++;
      } else {
        createOffering(patch);
        result.offeringsCreated++;
      }
    }
  }

  return result;
}
