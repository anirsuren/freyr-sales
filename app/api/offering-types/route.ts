import { NextResponse } from "next/server";
import { listOfferingTypes, createOfferingType } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offeringTypes: listOfferingTypes() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json(
      { error: "Offering type name is required" },
      { status: 400 }
    );
  }
  const offeringType = createOfferingType({
    name: String(body.name),
    description: body.description != null ? String(body.description) : "",
  });
  return NextResponse.json({ ok: true, offeringType });
}
