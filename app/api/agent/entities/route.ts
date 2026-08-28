import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  initializeLiveOfferings,
  listFdlComponents,
  listOfferings,
} from "@/lib/offerings";
import { listWorkspaceAccess } from "@/lib/accessStore";

export const dynamic = "force-dynamic";

/**
 * NAME -> ID INDEX FOR EVERY THING THE ASSISTANT CAN NAME.
 *
 * The chat turns any name it recognises into an inline pill: the logo, icon or
 * headshot, then the name, then a link to that record. It used to know about
 * customers and people only, so an answer listing thirteen offerings rendered
 * as thirteen pieces of grey text (Anir, Aug 14: "if it mentions Takeda it
 * should always have the logo with the company name in a pill. I want the same
 * thing with offerings, FDL components, customers, team members, reports,
 * everything").
 *
 * Every kind here has a real page behind it, because a pill is a link and a
 * link that 404s is worse than plain text. That is also why reports are a fixed
 * short list rather than a table: /reports is one page, not a row per report.
 *
 * Failures are per-source and non-fatal. Losing the team directory should cost
 * headshots on teammate names, not every pill in the answer.
 */
export async function GET() {
  const db = getDb();
  await initializeLiveOfferings().catch(() => undefined);

  const [customers, contacts, directory] = await Promise.all([
    db.customers.list().catch(() => []),
    db.contacts.list().catch(() => []),
    process.env.FREYR_WORKSPACE_ID
      ? listWorkspaceAccess(process.env.FREYR_WORKSPACE_ID).catch(() => null)
      : Promise.resolve(null),
  ]);

  let offerings: { name: string; id: string }[] = [];
  let components: { name: string; id: string }[] = [];
  /**
   * FILES ARE THINGS THE ASSISTANT NAMES TOO (Anir, Aug 28: "it should
   * definitely be able to let me open it... it should be the same way, like a
   * tag, and when I click on that link, it'll just directly open the video").
   *
   * Asked where a demo video was, the agent printed a raw
   * /api/offerings/…/materials/download?path=… line as code — a thing you can
   * read but not click. A material has a real destination (its offering page,
   * opened on that file), so it gets the same pill everything else gets.
   *
   * The id carries both halves the destination needs, offering and material,
   * because a pill only knows the id it was given.
   */
  let materials: { name: string; id: string }[] = [];
  try {
    const list = listOfferings();
    offerings = list.map((o) => ({ name: o.offering_name, id: o.id }));
    components = listFdlComponents().map((c) => ({ name: c.name, id: c.id }));
    materials = list.flatMap((o) =>
      (o.materials || [])
        .filter((m) => m.label && m.id)
        .map((m) => ({ name: m.label, id: `${o.id}:${m.id}` }))
    );
  } catch {
    // Catalogue unavailable: the other kinds still pill correctly.
  }

  const people = (directory?.members || [])
    .filter((m) => m.active !== false && m.name)
    .map((m) => ({ name: m.name, id: m.id }));

  return NextResponse.json({
    companies: customers.map((c) => ({ name: c.company_name, id: c.id })),
    contacts: contacts.map((c) => ({ name: c.full_name, id: c.id })),
    offerings,
    components,
    materials,
    people,
    // Named destinations rather than records. The assistant says "the coverage
    // report" far more often than it says a report's id.
    reports: [
      { name: "Portfolio Reports", id: "" },
      { name: "Customer Offering Heat Map", id: "customer-offering-heat-map" },
    ],
  });
}
