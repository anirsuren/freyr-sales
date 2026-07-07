import { NextResponse } from "next/server";
import { listMarkets, createMarket } from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ markets: listMarkets() });
}

export async function POST(req: Request) {
  if (!isAdmin())
    return NextResponse.json(
      { error: "View only — admin access required" },
      { status: 403 }
    );
  const body = await req.json().catch(() => ({}));
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Market name is required" }, { status: 400 });
  }
  const market = createMarket(String(body.name));
  return NextResponse.json({ ok: true, market });
}
