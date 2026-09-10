"use client";

import { safeHref } from "@/lib/safeUrl";
import { fmtWhen } from "@/lib/whenLabel";
import { SmartBack } from "@/components/ui/BackButton";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  Filter,
  Globe2,
  History,
  LayoutGrid,
  List,
  MessageSquare,
  Newspaper,
  Radar,
  Repeat2,
  Sparkles,
  Star,
  Sun,
  Swords,
  Table2,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AutoFresh } from "@/components/market-intel/AutoFresh";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { useToast } from "@/components/ui/Toast";
import { Sparkline } from "@/components/charts/Charts";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionEditor } from "@/components/market-intel/DivisionChips";
import { SignalRow } from "@/components/market-intel/SignalRow";
import { StopTrackingButton } from "@/components/market-intel/StopTrackingButton";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { cn } from "@/lib/utils";
import {
  ITEM_TAG_META,
  SIGNAL_ICON,
  SIGNAL_META,
  type ItemLabel,
  type ItemTag,
  type SignalKind,
} from "@/lib/marketIntelSignals";
import { groupStories, type StoryGroup, type StoryInput } from "@/lib/marketIntelStories";
import type { BriefingPost, FeedNews, FeedPost, LiveBriefing, LiveSignal } from "@/lib/marketIntelFeed";
import type { TrackedPerson } from "@/lib/marketIntelTracking";
import type { Division } from "@/lib/offeringMaterials";
import { useStoredView } from "@/lib/useStoredView";
import { tint } from "@/lib/tint";

/**
 * ONE COMPANY, REAL DATA ONLY. Every post links to the actual LinkedIn post,
 * every article to the actual story, every signal cites the item it was
 * detected in. Rendered in live mode; mock mode keeps the sample briefings.
 *
 * Sep 10 (Saras's meeting): the nine signals sit in a row at the top and
 * each is a filter; the source dropdown is a visible bar; an item that
 * carries a signal wears it on its own card instead of appearing twice; the
 * same story from several sources is one card with the other sources named
 * under it; a competitor's briefing shows only what concerns Freyr's
 * industries unless you ask for everything; thought leadership and awards
 * have chips of their own; and nobody is followed at a competitor.
 */

type Source = "all" | "company" | "people" | "news" | "site" | "signal" | "thought" | "award";

const NEWS_VIEWS = ["rows", "tiles", "table"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];

/** Date, plus the time when the record actually carries one. */
const fmtDate = fmtWhen;

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

type Item = StoryInput & {
  kind: "company" | "people" | "news" | "site";
  url: string;
  sourceLabel: string;
  label?: ItemLabel;
  signal?: LiveSignal;
  post?: BriefingPost;
  news?: FeedNews;
};

export function LiveCompanyBriefing({
  briefing,
  subtitle,
  extraPeople = [],
  personPosts = {},
  divisions = [],
  canWrite = false,
  canRemove = false,
  tracked = false,
}: {
  briefing: LiveBriefing;
  subtitle?: string;
  extraPeople?: TrackedPerson[];
  /** Collected posts per tracked person id; a missing key means no sync yet. */
  personPosts?: Record<string, FeedPost[]>;
  divisions?: Division[];
  /** May this viewer change the watch (tags, people)? The module's write privilege. */
  canWrite?: boolean;
  /** May this viewer take the company off the watch: the adder, or an admin. */
  canRemove?: boolean;
  /** True when the company was added by the team (not the built-in list). */
  tracked?: boolean;
}) {
  const { toast } = useToast();
  const isCompetitor = briefing.group === "competitor";
  const [source, setSource] = useState<Source>("all");
  const [signalPick, setSignalPick] = useState<SignalKind | null>(null);
  /* A COMPETITOR SHOWS WHAT CONCERNS US BY DEFAULT (Saras, Sep 10: "only if
     their posts are related to these industries should they show up here").
     Nothing is thrown away: the switch shows everything, with a count. */
  const [relevantOnly, setRelevantOnly] = useState(isCompetitor);
  const [viewOpen, setViewOpen] = useState(false);
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
  const [bookmarked, setBookmarked] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/market-intel/bookmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive) setBookmarked(Array.isArray(data?.companyIds) && data.companyIds.includes(briefing.id));
      })
      .catch(() => {
        if (alive) setBookmarked(false);
      });
    return () => {
      alive = false;
    };
  }, [briefing.id]);

  useEffect(() => {
    if (!viewOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!viewRef.current?.contains(event.target as Node)) setViewOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [viewOpen]);

  async function toggleBookmark() {
    const next = !(bookmarked ?? false);
    setBookmarked(next);
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: briefing.id, on: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Could not save.");
      toast(next ? `${briefing.name} is on your list.` : `${briefing.name} is off your list.`);
    } catch (caught) {
      setBookmarked(!next);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  const up = (briefing.momentumPct ?? 0) >= 0;
  const cutoff = Date.now() - Number(range) * 86_400_000;
  const inRange = (iso: string | null) => !iso || Date.parse(iso) > cutoff;
  const q = query.trim().toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) =>
    !q || parts.some((part) => part?.toLowerCase().includes(q));

  /* EVERY ITEM ONCE. A signal is a property of the post or article it was
     found in, so it rides on that card instead of adding a second one. */
  const signalByUrl = new Map(briefing.signals.map((s) => [s.url, s]));
  const items: Item[] = [
    ...briefing.posts.map<Item>((p) => ({
      key: p.url,
      kind: p.by ? "people" : "company",
      title: p.text.split("\n")[0].slice(0, 160),
      body: p.text,
      date: p.date,
      url: p.url,
      sourceLabel: p.by ? p.by.name : briefing.name,
      label: p.label,
      signal: signalByUrl.get(p.url),
      post: p,
    })),
    ...briefing.news.map<Item>((n) => ({
      key: n.url,
      kind: "news",
      title: n.title,
      body: n.summary ?? null,
      date: n.published,
      url: n.url,
      sourceLabel: n.source,
      label: n.label,
      signal: signalByUrl.get(n.url),
      news: n,
    })),
    ...(briefing.site ?? []).map<Item>((n) => ({
      key: n.url,
      kind: "site",
      title: n.title,
      body: n.summary ?? null,
      date: n.published,
      url: n.url,
      sourceLabel: n.source,
      label: n.label,
      signal: signalByUrl.get(n.url),
      news: n,
    })),
  ]
    /* ONE PAGE, ONE ITEM. A press release on the company's own site is also
       picked up by the news wire under the very same link; the site copy
       wins because "published by them" is the truer label for their URL. */
    .sort((a, b) => (a.kind === "site" ? -1 : 0) - (b.kind === "site" ? -1 : 0))
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));

  const concerns = (i: Item) => !relevantOnly || !i.label || i.label.relevant;
  const matched = items.filter((i) => inRange(i.date) && hit(i.title, i.body, i.sourceLabel, i.signal?.why));
  const base = matched.filter(concerns);
  const hiddenByRelevance = matched.length - base.length;

  const signalCounts: Partial<Record<SignalKind, number>> = {};
  for (const i of base) if (i.signal) signalCounts[i.signal.kind] = (signalCounts[i.signal.kind] ?? 0) + 1;
  const hasTag = (i: Item, tag: ItemTag) => !!i.label?.tags.includes(tag);

  const SOURCES: { key: Source; label: string; icon: LucideIcon; color: string; count: number; always: boolean }[] = [
    { key: "all" as Source, label: "Everything", icon: Radar, color: "var(--ink-bright-blue)", count: base.length, always: true },
    { key: "company" as Source, label: "Company posts", icon: Building2, color: "var(--ink-bright-blue)", count: base.filter((i) => i.kind === "company").length, always: true },
    ...(isCompetitor
      ? []
      : [{ key: "people" as Source, label: "People posts", icon: Users, color: "var(--ink-magenta)", count: base.filter((i) => i.kind === "people").length, always: true }]),
    { key: "news" as Source, label: "News", icon: Newspaper, color: "var(--ink-teal-deep)", count: base.filter((i) => i.kind === "news").length, always: true },
    { key: "site" as Source, label: "Their website", icon: Globe2, color: "var(--ink-orange)", count: base.filter((i) => i.kind === "site").length, always: true },
    { key: "signal" as Source, label: "Signals", icon: Radar, color: "var(--ink-violet-soft)", count: base.filter((i) => !!i.signal).length, always: true },
    { key: "thought" as Source, label: ITEM_TAG_META["thought-leadership"].label, icon: ITEM_TAG_META["thought-leadership"].icon, color: ITEM_TAG_META["thought-leadership"].color, count: base.filter((i) => hasTag(i, "thought-leadership")).length, always: isCompetitor },
    { key: "award" as Source, label: ITEM_TAG_META.award.label, icon: ITEM_TAG_META.award.icon, color: ITEM_TAG_META.award.color, count: base.filter((i) => hasTag(i, "award")).length, always: isCompetitor },
  ].filter((s) => s.always || s.count > 0);

  const passesSource = (i: Item) =>
    source === "all" ||
    (source === "signal"
      ? !!i.signal
      : source === "thought"
        ? hasTag(i, "thought-leadership")
        : source === "award"
          ? hasTag(i, "award")
          : i.kind === source);
  const filtered = base
    .filter(passesSource)
    .filter((i) => !signalPick || i.signal?.kind === signalPick);
  const groups = groupStories(filtered);

  // ---------------------------------------------------------------- cards
  const tagChips = (item: Item) =>
    (item.label?.tags ?? []).map((tag) => {
      const meta = ITEM_TAG_META[tag];
      const TIcon = meta.icon;
      return (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
          style={{ color: meta.color, background: tint(meta.color, 8) }}
        >
          <TIcon size={10.5} strokeWidth={2.2} /> {meta.label}
        </span>
      );
    });

  const signalChip = (signal: LiveSignal) => {
    const meta = SIGNAL_META[signal.kind];
    const SIcon = SIGNAL_ICON[signal.kind];
    return (
      <span
        title={meta.label}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
        style={{ color: meta.color, background: tint(meta.color, 8) }}
      >
        <SIcon size={10.5} strokeWidth={2.2} /> {meta.short}
      </span>
    );
  };

  const whyLine = (signal: LiveSignal) => (
    <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
      <span className="font-semibold text-text-primary">Why it matters: </span>
      {signal.why}
    </p>
  );

  /* ONE STORY, MANY SOURCES (Saras, Sep 10): the others are named under the
     card rather than shown again as cards of their own. */
  const othersLine = (group: StoryGroup<Item>) =>
    group.others.length > 0 ? (
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-light pt-2 text-[11.5px] text-text-tertiary">
        <span>
          {group.lead.kind === "company" || group.lead.kind === "people"
            ? "Also posted by:"
            : "Other sources talking about this:"}
        </span>
        {group.others.map((o, i) => (
          <a
            key={`${o.key}-${i}`}
            href={safeHref(o.url) as string}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-text-secondary hover:text-blue-primary"
          >
            {o.sourceLabel} <ExternalLink size={10} strokeWidth={2.2} />
          </a>
        ))}
      </p>
    ) : null;

  const cardStyle = (item: Item) =>
    item.signal ? { borderLeftColor: SIGNAL_META[item.signal.kind].color } : undefined;
  const cardClass = (item: Item) => cn("p-4", item.signal && "border-l-[3px]");

  const postCard = (group: StoryGroup<Item>, key: string) => {
    const item = group.lead;
    const post = item.post!;
    // COUNT CHARACTERS, NOT UTF-16 UNITS. LinkedIn posts are full of styled
    // unicode, where one visible character is two units, so slicing by
    // index could split one and React would throw a hydration error.
    const chars = Array.from(post.text);
    const isLong = chars.length > 420;
    const open = expanded.has(post.url);
    return (
      <Card key={key} className={cardClass(item)} style={cardStyle(item)}>
        {(item.signal || (item.label?.tags.length ?? 0) > 0) && (
          <p className="mb-2 flex flex-wrap items-center gap-2">
            {item.signal && signalChip(item.signal)}
            {tagChips(item)}
          </p>
        )}
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
              <span
                className="text-[11.5px] text-text-tertiary"
                suppressHydrationWarning
              >
                {post.by
                  ? `${post.by.role || "Tracked person"} · ${fmtDate(post.date)}`
                  : `Company page · ${fmtDate(post.date)}`}
              </span>
              <a
                href={safeHref(post.url) as string}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on LinkedIn"
                title="Open on LinkedIn"
                className="ml-auto flex items-center gap-1 text-[color:var(--ink-bright-blue)] transition-opacity hover:opacity-70"
              >
                <LinkedInIcon size={13} />
                <ExternalLink size={12} strokeWidth={2.2} />
              </a>
            </p>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-text-primary">
              {isLong && !open
                ? `${chars.slice(0, 420).join("").trimEnd()}…`
                : post.text}
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
            {item.signal && whyLine(item.signal)}
            {othersLine(group)}
          </div>
        </div>
      </Card>
    );
  };

  const articleCard = (group: StoryGroup<Item>, key: string) => {
    const item = group.lead;
    const article = item.news!;
    const own = item.kind === "site";
    return (
      <Card key={key} className={cardClass(item)} style={cardStyle(item)}>
        <p className="flex flex-wrap items-center gap-2">
          {item.signal && signalChip(item.signal)}
          {own ? (
            /* THE COMPANY'S OWN PAGE, said plainly: a warm chip and
               "Published by them", because a reporter's account and the
               company's own statement are different claims. */
            <>
              <span className="flex items-center gap-1 rounded-full bg-[rgba(194,65,12,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-orange)]">
                <Globe2 size={10.5} strokeWidth={2.2} /> {article.source}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                Published by them
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-teal-deep)]">
              <Newspaper size={10.5} strokeWidth={2.2} /> {article.source}
            </span>
          )}
          {tagChips(item)}
          <span className="text-[11.5px] text-text-tertiary" suppressHydrationWarning>
            {fmtDate(article.published)}
          </span>
        </p>
        <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
          {article.title}
        </h3>
        {article.summary && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {article.summary}{" "}
            <span className="inline-flex translate-y-[1px] items-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              <Sparkles size={9} strokeWidth={2.2} /> AI summary
            </span>
          </p>
        )}
        <a
          href={safeHref(article.url) as string}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
        >
          {own ? "Read it on their site" : "Read the article"}
          <ExternalLink size={11} strokeWidth={2.2} />
        </a>
        {item.signal && whyLine(item.signal)}
        {othersLine(group)}
      </Card>
    );
  };

  const TABLE_TAG = {
    post: { color: "var(--ink-bright-blue)" },
    news: { color: "var(--ink-teal-deep)" },
    site: { color: "var(--ink-orange)" },
  } as const;

  return (
    <div>
      {/* A briefing left open must keep pulling fresh server data. */}
      <AutoFresh />
      <SmartBack
        fallback={isCompetitor ? "/market-intel?tab=competitors" : "/market-intel"}
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} />{" "}
        {isCompetitor ? "Competitor Intelligence" : "Customer Intelligence"}
      </SmartBack>

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
              /* A COUNT, NOT A TREND, and an exact one: nothing is capped any
                 more (Anir, Sep 10: "if there are 1,000 items, there should be
                 1,000 items"). */
              <span
                title="Items picked up in the last 30 days: posts, articles and their own website. Not enough history yet to compare with the month before."
                className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-bold text-[color:var(--ink-bright-blue)] tnum"
              >
                <Newspaper size={12} strokeWidth={2.4} />
                {briefing.itemsThisMonth} items this month
              </span>
            ) : (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tnum"
                style={{
                  color: up ? "var(--ink-green)" : "#DC2626",
                  background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
                }}
              >
                {up ? <TrendingUp size={12} strokeWidth={2.4} /> : <TrendingDown size={12} strokeWidth={2.4} />}
                {up ? "+" : ""}
                {briefing.momentumPct}% vs last month
              </span>
            )}
            {briefing.followerCount != null && (
              <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[12px] font-semibold text-[color:var(--ink-bright-blue)] tnum">
                <LinkedInIcon size={11} /> {fmtFollowers(briefing.followerCount)} followers
              </span>
            )}
            <button
              type="button"
              onClick={() => void toggleBookmark()}
              aria-pressed={bookmarked ?? false}
              aria-label={bookmarked ? `Unfollow ${briefing.name}` : `Follow ${briefing.name}`}
              title={bookmarked ? "On your list. Click to unfollow." : "Add to your list"}
              className={cn(
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors",
                bookmarked
                  ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]"
                  : "text-text-tertiary hover:bg-surface hover:text-[#B45309]"
              )}
            >
              <Star size={15} strokeWidth={2.2} fill={bookmarked ? "currentColor" : "none"} />
            </button>
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {subtitle || "Live briefing from LinkedIn, the news wire and their own website, past 3 months"}
          </p>
          <div className="mt-1.5">
            <DivisionEditor
              companyId={briefing.id}
              companyName={briefing.name}
              divisions={divisions}
              canEdit={canWrite}
            />
          </div>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
            </span>
            Live data · updated {briefing.updatedLabel}
          </span>
          {tracked && canRemove && (
            <StopTrackingButton companyId={briefing.id} companyName={briefing.name} />
          )}
        </span>
      </div>

      {/* The rundown before any scrolling: everything that happened, in one
          breath, regenerated by AI with each refresh. */}
      {briefing.tldr && (
        <div className="rise-in mt-4 rounded-xl border border-blue-subtle bg-[rgba(0,113,227,0.04)] p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--ink-bright-blue)]">
            <Sparkles size={11} strokeWidth={2.2} /> The rundown
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-text-primary">
            {briefing.tldr}
          </p>
        </div>
      )}

      {/* THE NINE SIGNALS, AT THE TOP (Saras, Sep 10). */}
      <SignalRow className="mt-4" counts={signalCounts} active={signalPick} onPick={setSignalPick} />

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
              {isCompetitor && (
                <button
                  type="button"
                  onClick={() => setRelevantOnly((v) => !v)}
                  aria-pressed={relevantOnly}
                  title="Only items about pharma, medical devices, consumer products or regulatory work"
                  className={cn(
                    "flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                    relevantOnly
                      ? "border-transparent bg-[color:var(--ink-teal-deep)] text-white"
                      : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                  )}
                >
                  <Filter size={13} strokeWidth={2.2} />
                  {relevantOnly ? "Freyr's industries only" : "Showing everything"}
                  {relevantOnly && hiddenByRelevance > 0 && (
                    <span className="tnum opacity-85">· {hiddenByRelevance} hidden</span>
                  )}
                </button>
              )}
              <ColorSelect
                value={range}
                onChange={(v) => setRange(v as typeof range)}
                ariaLabel="Filter by time range"
                minWidth={150}
                dense
                options={[
                  { value: "1", label: "Past day", color: "var(--ink-orange)", icon: Sun },
                  { value: "7", label: "Past week", color: "var(--ink-bright-blue)", icon: CalendarDays },
                  { value: "30", label: "Past month", color: "var(--ink-violet)", icon: CalendarRange },
                  { value: "90", label: "Past 3 months", color: "var(--ink-teal-deep)", icon: History },
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

          {/* THE SOURCES, ALL VISIBLE (Saras, Sep 10: "instead of having this
              as a dropdown... can we just have it show all the options"). */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Sources">
            {SOURCES.map((s) => {
              const SIcon = s.icon;
              const on = source === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSource(s.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                    on
                      ? "border-transparent text-white"
                      : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                  )}
                  style={on ? { background: s.color } : undefined}
                >
                  <SIcon size={13} strokeWidth={2.2} />
                  {s.label}
                  <span className={cn("tnum", on ? "opacity-80" : "text-text-tertiary")}>{s.count}</span>
                </button>
              );
            })}
          </div>

          <div
            key={`${source}-${signalPick ?? "any"}-${newsView}-${range}-${relevantOnly}`}
            className={cn(
              "tab-panel",
              newsView === "tiles" && groups.length > 0
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
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        Article
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {groups.map((group, index) => {
                      const item = group.lead;
                      const rowKind = item.kind === "news" ? "news" : item.kind === "site" ? "site" : "post";
                      const color = item.signal ? SIGNAL_META[item.signal.kind].color : TABLE_TAG[rowKind].color;
                      const RowIcon = item.signal
                        ? SIGNAL_ICON[item.signal.kind]
                        : rowKind === "news"
                          ? Newspaper
                          : rowKind === "site"
                            ? Globe2
                            : (LinkedInIcon as unknown as LucideIcon);
                      return (
                        <tr key={index} className="transition-colors hover:bg-surface">
                          <td className="px-4 py-3 align-top">
                            <span
                              className="flex w-max max-w-[200px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                              style={{ color, background: tint(color, 8) }}
                            >
                              <RowIcon size={10.5} strokeWidth={2.2} />
                              {item.signal ? SIGNAL_META[item.signal.kind].short : item.sourceLabel}
                            </span>
                            {item.signal && (
                              <span className="mt-1 block max-w-[200px] truncate text-[11px] text-text-tertiary">
                                {item.sourceLabel}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="overflow-hidden text-[13px] font-semibold leading-snug text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                              {item.title}
                            </p>
                            {(item.signal?.why || item.news?.summary) && (
                              <p className="mt-0.5 overflow-hidden text-[12px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {item.signal?.why ?? item.news?.summary}
                              </p>
                            )}
                            {group.others.length > 0 && (
                              <p className="mt-0.5 text-[11px] text-text-tertiary tnum">
                                +{group.others.length} more {group.others.length === 1 ? "source" : "sources"}
                              </p>
                            )}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 align-top text-[12px] text-text-secondary"
                            suppressHydrationWarning
                          >
                            {fmtDate(item.date)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <a
                              href={safeHref(item.url) as string}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                            >
                              {rowKind === "post" ? "Open" : "Read"}{" "}
                              <ExternalLink size={11} strokeWidth={2.2} />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            ) : groups.length === 0 ? (
              <Card className="p-6 text-[13px] leading-relaxed text-text-secondary">
                {relevantOnly && hiddenByRelevance > 0 && matched.length > 0
                  ? `Nothing here concerns Freyr's industries. ${hiddenByRelevance} ${hiddenByRelevance === 1 ? "item is" : "items are"} hidden; switch to "Showing everything" to see them.`
                  : "Nothing matches the current filters. Widen the source, signal, time range or search to see more."}
              </Card>
            ) : (
              groups.map((group, index) =>
                group.lead.kind === "news" || group.lead.kind === "site"
                  ? articleCard(group, `a-${index}`)
                  : postCard(group, `p-${index}`)
              )
            )}
          </div>
        </div>

        {/* THE RAIL ANIMATES IN LIKE EVERYTHING ELSE (Anir, Sep 4). */}
        <div className="stagger space-y-4">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <TrendingUp size={14} strokeWidth={2} className="text-blue-primary" />
              Activity, last 12 weeks
            </h2>
            <p className="mt-0.5 text-[11.5px] text-text-tertiary">
              Posts, articles and website items per week.
            </p>
            <div className="mt-2">
              <Sparkline
                points={briefing.trend}
                height={44}
                xLabels={briefing.trendLabels}
                unit="items"
                label={`${briefing.name} posts, articles and website items per week`}
              />
            </div>
          </Card>

          {/* NO PEOPLE ON A COMPETITOR (Saras, Sep 10). */}
          {!isCompetitor && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Users size={14} strokeWidth={2} className="text-blue-primary" />
                People tracked
                {canWrite && <TrackPersonButton companyId={briefing.id} companyName={briefing.name} />}
              </h2>
              {extraPeople.length === 0 ? (
                <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary">
                  Nobody yet.{canWrite ? " Add the senior people whose posts you want in this feed, with the plus above." : ""}
                </p>
              ) : (
                <TrackedPeopleList people={extraPeople} personPosts={personPosts} />
              )}
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
                    className="flex items-center gap-1.5 rounded-full bg-[rgba(180,49,143,0.10)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--ink-magenta)]"
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
    </div>
  );
}
