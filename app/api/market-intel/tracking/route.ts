import {
  enqueueCompany,
  armCompanyOnboarding,
  runCompanyOnboarding,
  retryCompanyOnboarding,
} from "@/lib/marketIntelOnboarding";
import { NextRequest, NextResponse } from "next/server";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { after } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import {
  DuplicateCompanyError,
  findCompanyDuplicate,
} from "@/lib/marketIntelDuplicates";
import {
  addPersonByLink,
  refreshTrackedCompanyNow,
  refreshTrackedPersonNow,
} from "@/lib/marketIntelRefresh";
import { deleteFeedCompany } from "@/lib/marketIntelFeed";
import {
  cleanDivisions,
  deleteCompanyForGood,
  readMarketIntelTracking,
  setCompanyDivisions,
  setCompanyGroup,
  trackCompany,
  trackPerson,
  untrackPerson,
} from "@/lib/marketIntelTracking";
import {
  forgetMarketIntelCompany,
  readMarketIntelFollowers,
  setMarketIntelBookmark,
} from "@/lib/marketIntelBookmarks";

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
 * Since Sep 10 the Market Intel row gives BD *create* beside Admin (Saras).
 * There is no limit on how many companies a person adds (Anir, Sep 10: "idk
 * why ur putting a limit"); a company already in the list is never scraped
 * twice, it is simply ticked.
 *
 * THE MODEL (Anir, Sep 10): the catalogue holds every company the team knows
 * about; each person ticks the ones they want on their page. A company is
 * collected while at least one person has it ticked, and stops when the last
 * person unticks it. Only an admin deletes it for good.
 */
async function readOnly(): Promise<NextResponse | null> {
  const refusal = await moduleWriteRefusal("/market-intel");
  return refusal
    ? NextResponse.json({ error: refusal }, { status: 403 })
    : null;
}

export async function GET(req: NextRequest) {
  if (!(await verifiedRequestMemberScope(req)))
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await readOnly();
  if (shut) return shut;
  try {
    const tracking = await readMarketIntelTracking({ fresh: true });
    const statusIds = (req.nextUrl.searchParams.get("statusIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (statusIds.length) {
      const wanted = new Set(statusIds);
      return NextResponse.json({
        companies: tracking.companies
          .filter((company) => wanted.has(company.id))
          .map((company) => ({ id: company.id, onboarding: company.onboarding ?? null })),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const company = findCompanyDuplicate(
      tracking.companies,
      req.nextUrl.searchParams.get("website") || "",
      req.nextUrl.searchParams.get("linkedinUrl") || "",
    );
    return NextResponse.json(
      {
        duplicate: company
          ? {
              id: company.id,
              name: company.name,
              group: company.group || "customer",
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not check existing companies. Please try again." },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const shut = await readOnly();
  if (shut) return shut;
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const addedBy = {
    id: scope.userId,
    ...(user.name ? { name: user.name } : {}),
    ...(user.email ? { email: user.email } : {}),
  };
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (body?.kind === "company-link" || body?.kind === "company-retry") {
    try {
      let company;
      if (body.kind === "company-retry") {
        const tracking = await readMarketIntelTracking({ fresh: true });
        company = tracking.companies.find((c) => c.id === String(body.id));
        if (!company) throw new Error("Company is no longer tracked.");
        await retryCompanyOnboarding(company.id);
      } else {
        company = await enqueueCompany(
          {
            name: body.name,
            website: body.website,
            linkedinUrl: body.linkedinUrl,
          },
          body.group === "competitor" ? "competitor" : "customer",
          { addedBy, divisions: cleanDivisions(body.divisions) },
        );
        try {
          await setMarketIntelBookmark(scope, company.id, true);
        } catch {
          throw new Error(
            `${company.name} was saved, but could not be added to your personal list. Select it in Manage ${company.group === "competitor" ? "competitors" : "customers"}.`,
          );
        }
      }
      armCompanyOnboarding();
      after(() => runCompanyOnboarding());
      return NextResponse.json(
        {
          ok: true,
          company: { id: company.id, name: company.name, group: company.group },
          status: "queued",
        },
        { status: 202 },
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Could not add company.",
        },
        { status: error instanceof DuplicateCompanyError ? 409 : 400 },
      );
    }
  }
  const releaseWrite = await acquireTrackingWrite();
  try {
    // Link-only flows: the LinkedIn page is the whole form; everything else
    // (name, logo, title, photo, first data pull) comes from the page itself.
    if (body?.kind === "person-link") {
      const person = await addPersonByLink(
        String(body.companyId ?? "").trim(),
        String(body.linkedinUrl ?? ""),
      );
      return NextResponse.json({ ok: true, person });
    }
    if (body?.kind === "company") {
      const divisions = cleanDivisions(body.divisions);
      if (divisions.length === 0) {
        return NextResponse.json(
          { error: "Pick at least one division (MPR, MDV or CON)." },
          { status: 400 },
        );
      }
      const result = await trackCompany(body, { addedBy, divisions });
      await setMarketIntelBookmark(scope, result.company.id, true);
      // The first briefing is collected right after this response goes out
      // (a few cents), so the page fills in minutes instead of a day.
      after(() =>
        refreshTrackedCompanyNow(result.company).catch((error) =>
          console.error("[market-intel] first company scrape failed:", error),
        ),
      );
      return NextResponse.json({ ok: true, ...result });
    }
    if (body?.kind === "person") {
      const person = await trackPerson(body);
      after(() =>
        refreshTrackedPersonNow(person).catch((error) =>
          console.error("[market-intel] first person scrape failed:", error),
        ),
      );
      return NextResponse.json({ ok: true, person });
    }
    /* WHICH TAB A COMPANY LIVES ON: admins only. */
    if (body?.kind === "group") {
      if (!isAdmin) {
        return NextResponse.json(
          {
            error:
              "Only an admin moves a company between customers and competitors.",
          },
          { status: 403 },
        );
      }
      const id = String(body?.id ?? "").trim();
      const group = body?.group === "competitor" ? "competitor" : "customer";
      const company = await setCompanyGroup(id, group);
      return NextResponse.json({ ok: true, group: company.group });
    }
    /* THE DIVISION TAG on any company, built-in or added (Saras, Sep 10). */
    if (body?.kind === "divisions") {
      const divisions = cleanDivisions(body.divisions);
      if (divisions.length === 0) {
        return NextResponse.json(
          { error: "Every company needs at least one division." },
          { status: 400 },
        );
      }
      const saved = await setCompanyDivisions(String(body.id ?? ""), divisions);
      return NextResponse.json({ ok: true, divisions: saved });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: error instanceof DuplicateCompanyError ? 409 : 400 },
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
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const body = (await req.json().catch(() => ({}))) ?? {};
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const releaseWrite = await acquireTrackingWrite();
  try {
    if (body?.kind === "company") {
      /* GONE FOR GOOD, ADMINS ONLY (Anir, Sep 10). Everybody else takes a
         company off their OWN list with the star; when nobody has it left it
         pauses by itself. Deleting removes the registry entry, its people,
         its data rows and every follow, and a seed stays deleted. */
      if (!isAdmin) {
        return NextResponse.json(
          {
            error:
              "Only an admin can delete a company for everyone. Remove it from your list with the star instead.",
          },
          { status: 403 },
        );
      }
      const tracking = await readMarketIntelTracking();
      const personIds = tracking.people
        .filter((p) => p.companyId === id)
        .map((p) => p.id);
      const followers =
        (
          await readMarketIntelFollowers().catch(
            () => ({}) as Record<string, string[]>,
          )
        )[id]?.length ?? 0;
      const gone = await deleteCompanyForGood(id);
      await deleteFeedCompany(id, personIds).catch((error) =>
        console.error("[market-intel] delete of feed rows failed:", error),
      );
      const lists = await forgetMarketIntelCompany(id).catch(() => 0);
      return NextResponse.json({
        ok: true,
        found: gone.found,
        followersRemoved: followers,
        listsTouched: lists,
      });
    }
    if (body?.kind === "person") {
      await untrackPerson(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: 400 },
    );
  } finally {
    releaseWrite();
  }
}
