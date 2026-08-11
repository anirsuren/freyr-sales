"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Crown,
  ExternalLink,
  FileCheck2,
  Globe2,
  Handshake,
  History,
  LayoutGrid,
  List,
  MessageSquare,
  Newspaper,
  Radar,
  Repeat2,
  Sparkles,
  Sun,
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
import { ColorSelect } from "@/components/ui/ColorSelect";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { Sparkline } from "@/components/charts/Charts";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { cn } from "@/lib/utils";
import { SIGNAL_META, type MiSignalKind } from "@/lib/marketIntelMock";
import type { FeedPost, LiveBriefing } from "@/lib/marketIntelFeed";
import type { TrackedPerson } from "@/lib/marketIntelTracking";
import { useStoredView } from "@/lib/useStoredView";

/**
 * ONE COMPANY, REAL DATA ONLY. Every post links to the actual LinkedIn post,
 * every article to the actual story, every signal cites the item it was
 * detected in. Rendered in live mode; mock mode keeps the sample briefings.
 */

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

const SIGNAL_ICON: Record<MiSignalKind, LucideIcon> = {
  hiring: UserPlus,
  leadership: Crown,
  competitor: Swords,
  regulatory: FileCheck2,
  expansion: Globe2,
  deal: Handshake,
};

type Lens = "all" | "linkedin" | "news" | "signals";

const NEWS_VIEWS = ["rows", "tiles", "table"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function LiveCompanyBriefing({
  briefing,
  subtitle,
  extraPeople = [],
  personPosts = {},
}: {
  briefing: LiveBriefing;
  subtitle?: string;
  extraPeople?: TrackedPerson[];
  /** Collected posts per tracked person id; a missing key means no sync yet. */
  personPosts?: Record<string, FeedPost[]>;
}) {
  const [lens, setLens] = useState<Lens>("all");
  const [newsView, chooseNewsView] = useStoredView<NewsView>(
    "freyr.mi.news.view",
    "rows",
    NEWS_VIEWS
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // "A lot of these post a lot... you can always just filter it" (Aug 11
  // call): the feed keeps 90 days, the chips narrow the window.
  const [range, setRange] = useState<"1" | "7" | "30" | "90">("90");

  const up = (briefing.momentumPct ?? 0) >= 0;
  const cutoff = Date.now() - Number(range) * 86_400_000;
  const inRange = (iso: string | null) => !iso || Date.parse(iso) > cutoff;
  const posts = briefing.posts.filter((p) => inRange(p.date));
  const news = briefing.news.filter((n) => inRange(n.published));
  const signals = briefing.signals.filter((s) => inRange(s.date));
  // Signals are detected inside these same posts and articles, so Everything
  // counts each item once rather than repeating it as its own signal card.
  const feedCount = posts.length + news.length;

  const lenses: { key: Lens; label: string; icon: LucideIcon; color: string; count: number }[] = [
    { key: "all", label: "Everything", icon: Radar, color: "#0071E3", count: feedCount },
    { key: "linkedin", label: "LinkedIn", icon: LinkedInGlyph, color: "#0071E3", count: posts.length },
    { key: "news", label: "News", icon: Newspaper, color: "#0F766E", count: news.length },
    { key: "signals", label: "Signals", icon: Radar, color: "#7C3AED", count: signals.length },
  ];


  const signalCounts = signals.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }),
    {}
  );

  const postCard = (post: LiveBriefing["posts"][number], key: string) => {
    const isLong = post.text.length > 420;
    const open = expanded.has(post.url);
    return (
      <Card key={key} className="p-4">
        <div className="flex items-start gap-3">
          {post.by ? (
            <Avatar
              name={post.by.name}
              src={post.by.photoUrl || undefined}
              className="h-9 w-9 shrink-0 text-[11px]"
            />
          ) : (
            <MiLogo
              name={briefing.name}
              logoUrl={briefing.logoUrl}
              className="h-9 w-9 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[13.5px] font-semibold text-text-primary">
                {post.by ? post.by.name : briefing.name}
              </span>
              <span className="text-[11.5px] text-text-tertiary">
                {post.by
                  ? `${post.by.role || "Tracked person"} · ${fmtDate(post.date)}`
                  : `Company page · ${fmtDate(post.date)}`}
              </span>
            </p>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-text-primary">
              {isLong && !open ? `${post.text.slice(0, 420).trimEnd()}…` : post.text}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(post.url)) next.delete(post.url);
                    else next.add(post.url);
                    return next;
                  })
                }
                className="mt-1 cursor-pointer text-[12px] font-semibold text-blue-primary hover:underline"
              >
                {open ? "Show less" : "Show the full post"}
              </button>
            )}
            <p className="mt-2.5 flex items-center gap-4 text-[11.5px] font-medium text-text-tertiary">
              {post.reactions != null && (
                <span className="flex items-center gap-1 tnum">
                  <ThumbsUp size={12} strokeWidth={2} /> {post.reactions}
                </span>
              )}
              {post.comments != null && (
                <span className="flex items-center gap-1 tnum">
                  <MessageSquare size={12} strokeWidth={2} /> {post.comments}
                </span>
              )}
              {post.reposts != null && (
                <span className="flex items-center gap-1 tnum">
                  <Repeat2 size={13} strokeWidth={2} /> {post.reposts}
                </span>
              )}
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-[color:#0071E3] hover:underline"
              >
                <LinkedInIcon size={12} /> Open on LinkedIn
              </a>
            </p>
          </div>
        </div>
      </Card>
    );
  };

  const newsCard = (item: LiveBriefing["news"][number], key: string) => (
    <Card key={key} className="p-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:#0F766E]">
          <Newspaper size={10.5} strokeWidth={2.2} /> {item.source}
        </span>
        <span className="text-[11.5px] text-text-tertiary">
          {fmtDate(item.published)}
        </span>
      </p>
      <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
        {item.title}
      </h3>
      {item.summary && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
          {item.summary}{" "}
          <span className="inline-flex translate-y-[1px] items-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Sparkles size={9} strokeWidth={2.2} /> AI summary
          </span>
        </p>
      )}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
      >
        Read the article <ExternalLink size={11} strokeWidth={2.2} />
      </a>
    </Card>
  );

  const signalCard = (signal: LiveBriefing["signals"][number], key: string) => {
    const meta = SIGNAL_META[signal.kind];
    const SIcon = SIGNAL_ICON[signal.kind];
    return (
      <Card key={key} className="border-l-[3px] p-4" style={{ borderLeftColor: meta.color }}>
        <p className="flex flex-wrap items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
            style={{ color: meta.color, background: `${meta.color}14` }}
          >
            <SIcon size={10.5} strokeWidth={2.2} /> {meta.label}
          </span>
          <span className="text-[11.5px] text-text-tertiary">{fmtDate(signal.date)}</span>
        </p>
        <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
          {signal.title}
        </h3>
        <a
          href={signal.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
        >
          Spotted in {signal.sourceLabel} <ExternalLink size={11} strokeWidth={2.2} />
        </a>
        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">Why it matters: </span>
          {signal.why}
        </p>
      </Card>
    );
  };

  type FeedItem =
    | { kind: "post"; date: string | null; post: LiveBriefing["posts"][number] }
    | { kind: "news"; date: string | null; news: LiveBriefing["news"][number] };

  const merged: FeedItem[] = [
    ...posts.map((post) => ({ kind: "post" as const, date: post.date, post })),
    ...news.map((item) => ({ kind: "news" as const, date: item.published, news: item })),
  ].sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));

  const shown =
    lens === "all"
      ? merged
      : merged.filter((i) => (lens === "linkedin" ? i.kind === "post" : i.kind === "news"));

  return (
    <div>
      <Link
        href="/market-intel"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Market Intelligence
      </Link>

      <div className="rise-in flex flex-wrap items-center gap-4">
        <MiLogo
          name={briefing.name}
          logoUrl={briefing.logoUrl}
          className="h-12 w-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[24px] font-bold tracking-[-0.02em] text-text-primary">
            {briefing.name}
            {briefing.momentumPct === null ? (
              <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-bold text-[color:#0071E3] tnum">
                <TrendingUp size={12} strokeWidth={2.4} />
                {briefing.itemsThisMonth} items this month
              </span>
            ) : (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tnum"
                style={{
                  color: up ? "#1A7A35" : "#DC2626",
                  background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
                }}
              >
                {up ? <TrendingUp size={12} strokeWidth={2.4} /> : <TrendingDown size={12} strokeWidth={2.4} />}
                {up ? "+" : ""}
                {briefing.momentumPct}% vs last month
              </span>
            )}
            {briefing.followerCount != null && (
              <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-semibold text-[color:#0071E3] tnum">
                <LinkedInIcon size={11} /> {fmtFollowers(briefing.followerCount)} followers
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {subtitle || "Live briefing from LinkedIn and Google News, past 3 months"}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
          </span>
          Live data · updated {briefing.updatedLabel}
        </span>
      </div>

      {/* The rundown before any scrolling: everything that happened, in one
          breath, regenerated by AI with each refresh. */}
      {briefing.tldr && (
        <div className="rise-in mt-4 rounded-xl border border-blue-subtle bg-[rgba(0,113,227,0.04)] p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:#0071E3]">
            <Sparkles size={11} strokeWidth={2.2} /> The rundown
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-text-primary">
            {briefing.tldr}
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            <span className="ml-auto flex items-center gap-2">
              <ColorSelect
                value={range}
                onChange={(v) => setRange(v as typeof range)}
                ariaLabel="Filter by time range"
                minWidth={150}
                dense
                options={[
                  { value: "1", label: "Past day", color: "#C2410C", icon: Sun },
                  { value: "7", label: "Past week", color: "#0071E3", icon: CalendarDays },
                  { value: "30", label: "Past month", color: "#6D28D9", icon: CalendarRange },
                  { value: "90", label: "Past 3 months", color: "#0F766E", icon: History },
                ]}
              />
            {lens === "news" && (
              <ColorSelect
                value={newsView}
                onChange={(v) => chooseNewsView(v as NewsView)}
                ariaLabel="News layout"
                minWidth={116}
                dense
                options={[
                  { value: "rows", label: "Rows", icon: List, color: "#0071E3" },
                  { value: "tiles", label: "Tiles", icon: LayoutGrid, color: "#6D28D9" },
                  { value: "table", label: "Table", icon: Table2, color: "#0F766E" },
                ]}
              />
            )}
            </span>
          </div>

          <div
            key={`${lens}${lens === "news" ? `-${newsView}` : ""}-${range}`}
            className={cn(
              "tab-panel",
              lens === "news" && newsView === "tiles"
                ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                : "space-y-2.5"
            )}
          >
            {lens === "signals" ? (
              signals.length === 0 ? (
                <Card className="p-6 text-[13px] leading-relaxed text-text-secondary">
                  Nothing detected in the current window. Signals are spotted
                  automatically in new posts and articles: leadership changes,
                  regulatory moves, deals, expansion and hiring.
                </Card>
              ) : (
                signals.map((signal, index) => signalCard(signal, `s-${index}`))
              )
            ) : lens === "news" && newsView === "table" ? (
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
                    {news.map((item, index) => (
                      <tr key={index} className="transition-colors hover:bg-surface">
                        <td className="px-4 py-3 align-top">
                          <span className="flex w-max items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:#0F766E]">
                            <Newspaper size={10.5} strokeWidth={2.2} />
                            {item.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-[13px] font-semibold leading-snug text-text-primary">
                            {item.title}
                          </p>
                          {item.summary && (
                            <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">
                              {item.summary}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[12px] text-text-secondary">
                          {fmtDate(item.published)}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <a
                            href={item.url}
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
              news.map((item, index) => (
                <Card key={index} className="flex flex-col p-4">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:#0F766E]">
                      <Newspaper size={10.5} strokeWidth={2.2} /> {item.source}
                    </span>
                    <span className="text-[11.5px] text-text-tertiary">
                      {fmtDate(item.published)}
                    </span>
                  </p>
                  <h3 className="mt-1.5 text-[13.5px] font-semibold leading-snug text-text-primary">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="mt-1 flex-1 text-[12px] leading-snug text-text-secondary">
                      {item.summary}
                    </p>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                  >
                    Read the article <ExternalLink size={11} strokeWidth={2.2} />
                  </a>
                </Card>
              ))
            ) : shown.length === 0 ? (
              <Card className="p-6 text-[13px] leading-relaxed text-text-secondary">
                {lens === "linkedin"
                  ? "No public company page connected for this one yet, or no posts in the past 3 months."
                  : "Nothing in this window yet. The next refresh tops this up."}
              </Card>
            ) : (
              shown.map((item, index) =>
                item.kind === "post"
                  ? postCard(item.post, `p-${index}`)
                  : newsCard(item.news, `n-${index}`)
              )
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <TrendingUp size={14} strokeWidth={2} className="text-blue-primary" />
              Activity, last 12 weeks
            </h2>
            <div className="mt-2">
              <Sparkline
                points={briefing.trend}
                height={44}
                xLabels={briefing.trendLabels}
                unit="items"
                label={`${briefing.name} market activity`}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Users size={14} strokeWidth={2} className="text-blue-primary" />
              People tracked
              <TrackPersonButton companyId={briefing.id} companyName={briefing.name} />
            </h2>
            {extraPeople.length === 0 ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary">
                Nobody yet. Add the senior people whose posts you want in this
                feed, with the plus above.
              </p>
            ) : (
              <TrackedPeopleList people={extraPeople} personPosts={personPosts} />
            )}
          </Card>

          {signals.length > 0 && (
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
                        style={{ color: meta.color, background: `${meta.color}14` }}
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
          )}

          {briefing.competitorMentions.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Swords size={14} strokeWidth={2} className="text-blue-primary" />
                Competitors mentioned
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {briefing.competitorMentions.map((mention) => (
                  <span
                    key={mention.name}
                    className="flex items-center gap-1.5 rounded-full bg-[rgba(180,49,143,0.10)] px-2.5 py-1 text-[12px] font-semibold text-[color:#B4318F]"
                  >
                    {mention.name}
                    <span className="tnum font-bold">{mention.count}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-text-tertiary">
                Named alongside {briefing.name} in the collected posts and
                articles, past 3 months.
              </p>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-5 text-[11px] text-text-tertiary">
        Live data from public LinkedIn pages and Google News. Signals are
        detected automatically from those items and link to their source. The
        feed refreshes itself about once a day.
      </p>
    </div>
  );
}
