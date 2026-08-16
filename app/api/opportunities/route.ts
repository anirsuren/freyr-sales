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
  };
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
      return NextResponse.json({ ok: true, opportunity: created });
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
        await removeOpportunity(id);
        return NextResponse.json({ ok: true });
      }
      const updated = await updateOpportunity(id, body(raw));
      return NextResponse.json({ ok: true, opportunity: updated });
    }

    return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
