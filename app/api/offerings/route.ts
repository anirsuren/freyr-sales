import { NextResponse } from "next/server";
import { listOfferings, createOffering, hydrateOffering } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ offerings: listOfferings().map(hydrateOffering) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.offering_name || !String(body.offering_name).trim()) {
    return NextResponse.json({ error: "Offering name is required" }, { status: 400 });
  }
  const offering = createOffering(body);
  return NextResponse.json({ ok: true, offering });
}
