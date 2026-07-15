import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  if (!/\.csv$/i.test(file.name) || !["text/csv", "application/vnd.ms-excel", "application/octet-stream", ""].includes(file.type)) {
    return NextResponse.json({ error: "Upload a .csv file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "CSV exceeds the 5 MB limit." }, { status: 413 });

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return NextResponse.json({ error: "The CSV has no data rows." }, { status: 400 });
  if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ error: `CSV exceeds ${MAX_ROWS} data rows.` }, { status: 413 });
  const headers = rows[0].map(normalize);
  const required = headers.indexOf("company_name");
  if (required < 0) return NextResponse.json({ error: "Missing required company_name column." }, { status: 400 });

  const db = getDb();
  let customers = 0;
  let contacts = 0;
  let skipped = 0;
  const errors: string[] = [];
  const value = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() || "";

  for (const [offset, row] of rows.slice(1).entries()) {
    const line = offset + 2;
    const companyName = value(row, "company_name");
    if (!companyName) { skipped++; errors.push(`Row ${line}: company_name is empty.`); continue; }
    try {
      let customer = await db.customers.findByName(companyName);
      const customerPatch = {
        company_name: companyName,
        website_url: value(row, "website_url") || null,
        industry: value(row, "industry") || null,
        geography: value(row, "geography") || null,
        size_tier: (["small", "mid", "large"].includes(value(row, "size_tier").toLowerCase())
          ? value(row, "size_tier").toLowerCase() : null) as "small" | "mid" | "large" | null,
        owner: value(row, "owner") || null,
      };
      if (customer) customer = (await db.customers.update(customer.id, customerPatch)) || customer;
      else { customer = await db.customers.create(customerPatch); customers++; }

      const contactName = value(row, "contact_name");
      if (contactName) {
        await db.contacts.create({
          customer_id: customer.id,
          full_name: contactName,
          email: value(row, "contact_email") || null,
          phone: value(row, "contact_phone") || null,
          linkedin_url: value(row, "linkedin_url") || null,
          job_title: value(row, "job_title") || null,
          role_bucket: value(row, "role") || null,
        });
        contacts++;
      }
    } catch (error) {
      skipped++;
      errors.push(`Row ${line}: ${error instanceof Error ? error.message : "import failed"}`);
    }
  }
  return NextResponse.json({ ok: true, customers, contacts, skipped, errors: errors.slice(0, 20) });
}
