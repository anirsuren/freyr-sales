"use client";

import { useEffect, useState } from "react";
import { fmtWhen } from "@/lib/whenLabel";
import {
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Globe2,
  Radar,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Sparkline } from "@/components/charts/Charts";
import { Avatar } from "@/components/ui/Avatar";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionChips } from "@/components/market-intel/DivisionChips";
import { WatchStatus, isInactive, type WatchState } from "@/components/market-intel/WatchStatus";
import type { CompanyCard } from "@/lib/marketIntelFeed";
import type { Division } from "@/lib/offeringMaterials";
import { cn } from "@/lib/utils";
import { safeHref } from "@/lib/safeUrl";

/**
 * One company on the live dashboard. The bottom line is a ticker (Anir,
 * Aug 11: "like the New York Stock Exchange... every five seconds"): the
 * freshest stories rotate one at a time, pause while hovered, and step with
 * the arrows. Hovering the card pops it out in place, offerings-style, and
 * the expansion spells out the top five stories.
 *
 * Built from the company's SUMMARY, never its items (Sep 10): the list page
 * carries counts and dates for a hundred companies without downloading a
 * hundred briefings.
 */

const ROTATE_MS = 5000;

/** A followed person, as worn on the card's facepile. */
export type CardPerson = {
  id: string;
  name: string;
  role: string;
  photoUrl?: string;
  posts: number;
};

/** Date, plus the time when the record actually carries one. */
const fmtDate = fmtWhen;

export function LiveCompanyCard({
  card,
  people,
  divisions = [],
  starred = false,
  onStar,
  watch,
}: {
  card: CompanyCard;
  people?: CardPerson[];
  divisions?: Division[];
  /** A favourite inside this person's list, which is not the list itself. */
  starred?: boolean;
  /** How many people have it: Active with a count, or Inactive. */
  watch?: WatchState;
  /** Present when the viewer may star; absent renders no star. */
  onStar?: (on: boolean) => void;
}) {
  const up = (card.momentumPct ?? 0) >= 0;
  const stories = card.stories.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (stories.length < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % stories.length),
      ROTATE_MS
    );
    return () => clearInterval(timer);
  }, [stories.length, paused]);

  const story = stories.length
    ? stories[((index % stories.length) + stories.length) % stories.length]
    : null;

  const step = (delta: number) =>
    setIndex((i) => (((i + delta) % stories.length) + stories.length) % stories.length);

  const summary = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <MiLogo
            name={card.name}
            logoUrl={card.logoUrl}
            className="h-9 w-9 shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
              {card.name}
            </span>
            <span className="mt-0.5 block">
              {watch ? (
                <WatchStatus state={watch} />
              ) : (
                <span className="text-[11.5px] text-text-tertiary tnum">
                  {card.itemsInWindow} {card.itemsInWindow === 1 ? "item" : "items"}, 90 days
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {card.momentumPct === null ? (
            // A COUNT, not a trend: no arrow, because the arrow means "versus
            // last month" and this one isn't (Anir, Aug 14). The number is
            // exact; nothing is capped (Anir, Sep 10).
            <span
              title="Items picked up in the last 30 days. Not enough history yet to compare with the month before."
              className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ink-bright-blue)] tnum"
            >
              <Newspaper size={11} strokeWidth={2.4} />
              {card.itemsThisMonth} this month
            </span>
          ) : (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tnum"
              style={{
                color: up ? "var(--ink-green)" : "#DC2626",
                background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
              }}
            >
              {up ? (
                <TrendingUp size={11} strokeWidth={2.4} />
              ) : (
                <TrendingDown size={11} strokeWidth={2.4} />
              )}
              {up ? "+" : ""}
              {card.momentumPct}%
            </span>
          )}
          {onStar && (
            /* A FAVOURITE, NOT THE LIST (Anir, Sep 10). The card is here
               because it is ticked in Manage companies; the star just marks
               it. Inside a card that is itself a link, so the click stays
               here. */
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStar(!starred);
              }}
              aria-pressed={starred}
              aria-label={starred ? `Unstar ${card.name}` : `Star ${card.name}`}
              title={starred ? "Starred. Click to unstar; it stays on your page." : "Star it as a favourite"}
              className={cn(
                "relative z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors",
                starred
                  ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]"
                  : "text-text-tertiary hover:bg-surface hover:text-[#B45309]"
              )}
            >
              <Star size={13} strokeWidth={2.2} fill={starred ? "currentColor" : "none"} />
            </button>
          )}
        </span>
      </div>

      <div className="mt-3">
        {/* HOVER TELLS YOU THE DAY AND THE COUNT (Anir, Sep 10: "this graph
            doesn't even make any sense if I'm not able to put my cursor on
            top and see where these things are changing"). */}
        <Sparkline
          points={card.trend}
          height={36}
          xLabels={card.trendLabels}
          unit="items"
          label={card.name}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-1 whitespace-nowrap pb-1 [&>span]:shrink-0 [&_svg]:shrink-0">
        <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ink-bright-blue)] tnum">
          <LinkedInIcon size={10.5} />
          {card.counts.posts} {card.counts.posts === 1 ? "post" : "posts"}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ink-teal-deep)] tnum">
          <Newspaper size={10.5} strokeWidth={2.2} />
          {card.counts.news} news
        </span>
        {card.counts.site > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[rgba(194,65,12,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ink-orange)] tnum">
            <Globe2 size={10.5} strokeWidth={2.2} />
            {card.counts.site} from them
          </span>
        )}
        <span className="flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ink-violet-soft)] tnum">
          <Radar size={10.5} strokeWidth={2.2} />
          {card.signalTotal} {card.signalTotal === 1 ? "signal" : "signals"}
        </span>

      </div>

      {divisions.length > 0 && <DivisionChips divisions={divisions} className="mt-1" />}

      {story && (
        <div
          className="relative z-10 mt-3 min-h-[70px] overflow-hidden border-t border-border-light pt-2.5"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <p
            key={index}
            className="mi-ticker-in pr-12 text-[12px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
          >
            <span className="font-semibold text-text-primary">
              {story.source}:
            </span>{" "}
            {safeHref(story.url) ? <a href={safeHref(story.url) as string} target="_blank" rel="noreferrer" className="text-blue-primary underline decoration-blue-primary/30 underline-offset-2 hover:decoration-blue-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
              {story.title}
            </a> : story.title}
          </p>
          <span className="mt-1.5 flex items-center gap-1">
            {stories.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 12 : 4,
                  background: i === index ? "var(--ink-bright-blue)" : "rgba(0,113,227,0.25)",
                }}
              />
            ))}
          </span>
          {stories.length > 1 && (
            <span className="absolute right-0 top-2 flex gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous story"
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border-light bg-white text-text-tertiary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <ChevronLeft size={12} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next story"
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border-light bg-white text-text-tertiary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <ChevronRight size={12} strokeWidth={2.4} />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-text-tertiary">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
        Updated {card.updatedLabel}
        {people && people.length > 0 && (
          <span className="hover-yield group/pile ml-auto flex items-center pl-1">
            {people.slice(0, 5).map((person) => (
              <span
                key={person.id}
                className="group/face relative -ml-1.5 transition-[margin] duration-200 first:ml-0 group-hover/pile:ml-1 group-hover/pile:first:ml-0"
              >
                <Avatar
                  name={person.name}
                  src={person.photoUrl}
                  className="h-6 w-6 text-[9px] ring-2 ring-white transition-transform group-hover/face:-translate-y-0.5"
                />
                <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[210px] origin-bottom-right scale-90 rounded-xl border border-border-light bg-white p-3 text-left opacity-0 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.22)] transition-all duration-200 group-hover/face:scale-100 group-hover/face:opacity-100">
                  <span className="flex items-center gap-2.5">
                    <Avatar
                      name={person.name}
                      src={person.photoUrl}
                      className="h-10 w-10 shrink-0 text-[13px]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {person.name}
                      </span>
                      <span className="block overflow-hidden text-[11px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {person.role}
                      </span>
                    </span>
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--ink-bright-blue)] tnum">
                    <LinkedInIcon size={9.5} />
                    {person.posts} {person.posts === 1 ? "post" : "posts"} collected
                  </span>
                </span>
              </span>
            ))}
            {people.length > 5 && (
              <span className="tnum -ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[9.5px] font-bold text-text-secondary ring-2 ring-white transition-[margin] duration-200 group-hover/pile:ml-1">
                +{people.length - 5}
              </span>
            )}
          </span>
        )}
      </div>
    </>
  );

  const extra = (
    <div className="mt-3 border-t border-border-light pt-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        Top stories
      </p>
      <ul className="mt-2 space-y-1.5">
        {stories.map((item, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-snug">
            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
            <span className="min-w-0">
              <span className="font-semibold text-text-primary">
                {item.source}:
              </span>{" "}
              {safeHref(item.url) ? <a href={safeHref(item.url) as string} target="_blank" rel="noreferrer" className="text-blue-primary underline decoration-blue-primary/30 underline-offset-2 hover:decoration-blue-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                {item.title}
              </a> : <span className="text-text-secondary">{item.title}</span>}
              <span className="text-text-tertiary" suppressHydrationWarning>
                {" "}
                · {fmtDate(item.published)}
              </span>
            </span>
          </li>
        ))}
        {stories.length === 0 && (
          <li className="text-[12px] text-text-secondary">
            No news in the window yet. LinkedIn activity is still collected.
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-text-tertiary">
        Click for the full briefing.
      </p>
    </div>
  );

  return (
    <HoverExpandCard
      className={watch && isInactive(watch) ? "h-full opacity-75" : "h-full"}
      href={`/market-intel/${card.id}`}
      linkLabel={`Open ${card.name} briefing`}
      summary={summary}
      extra={extra}
    />
  );
}
