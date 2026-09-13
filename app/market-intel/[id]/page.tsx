import { CollectionProgress } from "@/components/market-intel/CollectionProgress";
import { PendingCompanyCard } from "@/components/market-intel/PendingCompanyCard";
import { SmartBack } from "@/components/ui/BackButton";
import { AutoFresh } from "@/components/market-intel/AutoFresh";
import {
  ArrowLeft,
  Building2,
  Globe2,
  Hourglass,
  Newspaper,
  Radar,
  Swords,
  Users,
} from "lucide-react";
import { CompanyIntel } from "@/components/market-intel/CompanyIntel";
import { LiveCompanyBriefing } from "@/components/market-intel/LiveCompanyBriefing";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { Card } from "@/components/ui/Card";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import {
  allTrackedNames,
  buildBriefing,
  readFeedCompany,
  readFeedPeople,
  readMarketIntelSummaries,
} from "@/lib/marketIntelFeed";
import { maybeScheduleMarketIntelRefresh } from "@/lib/marketIntelRefresh";
import { miCompany } from "@/lib/marketIntelMock";
import { COMPANY_SOURCES, COMPETITOR_SOURCES } from "@/lib/marketIntelSources";
import { companyDivisions, readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { requireServerMemberScope } from "@/lib/memberScope";
import {
  emptyBookmarks,
  readMarketIntelBookmarks,
  readMarketIntelFollowers,
} from "@/lib/marketIntelBookmarks";
import { DivisionEditor } from "@/components/market-intel/DivisionChips";
import { CompanyAdminControls } from "@/components/market-intel/CompanyAdminControls";
import { WatchStatus } from "@/components/market-intel/WatchStatus";
import { isInactive } from "@/lib/marketIntelWatchState";
import { MiSectionMarker } from "@/components/market-intel/MiSection";
import { MyListToggle } from "@/components/market-intel/MyListToggle";
import type { Division } from "@/lib/offeringMaterials";
import { moduleWriteRefusal, requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

// Name the company in the tab. Anyone watching the market keeps five of these
// open at once, and five tabs all reading "Freyr Sales Intelligence" is no
// better than none.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tracked = await readMarketIntelTracking()
    .then((t) => t.companies.find((c) => c.id === id)?.name)
    .catch(() => undefined);
  /**
   * The LIVE FEED is the third place a company's name can live, and it was
   * the one this missed. A competitor that exists in the scraped feed but not
   * in the tracked-companies list rendered a full briefing with its name in
   * the heading and "Market Intel" in the tab: GSK got its name, Intertek did
   * not (found Aug 14 walking the flows).
   */
  const fromFeed = tracked
    ? undefined
    : await readFeedCompany(id)
        .then((c) => c?.name)
        .catch(() => undefined);
  return { title: tracked ?? fromFeed ?? miCompany(id)?.name ?? "Market Intel" };
}

export default async function MarketIntelCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/market-intel");
  const { id } = await params;
  const tracking = await readMarketIntelTracking().catch(() => ({
    companies: [],
    people: [],
  }));
  const extraPeople = tracking.people.filter((p) => p.companyId === id);
  const sourceDefault = (companyId: string): Division[] =>
    ([...COMPANY_SOURCES, ...COMPETITOR_SOURCES].find((s) => s.id === companyId)?.divisions ??
      []) as Division[];
  /* Who may change this company's tags, and who may take it off the watch:
     the module's write privilege for the tags; the person who added it, or
     an admin, for the removal (Sep 10). */
  const canEdit = !(await moduleWriteRefusal("/market-intel"));
  const [user, followers, myScope] = await Promise.all([
    getCurrentUser(),
    readMarketIntelFollowers().catch(() => ({}) as Record<string, string[]>),
    requireServerMemberScope().catch(() => null),
  ]);
  const isAdmin = user.role === "admin";
  /* WHAT THIS PERSON HAS: the tick that puts the company on their page, and
     the star, which is a favourite inside that list (Anir, Sep 10). */
  const myLists = myScope
    ? await readMarketIntelBookmarks(myScope).catch(() => emptyBookmarks())
    : emptyBookmarks();
  const onMyPage = myLists.companyIds.includes(id);
  const starred = myLists.starredIds.includes(id);
  const watchOf = (companyId: string) => ({
    followers: followers[companyId]?.length ?? 0,
    byDefault: tracking.companies.some((c) => c.id === companyId && c.activeByDefault === true),
  });

  if (getDataMode() === "live") {
    /* ONE ROW (Sep 10): the briefing reads this company's row and, for a
       customer, the rows of the people followed here. Never the whole feed. */
    const [feedCompany, intel] = await Promise.all([
      readFeedCompany(id).catch(() => null),
      readMarketIntelSummaries().catch(() => null),
    ]);
    maybeScheduleMarketIntelRefresh(intel?.meta ?? null);
    if (feedCompany) {
      const trackedConfig = tracking.companies.find((c) => c.id === id);
      const isCompetitor = feedCompany.group === "competitor";
      const peopleFeeds = isCompetitor
        ? {}
        : await readFeedPeople(extraPeople.map((p) => p.id)).catch(() => ({}));
      const withFeed = extraPeople.filter((p) => peopleFeeds[p.id]);
      const briefing = buildBriefing(
        feedCompany,
        allTrackedNames(intel ? { companies: intel.companies } : null, tracking.companies),
        withFeed.map((p) => ({
          name: p.name,
          role: p.role,
          photoUrl: p.photoUrl,
          posts: peopleFeeds[p.id]?.posts ?? [],
        }))
      );
      return (
        <>
          <MiSectionMarker section={isCompetitor ? "competitors" : "customers"} />
          {trackedConfig?.onboarding && <CollectionProgress job={trackedConfig.onboarding} />}
          <LiveCompanyBriefing
            collection={trackedConfig?.onboarding}
            briefing={{ ...briefing, logoUrl: trackedConfig?.logoUrl || briefing.logoUrl || null }}
            refreshUpdatedAt={intel?.meta.updatedAt ?? null}
            extraPeople={isCompetitor ? [] : extraPeople}
            personPosts={Object.fromEntries(
              withFeed.map((p) => [p.id, peopleFeeds[p.id]?.posts ?? []])
            )}
            divisions={companyDivisions(tracking, id, sourceDefault(id))}
            canWrite={canEdit}
            isAdmin={isAdmin}
            watch={watchOf(id)}
            onMyPage={onMyPage}
            starred={starred}
          />
        </>
      );
    }
  } else {
    const company = miCompany(id);
    if (company) {
      return <CompanyIntel company={company} extraPeople={extraPeople} />;
    }
  }

  const mine = tracking.companies.find((c) => c.id === id);
  if (mine?.onboarding) return <>
    <AutoFresh everyMs={15_000} />
    <div className="mx-auto max-w-xl"><PendingCompanyCard company={mine} divisions={companyDivisions(tracking, id, sourceDefault(id))} /></div>
  </>;

  /**
   * BACK GOES TO THE BUCKET YOU CAME FROM, NAMED CORRECTLY.
   *
   * This module has three buckets — Customer Intelligence, Competitor
   * Intelligence and Market Intelligence — and these two empty states both
   * hardcoded the label "Market Intelligence" while pointing at
   * /market-intel, which is the CUSTOMER bucket. So a competitor with no
   * activity yet offered a back arrow naming a third bucket and landing on a
   * second one (found Aug 14 walking the flows). The live briefing beside
   * them has always done this properly; these two just never matched it.
   */
  const backHref =
    mine?.group === "competitor"
      ? "/market-intel?tab=competitors"
      : "/market-intel";
  const backLabel =
    mine?.group === "competitor"
      ? "Competitor Intelligence"
      : "Customer Intelligence";
  if (!mine) {
    return (
      <div>
        <AutoFresh />
        <SmartBack
          fallback={backHref}
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={14} strokeWidth={2} /> {backLabel}
        </SmartBack>
        {/* NOT TRACKED IS NOT THE SAME AS TRACKED AND QUIET (found Aug 16,
            opening company links that do not exist). This branch runs when the
            id matched nothing at all — not the live feed, not the sample set,
            not the tracked list — and it used to answer "This company is on
            the watchlist… tracked for signals". So /market-intel/pfizer said
            Pfizer was being tracked, and so did a typo. In a sales-intelligence
            product that is a claim somebody repeats in a meeting. The
            tracked-but-quiet wording it borrowed belongs to the branch below,
            where the company really is on the list. */}
        <EmptyState
          icon={Radar}
          title="Nothing is tracked under this link"
          description="This link no longer works, or the company was never added. Open a company from the dashboard, or add one with “Track a company”."
        />
      </div>
    );
  }

  // A company the team added: real configuration, honestly empty briefing.
  const people = tracking.people.filter((p) => p.companyId === mine.id);
  const addedOn = new Date(mine.addedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const idle = isInactive(watchOf(mine.id));
  return (
    <div>
      <MiSectionMarker section={mine.group === "competitor" ? "competitors" : "customers"} />
      <SmartBack
        fallback={backHref}
        className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> {backLabel}
      </SmartBack>

      {/* ONE LINE, THE SAME AS A LIVE BRIEFING (Anir, Sep 11: "confusing ui and
          clean it up. minimal space"). */}
      <div className="rise-in flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <MiLogo logoUrl={mine.logoUrl} name={mine.name} className="h-9 w-9 shrink-0" />
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-text-primary">{mine.name}</h1>
        <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-bold text-[color:var(--ink-bright-blue)]">
          New
        </span>
        {isAdmin && <WatchStatus state={watchOf(mine.id)} />}
        <DivisionEditor
          companyId={mine.id}
          companyName={mine.name}
          divisions={companyDivisions(tracking, mine.id, sourceDefault(mine.id))}
          canEdit={canEdit}
        />
        <span className="text-[12px] text-text-tertiary">
          {[mine.industry, mine.hq].filter(Boolean).join(" · ") || `Tracked since ${addedOn}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <MyListToggle
            companyId={mine.id}
            companyName={mine.name}
            onMyPage={onMyPage}
            starred={starred}
          />
          {isAdmin && (
            <CompanyAdminControls
              companyId={mine.id}
              companyName={mine.name}
              group={mine.group === "competitor" ? "competitor" : "customer"}
              followers={followers[mine.id]?.length ?? 0}
              compact
            />
          )}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(0,113,227,0.08)] text-blue-primary">
                <Hourglass size={18} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">
                  {idle ? "Nothing is being collected yet." : "Tracking is set up. The first briefing is on its way."}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                  {idle
                    ? `${mine.name} joined the watch on ${addedOn}. Nobody has it on their list, so collecting starts when somebody ticks it.`
                    : `${mine.name} joined the watch on ${addedOn}. From the next refresh this page fills with the same briefing the other companies have: summarized news and competitive signals from the past 3 months${mine.linkedinUrl || people.length > 0 ? ", plus LinkedIn activity" : ""}.`}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--ink-bright-blue)]">
                  <LinkedInIcon size={12} /> LinkedIn activity
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                  {mine.group === "competitor"
                    ? mine.linkedinUrl
                      ? "Posts from their LinkedIn page."
                      : "No LinkedIn page on file, so this starts with news."
                    : `Posts from the ${people.length === 1 ? "person" : "people"} you follow${people.length ? "" : ", once someone is added"}.`}
                </p>
              </div>
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--ink-teal-deep)]">
                  <Newspaper size={12} strokeWidth={2.2} /> News
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                  {mine.keywords.length
                    ? `Articles matching ${mine.keywords.join(", ")}.`
                    : "Articles mentioning the company, with summaries and links."}
                </p>
              </div>
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--ink-violet-soft)]">
                  <Radar size={12} strokeWidth={2.2} /> Signals
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                  Hiring, leadership, expansion and competitor moves worth a
                  call.
                </p>
              </div>
            </div>
          </Card>

          {(mine.note || mine.website || mine.linkedinUrl) && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Building2 size={14} strokeWidth={2} className="text-blue-primary" />
                About this watch
              </h2>
              {mine.note && (
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                  {mine.note}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                {mine.website && (
                  <a
                    href={mine.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                  >
                    <Globe2 size={12} strokeWidth={2.2} /> Website
                  </a>
                )}
                {mine.linkedinUrl && (
                  <a
                    href={mine.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                  >
                    <LinkedInIcon size={12} /> LinkedIn page
                  </a>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* NO PEOPLE ON A COMPETITOR (Saras, Sep 10). */}
          {mine.group !== "competitor" && (
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Users size={14} strokeWidth={2} className="text-blue-primary" />
              People tracked
              {canEdit && <TrackPersonButton companyId={mine.id} companyName={mine.name} />}
            </h2>
            {people.length === 0 ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary">
                Nobody yet. Add the senior people whose posts you want to see,
                with the plus above.
              </p>
            ) : (
              <TrackedPeopleList people={people} />
            )}
          </Card>
          )}

          {mine.competitors.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Swords size={14} strokeWidth={2} className="text-blue-primary" />
                Competitors watched
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {mine.competitors.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-[rgba(180,49,143,0.10)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--ink-magenta)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-text-tertiary">
                Mentions of these names alongside {mine.name} become
                competitive signals.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
