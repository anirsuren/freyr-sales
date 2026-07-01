// Excel import for the offerings repository (Suren's Jun 27 video: "if this data
// can be imported into the system then Saras doesn't have to re-edit it"). Reads
// his "Digital Sales and Marketing.xlsx" structure — the Offering Category,
// Offering Type, and Offerings sheets — and upserts into the in-memory store.
// Matching is tolerant (case-insensitive headers, name-based offering match,
// dot/space-insensitive) so a lightly-reformatted sheet still imports. The Early
// Adopters column is intentionally ignored — Suren removed that field.
//
// Server-only (xlsx is a Node module); imported by the import API route.
import * as XLSX from "xlsx";
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
function rowsOf(ws: XLSX.WorkSheet): Record<string, string>[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (!grid.length) return [];
  const headers = (grid[0] as unknown[]).map(norm);
  const out: Record<string, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, c) => {
      if (!h) return;
      const v = String(row[c] ?? "").trim();
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

export function importOfferingsWorkbook(
  data: ArrayBuffer | Uint8Array | Buffer
): ImportResult {
  let wb: XLSX.WorkBook;
  try {
    const buf =
      data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
    wb = XLSX.read(buf, { type: "array" });
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
    sheetsSeen: wb.SheetNames.slice(),
  };

  const findSheet = (re: RegExp) =>
    wb.SheetNames.find((n) => re.test(n.toLowerCase()));

  // --- Offering Category sheet -> upsert categories ------------------------
  const catSheet = findSheet(/offering categor/);
  if (catSheet) {
    for (const row of rowsOf(wb.Sheets[catSheet])) {
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
    for (const row of rowsOf(wb.Sheets[typeSheet])) {
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
    wb.SheetNames.find((n) => /^offerings?$/i.test(n.trim())) ||
    wb.SheetNames.find(
      (n) =>
        n !== catSheet &&
        n !== typeSheet &&
        rowsOf(wb.Sheets[n]).some((r) =>
          Object.keys(r).some((h) => h === "offering" || h.includes("offering name"))
        )
    );
  if (offSheet) {
    const existing = listOfferings();
    for (const row of rowsOf(wb.Sheets[offSheet])) {
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
