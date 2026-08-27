import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  freezeAccrualSnapshot,
  readRevenueAccruals,
  removeAccrualPlan,
  removeAccrualSnapshot,
  saveAccrualPlan,
} from "@/lib/revenueAccruals";

export const dynamic = "force-dynamic";

/**
 * REVENUE ACCRUALS API.
 *
 * NOTHING IN HERE MOVES A MONTH ON ITS OWN — that is the rule the whole module
 * exists to hold (Manoj, Aug 25: "if you keep pushing it, then I'm off the
 * hook, you will never catch hold of me"; Suren: "the system should not adjust
 * it, the user should come and adjust it"). Every write is a person deciding.
 *
 * Freezing a snapshot is deliberately a separate, deliberate op rather than a
 * cron: the frozen sheet is the thing the month-on-month gap is measured
 * against, and it should exist because somebody closed the month.
 */
async function closed(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  return canAccessModule("/revenue-accruals", me.role)
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  return NextResponse.json({ state: await readRevenueAccruals() });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality (add, edit
     etc.) should be on mock mode, but it shouldn't affect real data"). */
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");
  try {
    if (op === "save") {
      const plan = await saveAccrualPlan(body.plan ?? {}, me.name);
      return NextResponse.json({
        ok: true,
        plan,
        state: await readRevenueAccruals(),
      });
    }
    if (op === "delete") {
      await removeAccrualPlan(String(body.opportunityId ?? ""));
      return NextResponse.json({ ok: true, state: await readRevenueAccruals() });
    }
    if (op === "freeze") {
      const snapshot = await freezeAccrualSnapshot(me.name);
      return NextResponse.json({
        ok: true,
        snapshot,
        state: await readRevenueAccruals(),
      });
    }
    if (op === "unfreeze") {
      /* Undoing a freeze is a person's decision too — a sheet frozen by
         mistake is the baseline every later gap is measured against. */
      await removeAccrualSnapshot(String(body.month ?? ""));
      return NextResponse.json({ ok: true, state: await readRevenueAccruals() });
    }
    return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
