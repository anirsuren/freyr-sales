import { NextResponse } from "next/server";
import {
  listOfferings,
  createOffering,
  hydrateOffering,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { getCurrentUser } from "@/lib/currentUser";
import { GENERIC_USER_IDENTITY } from "@/lib/userIdentity";
import {
  canViewNextCustomerVersion,
  hideNextCustomerVersions,
} from "@/lib/roadmapAccess";
import {
  stampMaterialAttribution,
  sanitizeMaterialFolderPath,
  materialJourneyStages,
  MATERIAL_FORMATS,
  ACCESS_LEVELS,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { redactOfferingsForCurrentUser } from "@/lib/materialAccess";
import {
  accountBackedPeopleForPoc,
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import { getDataMode } from "@/lib/dataMode";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only: admin access required" },
  { status: 403 }
);

export async function GET() {
  const people = await listAssignablePeople();
  const offeringsWithRoadmapAccess = await Promise.all(
    listOfferings().map(async (offering) => {
      const hydrated = hydrateOffering(
        redactUnverifiedOfferingPeople(offering, people)
      );
      return (await canViewNextCustomerVersion(offering))
        ? hydrated
        : hideNextCustomerVersions(hydrated);
    })
  );
  const offerings = await redactOfferingsForCurrentUser(
    offeringsWithRoadmapAccess
  );
  return NextResponse.json({ offerings });
}

export async function POST(req: Request) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/offerings");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  if (!(await canManageOfferings())) return FORBIDDEN;
  const body = (await req.json().catch(() => ({}))) ?? {};
  // Record identity, ownership and person rows are server-owned. A caller may
  // select active workspace accounts through `poc`; it may not inject an
  // arbitrary contacts/owners payload.
  delete body.id;
  delete body.created_at;
  delete body.owners;
  delete body.contacts;
  if (!body.offering_name || !String(body.offering_name).trim()) {
    return NextResponse.json({ error: "Offering name is required" }, { status: 400 });
  }
  const people = await listAssignablePeople();
  if (getDataMode() === "live") {
    const selected = accountBackedPeopleForPoc(String(body.poc || ""), people);
    if (selected.invalid.length) {
      return NextResponse.json(
        {
          error: `Choose active workspace accounts for POC: ${selected.invalid.join(", ")}`,
        },
        { status: 400 }
      );
    }
    body.poc = selected.people.map((person) => person.name).join(" / ");
    body.contacts = selected.people.map((person, index) => ({
      id: `oc-new-${Date.now().toString(36)}-${index}`,
      name: person.name,
      role: person.role || "Service delivery POC",
      email: person.email || "",
      phone: "",
    }));
  }
  if (Array.isArray(body.materialFolders)) {
    body.materialFolders = Array.from(
      new Set(
        body.materialFolders
          .map(sanitizeMaterialFolderPath)
          .filter(Boolean)
      )
    );
  }
  // Materials shipped with a brand-new offering are real uploads too, so they
  // get the same server-side attribution stamp (never a client-supplied name).
  if (Array.isArray(body.materials)) {
    for (const material of body.materials as OfferingMaterial[]) {
      material.folder = sanitizeMaterialFolderPath(material.folder);
      const stages = materialJourneyStages(material);
      let validUrl = false;
      try {
        const parsed = new URL(String(material.url || ""));
        validUrl = parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {}
      if (
        !material.label?.trim() ||
        !validUrl ||
        !MATERIAL_FORMATS.includes(material.kind as never) ||
        !material.folder ||
        !stages.length ||
        !ACCESS_LEVELS.includes(material.accessLevel as never)
      ) {
        return NextResponse.json(
          { error: "Every material needs complete required metadata." },
          { status: 400 }
        );
      }
      material.journeyStages = stages;
      material.journeyStage = stages[0];
    }
    const user = await getCurrentUser();
    body.materials = stampMaterialAttribution(
      body.materials as OfferingMaterial[],
      [],
      user.id === GENERIC_USER_IDENTITY.id ? null : user.name.trim() || null
    );
  }
  try {
    /* WHO ADDED IT, recorded at the moment it is added (Anir, Aug 23: "I need
       to see who created these... same thing for Offering, Opportunities,
       Customers, Team"). The generic identity is not a person, so it records
       nobody rather than a placeholder name. */
    const author = await getCurrentUser().catch(() => null);
    if (author && author.id !== GENERIC_USER_IDENTITY.id) {
      body.created_by = author.name.trim() || undefined;
    }
    const offering = await commitOfferingsChange(() => createOffering(body));
    const [visible] = await redactOfferingsForCurrentUser([
      redactUnverifiedOfferingPeople(offering, people),
    ]);
    return NextResponse.json({ ok: true, offering: visible });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering save failed" },
      { status: 503 }
    );
  }
}
