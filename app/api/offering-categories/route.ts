import { NextRequest, NextResponse } from "next/server";
import {
  listOfferingCategories,
  createOfferingCategory,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import {
  memberAssignmentResponse,
  verifiedOwnerAssignment,
} from "@/lib/memberAssignments";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offeringCategories: listOfferingCategories() });
}

export async function POST(req: NextRequest) {
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
      { error: "Offering category name is required" },
      { status: 400 }
    );
  }
  try {
    const assignment =
      body.owner != null || body.owner_user_id != null
        ? await verifiedOwnerAssignment(req, {
            owner: body.owner,
            ownerUserId: body.owner_user_id,
          })
        : null;
    const offeringCategory = await commitOfferingsChange(() =>
      createOfferingCategory({
        name: String(body.name),
        description: body.description != null ? String(body.description) : "",
        owner: assignment?.owner || "",
        owner_user_id: assignment?.owner_user_id || null,
      })
    );
    return NextResponse.json({ ok: true, offeringCategory });
  } catch (error) {
    const assignmentError = memberAssignmentResponse(error);
    if (assignmentError) return assignmentError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering category save failed" },
      { status: 503 }
    );
  }
}
