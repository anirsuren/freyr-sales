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
  stampMaterialAttribution,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only: admin access required" },
  { status: 403 }
);

export async function GET() {
  return NextResponse.json({ offerings: listOfferings().map(hydrateOffering) });
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
    const user = await getCurrentUser();
    body.materials = stampMaterialAttribution(
      body.materials as OfferingMaterial[],
      [],
      user.id === GENERIC_USER_IDENTITY.id ? null : user.name.trim() || null
    );
  }
  try {
    const offering = await commitOfferingsChange(() => createOffering(body));
    return NextResponse.json({ ok: true, offering });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering save failed" },
      { status: 503 }
    );
  }
}
