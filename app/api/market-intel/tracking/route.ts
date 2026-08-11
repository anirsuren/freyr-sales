import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  addCompanyByLink,
  addPersonByLink,
  refreshTrackedCompanyNow,
  refreshTrackedPersonNow,
} from "@/lib/marketIntelRefresh";
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
    // Link-only flows: the LinkedIn page is the whole form; everything else
    // (name, logo, title, photo, first data pull) comes from the page itself.
    if (body?.kind === "company-link") {
      const company = await addCompanyByLink(String(body.linkedinUrl ?? ""));
      return NextResponse.json({ ok: true, company });
    }
    if (body?.kind === "person-link") {
      const person = await addPersonByLink(
        String(body.companyId ?? "").trim(),
        String(body.linkedinUrl ?? "")
      );
      return NextResponse.json({ ok: true, person });
    }
    if (body?.kind === "company") {
      const result = await trackCompany(body);
      // The first briefing is collected right after this response goes out
      // (a few cents), so the page fills in minutes instead of a day.
      after(() =>
        refreshTrackedCompanyNow(result.company).catch((error) =>
          console.error("[market-intel] first company scrape failed:", error)
        )
      );
      return NextResponse.json({ ok: true, ...result });
    }
    if (body?.kind === "person") {
      const person = await trackPerson(body);
      after(() =>
        refreshTrackedPersonNow(person).catch((error) =>
          console.error("[market-intel] first person scrape failed:", error)
        )
      );
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
