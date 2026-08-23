import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import {
  addCompetitionMaterial,
  addCompetitorProduct,
  readCompetition,
  removeCompetitionMaterial,
  removeCompetitorProduct,
  type CompetitionMaterialKind,
} from "@/lib/offeringCompetition";

export const dynamic = "force-dynamic";

// Competition intel is every rep's tool, like sales materials: anyone signed
// in reads and contributes. Mock mode shows samples and never accepts writes.

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const offeringId = String(
    req.nextUrl.searchParams.get("offeringId") ?? ""
  ).trim();
  if (!offeringId) {
    return NextResponse.json({ error: "Missing offeringId" }, { status: 400 });
  }
  const rows = await readCompetition(offeringId).catch(() => []);
  return NextResponse.json({ rows });
}

/**
 * ONE WRITER AT A TIME. Every op below reads the whole competition row, adds or
 * drops one entry, and writes the row back. Two people adding a competitor in
 * the same moment both read the same "before", so the second write erases the
 * first. Measured on this route: six simultaneous adds, six 200s, ONE survivor.
 * Same fix as Performance and Market Intel tracking.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_COMPETITION_QUEUE__: Promise<void> | undefined;
}
async function acquireCompetitionWrite(): Promise<() => void> {
  const previous = globalThis.__FREYR_COMPETITION_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_COMPETITION_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  return release;
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDataMode() !== "live") {
    return NextResponse.json(
      { error: "Mock mode shows sample intel only. Switch to Real to add." },
      { status: 400 }
    );
  }
  const me = await getCurrentUser();
  const addedBy = me.name || "Teammate";
  const body = (await req.json().catch(() => ({}))) ?? {};
  const offeringId = String(body.offeringId ?? "").trim();
  if (!offeringId) {
    return NextResponse.json({ error: "Missing offeringId" }, { status: 400 });
  }
  const releaseWrite = await acquireCompetitionWrite();
  try {
    if (body.op === "add-competitor") {
      const entry = await addCompetitorProduct({
        offeringId,
        company: String(body.company ?? ""),
        product: String(body.product ?? ""),
        marketIntelId: body.marketIntelId ? String(body.marketIntelId) : null,
        pricing: body.pricing ? String(body.pricing) : undefined,
        about: body.about ? String(body.about) : undefined,
        addedBy,
      });
      return NextResponse.json({ ok: true, entry });
    }
    if (body.op === "remove-competitor") {
      await removeCompetitorProduct(offeringId, String(body.competitorId ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (body.op === "add-material") {
      const material = await addCompetitionMaterial({
        offeringId,
        competitorId: String(body.competitorId ?? ""),
        kind: String(body.kind ?? "about") as CompetitionMaterialKind,
        label: String(body.label ?? ""),
        text: body.text ? String(body.text) : undefined,
        url: body.url ? String(body.url) : undefined,
        addedBy,
      });
      return NextResponse.json({ ok: true, material });
    }
    if (body.op === "remove-material") {
      await removeCompetitionMaterial(
        offeringId,
        String(body.competitorId ?? ""),
        String(body.materialId ?? "")
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "That didn't save." },
      { status: 400 }
    );
  } finally {
    releaseWrite();
  }
}
