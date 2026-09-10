import { NextRequest, NextResponse } from "next/server";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { after } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import {
  addCompanyByLink,
  addPersonByLink,
  refreshTrackedCompanyNow,
  refreshTrackedPersonNow,
  resumeCompanyIfStale,
} from "@/lib/marketIntelRefresh";
import { deleteFeedCompany } from "@/lib/marketIntelFeed";
import {
  MEMBER_TRACK_LIMIT,
  cleanDivisions,
  countAddedBy,
  deleteCompanyForGood,
  readMarketIntelTracking,
  setCompanyDivisions,
  setCompanyGroup,
  setCompanyStanding,
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
 * Since Sep 10 the Market Intel row gives BD *create* beside Admin (Saras:
 * "give it to the BD members as well and maybe keep a limit"). The limit is
 * enforced here: a person may put MEMBER_TRACK_LIMIT NEW companies on the
 * watch; following a company that is already there is free and unlimited,
 * because it is scraped once for everybody. Admins have no limit.
 *
 * THE MODEL (Anir, Sep 10): a company is on the watch because somebody has
 * it, the workspace's standing watch (admins add and remove) or a person's
 * own list (anybody follows and unfollows). It is refreshed while somebody
 * has it and pauses when nobody does. Only an admin deletes it for good.
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
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const addedBy = {
    id: scope.userId,
    ...(user.name ? { name: user.name } : {}),
    ...(user.email ? { email: user.email } : {}),
  };
  const body = (await req.json().catch(() => ({}))) ?? {};
  const releaseWrite = await acquireTrackingWrite();
  try {
    // Link-only flows: the LinkedIn page is the whole form; everything else
    // (name, logo, title, photo, first data pull) comes from the page itself.
    if (body?.kind === "company-link") {
      const tracking = await readMarketIntelTracking();
      const canCreate = isAdmin || countAddedBy(tracking, scope.userId) < MEMBER_TRACK_LIMIT;
      const result = await addCompanyByLink(
        String(body.linkedinUrl ?? ""),
        body?.group === "competitor" ? "competitor" : "customer",
        {
          addedBy,
          divisions: cleanDivisions(body.divisions),
          canCreate,
          // Only an admin puts a new company on the workspace's standing watch.
          standing: isAdmin && body?.standing === true,
        }
      );
      // Whoever added or chose it follows it: it lands on their own list.
      await setMarketIntelBookmark(scope, result.id, true).catch(() => undefined);
      // A paused company somebody wants again is pulled now if its data is old.
      if (result.resumed) after(() => resumeCompanyIfStale(result.id));
      return NextResponse.json({
        ok: true,
        company: { id: result.id, name: result.name, group: result.group },
        existing: result.existing,
        resumed: result.resumed,
        addedLeft: isAdmin
          ? null
          : Math.max(
              0,
              MEMBER_TRACK_LIMIT -
                countAddedBy(await readMarketIntelTracking(), scope.userId)
            ),
      });
    }
    if (body?.kind === "person-link") {
      const person = await addPersonByLink(
        String(body.companyId ?? "").trim(),
        String(body.linkedinUrl ?? "")
      );
      return NextResponse.json({ ok: true, person });
    }
    if (body?.kind === "company") {
      const tracking = await readMarketIntelTracking();
      if (!isAdmin && countAddedBy(tracking, scope.userId) >= MEMBER_TRACK_LIMIT) {
        return NextResponse.json(
          {
            error:
              "You've added the most companies one person can. You can still follow any company already on the list.",
          },
          { status: 403 }
        );
      }
      const divisions = cleanDivisions(body.divisions);
      if (divisions.length === 0) {
        return NextResponse.json(
          { error: "Pick at least one division (MPR, MDV or CON)." },
          { status: 400 }
        );
      }
      const result = await trackCompany(body, { addedBy, divisions });
      await setMarketIntelBookmark(scope, result.company.id, true).catch(() => undefined);
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
    /* THE STANDING WATCH and the tab a company lives on: admins only. */
    if (body?.kind === "standing" || body?.kind === "group") {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Only an admin changes what is tracked for everyone." },
          { status: 403 }
        );
      }
      const id = String(body?.id ?? "").trim();
      if (body.kind === "standing") {
        const company = await setCompanyStanding(id, body?.on === true);
        return NextResponse.json({ ok: true, standing: company.standing === true });
      }
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
          { status: 400 }
        );
      }
      const saved = await setCompanyDivisions(String(body.id ?? ""), divisions);
      return NextResponse.json({ ok: true, divisions: saved });
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
          { error: "Only an admin can delete a company for everyone. Remove it from your list with the star instead." },
          { status: 403 }
        );
      }
      const tracking = await readMarketIntelTracking();
      const personIds = tracking.people.filter((p) => p.companyId === id).map((p) => p.id);
      const followers =
        (await readMarketIntelFollowers().catch(() => ({}) as Record<string, string[]>))[id]?.length ?? 0;
      const gone = await deleteCompanyForGood(id);
      await deleteFeedCompany(id, personIds).catch((error) =>
        console.error("[market-intel] delete of feed rows failed:", error)
      );
      const lists = await forgetMarketIntelCompany(id).catch(() => 0);
      return NextResponse.json({ ok: true, found: gone.found, followersRemoved: followers, listsTouched: lists });
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
