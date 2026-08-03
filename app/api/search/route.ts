import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listOfferings, hydrateOffering } from "@/lib/offerings";
import { getDataMode } from "@/lib/dataMode";
import { isReleased } from "@/lib/release";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "")
    .toLowerCase()
    .trim();
  if (!q) return NextResponse.json({ results: [] });

  // Release gate (Suren, Jul 28): in the offerings-only rollout the global
  // search must not surface unreleased modules. The palette already filtered
  // the response client-side, which meant every customer and contact matching
  // the query still travelled to the browser — hidden in the UI, present in the
  // payload. Never build the rows in the first place.
  const dataMode = getDataMode();
  const customersReleased = isReleased("/customers", dataMode);
  const contactsReleased = isReleased("/contacts", dataMode);

  const db = getDb();
  const customers = customersReleased ? await db.customers.list() : [];
  const contacts = contactsReleased ? await db.contacts.list() : [];

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
  // Offerings are a core object now — make them findable in global search too,
  // matching the same fields the in-page offerings search does (name, type,
  // description, plus the markets and customer types they're mapped to) so
  // "Europe" or "pharmaceutical" surface their offerings here as well.
  for (const raw of listOfferings()) {
    const o = hydrateOffering(raw);
    const hay = `${o.offering_name} ${o.offering_type} ${o.offering_description} ${o.markets
      .map((m) => m.name)
      .join(" ")} ${o.customerTypes.map((c) => c.name).join(" ")}`.toLowerCase();
    if (hay.includes(q)) {
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
