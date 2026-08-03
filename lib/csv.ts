// Excel and other spreadsheet apps may execute cells beginning with these
// characters as formulas. Prefixing user-controlled strings with an apostrophe
// keeps exported CSV data inert while leaving genuine numeric values numeric.
export function csvCell(value: string | number | null): string {
  let cell = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(cell)) {
    cell = `'${cell}`;
  }
  return /[",\n\r]/.test(cell)
    ? `"${cell.replace(/"/g, '""')}"`
    : cell;
}

// Tiny client-side CSV export helper.
export function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
