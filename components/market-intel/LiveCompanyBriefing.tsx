"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  Building2,
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
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
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

type Kind = "company" | "people" | "news" | "signal";

const NEWS_VIEWS = ["rows", "tiles", "table"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const ALL_KINDS: Kind[] = ["company", "people", "news", "signal"];
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(ALL_KINDS));
  const [kindsOpen, setKindsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const kindsRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [newsView, chooseNewsView] = useStoredView<NewsView>(
    "freyr.mi.news.view",
    "rows",
    NEWS_VIEWS
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // "A lot of these post a lot... you can always just filter it" (Aug 11
  // call): the feed keeps 90 days, the chips narrow the window.
  const [range, setRange] = useState<"1" | "7" | "30" | "90">("90");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!kindsOpen && !viewOpen) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (!kindsRef.current?.contains(t)) setKindsOpen(false);
      if (!viewRef.current?.contains(t)) setViewOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setKindsOpen(false);
        setViewOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [kindsOpen, viewOpen]);

  const up = (briefing.momentumPct ?? 0) >= 0;
  const cutoff = Date.now() - Number(range) * 86_400_000;
  const inRange = (iso: string | null) => !iso || Date.parse(iso) > cutoff;
  const q = query.trim().toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) =>
    !q || parts.some((part) => part?.toLowerCase().includes(q));
  const posts = briefing.posts.filter(
    (p) => inRange(p.date) && hit(p.text, p.by?.name, p.by?.role)
  );
  const news = briefing.news.filter(
    (n) => inRange(n.published) && hit(n.title, n.summary, n.source)
  );
  const signals = briefing.signals.filter(
    (s) => inRange(s.date) && hit(s.title, s.sourceLabel, s.why)
  );
  // Four content types, each its own toggle (Anir, Aug 11: "I can even filter
  // to only see what people are posting").
  const KIND_META: { key: Kind; label: string; icon: LucideIcon; color: string; count: number }[] = [
    { key: "company", label: "Company posts", icon: Building2, color: "#0071E3", count: posts.filter((p) => !p.by).length },
    { key: "people", label: "People posts", icon: Users, color: "#B4318F", count: posts.filter((p) => p.by).length },
    { key: "news", label: "News", icon: Newspaper, color: "#0F766E", count: news.length },
    { key: "signal", label: "Signals", icon: Radar, color: "#7C3AED", count: signals.length },
  ];
  const activeCount = KIND_META.filter((k) => kinds.has(k.key)).reduce((a, k) => a + k.count, 0);
  const allOn = kinds.size === ALL_KINDS.length;
  const kindLabel = allOn
    ? "Everything"
    : kinds.size === 1
      ? KIND_META.find((k) => kinds.has(k.key))?.label ?? "Filtered"
      : `${kinds.size} of 4 types`;
  const toggleKind = (kind: Kind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size === 1) return prev;
        next.delete(kind);
      } else next.add(kind);
      return next;
    });


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
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on LinkedIn"
                title="Open on LinkedIn"
                className="ml-auto flex items-center gap-1 text-[color:#0071E3] transition-opacity hover:opacity-70"
              >
                <LinkedInIcon size={13} />
                <ExternalLink size={12} strokeWidth={2.2} />
              </a>
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

  const TABLE_TAG = {
    post: { color: "#0071E3" },
    news: { color: "#0F766E" },
    signal: { color: "#7C3AED" },
  } as const;

  type FeedItem =
    | { kind: "company" | "people"; date: string | null; post: LiveBriefing["posts"][number] }
    | { kind: "news"; date: string | null; news: LiveBriefing["news"][number] }
    | { kind: "signal"; date: string | null; signal: LiveBriefing["signals"][number] };

  const merged: FeedItem[] = [
    ...posts.map((post) => ({
      kind: (post.by ? "people" : "company") as "people" | "company",
      date: post.date,
      post,
    })),
    ...news.map((item) => ({ kind: "news" as const, date: item.published, news: item })),
    ...signals.map((signal) => ({ kind: "signal" as const, date: signal.date, signal })),
  ].sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));

  const shown = merged.filter((i) => kinds.has(i.kind));

  /** The table layout works on every lens: one row per item, whatever it is. */
  type TableRow = {
    kind: "post" | "news" | "signal";
    tag: string;
    what: string;
    sub?: string | null;
    when: string | null;
    url: string;
  };
  const tableRows: TableRow[] = shown.map((item) =>
    item.kind === "signal"
      ? {
          kind: "signal" as const,
          tag: SIGNAL_META[item.signal.kind].label,
          what: item.signal.title,
          sub: item.signal.why,
          when: item.signal.date,
          url: item.signal.url,
        }
      : item.kind === "news"
        ? {
            kind: "news" as const,
            tag: item.news.source,
            what: item.news.title,
            sub: item.news.summary,
            when: item.news.published,
            url: item.news.url,
          }
        : {
            kind: "post" as const,
            tag: item.post.by?.name ?? briefing.name,
            what: item.post.text,
            when: item.post.date,
            url: item.post.url,
          }
  );

  return (
    <div>
      <Link
        href={
          briefing.group === "competitor"
            ? "/market-intel?tab=competitors"
            : "/market-intel"
        }
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} />{" "}
        {briefing.group === "competitor"
          ? "Competitor Intelligence"
          : "Customer Intelligence"}
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
          <SearchPriority
            query={query}
            className="mb-3 flex flex-wrap items-center gap-1.5"
          >
            <PrioritySearchInput
              grow
              className="flex-1"
              value={query}
              onChange={setQuery}
              placeholder="Search this briefing…"
              ariaLabel="Search this briefing"
              iconSize={13}
              iconClassName="left-3"
              inputClassName="h-[34px] w-full rounded-full border border-border-light bg-white pl-8 pr-3 text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-subtle"
            />
            <span className="ml-auto flex items-center gap-2">
              <div ref={kindsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setKindsOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={kindsOpen}
                  className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white pl-1.5 pr-2.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-subtle"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      color: kinds.size === 1 ? KIND_META.find((k) => kinds.has(k.key))?.color : "#0071E3",
                      background: `${(kinds.size === 1 ? KIND_META.find((k) => kinds.has(k.key))?.color : "#0071E3") ?? "#0071E3"}14`,
                    }}
                  >
                    <Radar size={13} strokeWidth={2.2} />
                  </span>
                  {kindLabel}
                  <span className="tnum text-text-tertiary">({activeCount})</span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2.2}
                    className={cn("text-text-tertiary transition-transform", kindsOpen && "rotate-180 text-blue-primary")}
                  />
                </button>
                {kindsOpen && (
                  <div
                    role="menu"
                    className="menu-in absolute right-0 top-full z-50 mt-2 w-[236px] rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
                  >
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={allOn}
                      onClick={() => setKinds(new Set(ALL_KINDS))}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors",
                        allOn ? "bg-blue-light text-text-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,113,227,0.08)] text-[color:#0071E3]">
                        <Radar size={13} strokeWidth={2.2} />
                      </span>
                      <span className="flex-1">Everything</span>
                      {allOn && <Check size={14} strokeWidth={2.4} className="text-blue-primary" />}
                    </button>
                    <div className="mx-2 my-1 border-t border-border-light" />
                    {KIND_META.map((k) => {
                      const KIcon = k.icon;
                      const on = kinds.has(k.key);
                      return (
                        <button
                          key={k.key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={on}
                          onClick={() => toggleKind(k.key)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors",
                            on ? "text-text-primary" : "text-text-tertiary hover:bg-surface hover:text-text-secondary"
                          )}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                            style={{ color: k.color, background: `${k.color}${on ? "1f" : "0f"}` }}
                          >
                            <KIcon size={13} strokeWidth={2.2} />
                          </span>
                          <span className="flex-1">
                            {k.label}{" "}
                            <span className="tnum font-normal text-[12px] text-text-tertiary">
                              ({k.count})
                            </span>
                          </span>
                          {on && <Check size={14} strokeWidth={2.4} className="text-blue-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
              <div ref={viewRef} className="relative">
                <button
                  type="button"
                  onClick={() => setViewOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={viewOpen}
                  aria-label="Layout"
                  title="Layout"
                  className="flex h-[34px] cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 transition-colors hover:border-blue-subtle"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(0,113,227,0.10)] text-blue-primary">
                    {newsView === "rows" ? (
                      <List size={14} strokeWidth={2.2} />
                    ) : newsView === "tiles" ? (
                      <LayoutGrid size={14} strokeWidth={2.2} />
                    ) : (
                      <Table2 size={14} strokeWidth={2.2} />
                    )}
                  </span>
                  <ChevronDown
                    size={12}
                    strokeWidth={2.2}
                    className={cn("text-text-tertiary transition-transform", viewOpen && "rotate-180 text-blue-primary")}
                  />
                </button>
                {viewOpen && (
                  <div
                    role="menu"
                    className="menu-in absolute right-0 top-full z-50 mt-2 flex gap-1 rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
                  >
                    {(["rows", "tiles", "table"] as NewsView[]).map((view) => {
                      const VIcon = view === "rows" ? List : view === "tiles" ? LayoutGrid : Table2;
                      const on = newsView === view;
                      return (
                        <button
                          key={view}
                          type="button"
                          role="menuitemradio"
                          aria-checked={on}
                          aria-label={view}
                          title={view}
                          onClick={() => {
                            chooseNewsView(view);
                            setViewOpen(false);
                          }}
                          className={cn(
                            "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors",
                            on
                              ? "bg-[rgba(0,113,227,0.12)] text-blue-primary"
                              : "text-text-tertiary hover:bg-surface hover:text-text-primary"
                          )}
                        >
                          <VIcon size={16} strokeWidth={2.2} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </span>
          </SearchPriority>

          <div
            key={`${[...kinds].sort().join("+")}-${newsView}-${range}`}
            className={cn(
              "tab-panel",
              newsView === "tiles" && shown.length > 0
                ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                : "space-y-2.5"
            )}
          >
            {newsView === "table" ? (
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
                    {tableRows.map((row, index) => (
                      <tr key={index} className="transition-colors hover:bg-surface">
                        <td className="px-4 py-3 align-top">
                          <span
                            className="flex w-max max-w-[180px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                            style={{
                              color: TABLE_TAG[row.kind].color,
                              background: `${TABLE_TAG[row.kind].color}14`,
                            }}
                          >
                            {row.kind === "post" ? (
                              <LinkedInIcon size={10.5} />
                            ) : row.kind === "news" ? (
                              <Newspaper size={10.5} strokeWidth={2.2} />
                            ) : (
                              <Radar size={10.5} strokeWidth={2.2} />
                            )}
                            {row.tag}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="overflow-hidden text-[13px] font-semibold leading-snug text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {row.what}
                          </p>
                          {row.sub && (
                            <p className="mt-0.5 overflow-hidden text-[12px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                              {row.sub}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[12px] text-text-secondary">
                          {fmtDate(row.when)}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                          >
                            {row.kind === "post" ? "Open" : "Read"}{" "}
                            <ExternalLink size={11} strokeWidth={2.2} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : shown.length === 0 ? (
              <Card className="p-6 text-[13px] leading-relaxed text-text-secondary">
                Nothing matches the current filters. Widen the types, time
                range or search to see more.
              </Card>
            ) : (
              shown.map((item, index) =>
                item.kind === "signal"
                  ? signalCard(item.signal, `s-${index}`)
                  : item.kind === "news"
                    ? newsCard(item.news, `n-${index}`)
                    : postCard(item.post, `p-${index}`)
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
        feed refreshes itself twice a day.
      </p>
    </div>
  );
}
