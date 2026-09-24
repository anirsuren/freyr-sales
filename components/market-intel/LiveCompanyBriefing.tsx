"use client";

import { safeHref } from "@/lib/safeUrl";
import { fmtWhen } from "@/lib/whenLabel";
import { SmartBack } from "@/components/ui/BackButton";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ExternalLink,
  Filter,
  Globe2,
  History,
  LayoutGrid,
  Loader2,
  List,
  MessageSquare,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Repeat2,
  ShieldAlert,
  Sparkles,
  Sun,
  Swords,
  Table2,
  ThumbsUp,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AutoFresh } from "@/components/market-intel/AutoFresh";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { RefreshChip } from "@/components/market-intel/NextRefresh";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionEditor } from "@/components/market-intel/DivisionChips";
import { CompanyAdminControls } from "@/components/market-intel/CompanyAdminControls";
import { WatchStatus, type WatchState } from "@/components/market-intel/WatchStatus";
import { MyListToggle } from "@/components/market-intel/MyListToggle";
import { TrackPersonButton } from "@/components/market-intel/TrackPersonControls";
import { TrackedPeopleList } from "@/components/market-intel/TrackedPeopleList";
import { cn } from "@/lib/utils";
import { SIGNAL_META, signalsFor, type ItemLabel, type SignalId } from "@/lib/marketIntelSignals";
import { groupStories, type StoryGroup, type StoryInput } from "@/lib/marketIntelStories";
import { clipText, outletName, titleFromUrl } from "@/lib/marketIntelText";
import {
  isRelevantCompanyItem,
  type BriefingPost,
  type FeedNews,
  type FeedPost,
  type LiveBriefing,
  type LiveSignal,
} from "@/lib/marketIntelFeed";
import type { TrackedPerson, TrackedCompany } from "@/lib/marketIntelTracking";
import type { Division } from "@/lib/offeringMaterials";
import { useStoredView } from "@/lib/useStoredView";
import { tint } from "@/lib/tint";
import { useCurrentDataMode } from "@/components/auth/CurrentUserProvider";

/**
 * ONE COMPANY, REAL DATA ONLY. Every post links to the actual LinkedIn post,
 * every article to the actual story, every signal cites the item it was
 * detected in. Rendered in live mode; mock mode keeps the sample briefings.
 *
 * Sep 10 (Saras's meeting): the nine signals sit in a row at the top and
 * each is a filter; source filters sit in company details; an item that
 * carries a signal wears it on its own card instead of appearing twice; the
 * same story from several sources is one card with the other sources named
 * under it; a competitor's briefing shows only what concerns Freyr's
 * industries unless you ask for everything; and nobody is followed at a
 * competitor.
 *
 * Sep 11 (Saras's Word doc): Signals is the main bar, with her ten customer or
 * nine competitor titles, and Sources sits below Signals in the details panel. Every
 * item wears at least one signal, so thought leadership and awards became
 * signals and left the Sources list.
 */

type Source = "all" | "company" | "people" | "news" | "authority" | "site";

const NEWS_VIEWS = ["rows", "tiles", "table"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];

/** Date, plus the time when the record actually carries one. */
const fmtDate = fmtWhen;


type Item = StoryInput & {
  kind: "company" | "people" | "news" | "authority" | "site";
  url: string;
  sourceLabel: string;
  label?: ItemLabel;
  signal?: LiveSignal;
  post?: BriefingPost;
  news?: FeedNews;
  personId?: string;
};

type StoryRemoval = {
  title: string;
  items: { url: string; personId?: string }[];
};

/* ONE NAME PER SOURCE (Sep 13 loop). A company's own site read "TCS.COM" on one
   story and "TCS" on the next. Their own site always shows its address; an
   outlet shows its name (outletName, shared with the cards). */
function siteSourceLabel(url: string, fallback: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname === "google.com" || hostname.endsWith(".example") ? fallback : hostname;
  } catch {
    return fallback;
  }
}

export function LiveCompanyBriefing({
  briefing,
  refreshUpdatedAt = null,
  collection,
  extraPeople = [],
  availablePeople = [],
  personPosts = {},
  divisions = [],
  canWrite = false,
  canManagePeople = false,
  isAdmin = false,
  watch = { followers: 0 },
  onMyPage = false,
  starred = false,
}: {
  briefing: LiveBriefing;
  collection?: TrackedCompany["onboarding"];
  refreshUpdatedAt?: string | null;
  extraPeople?: TrackedPerson[];
  availablePeople?: TrackedPerson[];
  /** Collected posts per tracked person id; a missing key means no sync yet. */
  personPosts?: Record<string, FeedPost[]>;
  divisions?: Division[];
  /** May this viewer change company tags? The module's write privilege. */
  canWrite?: boolean;
  /** May follow and stop following people on this customer briefing. */
  canManagePeople?: boolean;
  /** Admins: move between tabs, delete for everyone. */
  isAdmin?: boolean;
  /** Is this company on the viewer's own page, and starred there? */
  onMyPage?: boolean;
  starred?: boolean;
  /** How many people have it: Active with a count, or Inactive. */
  watch?: WatchState;
}) {
  const router = useRouter();
  const dataMode = useCurrentDataMode();
  const { toast } = useToast();
  const isCompetitor = briefing.group === "competitor";
  const [source, setSource] = useState<Source>("all");
  const [selectedSignals, setSelectedSignals] = useState<SignalId[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  /* A COMPETITOR SHOWS WHAT CONCERNS US BY DEFAULT (Saras, Sep 10: "only if
     their posts are related to these industries should they show up here").
     Nothing is thrown away: the switch shows everything, with a count. */
  const [relevantOnly, setRelevantOnly] = useState(isCompetitor);
  const [detailsView, setDetailsView] = useStoredView("freyr.mi.details", "open", ["open", "closed"] as const);
  const detailsOpen = detailsView === "open";
  const [detailsSide, setDetailsSide] = useStoredView("freyr.mi.details.side", "right", ["right", "left"] as const);
  const [newsView, chooseNewsView] = useStoredView<NewsView>(
    "freyr.mi.news.view",
    "rows",
    NEWS_VIEWS
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // "A lot of these post a lot... you can always just filter it" (Aug 11
  // call): the feed keeps 90 days, the chips narrow the window.
  const [range, setRange] = useState<"1" | "7" | "30" | "90">("90");
  const [exactDate, setExactDate] = useState("");
  const [query, setQuery] = useState("");
  const [savedArticles, setSavedArticles] = useState<Item[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedReady, setSavedReady] = useState(false);
  const savingArticlesRef = useRef(new Set<string>());
  const [savingArticles, setSavingArticles] = useState<Set<string>>(new Set());
  useEffect(() => {
    const controller = new AbortController();
    setSavedReady(false);
    setSavedArticles([]);
    fetch(`/api/market-intel/saved-articles?companyId=${encodeURIComponent(briefing.id)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => {
        setSavedArticles(data.articles.map((article: Item) => {
          const saved = { ...article, key: article.url };
          if (article.kind === "company" || article.kind === "people") {
            return {
              ...saved,
              post: {
                url: article.url,
                text: article.body || article.title,
                date: article.date,
                reactions: null,
                comments: null,
                reposts: null,
                ...(article.kind === "people"
                  ? { by: { id: `saved:${article.url}`, name: article.sourceLabel, role: "Tracked person" } }
                  : {}),
              },
            };
          }
          return { ...saved, news: { title: article.title, url: article.url, source: article.sourceLabel, published: article.date, summary: article.body ?? undefined } };
        }));
        setSavedReady(true);
      }).catch(() => { if (!controller.signal.aborted) toast("Could not load your saved articles. Reload to try again.", "error"); });
    return () => controller.abort();
  }, [briefing.id, toast]);
  const savedUrls = new Set(savedArticles.map(article => article.url));
  async function toggleArticle(item: Item) {
    if (!savedReady || savingArticlesRef.current.has(item.url)) return;
    const savedArticle = savedArticles.find(article => article.url === item.url);
    const on = !savedArticle;
    savingArticlesRef.current.add(item.url);
    setSavingArticles(new Set(savingArticlesRef.current));
    setSavedArticles(previous => on
      ? [...previous.filter(article => article.url !== item.url), item]
      : previous.filter(article => article.url !== item.url));
    try {
      const response = await fetch("/api/market-intel/saved-articles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: briefing.id, companyName: briefing.name, group: briefing.group, url: item.url, title: item.title, body: item.body, date: item.date, sourceLabel: item.sourceLabel, kind: item.kind, on }) });
      if (!response.ok) throw new Error();
      toast(on ? "Item saved to your bookmarks." : "Item removed from your bookmarks.");
    } catch {
      setSavedArticles(previous => on
        ? previous.filter(article => article.url !== item.url)
        : [...previous.filter(article => article.url !== item.url), savedArticle ?? item]);
      toast("Could not update this bookmark. Please try again.", "error");
    } finally {
      savingArticlesRef.current.delete(item.url);
      setSavingArticles(new Set(savingArticlesRef.current));
    }
  }
  const storyActionClass =
    "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary";
  const bookmarkButton = (item: Item) => (
    <button type="button" disabled={!savedReady || savingArticles.has(item.url)} onClick={() => void toggleArticle(item)}
      aria-label={`${savedUrls.has(item.url) ? "Unsave" : "Save"} item: ${item.title}`} aria-pressed={savedUrls.has(item.url)}
      aria-busy={savingArticles.has(item.url)}
      title={savedUrls.has(item.url) ? "Remove bookmark" : "Save item"}
      style={savedUrls.has(item.url) ? { color: "#d97706", backgroundColor: "#fef3c7", borderColor: "#fcd34d" } : undefined}
      className={cn(
        storyActionClass,
        "w-7 hover:bg-amber-50 hover:!text-amber-600 disabled:cursor-default",
        savedUrls.has(item.url) && "border border-amber-200 bg-amber-100 !text-amber-600 hover:bg-amber-100",
      )}>
      <Bookmark
        size={14}
        strokeWidth={2.2}
        className={savedUrls.has(item.url) ? "text-amber-600" : undefined}
        fill={savedUrls.has(item.url) ? "currentColor" : "none"}
      />
    </button>
  );
  const [removedUrls, setRemovedUrls] = useState<Set<string>>(new Set());
  const [storyRemoval, setStoryRemoval] = useState<StoryRemoval | null>(null);
  const [removingStory, setRemovingStory] = useState(false);
  const cutoff = Date.now() - Number(range) * 86_400_000;
  const localDay = (iso: string) => {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const inRange = (iso: string | null) =>
    exactDate ? Boolean(iso && localDay(iso) === exactDate) : !iso || Date.parse(iso) > cutoff;
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
      title: clipText(p.text.split("\n")[0], 160) || "View post on LinkedIn",
      body: p.text,
      date: p.date,
      url: p.url,
      sourceLabel: p.by ? p.by.name : briefing.name,
      label: p.label,
      signal: signalByUrl.get(p.url),
      post: p,
      personId: p.by?.id,
    })),
    ...briefing.news.map<Item>((n) => ({
      key: n.url,
      storyCluster: n.storyCluster,
      kind: n.provenance === "health_authority" ? "authority" : "news",
      title: n.title || titleFromUrl(n.url),
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
      storyCluster: n.storyCluster,
      kind: "site",
      title: n.title || titleFromUrl(n.url),
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

  /* THE RAIL COUNTS THE PAGE'S WINDOW (Sep 13 loop). Each person's badge
     counted every post kept, up to 120 days, beside a People posts chip that
     counts the past 3 months: GSK's rail added up to 36 against a chip of 15,
     and Bayer's Daljit showed 30 posts with none of them on the page. */
  const railCutoff = Date.now() - 90 * 86_400_000;
  const railPosts: Record<string, FeedPost[]> = Object.fromEntries(
    Object.entries(personPosts).map(([id, posts]) => [
      id,
      posts.filter((post) => !post.date || Date.parse(post.date) > railCutoff),
    ])
  );

  const concerns = (i: Item) =>
    !relevantOnly || isRelevantCompanyItem(briefing.group, i);
  const availableItems = [...(savedOnly ? savedArticles.map(saved => items.find(item => item.url === saved.url) ?? saved) : items)]
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
  const matched = availableItems.filter((i) => inRange(i.date) && hit(i.title, i.body, i.sourceLabel, i.signal?.why));
  const base = matched.filter(concerns);
  const hiddenByRelevance = matched.length - base.length;

  /* An item with several signals counts under each of them. */
  const kindsOf = (i: Item): SignalId[] => i.signal?.kinds ?? ["others"];
  const signalCounts: Partial<Record<SignalId, number>> = {};
  for (const i of base) for (const kind of kindsOf(i)) signalCounts[kind] = (signalCounts[kind] ?? 0) + 1;

  const SOURCES: { key: Source; label: string; icon: LucideIcon; color: string; count: number; always: boolean }[] = [
    { key: "all" as Source, label: "All sources", icon: Radar, color: "var(--ink-bright-blue)", count: base.length, always: true },
    { key: "company" as Source, label: "LinkedIn posts: company", icon: Building2, color: "var(--ink-bright-blue)", count: base.filter((i) => i.kind === "company").length, always: true },
    ...(isCompetitor
      ? []
      : [{ key: "people" as Source, label: "LinkedIn posts: people", icon: Users, color: "var(--ink-magenta)", count: base.filter((i) => i.kind === "people").length, always: true }]),
    { key: "news" as Source, label: "News", icon: Newspaper, color: "var(--ink-teal-deep)", count: base.filter((i) => i.kind === "news").length, always: true },
    ...(!isCompetitor ? [{ key: "authority" as Source, label: "Health authorities", icon: ShieldAlert, color: "#C2410C", count: base.filter((i) => i.kind === "authority").length, always: true }] : []),
    { key: "site" as Source, label: "Company website", icon: Globe2, color: "var(--ink-orange)", count: base.filter((i) => i.kind === "site").length, always: true },
  ].filter((s) => s.always || s.count > 0);

  const passesSource = (i: Item) => source === "all" || i.kind === source;
  const filtered = base
    .filter(passesSource)
    .filter((i) => selectedSignals.length === 0 || selectedSignals.some((signal) => kindsOf(i).includes(signal)))
    .filter((i) => !selectedCompetitor || i.signal?.competitors?.includes(selectedCompetitor));
  const groups = groupStories(filtered).filter((group) =>
    [group.lead, ...group.others].every((item) => !removedUrls.has(item.url))
  );

  const askToRemove = (group: StoryGroup<Item>) => {
    setStoryRemoval({
      title: group.lead.title,
      items: [group.lead, ...group.others].map((item) => ({
        url: item.url,
        ...(item.personId ? { personId: item.personId } : {}),
      })),
    });
  };

  const removeStory = async () => {
    if (!storyRemoval) return;
    setRemovingStory(true);
    try {
      const response = await fetch("/api/market-intel/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: briefing.id, items: storyRemoval.items }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not remove the story.");
      setRemovedUrls((previous) => new Set([...previous, ...storyRemoval.items.map((item) => item.url)]));
      toast("Story removed. Future collections will keep it hidden.");
      setStoryRemoval(null);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not remove the story.", "error");
    } finally {
      setRemovingStory(false);
    }
  };

  const removeStoryButton = (group: StoryGroup<Item>, className = "") =>
    isAdmin ? (
      <button
        type="button"
        onClick={() => askToRemove(group)}
        aria-label={`Remove story: ${group.lead.title}`}
        title="Remove this story"
        className={cn(
          storyActionClass,
          "w-7 hover:bg-[rgba(176,32,32,0.08)] hover:text-[color:#B02020] focus-visible:outline-[color:#B02020]",
          className
        )}
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
    ) : null;

  const openItemButton = (item: Item) => {
    return (
      <a
        href={safeHref(item.url) as string}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open item in a new tab: ${item.title}`}
        title="Open in a new tab"
        className={cn(storyActionClass, "w-7 hover:bg-blue-light hover:text-blue-primary")}
      >
        <ExternalLink size={14} strokeWidth={2.2} />
      </a>
    );
  };

  const storyActions = (group: StoryGroup<Item>) => (
    <span className="absolute right-3 top-3 z-10 inline-flex w-max items-center gap-0.5 rounded-lg border border-border-light bg-white/95 p-0.5 shadow-sm backdrop-blur-sm">
      {bookmarkButton(group.lead)}
      {openItemButton(group.lead)}
      {removeStoryButton(group)}
    </span>
  );

  // ---------------------------------------------------------------- cards
  const signalChips = (item: Item) =>
    kindsOf(item).map((kind) => {
      const meta = SIGNAL_META[kind];
      const SIcon = meta.icon;
      return (
        <span
          key={kind}
          title={meta.label}
          className="inline-flex w-max shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4"
          style={{ color: meta.color, background: tint(meta.color, 8) }}
        >
          <SIcon size={11} strokeWidth={2} className="shrink-0" /> {meta.label}
        </span>
      );
    });

  const whyLine = (signal: LiveSignal) => (
    <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
      <span className="font-semibold text-text-primary">Why it matters: </span>
      {signal.why}
    </p>
  );

  /* ONE STORY, MANY SOURCES (Saras, Sep 10): the others are named under the
     card rather than shown again as cards of their own. */
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const supportingSourceType = (item: Item) => {
    if (item.kind === "company") return "Company post";
    if (item.kind === "people") return "People post";
    if (item.kind === "site") return "Company website";
    if (item.kind === "authority") return "Health authority notice";
    return "News article";
  };
  const othersLine = (group: StoryGroup<Item>, inHeader = false) => {
    if (!group.others.length) return null;
    const expanded = !!expandedSources[group.lead.key];
    const panelId = `other-sources-${encodeURIComponent(group.lead.key)}`;
    return (
      <div className={cn(inHeader ? "relative ml-auto shrink-0" : "mt-2.5")}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpandedSources(previous => ({ ...previous, [group.lead.key]: !expanded }))}
          className={cn("inline-flex cursor-pointer items-center gap-1 rounded text-[10px] font-semibold text-text-secondary transition-colors hover:text-blue-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary", inHeader ? "rounded-full border border-border-light bg-white px-2 py-0.5 leading-4" : "py-1")}
        >
          <Newspaper size={12} className="shrink-0" />
          <span>{group.others.length} other {group.others.length === 1 ? "source" : "sources"}</span>
          <ChevronDown size={12} className={cn("transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
        </button>
        <div
          id={panelId}
          className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", inHeader && "absolute right-0 top-full z-30 mt-2 w-[min(22rem,80vw)] rounded-xl border border-border-light bg-white p-2 shadow-xl", expanded ? "grid-rows-[1fr] opacity-100" : inHeader ? "hidden" : "pointer-events-none grid-rows-[0fr] opacity-0")}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <div className={cn("min-h-0 overflow-hidden", inHeader && "max-h-64 overflow-y-auto")}>
            <ul className={cn("my-1.5 space-y-1.5", !inHeader && "border-l border-border-light pl-3")}>
              {group.others.map((source, index) => (
                <li key={`${source.key}-${index}`}>
                  <a
                    href={safeHref(source.url) as string}
                    target="_blank"
                    rel="noreferrer"
                    title={source.title}
                    className="group block max-w-full rounded px-2 py-1.5 transition-colors hover:bg-blue-light/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary"
                  >
                    <span className="flex min-w-0 items-start gap-1.5 text-[11.5px] font-semibold leading-4 text-blue-primary group-hover:underline">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{source.title}</span>
                      <ExternalLink size={10} className="mt-0.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-4 text-text-tertiary">
                      {outletName(source.sourceLabel, source.url)} · {supportingSourceType(source)}{source.date ? ` · ${fmtDate(source.date)}` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const leadKind = (item: Item) => kindsOf(item)[0];
  const sourceType = (item: Item) => {
    if (item.kind === "company") return { label: "LinkedIn post: company", Icon: Building2 };
    if (item.kind === "people") return { label: "LinkedIn post: people", Icon: Users };
    if (item.kind === "site") return { label: "Company website", Icon: Globe2 };
    if (item.kind === "authority") return { label: "Health authority notice", Icon: ShieldAlert };
    return { label: "News article", Icon: Newspaper };
  };
  const sourceTypeChip = (item: Item) => {
    const meta = sourceType(item);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-blue-primary">
        {item.kind === "company" || item.kind === "people"
          ? <LinkedInIcon size={11} />
          : <meta.Icon size={10} strokeWidth={2.2} />}{meta.label}
      </span>
    );
  };
  const cardStyle = (item: Item) =>
    leadKind(item) !== "others" ? { borderLeftColor: SIGNAL_META[leadKind(item)].color } : undefined;
  const cardClass = (item: Item) => cn("group/story relative flex h-full flex-col p-4", leadKind(item) !== "others" && "border-l-[3px]", expandedSources[item.key] && "z-20");

  const postCard = (group: StoryGroup<Item>, key: string) => {
    const item = group.lead;
    const post = item.post!;
    // COUNT CHARACTERS, NOT UTF-16 UNITS. LinkedIn posts are full of styled
    // unicode, where one visible character is two units, so slicing by
    // index could split one and React would throw a hydration error.
    const chars = Array.from(post.text);
    const open = expanded.has(post.url);
    const titleLength = Array.from(item.title).length;
    const postRemainder = chars.slice(titleLength).join("").trim();
    const isLong = Array.from(postRemainder).length > 120;
    return (
      <Card key={key} className={cardClass(item)} style={cardStyle(item)}>
        {storyActions(group)}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 pr-28">{signalChips(item)}{sourceTypeChip(item)}{othersLine(group, true)}</div>
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
              >
                {post.by
                  ? post.by.role || "Tracked person"
                  : "Company page"}
              </span>
            </p>
            <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
              <a href={safeHref(post.url) as string} target="_blank" rel="noreferrer" className="text-blue-primary hover:underline">{item.title}</a>
            </h3>
            {postRemainder && <p className={cn("mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-text-secondary", !open && "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]")}>
              {postRemainder}
            </p>}
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
            {item.signal?.why && whyLine(item.signal)}
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 pt-3">
          <p className="flex items-center gap-4 text-[11.5px] font-medium text-text-tertiary">
            {post.reactions != null && <span className="flex items-center gap-1 tnum"><ThumbsUp size={12} strokeWidth={2} /> {post.reactions}</span>}
            {post.comments != null && <span className="flex items-center gap-1 tnum"><MessageSquare size={12} strokeWidth={2} /> {post.comments}</span>}
            {post.reposts != null && <span className="flex items-center gap-1 tnum"><Repeat2 size={13} strokeWidth={2} /> {post.reposts}</span>}
          </p>
          <time className="shrink-0 whitespace-nowrap text-right text-[11.5px] text-text-tertiary" suppressHydrationWarning>{fmtDate(item.date)}</time>
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
        {storyActions(group)}
        <div className="flex flex-wrap items-center gap-1.5 pr-28">
          {signalChips(item)}
          {sourceTypeChip(item)}
          {own ? (
            /* Source identity stays neutral blue. "Published by them" still
               states the meaningful provenance difference in plain text. */
            <>
              <span className="flex items-center gap-1 rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-blue-primary">
                <Globe2 size={10} strokeWidth={2.2} /> Website: {siteSourceLabel(article.url, article.source)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                Published by them
              </span>
            </>
          ) : item.kind === "authority" ? (
            <span title={article.source} className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-orange-800">
              <ShieldAlert size={10} strokeWidth={2.2} /> Official source: {article.source}
            </span>
          ) : (
            <span title={article.source} className="flex items-center gap-1 rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-blue-primary">
              <Newspaper size={10} strokeWidth={2.2} /> Source of news article: {outletName(article.source, article.url)}
            </span>
          )}
          {othersLine(group, true)}
        </div>
        <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">
          <a
            href={safeHref(article.url) as string}
            target="_blank"
            rel="noreferrer"
            className="text-blue-primary hover:underline"
          >
            <span>{item.title}</span>
          </a>
        </h3>
        {article.summary && (
          <div className="mt-1">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              <Sparkles size={9} strokeWidth={2.2} /> AI summary
            </span>
            <p className="line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">{article.summary}</p>
          </div>
        )}
        {item.signal?.why && whyLine(item.signal)}
        <time className="mt-auto block whitespace-nowrap pt-3 text-right text-[11.5px] text-text-tertiary" suppressHydrationWarning>{fmtDate(item.date)}</time>
      </Card>
    );
  };

  return (
    <div data-market-intel-details-open={detailsOpen} data-market-intel-details-side={detailsSide}>
      {/* A briefing left open must keep pulling fresh server data. */}
      <AutoFresh />
      <ConfirmDialog
        open={storyRemoval !== null}
        onClose={() => !removingStory && setStoryRemoval(null)}
        onConfirm={() => void removeStory()}
        busy={removingStory}
        title="Remove this story?"
        body={<>This removes <b>{storyRemoval?.title}</b> from the shared intelligence feed.</>}
        detail="All grouped source copies are removed, and future collections will keep them hidden."
        confirmLabel="Remove story"
      />
      <SmartBack
        fallback={isCompetitor ? "/market-intel?tab=competitors" : "/market-intel"}
        className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} />{" "}
        {isCompetitor ? "Competitor Intel" : "Customer Intel"}
      </SmartBack>

      {/* ONE LINE FOR WHO THIS IS AND WHAT YOU CAN DO (Anir, Sep 11: "confusing
          ui and clean it up. minimal space"). Where the data comes from is a
          hint beside the name, the update time is quiet text, and an admin's
          move and delete sit behind the "more" button instead of a row. */}
      <div className="rise-in flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <MiLogo
          name={briefing.name}
          logoUrl={briefing.logoUrl}
          className="h-9 w-9 shrink-0"
        />
        <h1 className="flex items-center gap-1.5 text-[22px] font-bold tracking-[-0.02em] text-text-primary">
          {briefing.name}
        </h1>
        {isAdmin && <WatchStatus state={watch} />}
        <DivisionEditor
          companyId={briefing.id}
          companyName={briefing.name}
          divisions={divisions}
          canEdit={canWrite}
        />
        <span className="ml-auto flex items-center gap-2">
          <RefreshChip updatedAt={refreshUpdatedAt} />
          <MyListToggle
            companyId={briefing.id}
            companyName={briefing.name}
            onMyPage={onMyPage}
            starred={starred}
            group={briefing.group}
          />
          {isAdmin && (
            <CompanyAdminControls
              companyId={briefing.id}
              companyName={briefing.name}
              group={briefing.group}
              followers={watch.followers}
              compact
            />
          )}
        </span>
      </div>

      {briefing.tldr && (
        <div className="rise-in mt-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--ink-bright-blue)]">
            <Sparkles size={11} strokeWidth={2.2} /> The rundown
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {briefing.tldr}
          </p>
        </div>
      )}

      <SearchPriority
        query={query}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-surface/55 p-2.5"
      >
        <PrioritySearchInput
          grow
          className="min-w-[240px] flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search this briefing…"
          ariaLabel="Search this briefing"
          iconSize={14}
          iconClassName="left-3"
          inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-subtle"
        />
        {isCompetitor && (
          <ColorSelect
            value={relevantOnly ? "relevant" : "all"}
            onChange={(value) => setRelevantOnly(value === "relevant")}
            ariaLabel="Filter competitor updates by relevance"
            minWidth={165}
            dense
            options={[
              { value: "relevant", label: "Relevant to Freyr", color: "var(--ink-teal-deep)", icon: Filter },
              { value: "all", label: "All competitor updates", color: "var(--ink-bright-blue)", icon: Globe2 },
            ]}
          />
        )}
        <button type="button" disabled={!savedReady} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}
          className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold disabled:opacity-40", savedOnly ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border-light bg-white text-text-secondary")}>
          <Bookmark
            className={savedArticles.length > 0 ? "text-amber-600" : undefined}
            style={savedArticles.length > 0 ? { color: "#d97706" } : undefined}
            size={14}
            fill={savedArticles.length > 0 ? "currentColor" : "none"}
          />Saved {savedArticles.length}
        </button>
        <ColorSelect
            value={range}
            onChange={(value) => { setRange(value as typeof range); setExactDate(""); }}
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
        <div className="relative flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-3 text-[12px] font-semibold text-text-secondary focus-within:border-blue-subtle">
          <CalendarDays size={14} className="text-blue-primary" />
          <label htmlFor="briefing-exact-date" className="sr-only">Show updates from an exact date</label>
          <input id="briefing-exact-date" type="date" value={exactDate} onChange={(event) => setExactDate(event.target.value)} className="cursor-pointer bg-transparent text-[12px] text-text-primary outline-none" />
          {exactDate && <button type="button" onClick={() => setExactDate("")} className="cursor-pointer text-blue-primary hover:underline">Clear</button>}
        </div>
        <ColorSelect
          value={newsView}
          onChange={(value) => chooseNewsView(value as NewsView)}
          ariaLabel="Article view"
          dense
          iconOnly
          options={[
            { value: "rows", label: "List view", color: "var(--ink-bright-blue)", icon: List },
            { value: "tiles", label: "Tile view", color: "var(--ink-violet)", icon: LayoutGrid },
            { value: "table", label: "Table view", color: "var(--ink-teal-deep)", icon: Table2 },
          ]}
        />
      </SearchPriority>

      <div className={cn(
        "mt-5 grid items-start gap-4 motion-safe:transition-[grid-template-columns] motion-safe:duration-300 motion-safe:ease-in-out",
        detailsOpen
          ? detailsSide === "left" ? "grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]"
          : detailsSide === "left" ? "grid-cols-[minmax(0,1fr)_40px] lg:grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_40px]"
      )}>
        <div className={cn("min-w-0", detailsSide === "left" && "lg:order-2")}>
          {selectedCompetitor && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-subtle bg-blue-light px-3 py-2 text-[12px] text-text-primary" role="status">
              <span>Showing competitor mentions of <strong>{selectedCompetitor}</strong> · {groups.length} {groups.length === 1 ? "story" : "stories"}</span>
              <button type="button" onClick={() => { setSelectedCompetitor(null); setSelectedSignals([]); }} className="shrink-0 cursor-pointer font-semibold text-blue-primary hover:underline">Clear filter</button>
            </div>
          )}

          <div
            key={`${savedOnly}-${source}-${selectedSignals.join(",") || "any"}-${selectedCompetitor ?? "any"}-${newsView}-${range}-${exactDate}-${relevantOnly}`}
            className={cn(
              "tab-panel",
              newsView === "tiles" && groups.length > 0
                ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                : "space-y-2.5"
            )}
          >
            {groups.length === 0 ? (
              <Card className="p-6 text-[13px] leading-relaxed text-text-secondary">
                {relevantOnly && hiddenByRelevance > 0 && matched.length > 0
                  ? `Nothing here is currently marked relevant to Freyr. ${hiddenByRelevance} ${hiddenByRelevance === 1 ? "item is" : "items are"} hidden; choose “All competitor updates” to see them.`
                  : "Nothing matches the current filters. Widen the source, signal, time range or search to see more."}
              </Card>
            ) : newsView === "table" ? (
              <Card className="overflow-hidden p-0">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[220px]" />
                    <col />
                    <col className="w-[180px]" />
                    <col className="w-[128px]" />
                  </colgroup>
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
                      <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {groups.map((group, index) => {
                      const item = group.lead;
                      const rowKind = item.kind === "news" ? "news" : item.kind === "authority" ? "authority" : item.kind === "site" ? "site" : "post";
                      const lead = leadKind(item);
                      const tagged = lead !== "others";
                      const color = SIGNAL_META[lead].color;
                      const SignalIcon = SIGNAL_META[lead].icon;
                      const RowIcon = rowKind === "authority"
                          ? ShieldAlert
                          : rowKind === "news"
                          ? Newspaper
                          : rowKind === "site"
                            ? Globe2
                            : (LinkedInIcon as unknown as LucideIcon);
                      let domain = "";
                      try { domain = new URL(item.url).hostname.replace(/^www\./, ""); } catch {}
                      const sourceName = rowKind === "post" ? "LinkedIn" : rowKind === "site" ? domain || item.sourceLabel : outletName(item.sourceLabel, item.url) || domain;
                      return (
                        <tr key={index} className="group/story transition-colors hover:bg-surface">
                          <td className="px-4 py-3 align-top">
                            <a
                              href={safeHref(item.url) as string}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 max-w-full items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline"
                              title={sourceName}
                            >
                              <RowIcon size={12} strokeWidth={2} className="shrink-0" />
                              <span className="min-w-0 truncate">{sourceName}</span>
                            </a>
                            <span className="mt-1 block max-w-full truncate text-[11px] leading-4 text-text-tertiary" title={rowKind === "post" ? item.sourceLabel : rowKind === "site" ? "Company website" : ""}>
                              {rowKind === "post" ? item.sourceLabel : rowKind === "site" ? "Company website" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-1.5">
                              {sourceTypeChip(item)}
                              {tagged && <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4" style={{ color, background: tint(color, 8) }}>
                                <SignalIcon size={12} strokeWidth={2} className="shrink-0" />
                                {SIGNAL_META[lead].label}
                              </span>}
                            </div>
                            <a
                              href={safeHref(item.url) as string}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full items-start text-[13px] font-semibold leading-snug text-blue-primary hover:underline"
                            >
                              <span className="overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{item.title}</span>
                            </a>
                            {(item.signal?.why || item.news?.summary) && (
                              <p className="mt-0.5 overflow-hidden text-[12px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {item.signal?.why ?? item.news?.summary}
                              </p>
                            )}
                            {othersLine(group)}
                          </td>
                          <td
                            className="px-4 py-3 align-top text-[12px] text-text-secondary"
                            suppressHydrationWarning
                          >
                            {/* One line: "Sep 13, 2026 ·" used to break away from its time. */}
                            <span className="inline-flex h-7 items-center whitespace-nowrap">{fmtDate(item.date)}</span>
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <span className="inline-flex w-max items-center gap-0.5 rounded-lg border border-border-light bg-white p-0.5 align-top">
                              {bookmarkButton(item)}
                              {openItemButton(item)}
                              {removeStoryButton(group)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            ) : (
              groups.map((group, index) =>
                group.lead.kind === "news" || group.lead.kind === "authority" || group.lead.kind === "site"
                  ? articleCard(group, `a-${index}`)
                  : postCard(group, `p-${index}`)
              )
            )}
          </div>
        </div>

        {/* THE RAIL ANIMATES IN LIKE EVERYTHING ELSE (Anir, Sep 4). */}
        <div className={cn("sticky top-3 min-w-0 self-start", detailsSide === "left" && "lg:order-1")}>
          {!detailsOpen && (
            <button
              type="button"
              aria-label="Show company details"
              aria-expanded={false}
              aria-controls="company-details-panel"
              onClick={() => setDetailsView("open")}
              className={cn("flex w-10 cursor-pointer flex-col items-center gap-3 border border-border-light bg-white py-4 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary", detailsSide === "left" ? "lg:rounded-r-xl lg:border-l-0" : "rounded-l-xl border-r-0")}
            >
              {detailsSide === "left" ? <PanelLeftOpen size={16} className="shrink-0" /> : <PanelRightOpen size={16} className="shrink-0" />}
              <span className="whitespace-nowrap [writing-mode:vertical-rl]">Company details</span>
            </button>
          )}
          <aside
            id="company-details-panel"
            aria-label="Company details"
            aria-hidden={!detailsOpen}
            inert={!detailsOpen}
            className={cn(
              "flex min-w-0 flex-col overflow-hidden rounded-2xl border shadow-sm motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out",
              "border-blue-subtle bg-[rgba(0,113,227,0.035)]",
              detailsOpen
                ? cn(
                    dataMode === "mock"
                      ? "h-[calc(100dvh-114px)]"
                      : "h-[calc(100dvh-68px)]",
                    "min-h-[420px] translate-x-0 opacity-100"
                  )
                : "pointer-events-none h-0 translate-x-4 opacity-0"
            )}
          >
          {/* Keep the rail control outside its scrolling body. Previously the
              header disappeared as soon as someone scrolled down to the last
              cards, making the panel look impossible to close. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-subtle bg-blue-light/70 px-4 py-3">
            <h2 className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">Company details</h2>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setDetailsSide(detailsSide === "left" ? "right" : "left")} aria-label={`Move company details to the ${detailsSide === "left" ? "right" : "left"}`} title={`Move to ${detailsSide === "left" ? "right" : "left"}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border-light bg-white text-text-secondary shadow-sm transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary">{detailsSide === "left" ? <ArrowRight size={15} aria-hidden="true" /> : <ArrowLeft size={15} aria-hidden="true" />}</button>
              <button type="button" onClick={() => setDetailsView("closed")} aria-label="Hide company details" title="Hide company details" aria-expanded={true} aria-controls="company-details-panel" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-border-light bg-white text-blue-primary shadow-sm transition-colors hover:border-blue-subtle hover:bg-blue-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary">{detailsSide === "left" ? <PanelLeftClose size={15} aria-hidden="true" /> : <PanelRightClose size={15} aria-hidden="true" />}</button>
            </div>
          </div>
          {/* The panel hugs quiet content, while busy content scrolls inside the
              viewport. Extra bottom room keeps the last card clear of chat. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-24 [scrollbar-gutter:stable]">
          <Card className="p-4" aria-labelledby="signal-filter-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="signal-filter-title" className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                  <Radar size={14} strokeWidth={2} className="text-blue-primary" />
                  Signals
                </h2>
                <p className="mt-1 text-[11.5px] leading-snug text-text-tertiary">
                  {selectedSignals.length > 0 ? `${selectedSignals.length} selected` : "Showing every signal"}
                </p>
              </div>
              {selectedSignals.length > 0 && <button type="button" onClick={() => { setSelectedSignals([]); setSelectedCompetitor(null); }} className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-blue-primary hover:underline">Clear</button>}
            </div>
            <div className="mt-2.5 space-y-1">
              {signalsFor(briefing.group).map(signal => {
                const meta = SIGNAL_META[signal];
                const Icon = meta.icon;
                const checked = selectedSignals.includes(signal);
                return (
                  <label key={signal} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors", checked ? "border-blue-subtle bg-blue-light" : "border-transparent hover:bg-surface")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-blue-primary bg-blue-primary text-white" : "border-border-light bg-white")}>
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => { setSelectedCompetitor(null); setSelectedSignals(current => checked ? current.filter(item => item !== signal) : [...current, signal]); }} />
                    <Icon size={14} style={{ color: meta.color }} className="shrink-0" />
                    <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-text-primary">{meta.label}</span>
                    <span className="tnum text-[11.5px] font-semibold text-text-secondary">{signalCounts[signal] ?? 0}</span>
                  </label>
                );
              })}
            </div>
          </Card>

          <Card className="p-4" aria-labelledby="source-filter-title">
            <h2 id="source-filter-title" className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <Newspaper size={14} strokeWidth={2} className="text-blue-primary" />
              Sources
            </h2>
            <p className="mt-1 text-[11.5px] leading-snug text-text-tertiary">Where these updates came from</p>
            <div className="mt-2.5 space-y-1" role="group" aria-label="Sources">
              {SOURCES.map((item) => {
                const Icon = item.icon;
                const selected = source === item.key;
                const pending = collection?.status === "collecting" && collection.stage === "sources" && item.count === 0 && (item.key === "news" || item.key === "site");
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { setSource(item.key); if (item.key !== "all") setSelectedCompetitor(null); }}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary",
                      selected ? "border-blue-subtle bg-blue-light" : "border-transparent hover:bg-surface"
                    )}
                  >
                    {item.key === "company" || item.key === "people"
                      ? <LinkedInIcon size={15} className="shrink-0" />
                      : <Icon size={14} strokeWidth={2} style={{ color: item.color }} className="shrink-0" />}
                    <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-text-primary">{item.label}</span>
                    {pending ? <Loader2 size={13} className="shrink-0 text-blue-primary motion-safe:animate-spin" aria-label="Collecting" /> : <span className="tnum text-[11.5px] font-semibold text-text-secondary">{item.count}</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          {briefing.competitorMentions.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Swords size={14} strokeWidth={2} className="text-blue-primary" />
                Freyr competitors mentioned
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {briefing.competitorMentions.map((mention) => (
                  <button
                    type="button"
                    key={mention.name}
                    onClick={() => {
                      if (selectedCompetitor === mention.name) {
                        setSelectedCompetitor(null);
                        setSelectedSignals([]);
                      } else {
                        setSelectedCompetitor(mention.name);
                        setSelectedSignals(["competitor_mentions"]);
                        setSource("all");
                      }
                    }}
                    aria-pressed={selectedCompetitor === mention.name}
                    aria-label={`${selectedCompetitor === mention.name ? "Clear" : "Show"} mentions of ${mention.name}`}
                    className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors", selectedCompetitor === mention.name ? "border-[color:var(--ink-magenta)] bg-[rgba(180,49,143,0.16)] text-[color:var(--ink-magenta)]" : "border-transparent bg-[rgba(180,49,143,0.10)] text-[color:var(--ink-magenta)] hover:bg-[rgba(180,49,143,0.16)]")}
                  >
                    {selectedCompetitor === mention.name && <Check size={12} strokeWidth={2.5} />}
                    {mention.name}
                    <span className="tnum font-bold">{mention.count}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-text-tertiary">
                Freyr competitors named in this customer’s collected posts and articles.
              </p>
            </Card>
          )}

          {/* NO PEOPLE ON A COMPETITOR (Saras, Sep 10). */}
          {!isCompetitor && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <Users size={14} strokeWidth={2} className="text-blue-primary" />
                People tracked
                {canManagePeople && <TrackPersonButton companyId={briefing.id} companyName={briefing.name} availablePeople={availablePeople} />}
              </h2>
              {extraPeople.length === 0 ? (
                <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary">
                  Nobody yet.{canManagePeople ? " Add the senior people whose posts you want in this feed." : ""}
                </p>
              ) : (
                <TrackedPeopleList people={extraPeople} personPosts={railPosts} canManage={canManagePeople} />
              )}
            </Card>
          )}

          </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
