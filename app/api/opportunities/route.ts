import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import {
  addOpportunity,
  commitOpportunitiesChange,
  readOpportunities,
  removeOpportunity,
  updateOpportunity,
  type OpportunityInput,
} from "@/lib/opportunities";
import type { Opportunity } from "@/lib/opportunitiesShared";
import { logActual, readPerformance, removeActual } from "@/lib/performance";
import { removeAccrualPlan } from "@/lib/revenueAccruals";
import { withPerformanceWrite } from "@/lib/performanceQueue";
import {
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * OPPORTUNITIES API.
 *
 * Reading is open to anyone signed in: the pipeline is the company's shared
 * picture, and Performance already shows the totals these roll up into.
 * Writing follows the same rule as Customers — managers and admins, plus the
 * person who owns the opportunity. Mock mode never accepts a write, exactly
 * like the performance route.
 */

/** null survives as null (clear it); "" and absent mean "not mentioned". */
function clearable(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function body(raw: Record<string, unknown>): OpportunityInput {
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  const n = (v: unknown) =>
    v === undefined || v === null || v === "" ? undefined : Number(v);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  return {
    externalId: s(raw.externalId),
    name: s(raw.name),
    customer: s(raw.customer),
    customerId: s(raw.customerId),
    offeringIds: list(raw.offeringIds),
    offeringLabels: list(raw.offeringLabels),
    // The offering rows. Shape-checked in lib/opportunities (normalizeLines),
    // which is the one place that decides what a row may contain, so this
    // hands it the array and nothing more.
    lines: Array.isArray(raw.lines) ? raw.lines : undefined,
    level: s(raw.level),
    status: s(raw.status),
    revenueType: s(raw.revenueType),
    dealType: s(raw.dealType),
    value: n(raw.value),
    currency: s(raw.currency),
    /* The summary's two numbers, and the ONE pair of fields that must be
       able to travel as null. `n()` folds null into undefined, and the update
       merge drops undefined so a form that posts three fields cannot blank
       the other twelve — correct everywhere else, and wrong here: clearing a
       figure somebody mistyped would silently keep the old one. null means
       "clear this", undefined still means "not mentioned". */
    estimatedAcv: clearable(raw.estimatedAcv),
    estimatedTcv: clearable(raw.estimatedTcv),
    confidence: n(raw.confidence),
    estSignDate: s(raw.estSignDate),
    owner: s(raw.owner),
    nextSteps: s(raw.nextSteps),
    goalIds: list(raw.goalIds),
    // Shape-checked in lib/opportunities (normalizeGoalLinks /
    // normalizeActivities), same deal as the offering rows above.
    goalLinks: Array.isArray(raw.goalLinks) ? raw.goalLinks : undefined,
    activities: Array.isArray(raw.activities) ? raw.activities : undefined,
  };
}

/**
 * THE MET BUTTON IS WHAT COUNTS (Suren, Aug 18 call: "the moment they click
 * on met, that's when you take this value and add it against [the goal], and
 * also put the person name… let it be manual right now").
 *
 * A goal row newly saved as met writes ONE performance entry — goal, person,
 * value, tagged with the deal — and remembers the entry id so a re-save never
 * double-counts. Un-met withdraws the entry while it is still unverified; a
 * verified entry is locked by the group owner's sign-off and stays.
 */
async function settleMetGoals(
  before: Opportunity | null,
  after: Opportunity,
  meName: string
): Promise<Opportunity> {
  const links = after.goalLinks ?? [];
  if (links.length === 0 && !(before?.goalLinks ?? []).length) return after;
  /* IN THE SAME LINE AS EVERY OTHER PERFORMANCE WRITE (Aug 23 audit). This
     function reads the performance row, then logs and removes entries — and
     it used to do so OUTSIDE the write queue the performance API stands in,
     so a deal save racing a logged result could erase either one, both with
     a 200. Same store, same queue. */
  return withPerformanceWrite(() => settleMetGoalsLocked(before, after, meName));
}

async function settleMetGoalsLocked(
  before: Opportunity | null,
  after: Opportunity,
  meName: string
): Promise<Opportunity> {
  const links = after.goalLinks ?? [];
  const next = [...links];
  let changed = false;

  /**
   * THE GUARD CANNOT LIVE IN THE PAYLOAD (found testing, Aug 19).
   *
   * "A re-save never double-counts" held only while the client echoed the
   * link's `actualId` back. Any save that rebuilt the rows without it — a
   * stale tab, a second device, anything posting the same deal twice — wrote
   * a SECOND performance entry for the same deal and goal, and the money was
   * counted twice. The entries themselves know which deal and goal they came
   * from, so the server can answer this without being told.
   */
  const existingForLink = await (async () => {
    if (!next.some((l) => !l.actualId)) return new Map<string, string>();
    const perf = await readPerformance();
    const found = new Map<string, string>();
    for (const a of perf.actuals) {
      if (a.opportunityId !== after.id) continue;
      const key = `${a.goalId}::${a.person.trim().toLowerCase()}`;
      if (!found.has(key)) found.set(key, a.id);
    }
    return found;
  })();

  for (let i = 0; i < next.length; i++) {
    const link = next[i];
    if (link.met && !link.actualId && (link.value ?? 0) > 0) {
      // Already counted once for this deal, goal and person: adopt that entry
      // instead of writing a second one.
      const already = existingForLink.get(
        `${link.goalId}::${(link.person || after.owner || meName).trim().toLowerCase()}`
      );
      if (already) {
        next[i] = {
          ...link,
          actualId: already,
          metAt: link.metAt ?? new Date().toISOString().slice(0, 10),
        };
        changed = true;
        continue;
      }
      try {
        const entry = await logActual({
          goalId: link.goalId,
          person: link.person || after.owner || meName,
          amount: link.value ?? 0,
          // THE DEAL'S OWN CURRENCY RIDES ALONG (loop tick 2, Aug 20: a €50K
          // deal marked Met minted a claim with no currency, which Performance
          // then rendered as $50,000 — the exact class of lie the Aug 20
          // "never again" rule exists for).
          currency: after.currency,
          note: "Marked met on the deal",
          customer: after.customer,
          opportunityId: after.id,
          dealLabel: after.name,
          addedBy: meName,
        });
        next[i] = {
          ...link,
          actualId: entry.id,
          metAt: new Date().toISOString().slice(0, 10),
        };
        changed = true;
      } catch (error) {
        console.error("[opportunities] met entry failed:", error);
      }
    } else if (!link.met) {
      /**
       * THE HANDLE HAS TO BE FOUND, NOT ASSUMED (found testing, Aug 19).
       *
       * Un-marking Met only ran when the browser sent the link's actualId
       * back. A client that rebuilt the rows without it left the entry
       * standing on the goal while the deal said "not met" — the money still
       * counted and nothing on the deal knew about it. Same lookup the Met
       * branch above uses.
       */
      const handle =
        link.actualId ??
        existingForLink.get(
          `${link.goalId}::${(link.person || after.owner || meName).trim().toLowerCase()}`
        );
      if (!handle) continue;
      try {
        await removeActual(handle);
        next[i] = { ...link, actualId: undefined, metAt: undefined };
        changed = true;
      } catch {
        // Verified and locked: the number stays, and the handle stays with it
        // so a future re-met adopts that entry instead of writing a second.
        if (!link.actualId) {
          next[i] = { ...link, actualId: handle };
          changed = true;
        }
      }
    }
  }

  // Rows deleted outright take their unverified entry with them.
  const stillHere = new Set(next.map((l) => l.id));
  for (const old of before?.goalLinks ?? []) {
    if (old.actualId && !stillHere.has(old.id)) {
      try {
        await removeActual(old.actualId);
      } catch {
        // Verified: stays, by the same rule as above.
      }
    }
  }

  if (!changed) return after;
  return updateOpportunity(after.id, { goalLinks: next });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const state = await readOpportunities();
  return NextResponse.json({ state });
}

export async function POST(req: NextRequest) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/opportunities");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDataMode() !== "live") {
    return NextResponse.json(
      {
        error:
          "Mock mode shows a sample pipeline only. Switch to Real to change it.",
      },
      { status: 403 }
    );
  }
  /* See the performance route: a literal `null` body parses, so the catch
     never fires and the read below threw a 500 instead of a 400. */
  const raw = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const op = String(raw.op ?? "");
  const me = await getCurrentUser();
  const privileged = isManagerOrAdmin(me.role);

  /* Every mutation below reads the whole row and writes it back, so they must
     not overlap — see commitOpportunitiesChange. Wrapping the whole block
     rather than each call keeps a read and its dependent write inside one
     turn (settleMetGoals reads the deal it just wrote). */
  return commitOpportunitiesChange(async () => {
  try {
    if (op === "add") {
      /* MAKING A NEW ONE IS THE OWNER'S RIGHT, not the member's (Suren, Aug 29:
         "owner can create, member can edit"). The gate at the top of this
         handler asks whether the pen is in the room at all, and a BD Member's
         row says edit, so it let them start deals as well as correct them. */
      const refusal = await moduleCreateRefusal("/opportunities");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

      /* WHAT A NEW DEAL MUST CARRY, ENFORCED HERE AND NOT ONLY IN THE FORM.
         Suren, Sep 1: "you have to make everything mandatory... Estimated TCV
         is mandatory. ACV is not mandated. Confidence level is mandatory.
         Expected to sign is mandatory. Owner is mandatory."

         The browser checks the same list, but a check that lives only in the
         browser is a suggestion: this route is reachable from the agent, from
         a script, and from anything else that learns the shape. Owner is the
         exception and is absent below on purpose, because the line underneath
         already guarantees one by falling back to the creator.

         ADD ONLY. Editing an existing deal is deliberately not held to this:
         97 of the 102 deals in the workspace have no owner, so enforcing it on
         update would stop people correcting records they already have. */
      const draft = body(raw) as {
        estimatedTcv?: unknown;
        lines?: { confidence?: unknown; estSignDate?: unknown }[];
      };
      const firstLine = Array.isArray(draft.lines) ? draft.lines[0] : undefined;
      const needed: string[] = [];
      if (typeof draft.estimatedTcv !== "number" || !Number.isFinite(draft.estimatedTcv))
        needed.push("an estimated TCV");
      if (typeof firstLine?.confidence !== "number" || !Number.isFinite(firstLine.confidence))
        needed.push("a confidence level");
      if (typeof firstLine?.estSignDate !== "string" || !firstLine.estSignDate.trim())
        needed.push("an expected signing date");
      if (needed.length)
        return NextResponse.json(
          {
            error:
              needed.length === 1
                ? `A new deal needs ${needed[0]}.`
                : `A new deal needs ${needed.slice(0, -1).join(", ")} and ${needed[needed.length - 1]}.`,
          },
          { status: 400 }
        );

      const created = await addOpportunity({
        ...body(raw),
        // An opportunity nobody owns is an opportunity nobody chases.
        owner: body(raw).owner || me.name,
      });
      const settled = await settleMetGoals(null, created, me.name);
      return NextResponse.json({ ok: true, opportunity: settled });
    }

    const id = String(raw.id ?? "");
    if (!id) {
      return NextResponse.json({ error: "Which opportunity?" }, { status: 400 });
    }

    if (op === "update" || op === "remove") {
      const state = await readOpportunities();
      const target = state.opportunities.find((o) => o.id === id);
      if (!target) {
        return NextResponse.json(
          { error: "That opportunity no longer exists." },
          { status: 404 }
        );
      }
      const mine =
        !!target.owner &&
        target.owner.trim().toLowerCase() === me.name.trim().toLowerCase();
      if (!privileged && !mine) {
        return NextResponse.json(
          { error: "Only its owner, or a manager, can change this opportunity." },
          { status: 403 }
        );
      }
      if (op === "remove") {
        /* "The person who can create only can delete. The edit person can only
           edit, cannot delete." Deleting is the one thing editing cannot undo. */
        const refusal = await moduleDeleteRefusal("/opportunities");
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
        // A deleted deal takes its unverified met entries with it, same as a
        // deleted goal row; verified entries are locked and stay. Queued for
        // the same reason settleMetGoals is.
        await withPerformanceWrite(async () => {
          for (const link of target.goalLinks ?? []) {
            if (link.actualId) {
              try {
                await removeActual(link.actualId);
              } catch {}
            }
          }
        });
        /* THE ACCRUAL PLAN GOES WITH THE DEAL.
           Found in the loop, Sep 1: deleting a probe deal left its accrual
           plan behind, and that plan keeps its months and its money — so the
           Revenue Accruals page went on counting a deal that no longer exists
           in "Total accrued revenue", with a row whose deal cannot be opened.

           Exactly the reasoning already applied to met entries two lines
           above: a plan is a child of the deal and means nothing without it.
           Failure is swallowed for the same reason — the deal must still go
           even if the accrual store is unreachable. */
        try {
          await removeAccrualPlan(id);
        } catch {}
        await removeOpportunity(id);
        return NextResponse.json({ ok: true });
      }
      const updated = await updateOpportunity(id, body(raw));
      const settled = await settleMetGoals(target, updated, me.name);
      return NextResponse.json({ ok: true, opportunity: settled });
    }

    return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
  });
}
