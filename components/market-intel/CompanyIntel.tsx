"use client";

import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { useState } from "react";
import {
  ArrowLeft,
  Crown,
  ExternalLink,
  FileCheck2,
  Globe2,
  Handshake,
  LayoutGrid,
  List,
  MessageSquare,
  Newspaper,
  Radar,
  Swords,
  Table2,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

// See app/market-intel/page.tsx: the house glyph in LucideIcon slots.
const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;
import { Sparkline } from "@/components/charts/Charts";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { cn } from "@/lib/utils";
import {
  SIGNAL_META,
  miDateLabel,
  miFreshMinutes,
  type MiCompany,
  type MiSignalKind,
} from "@/lib/marketIntelMock";
import type { TrackedPerson } from "@/lib/marketIntelTracking";
import { useStoredView } from "@/lib/useStoredView";
import { tint } from "@/lib/tint";

/**
 * ONE COMPANY'S BRIEFING (Anir, Aug 10: "I can see the employees, it'll track
 * their LinkedIn, it'll scrape online news with links and summaries, and then
 * you have competitive signals. I click into each company and it gives me all
 * the information"). One chronological feed with source filters on the left,
 * the who-and-what rail on the right. All sample content.
 */

const SIGNAL_ICON: Record<MiSignalKind, LucideIcon> = {
  hiring: UserPlus,
  leadership: Crown,
  competitor: Swords,
  regulatory: FileCheck2,
  expansion: Globe2,
  deal: Handshake,
};

const SOURCE_HOME: Record<string, string> = {
  Reuters: "https://www.reuters.com",
  "Fierce Pharma": "https://www.fiercepharma.com",
  "Fierce Biotech": "https://www.fiercebiotech.com",
  "Endpoints News": "https://endpts.com",
  PharmaTimes: "https://www.pharmatimes.com",
  BioSpace: "https://www.biospace.com",
  "Regulatory Focus": "https://www.raps.org",
};

type Lens = "all" | "linkedin" | "news" | "signals";

type FeedItem =
  | { kind: "post"; daysAgo: number; personId: string; text: string; reactions: number; comments: number }
  | { kind: "news"; daysAgo: number; source: string; headline: string; summary: string }
  | { kind: "signal"; daysAgo: number; signal: MiSignalKind; title: string; detail: string; why: string };

// How the news blurbs read: full cards, a scannable grid, or a table (Anir,
// Aug 11: "a tiles view, a rows view, and maybe even a table view").
const NEWS_VIEWS = ["rows", "tiles", "table"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];
const NEWS_VIEW_META: { key: NewsView; label: string; icon: LucideIcon }[] = [
  { key: "rows", label: "Rows", icon: List },
  { key: "tiles", label: "Tiles", icon: LayoutGrid },
  { key: "table", label: "Table", icon: Table2 },
];

export function CompanyIntel({
  company,
  extraPeople = [],
}: {
  company: MiCompany;
  /** People the team added on top of the sample briefing. Never invented. */
  extraPeople?: TrackedPerson[];
}) {
  const [lens, setLens] = useState<Lens>("all");
  const [newsView, chooseNewsView] = useStoredView<NewsView>(
    "freyr.mi.news.view",
    "rows",
    NEWS_VIEWS
  );
  const personById = new Map(company.people.map((p) => [p.id, p]));

  const feed: FeedItem[] = [
    ...company.posts.map((p) => ({ kind: "post" as const, ...p })),
    ...company.news.map((n) => ({ kind: "news" as const, ...n })),
    ...company.signals.map((s) => ({
      kind: "signal" as const,
      daysAgo: s.daysAgo,
      signal: s.kind,
      title: s.title,
      detail: s.detail,
      why: s.why,
    })),
  ].sort((a, b) => a.daysAgo - b.daysAgo);

  const shown = feed.filter(
    (item) =>
      lens === "all" ||
      (lens === "linkedin" && item.kind === "post") ||
      (lens === "news" && item.kind === "news") ||
      (lens === "signals" && item.kind === "signal")
  );

  const up = company.momentum >= 0;
  const signalCounts = company.signals.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }),
    {}
  );

  const lenses: { key: Lens; label: string; icon: LucideIcon; color: string; count: number }[] = [
    { key: "all", label: "Everything", icon: Radar, color: "var(--ink-bright-blue)", count: feed.length },
    { key: "linkedin", label: "LinkedIn", icon: LinkedInGlyph, color: "var(--ink-bright-blue)", count: company.posts.length },
    { key: "news", label: "News", icon: Newspaper, color: "var(--ink-teal-deep)", count: company.news.length },
    { key: "signals", label: "Signals", icon: Radar, color: "var(--ink-violet-soft)", count: company.signals.length },
  ];

  return (
    <div>
      <SmartBack
        fallback="/market-intel"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        {/* Named for where it actually goes. The fallback is /market-intel,
            which is the CUSTOMER bucket; "Market Intelligence" is the third,
            separate bucket (M&A) and this never went there. */}
        <ArrowLeft size={14} strokeWidth={2} /> Customer Intelligence
      </SmartBack>

      {/* Header: who this is, how loud the market is about them, how fresh. */}
      <div className="rise-in flex flex-wrap items-center gap-4">
        <CompanyLogo name={company.name} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[24px] font-bold tracking-[-0.02em] text-text-primary">
            {company.name}
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tnum"
              style={{
                color: up ? "var(--ink-green)" : "#DC2626",
                background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
              }}
            >
              {up ? <TrendingUp size={12} strokeWidth={2.4} /> : <TrendingDown size={12} strokeWidth={2.4} />}
              {up ? "+" : ""}
              {company.momentum}% vs last month
            </span>
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {company.industry} · {company.hq}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1A7A35] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
          </span>
          Updated {miFreshMinutes(company.id)} min ago
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------ the feed */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {lenses.map((l) => {
              const LIcon = l.icon;
              const active = lens === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLens(l.key)}
                  aria-pressed={active}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                    active
                      ? "border-transparent text-white"
                      : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                  )}
                  style={active ? { background: l.color } : undefined}
                >
                  <LIcon size={13} strokeWidth={2.2} />
                  {l.label}
                  <span className={cn("tnum", active ? "opacity-80" : "text-text-tertiary")}>
                    {l.count}
                  </span>
                </button>
              );
            })}
            {lens === "news" && (
              <span className="ml-auto flex items-center rounded-full border border-border-light bg-white p-0.5">
                {NEWS_VIEW_META.map((view) => {
                  const VIcon = view.icon;
                  const active = newsView === view.key;
                  return (
                    <button
                      key={view.key}
                      type="button"
                      onClick={() => chooseNewsView(view.key)}
                      aria-pressed={active}
                      aria-label={`${view.label} view`}
                      title={view.label}
                      className={cn(
                        "flex cursor-pointer items-center justify-center rounded-full px-2.5 py-1 transition-colors",
                        active
                          ? "bg-blue-primary text-white"
                          : "text-text-tertiary hover:text-text-primary"
                      )}
                    >
                      <VIcon size={13} strokeWidth={2.2} />
                    </button>
                  );
                })}
              </span>
            )}
          </div>

          <div
            key={`${lens}${lens === "news" ? `-${newsView}` : ""}`}
            className={cn(
              "tab-panel",
              lens === "news" && newsView === "tiles"
                ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                : "space-y-2.5"
            )}
          >
            {lens === "news" && newsView === "table" ? (
              <Card className="overflow-x-auto p-0">
                <table className="min-w-[560px] w-full">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        Source
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        What happened
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        When
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        Article
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {[...company.news]
                      .sort((a, b) => a.daysAgo - b.daysAgo)
                      .map((item, index) => (
                        <tr key={index} className="transition-colors hover:bg-surface">
                          <td className="px-4 py-3 align-top">
                            <span className="flex w-max items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-teal-deep)]">
                              <Newspaper size={10.5} strokeWidth={2.2} />
                              {item.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-[13px] font-semibold leading-snug text-text-primary">
                              {item.headline}
                            </p>
                            <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">
                              {item.summary}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top text-[12px] text-text-secondary">
                            {miDateLabel(item.daysAgo)}
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <a
                              href={SOURCE_HOME[item.source] || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                            >
                              Read <ExternalLink size={11} strokeWidth={2.2} />
                            </a>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Card>
            ) : lens === "news" && newsView === "tiles" ? (
              [...company.news]
                .sort((a, b) => a.daysAgo - b.daysAgo)
                .map((item, index) => (
                  <Card key={index} className="flex flex-col p-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-teal-deep)]">
                        <Newspaper size={10.5} strokeWidth={2.2} /> {item.source}
                      </span>
                      <span className="text-[11.5px] text-text-tertiary">
                        {miDateLabel(item.daysAgo)}
                      </span>
                    </p>
                    <h3 className="mt-1.5 flex-1 text-[13.5px] font-semibold leading-snug text-text-primary">
                      {item.headline}
                    </h3>
                    <a
                      href={SOURCE_HOME[item.source] || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                    >
                      Read the article <ExternalLink size={11} strokeWidth={2.2} />
                    </a>
                  </Card>
                ))
            ) : (
              shown.map((item, index) => {
              if (item.kind === "post") {
                const person = personById.get(item.personId);
                return (
                  <Card key={`p-${index}`} className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={person?.name || "Unknown"} className="h-9 w-9 shrink-0 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[13.5px] font-semibold text-text-primary">
                            {person?.name}
                          </span>
                          <span className="text-[11.5px] text-text-tertiary">
                            {person?.role} · {miDateLabel(item.daysAgo)}
                          </span>
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary">
                          {item.text}
                        </p>
                        <p className="mt-2.5 flex items-center gap-4 text-[11.5px] font-medium text-text-tertiary">
                          <span className="flex items-center gap-1 tnum">
                            <ThumbsUp size={12} strokeWidth={2} /> {item.reactions}
                          </span>
                          <span className="flex items-center gap-1 tnum">
                            <MessageSquare size={12} strokeWidth={2} /> {item.comments}
                          </span>
                          <span className="ml-auto flex items-center gap-1 text-[color:var(--ink-bright-blue)]">
                            <LinkedInIcon size={12} /> LinkedIn
                          </span>
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              }
              if (item.kind === "news") {
                return (
                  <Card key={`n-${index}`} className="p-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-teal-deep)]">
                        <Newspaper size={10.5} strokeWidth={2.2} /> {item.source}
                      </span>
                      <span className="text-[11.5px] text-text-tertiary">
                        {miDateLabel(item.daysAgo)}
                      </span>
                    </p>
                    <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
                      {item.headline}
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                      {item.summary}
                    </p>
                    <a
                      href={SOURCE_HOME[item.source] || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                    >
                      Read the article <ExternalLink size={11} strokeWidth={2.2} />
                    </a>
                  </Card>
                );
              }
              const meta = SIGNAL_META[item.signal];
              const SIcon = SIGNAL_ICON[item.signal];
              return (
                <Card
                  key={`s-${index}`}
                  className="border-l-[3px] p-4"
                  style={{ borderLeftColor: meta.color }}
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                      style={{ color: meta.color, background: tint(meta.color, 8) }}
                    >
                      <SIcon size={10.5} strokeWidth={2.2} /> {meta.label}
                    </span>
                    <span className="text-[11.5px] text-text-tertiary">
                      {miDateLabel(item.daysAgo)}
                    </span>
                  </p>
                  <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                    {item.detail}
                  </p>
                  <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
                    <span className="font-semibold text-text-primary">Why it matters: </span>
                    {item.why}
                  </p>
                </Card>
              );
              })
            )}
          </div>
        </div>

        {/* ------------------------------------------------ the rail */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <TrendingUp size={14} strokeWidth={2} className="text-blue-primary" />
              Activity, last 12 weeks
            </h2>
            <div className="mt-2">
              <Sparkline
                points={company.trend}
                height={44}
                unit="items"
                label={`${company.name} market activity`}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Users size={14} strokeWidth={2} className="text-blue-primary" />
              People tracked
              <TrackPersonButton
                companyId={company.id}
                companyName={company.name}
              />
            </h2>
            <ul className="mt-2.5 space-y-2.5">
              {company.people.map((person) => (
                <li key={person.id} className="flex items-center gap-2.5">
                  <Avatar name={person.name} className="h-8 w-8 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                      {person.name}
                    </span>
                    <span className="block truncate text-[11px] text-text-tertiary">
                      {person.role}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--ink-bright-blue)] tnum">
                    {person.posts90d} posts
                  </span>
                </li>
              ))}
            </ul>
            {/* People the team added themselves: real names, honest state,
                removable with a confirm. Their posts arrive with the refresh. */}
            {extraPeople.length > 0 && <TrackedPeopleList people={extraPeople} />}
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Radar size={14} strokeWidth={2} className="text-blue-primary" />
              Signal mix
            </h2>
            <ul className="mt-2.5 space-y-1.5">
              {(Object.keys(signalCounts) as MiSignalKind[]).map((kind) => {
                const meta = SIGNAL_META[kind];
                const SIcon = SIGNAL_ICON[kind];
                return (
                  <li key={kind} className="flex items-center gap-2">
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: meta.color, background: tint(meta.color, 8) }}
                    >
                      <SIcon size={11} strokeWidth={2.2} /> {meta.label}
                    </span>
                    <span className="ml-auto text-[12px] font-semibold text-text-secondary tnum">
                      {signalCounts[kind]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Swords size={14} strokeWidth={2} className="text-blue-primary" />
              Competitors mentioned
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {company.competitors.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-[rgba(180,49,143,0.10)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--ink-magenta)]"
                >
                  {name}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-snug text-text-tertiary">
              Named alongside {company.name} in tracked posts and articles over
              the past 90 days.
            </p>
          </Card>
        </div>
      </div>

      <p className="mt-5 text-[11px] text-text-tertiary">
        Design preview. The company is real, every person, post, article and
        signal here is illustrative sample content.
      </p>
    </div>
  );
}
