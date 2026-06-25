import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listOfferings } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "")
    .toLowerCase()
    .trim();
  if (!q) return NextResponse.json({ results: [] });

  const db = getDb();
  const [customers, contacts] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
  ]);

  const results: {
    type: string;
    label: string;
    sublabel: string;
    href: string;
  }[] = [];

  for (const c of customers) {
    if (
      c.company_name.toLowerCase().includes(q) ||
      (c.industry || "").toLowerCase().includes(q) ||
      (c.geography || "").toLowerCase().includes(q)
    ) {
      results.push({
        type: "Customer",
        label: c.company_name,
        sublabel: c.industry || "",
        href: `/customers/${c.id}`,
      });
    }
  }
  for (const ct of contacts) {
    if (
      ct.full_name.toLowerCase().includes(q) ||
      (ct.job_title || "").toLowerCase().includes(q) ||
      (ct.email || "").toLowerCase().includes(q)
    ) {
      results.push({
        type: "Contact",
        label: ct.full_name,
        sublabel: ct.job_title || "",
        href: `/contacts/${ct.id}`,
      });
    }
  }
  // Offerings are a core object now — make them findable in global search too.
  for (const o of listOfferings()) {
    if (
      o.offering_name.toLowerCase().includes(q) ||
      (o.offering_type || "").toLowerCase().includes(q) ||
      (o.offering_description || "").toLowerCase().includes(q)
    ) {
      results.push({
        type: "Offering",
        label: o.offering_name,
        sublabel: o.offering_type || "",
        href: `/offerings/${o.id}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, 12) });
}
