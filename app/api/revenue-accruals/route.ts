import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import {
  deviateAccrualPlan,
  freezeAccrualSnapshot,
  parseFigure,
  readRevenueAccruals,
  removeAccrualPlan,
  removeAccrualSnapshot,
  saveAccrualPlan,
  sweepAccrualPlans,
} from "@/lib/revenueAccruals";
import { readOpportunities } from "@/lib/opportunities";
import type { AccrualLine } from "@/lib/revenueAccrualsShared";
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
    if (op === "deviate") {
      /* THE DEVIATE BUTTON (Suren, Sep 1: "if he's going to change it, he has
         to put a button called Deviate... The moment you do that, this record
         from version 1 becomes a new record called version 2").

         THIS IS A WRITE, NOT A CREATE AND NOT A DELETE. It appends a version to
         a plan that already exists and removes nothing, so the write gate above
         (moduleWriteRefusal) is the whole permission question, exactly as it is
         for editing the months on that plan today. */
      const opportunityId = String(body.opportunityId ?? "");

      /* THE REASON IS THE LAST COLUMN OF HIS SHEET and it is not optional.
         Refused here as well as in the store so the message names the missing
         thing rather than arriving as a generic save failure. */
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json(
          { error: "Say why this is deviating before you save it." },
          { status: 400 }
        );
      }

      /* EVERY FIGURE STRICTLY, OTS AND ARR INCLUDED ("the two columns repeat
         for the deviation"). A string that becomes NaN, a negative, a boolean:
         all refused out loud. Nothing is coerced into a 0 that would then be
         read as a month somebody deliberately zeroed. */
      const raw = Array.isArray(body.lines) ? body.lines : [];
      if (!raw.length) {
        return NextResponse.json(
          { error: "A deviation needs at least one month." },
          { status: 400 }
        );
      }
      const lines: AccrualLine[] = [];
      for (const item of raw) {
        const row = (item ?? {}) as Record<string, unknown>;
        const month = String(row.month ?? "");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
          return NextResponse.json(
            { error: `"${month}" is not a month this plan can use.` },
            { status: 400 }
          );
        }
        const ots = row.ots === undefined ? undefined : parseFigure(row.ots);
        const arr = row.arr === undefined ? undefined : parseFigure(row.arr);
        const split = row.ots !== undefined || row.arr !== undefined;
        if (
          (row.ots !== undefined && ots === undefined) ||
          (row.arr !== undefined && arr === undefined)
        ) {
          return NextResponse.json(
            {
              error: `The one-time and recurring figures for ${month} have to be zero or more.`,
            },
            { status: 400 }
          );
        }
        /* The split IS the total when it is present, the same rule the plan
           itself follows, so the two can never disagree. */
        const amount = split ? (ots ?? 0) + (arr ?? 0) : parseFigure(row.amount);
        if (amount === undefined) {
          return NextResponse.json(
            { error: `The amount for ${month} has to be zero or more.` },
            { status: 400 }
          );
        }
        lines.push({
          month,
          amount,
          ...(ots === undefined ? {} : { ots }),
          ...(arr === undefined ? {} : { arr }),
        });
      }

      /* Same lesson the delete op above learned: name what was missing rather
         than answering ok:true to a call that did nothing. */
      const before = await readRevenueAccruals();
      if (!before.plans.some((p) => p.opportunityId === opportunityId)) {
        return NextResponse.json(
          { error: "There is no accrual plan on that deal." },
          { status: 404 }
        );
      }

      const plan = await deviateAccrualPlan(opportunityId, lines, reason, me.name);
      return NextResponse.json({
        ok: true,
        plan,
        state: await readRevenueAccruals(),
      });
    }
    if (op === "system-deviate") {
      /* THE SYSTEM DEVIATION BUTTON (Suren, Sep 1: "there will be a button that
         you go and click on. Every time somebody comes and clicks on that
         button, the system will go and record all the revenue and all the
         opportunities. If the contract date is passed and the signatures have
         not happened, then it will automatically create a new version").

         A BUTTON AND NOT A CRON, like freezing a month above it. Nothing in
         this module moves on its own, and this one writes to every plan at
         once, which is the last thing that should ever fire unattended.

         The deals come from here rather than from the store so the accruals
         library keeps no opinion about opportunities; it is handed the sign
         dates and statuses and judges the plans it already holds. */
      const { opportunities } = await readOpportunities();
      const result = await sweepAccrualPlans(
        opportunities.map((o) => ({
          id: o.id,
          estSignDate: o.estSignDate,
          status: o.status,
        })),
        me.name
      );
      return NextResponse.json({
        ok: true,
        ...result,
        state: await readRevenueAccruals(),
      });
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
