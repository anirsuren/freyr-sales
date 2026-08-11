import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  trackCompany,
  trackPerson,
  untrackCompany,
  untrackPerson,
} from "@/lib/marketIntelTracking";

export const dynamic = "force-dynamic";

// Tracking is every rep's tool, not an admin surface: anyone signed in can put
// a company or a person on the watch list, same as anyone can log an activity.

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.kind === "company") {
      const result = await trackCompany(body);
      return NextResponse.json({ ok: true, ...result });
    }
    if (body?.kind === "person") {
      const person = await trackPerson(body);
      return NextResponse.json({ ok: true, person });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    if (body?.kind === "company") {
      await untrackCompany(id);
      return NextResponse.json({ ok: true });
    }
    if (body?.kind === "person") {
      await untrackPerson(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: 400 }
    );
  }
}
