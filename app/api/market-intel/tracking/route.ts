import { NextRequest, NextResponse } from "next/server";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
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

/**
 * ONE WRITER AT A TIME. Every call below reads the whole tracking list, adds or
 * drops one entry, and writes the whole list back. Two people adding a person
 * in the same moment both read the same "before", so the second write drops the
 * first: two 200s, one entry kept. Performance had the identical shape and lost
 * five of six simultaneous saves until it was serialised this way.
 *
 * The queue tail lives on globalThis so a dev-server hot reload cannot hand two
 * requests two separate empty queues.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MI_TRACKING_QUEUE__: Promise<void> | undefined;
}
async function acquireTrackingWrite(): Promise<() => void> {
  const previous = globalThis.__FREYR_MI_TRACKING_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_MI_TRACKING_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  return release;
}

/**
 * WHO MAY CHANGE THE WATCH LIST — the privilege table, like every other module.
 *
 * This used to be open to anybody signed in ("tracking is every rep's tool,
 * not an admin surface"), which predates the map. The Market Intel row gives
 * everyone *view* and only Admin *create*, so a BD Member adding companies was
 * writing to a module they can only read (found Aug 31, walking every role in
 * the browser: "Track a company" was on a BD Member's screen and worked).
 *
 * It is not only a permission question. Each company added fires a paid scrape
 * within seconds of the response, so an open write endpoint here spends money.
 *
 * Reopening it to reps is one cell in Admin, not a deploy.
 */
async function readOnly(): Promise<NextResponse | null> {
  const refusal = await moduleWriteRefusal("/market-intel");
  return refusal ? NextResponse.json({ error: refusal }, { status: 403 }) : null;
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const shut = await readOnly();
  if (shut) return shut;
  const body = (await req.json().catch(() => ({}))) ?? {};
  const releaseWrite = await acquireTrackingWrite();
  try {
    // Link-only flows: the LinkedIn page is the whole form; everything else
    // (name, logo, title, photo, first data pull) comes from the page itself.
    if (body?.kind === "company-link") {
      const company = await addCompanyByLink(
        String(body.linkedinUrl ?? ""),
        body?.group === "competitor" ? "competitor" : "customer"
      );
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
  } finally {
    releaseWrite();
  }
}

export async function DELETE(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const shut = await readOnly();
  if (shut) return shut;
  const body = (await req.json().catch(() => ({}))) ?? {};
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const releaseWrite = await acquireTrackingWrite();
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
  } finally {
    releaseWrite();
  }
}
