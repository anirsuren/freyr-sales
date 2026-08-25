import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { canAccessModule } from "@/lib/moduleAccess";
import { readContracts, removeContract, saveContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

/**
 * CONTRACTS API. Sales writes here and the delivery platform reads by
 * `reference` (Suren, Aug 25: "this interface should enter the data, because
 * this is where we are logically closing").
 *
 * Admin-only for now, enforced here as well as in the nav.
 */
async function closed(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  return canAccessModule("/contracts", me.role)
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  return NextResponse.json({ state: await readContracts() });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  if (getDataMode() !== "live") {
    return NextResponse.json(
      { error: "Mock mode shows sample contracts only. Switch to Real to work them." },
      { status: 400 }
    );
  }
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");
  try {
    if (op === "save") {
      const contract = await saveContract(body.contract ?? {}, me.name);
      return NextResponse.json({
        ok: true,
        contract,
        state: await readContracts(),
      });
    }
    if (op === "delete") {
      await removeContract(String(body.id ?? ""));
      return NextResponse.json({ ok: true, state: await readContracts() });
    }
    return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
