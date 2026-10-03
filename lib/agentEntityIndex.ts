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
import { canOpenModule, canOpenModules } from "@/lib/moduleAccessServer";
import { canViewOfferingMaterial } from "@/lib/materialAccess";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { readSolutioning } from "@/lib/solutioning";
import {
  customerMetadata, contactMetadata, teammateMetadata, offeringMetadata,
  materialMetadata, componentMetadata, opportunityMetadata, contractMetadata,
  leadPickerEntity, goalMetadata, solutionMetadata, trackedPersonMetadata,
  marketCompanyMetadata, articleMetadata,
} from "@/lib/agentEntityMetadata";

/** This name index is discoverable data. Apply the same doors as the pages
 * before reading sources, and the same file visibility as the material viewer. */
export async function readAgentEntityIndex(request: NextRequest) {
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
  const allowed = await canOpenModules(paths);
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
    allowed.get("/market-intel")
      ? readMarketIntelFeed().catch(() => null)
      : null,
  ]);
  const catalogue = allowed.get("/offerings") ? listOfferings() : [];
  const customerNames = new Map(customers.map((c) => [c.id, c.company_name]));
  const trackedNames = new Map((tracking?.companies || []).map((c) => [c.id, c.name]));
  const companyLogos = new Map((tracking?.companies || []).map((c) => [c.id,
    marketFeed?.companies[c.id]?.author?.logoUrl || marketFeed?.companies[c.id]?.logoUrl || c.logoUrl]));
  const logosByName = new Map((tracking?.companies || []).map((c) => [c.name.toLocaleLowerCase(), companyLogos.get(c.id)]));
  const companyLogo = (id: string) => companyLogos.get(id);
  const customerLogo = (name?: string) => name ? logosByName.get(name.toLocaleLowerCase()) : undefined;
  return NextResponse.json(
    {
      companies: customers.map((c) => ({ name: c.company_name, id: c.id, logoUrl: customerLogo(c.company_name), ...customerMetadata(c) })),
      contacts: contacts.map((c) => ({
        name: c.full_name,
        id: c.id,
        ...contactMetadata(c, customerNames.get(c.customer_id), customerLogo(customerNames.get(c.customer_id))),
      })),
      offerings: catalogue.map((o) => ({ name: o.offering_name, id: o.id, ...offeringMetadata(o) })),
      components: allowed.get("/components")
        ? listFdlComponents().map((c) => ({ name: c.name, id: c.id, ...componentMetadata(c) }))
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
          .map((m) => ({
            name: m.label,
            id: `${o.id}:${m.id}`,
            ...materialMetadata(m, o.offering_name),
          })),
      ),
      people: (directory?.members || [])
        .filter((m) => m.active !== false && m.name)
        .map((m) => ({ name: m.name, id: m.id, ...teammateMetadata(m) })),
      deals: (deals?.opportunities ?? [])
        .filter((o) => o.name)
        .map((o) => ({ name: o.name, id: o.id, ...opportunityMetadata(o, customerLogo(o.customer)) })),
      contracts: (contracts?.contracts ?? [])
        .filter((c) => c.name)
        .map((c) => ({ name: c.name, id: c.id, ...contractMetadata(c, customerLogo(c.customer)) })),
      leads: (leads?.leads ?? [])
        .map((l) => leadPickerEntity(l, customerLogo(l.company))),
      // Picker identities include short metric names; automatic prose matching filters them separately.
      goals: (perf?.goals ?? [])
        .filter((goal) => goal.name?.trim())
        .map((goal) => ({ name: goal.name, id: goal.id, ...goalMetadata(goal) })),
      trackedPeople: (tracking?.people ?? [])
        .filter((p) =>
          /^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(p.linkedinUrl),
        )
        .map((p) => ({ name: p.name, id: p.linkedinUrl, logoUrl: p.photoUrl, ...trackedPersonMetadata(p, trackedNames.get(p.companyId), companyLogo(p.companyId)) })),
      marketItems: (tracking?.companies ?? []).flatMap((company) =>
        (marketFeed?.companies[company.id]?.news || [])
          .filter((item) => item.title && /^https:\/\//i.test(item.url))
          .map((item) => ({
            name: item.title,
            id: item.url,
            ...articleMetadata(company.name, companyLogo(company.id), item.source, item.published),
          })),
      ),
      marketCompanies: (tracking?.companies ?? []).map((c) => ({
        name: c.name,
        id: c.id,
        ...marketCompanyMetadata(c),
        logoUrl:
          marketFeed?.companies[c.id]?.author?.logoUrl ||
          marketFeed?.companies[c.id]?.logoUrl ||
          c.logoUrl,
      })),
      solutioning: (solutions?.requests ?? []).map((r) => ({
        name: r.title,
        id: r.id,
        ...solutionMetadata(r, customerLogo(r.customer)),
      })),
      reports: allowed.get("/reports")
        ? [
            { name: "Portfolio Reports", id: "", subtitle: "Portfolio performance and pipeline reporting" },
            {
              name: "Customer Offering Heat Map",
              id: "customer-offering-heat-map",
              subtitle: "Customer adoption by offering",
            },
            { name: "Activity Goal Flow", id: "activity-goal-flow", subtitle: "Activities connected to goals" },
          ]
        : [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
