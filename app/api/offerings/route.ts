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
  isFixedMaterialFolder,
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
  // Materials shipped with a brand-new offering are real uploads too, so they
  // get the same server-side attribution stamp (never a client-supplied name).
  if (Array.isArray(body.materials)) {
    if (
      (body.materials as OfferingMaterial[]).some(
        (material) => !isFixedMaterialFolder(material.folder)
      )
    ) {
      return NextResponse.json(
        { error: "Choose a folder from the workspace's fixed list." },
        { status: 400 }
      );
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
