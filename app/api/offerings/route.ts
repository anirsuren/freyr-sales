import { NextResponse } from "next/server";
import { listOfferings, createOffering, hydrateOffering } from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only — admin access required" },
  { status: 403 }
);

export async function GET() {
  return NextResponse.json({ offerings: listOfferings().map(hydrateOffering) });
}

export async function POST(req: Request) {
  if (!isAdmin()) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
  if (!body.offering_name || !String(body.offering_name).trim()) {
    return NextResponse.json({ error: "Offering name is required" }, { status: 400 });
  }
  const offering = createOffering(body);
  return NextResponse.json({ ok: true, offering });
}
