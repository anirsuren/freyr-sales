import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import {
  addOpportunity,
  readOpportunities,
  removeOpportunity,
  updateOpportunity,
  type OpportunityInput,
} from "@/lib/opportunities";
import type { Opportunity } from "@/lib/opportunitiesShared";
import { logActual, readPerformance, removeActual } from "@/lib/performance";

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
    value: n(raw.value),
    currency: s(raw.currency),
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
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(raw.op ?? "");
  const me = await getCurrentUser();
  const privileged = isManagerOrAdmin(me.role);

  try {
    if (op === "add") {
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
        // A deleted deal takes its unverified met entries with it, same as a
        // deleted goal row; verified entries are locked and stay.
        for (const link of target.goalLinks ?? []) {
          if (link.actualId) {
            try {
              await removeActual(link.actualId);
            } catch {}
          }
        }
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
}
