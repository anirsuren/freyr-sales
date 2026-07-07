import { NextResponse } from "next/server";
import { hasAnthropic } from "@/lib/env";

export const dynamic = "force-dynamic";

// Agent intelligence mode (V9) — whether the agent reasons with Claude or runs
// deterministically. Lets the (client) top bar show an honest, app-wide badge.
export async function GET() {
  return NextResponse.json({ claude: hasAnthropic() });
}
