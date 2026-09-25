import { readMarketIntelFeed } from "@/lib/marketIntelFeed";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  initializeLiveOfferings,
  listFdlComponents,
  listOfferings,
} from "@/lib/offerings";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readOpportunities } from "@/lib/opportunities";
import { readContracts } from "@/lib/contracts";
import { readLeads } from "@/lib/leads";
import { readPerformance } from "@/lib/performance";

import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { canViewOfferingMaterial } from "@/lib/materialAccess";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { readSolutioning } from "@/lib/solutioning";

export const dynamic = "force-dynamic";

/** This name index is discoverable data. Apply the same doors as the pages
 * before reading sources, and the same file visibility as the material viewer. */
export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await canOpenModule("/agent")))
    return NextResponse.json(
      { error: "Not available on this account" },
      { status: 403 },
    );
  const user = await getCurrentUser();
  const paths = [
    "/customers",
    "/contacts",
    "/team",
    "/offerings",
    "/components",
    "/opportunities",
    "/contracts",
    "/leads",
    "/goals",
    "/reports",
    "/market-intel",
    "/solutioning",
  ];
  const permissions = await Promise.all(
    paths.map(async (path) => [path, await canOpenModule(path)] as const),
  );
  const allowed = new Map(permissions);
  const db = getDb();
  if (allowed.get("/offerings") || allowed.get("/components"))
    await initializeLiveOfferings().catch(() => undefined);
  const [
    customers,
    contacts,
    directory,
    deals,
    contracts,
    leads,
    perf,
    tracking,
    solutions,
    marketFeed,
  ] = await Promise.all([
    allowed.get("/customers") ? db.customers.list().catch(() => []) : [],
    allowed.get("/contacts") ? db.contacts.list().catch(() => []) : [],
    allowed.get("/team")
      ? listWorkspaceAccess(scope.workspaceId).catch(() => null)
      : null,
    allowed.get("/opportunities")
      ? readOpportunities().catch(() => null)
      : null,
    allowed.get("/contracts") ? readContracts().catch(() => null) : null,
    allowed.get("/leads") ? readLeads().catch(() => null) : null,
    allowed.get("/goals") ? readPerformance().catch(() => null) : null,
    allowed.get("/market-intel")
      ? readMarketIntelTracking().catch(() => null)
      : null,
    allowed.get("/solutioning") ? readSolutioning().catch(() => null) : null,
    allowed.get("/market-intel") ? readMarketIntelFeed().catch(() => null) : null,
  ]);
  const catalogue = allowed.get("/offerings") ? listOfferings() : [];
  return NextResponse.json(
    {
      companies: customers.map((c) => ({ name: c.company_name, id: c.id })),
      contacts: contacts.map((c) => ({ name: c.full_name, id: c.id })),
      offerings: catalogue.map((o) => ({ name: o.offering_name, id: o.id })),
      components: allowed.get("/components")
        ? listFdlComponents().map((c) => ({ name: c.name, id: c.id }))
        : [],
      materials: catalogue.flatMap((o) =>
        (o.materials || [])
          .filter(
            (m) =>
              m.label &&
              m.id &&
              canViewOfferingMaterial(
                o,
                m,
                user.memberId,
                user.role === "admin",
              ),
          )
          .map((m) => ({ name: m.label, id: `${o.id}:${m.id}` })),
      ),
      people: (directory?.members || [])
        .filter((m) => m.active !== false && m.name)
        .map((m) => ({ name: m.name, id: m.id })),
      deals: (deals?.opportunities ?? [])
        .filter((o) => o.name)
        .map((o) => ({ name: o.name, id: o.id })),
      contracts: (contracts?.contracts ?? [])
        .filter((c) => c.name)
        .map((c) => ({ name: c.name, id: c.id })),
      leads: (leads?.leads ?? [])
        .filter((l) => l.company)
        .map((l) => ({ name: l.company, id: l.id })),
      // Generic metric labels such as "Renewals" are ordinary prose, not names.
      goals: (perf?.goals ?? [])
        .filter((g) => {
          const name = (g.name || "").trim();
          return (
            name && (name.split(/\s+/).length >= 3 || /[^\w\s]/.test(name))
          );
        })
        .map((g) => ({ name: g.name, id: g.id })),
      trackedPeople: (tracking?.people ?? []).filter(p => /^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(p.linkedinUrl)).map(p => ({name:p.name,id:p.linkedinUrl,logoUrl:p.photoUrl})),
      marketCompanies: (tracking?.companies ?? []).map((c) => ({
        name: c.name,
        id: c.id,
        logoUrl: marketFeed?.companies[c.id]?.author?.logoUrl || marketFeed?.companies[c.id]?.logoUrl || c.logoUrl,
      })),
      solutioning: (solutions?.requests ?? []).map((r) => ({
        name: r.title,
        id: r.id,
      })),
      reports: allowed.get("/reports")
        ? [
            { name: "Portfolio Reports", id: "" },
            {
              name: "Customer Offering Heat Map",
              id: "customer-offering-heat-map",
            },
            { name: "Activity Goal Flow", id: "activity-goal-flow" },
          ]
        : [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
