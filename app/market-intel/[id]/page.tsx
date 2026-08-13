import Link from "next/link";
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
import { StopTrackingButton } from "@/components/market-intel/StopTrackingButton";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { getDataMode } from "@/lib/dataMode";
import {
  allTrackedNames,
  buildBriefing,
  readMarketIntelFeed,
} from "@/lib/marketIntelFeed";
import { maybeScheduleMarketIntelRefresh } from "@/lib/marketIntelRefresh";
import { miCompany } from "@/lib/marketIntelMock";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

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

  if (getDataMode() === "live") {
    // Real mode renders scraped data only; the sample briefings stay in mock.
    const feed = await readMarketIntelFeed().catch(() => null);
    maybeScheduleMarketIntelRefresh(feed);
    const feedCompany = feed?.companies[id];
    if (feedCompany) {
      const trackedConfig = tracking.companies.find((c) => c.id === id);
      const withFeed = extraPeople.filter((p) => feed?.people?.[p.id]);
      const briefing = buildBriefing(
        feedCompany,
        allTrackedNames(feed, tracking.companies),
        withFeed.map((p) => ({
          name: p.name,
          role: p.role,
          photoUrl: p.photoUrl,
          posts: feed?.people?.[p.id]?.posts ?? [],
        }))
      );
      return (
        <LiveCompanyBriefing
          briefing={briefing}
          subtitle={
            [trackedConfig?.industry, trackedConfig?.hq]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          extraPeople={extraPeople}
          personPosts={Object.fromEntries(
            withFeed.map((p) => [p.id, feed?.people?.[p.id]?.posts ?? []])
          )}
        />
      );
    }
  } else {
    const company = miCompany(id);
    if (company) {
      return <CompanyIntel company={company} extraPeople={extraPeople} />;
    }
  }

  const mine = tracking.companies.find((c) => c.id === id);
  if (!mine) {
    return (
      <div>
        <AutoFresh />
        <SmartBack
          fallback="/market-intel"
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={14} strokeWidth={2} /> Market Intelligence
        </SmartBack>
        <EmptyState
          icon={Radar}
          title="This company is on the watchlist"
          description="It is tracked for signals but has no notable activity in the sample window yet. Open one of the companies on the dashboard to see a full briefing."
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
  return (
    <div>
      <SmartBack
        fallback="/market-intel"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Market Intelligence
      </SmartBack>

      <div className="rise-in flex flex-wrap items-center gap-4">
        <CompanyLogo name={mine.name} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[24px] font-bold tracking-[-0.02em] text-text-primary">
            {mine.name}
            <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-bold text-[color:#0071E3]">
              New
            </span>
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {[mine.industry, mine.hq].filter(Boolean).join(" · ") ||
              `Tracked since ${addedOn}`}
          </p>
        </div>
        <StopTrackingButton companyId={mine.id} companyName={mine.name} />
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
                  Tracking is set up. The first briefing is on its way.
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                  {mine.name} joined the watch on {addedOn}. From the next
                  refresh this page fills with the same briefing the other
                  companies have: LinkedIn activity, summarized news and
                  competitive signals from the past 3 months.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:#0071E3]">
                  <LinkedInIcon size={12} /> LinkedIn activity
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                  Posts from the {people.length === 1 ? "person" : "people"}{" "}
                  you follow{people.length ? "" : ", once someone is added"}.
                </p>
              </div>
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:#0F766E]">
                  <Newspaper size={12} strokeWidth={2.2} /> News
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                  {mine.keywords.length
                    ? `Articles matching ${mine.keywords.join(", ")}.`
                    : "Articles mentioning the company, with summaries and links."}
                </p>
              </div>
              <div className="rounded-lg border border-border-light bg-surface p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:#7C3AED]">
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
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Users size={14} strokeWidth={2} className="text-blue-primary" />
              People tracked
              <TrackPersonButton companyId={mine.id} companyName={mine.name} />
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
                    className="rounded-full bg-[rgba(180,49,143,0.10)] px-2.5 py-1 text-[12px] font-semibold text-[color:#B4318F]"
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
