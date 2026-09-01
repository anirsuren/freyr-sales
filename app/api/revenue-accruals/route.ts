import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import {
  freezeAccrualSnapshot,
  readRevenueAccruals,
  removeAccrualPlan,
  removeAccrualSnapshot,
  saveAccrualPlan,
} from "@/lib/revenueAccruals";
import {
  canOpenModule,
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

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
  return (await canOpenModule("/revenue-accruals"))
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

/**
 * WRITING IS ITS OWN PERMISSION, and this route was asking the READ question
 * for both.
 *
 * `closed()` is canOpenModule, which answers "may you see this page". POST used
 * it too, so anybody whose row says *view* could save, delete, freeze and
 * unfreeze. Signed in as a Solutioning Member -- whose row on Revenue Accruals
 * is view -- an accrual plan saved against somebody else's deal (found Aug 30
 * walking every role). The same account was correctly refused by Opportunities,
 * Customers and Leads, which all ask moduleWriteRefusal.
 *
 * This does not decide who may write; the privilege table does, exactly as it
 * does for every other module. It only stops this one route answering a
 * different question from the rest of them.
 */
async function readOnly(): Promise<NextResponse | null> {
  const refusal = await moduleWriteRefusal("/revenue-accruals");
  return refusal ? NextResponse.json({ error: refusal }, { status: 403 }) : null;
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
  const pen = await readOnly();
  if (pen) return pen;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality (add, edit
     etc.) should be on mock mode, but it shouldn't affect real data"). */
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");
  try {
    if (op === "save") {
      /* A deal with no plan yet is a new one, and starting one is the owner's
         right (Suren, Aug 29: "owner can create, member can edit"). Editing the
         months on a plan that already exists stays with the member. */
      const dealId = String(
        (body.plan as { opportunityId?: string } | undefined)?.opportunityId ?? ""
      );
      const existing = await readRevenueAccruals();
      if (!existing.plans.some((p) => p.opportunityId === dealId)) {
        const refusal = await moduleCreateRefusal("/revenue-accruals");
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      }
      const plan = await saveAccrualPlan(body.plan ?? {}, me.name);
      return NextResponse.json({
        ok: true,
        plan,
        state: await readRevenueAccruals(),
      });
    }
    if (op === "delete") {
      /* SAY SO WHEN THERE WAS NOTHING TO DELETE. This answered ok:true for any
         id, including a missing one, so a caller that named the plan by the
         wrong key got a success and left the plan sitting there (I did exactly
         that testing on Aug 30 and only caught it because the number was still
         on the page). */
      /* "The person who can create only can delete." */
      const gone = await moduleDeleteRefusal("/revenue-accruals");
      if (gone) return NextResponse.json({ error: gone }, { status: 403 });
      const opportunityId = String(body.opportunityId ?? "");
      const before = await readRevenueAccruals();
      if (!before.plans.some((p) => p.opportunityId === opportunityId)) {
        return NextResponse.json(
          { error: "There is no accrual plan on that deal." },
          { status: 404 }
        );
      }
      await removeAccrualPlan(opportunityId);
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
