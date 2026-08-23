import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listOfferings, hydrateOffering } from "@/lib/offerings";
import { getDataMode } from "@/lib/dataMode";
import { isReleased } from "@/lib/release";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import { readOpportunities } from "@/lib/opportunities";

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

  /**
   * EVERYONE'S SEARCH SHOWS ONLY WHAT THEY CAN OPEN (Anir, Aug 23: "search
   * has to always work for everyone... for each person the search should only
   * show what they have access to").
   *
   * Search used to answer identically for an admin and a rep — the release
   * gate below was the only filter, and it is a workspace-wide switch, not a
   * per-person one. So a rep searching "pharma" got twelve results, nine of
   * them customer accounts whose pages bounce them straight back to
   * Offerings. The search worked; the doors were locked.
   *
   * Same rule the sidebar uses, from the same function, so what you can find
   * and what you can see are one answer. `getRole` honours the view-as
   * preview, which only ever DOWNGRADES, so this can never widen anyone's
   * reach — an admin previewing as a rep gets the rep's search too.
   *
   * Gated before the rows are built, not filtered after, for the reason the
   * release gate already gives: a hidden row that still travelled to the
   * browser was never actually hidden.
   */
  const role = await getRole();
  const canSee = (path: string) =>
    isReleased(path, dataMode) && canAccessModule(path, role);
  const customersReleased = canSee("/customers");
  const contactsReleased = canSee("/contacts");

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
  for (const raw of canSee("/offerings") ? listOfferings() : []) {
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

  /**
   * DEALS ARE SEARCHABLE, which is what makes the rule above liveable.
   * Scoping search to what you can open left a rep searching their own
   * account's name with nothing at all — the account row was the only thing
   * indexed under it, and that is the one page they cannot reach. They have
   * had deals on that account the whole time; search simply never looked at
   * the pipeline. Every role can open Opportunities, so this widens nobody's
   * reach — it just stops the honest answer from being an empty one.
   */
  if (canSee("/opportunities")) {
    const { opportunities } = await readOpportunities();
    for (const o of opportunities) {
      const hay = `${o.name} ${o.customer} ${o.externalId ?? ""} ${o.owner ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      results.push({
        type: "Opportunity",
        label: o.name,
        sublabel: [o.customer, o.externalId].filter(Boolean).join(" · "),
        href: `/opportunities?deal=${encodeURIComponent(o.id)}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, 12) });
}
