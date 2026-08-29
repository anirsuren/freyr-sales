import { NextResponse } from "next/server";
import {
  listOfferingTypes,
  createOfferingType,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offeringTypes: listOfferingTypes() });
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

  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only: admin access required" },
      { status: 403 }
    );
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json(
      { error: "Offering type name is required" },
      { status: 400 }
    );
  }
  try {
    const offeringType = await commitOfferingsChange(() =>
      createOfferingType({
        name: String(body.name),
        description: body.description != null ? String(body.description) : "",
      })
    );
    return NextResponse.json({ ok: true, offeringType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering type save failed" },
      { status: 503 }
    );
  }
}
