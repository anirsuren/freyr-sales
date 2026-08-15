"use client";

import { useEffect, useState } from "react";
import { fmtWhen } from "@/lib/whenLabel";
import {
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Radar,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Sparkline } from "@/components/charts/Charts";
import { Avatar } from "@/components/ui/Avatar";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { MiLogo } from "@/components/market-intel/MiLogo";
import type { LiveBriefing } from "@/lib/marketIntelFeed";

/**
 * One company on the live dashboard. The bottom line is a ticker (Anir,
 * Aug 11: "like the New York Stock Exchange... every five seconds"): the
 * freshest stories rotate one at a time, pause while hovered, and step with
 * the arrows. Hovering the card pops it out in place, offerings-style, and
 * the expansion spells out the top five stories.
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
  briefing,
  people,
}: {
  briefing: LiveBriefing;
  people?: CardPerson[];
}) {
  const up = (briefing.momentumPct ?? 0) >= 0;
  const stories = briefing.news.slice(0, 5);
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
            name={briefing.name}
            logoUrl={briefing.logoUrl}
            className="h-9 w-9 shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
              {briefing.name}
            </span>
            <span className="block truncate text-[11.5px] text-text-tertiary">
              {briefing.posts.length + briefing.news.length} items, 90 days
            </span>
          </span>
        </span>
        {briefing.momentumPct === null ? (
          // A COUNT, not a trend. It used to wear the same up-arrow as the
          // momentum badge beside it, so "72 this month" and "+914%" read as
          // the same kind of number in the same slot (Anir, Aug 14). No arrow
          // here: the arrow means "versus last month", and this one isn't.
          <span
            title="New items picked up this month. Not enough history yet to compare it with last month."
            className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:#0071E3] tnum"
          >
            <Newspaper size={11} strokeWidth={2.4} />
            {briefing.itemsThisMonth} this month
          </span>
        ) : (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tnum"
            style={{
              color: up ? "#1A7A35" : "#DC2626",
              background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
            }}
          >
            {up ? (
              <TrendingUp size={11} strokeWidth={2.4} />
            ) : (
              <TrendingDown size={11} strokeWidth={2.4} />
            )}
            {up ? "+" : ""}
            {briefing.momentumPct}%
          </span>
        )}
      </div>

      <div className="mt-3">
        <Sparkline
          points={briefing.trend}
          height={36}
          xLabels={briefing.trendLabels}
          unit="items"
          label={`${briefing.name} market activity`}
          interactive={false}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
          <LinkedInIcon size={10.5} />
          {briefing.posts.length} {briefing.posts.length === 1 ? "post" : "posts"}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0F766E]">
          <Newspaper size={10.5} strokeWidth={2.2} />
          {briefing.news.length} news
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#7C3AED]">
          <Radar size={10.5} strokeWidth={2.2} />
          {briefing.signals.length}{" "}
          {briefing.signals.length === 1 ? "signal" : "signals"}
        </span>
      </div>

      {story && (
        <div
          // Fixed height so every card in the grid stays the same size while
          // the ticker rotates. Two lines cut real headlines mid-word
          // ("...royalty deal tied to rusfertid…", Anir Aug 14); three fits
          // the long ones without letting any card grow taller than its row.
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
            {story.title}
          </p>
          <span className="mt-1.5 flex items-center gap-1">
            {stories.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 12 : 4,
                  background: i === index ? "#0071E3" : "rgba(0,113,227,0.25)",
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
        Updated {briefing.updatedLabel}
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
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:#0071E3] tnum">
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
              <span className="text-text-secondary">{item.title}</span>
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
      className="h-full"
      href={`/market-intel/${briefing.id}`}
      summary={summary}
      extra={extra}
    />
  );
}
