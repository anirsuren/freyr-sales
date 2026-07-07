import { NextResponse } from "next/server";
import {
  listOfferingCategories,
  createOfferingCategory,
} from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offeringCategories: listOfferingCategories() });
}

export async function POST(req: Request) {
  if (!isAdmin())
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
  const offeringCategory = createOfferingCategory({
    name: String(body.name),
    description: body.description != null ? String(body.description) : "",
    owner: body.owner != null ? String(body.owner) : "",
  });
  return NextResponse.json({ ok: true, offeringCategory });
}
