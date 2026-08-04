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
  isFixedMaterialFolder,
  materialJourneyStages,
  MATERIAL_FORMATS,
  ACCESS_LEVELS,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { redactOfferingsForCurrentUser } from "@/lib/materialAccess";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only: admin access required" },
  { status: 403 }
);

export async function GET() {
  const offeringsWithRoadmapAccess = await Promise.all(
    listOfferings().map(async (offering) => {
      const hydrated = hydrateOffering(offering);
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
  if (!(await canManageOfferings())) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
  if (!body.offering_name || !String(body.offering_name).trim()) {
    return NextResponse.json({ error: "Offering name is required" }, { status: 400 });
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
        !isFixedMaterialFolder(material.folder) ||
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
    const offering = await commitOfferingsChange(() => createOffering(body));
    const [visible] = await redactOfferingsForCurrentUser([offering]);
    return NextResponse.json({ ok: true, offering: visible });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering save failed" },
      { status: 503 }
    );
  }
}
