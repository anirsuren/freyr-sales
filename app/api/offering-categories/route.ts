import { NextResponse } from "next/server";
import {
  listOfferingCategories,
  createOfferingCategory,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offeringCategories: listOfferingCategories() });
}

export async function POST(req: Request) {
  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only — admin access required" },
      { status: 403 }
    );
  const body = await req.json().catch(() => ({}));
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json(
      { error: "Offering category name is required" },
      { status: 400 }
    );
  }
  try {
    const offeringCategory = await commitOfferingsChange(() =>
      createOfferingCategory({
        name: String(body.name),
        description: body.description != null ? String(body.description) : "",
        owner: body.owner != null ? String(body.owner) : "",
      })
    );
    return NextResponse.json({ ok: true, offeringCategory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering category save failed" },
      { status: 503 }
    );
  }
}
