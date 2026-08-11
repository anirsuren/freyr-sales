"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  CalendarClock,
  Flame,
  Hourglass,
  Layers,
  Moon,
  Swords,
  Users,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import {
  LiveCompanyCard,
  type CardPerson,
} from "@/components/market-intel/LiveCompanyCard";
import type { LiveBriefing } from "@/lib/marketIntelFeed";
import type { TrackedCompany } from "@/lib/marketIntelTracking";

/**
 * The dashboard's card grid plus its toolbar (Anir, Aug 11: "We need search
 * bars everywhere... and a filter underneath the four cards"). Search matches
 * companies AND the people followed inside them, so typing a person's name
 * surfaces their company's card.
 */

type Activity = "all" | "busy" | "quiet";
type Sort = "active" | "month" | "az";

export function LiveCompanyGrid({
  briefings,
  pending,
  people,
  group,
}: {
  briefings: LiveBriefing[];
  pending: TrackedCompany[];
  people: Record<string, CardPerson[]>;
  group: "customer" | "competitor";
}) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<Activity>("all");
  const [sort, setSort] = useState<Sort>("active");

  const q = query.trim().toLowerCase();
  const matches = (id: string, name: string, industry?: string | null) =>
    !q ||
    name.toLowerCase().includes(q) ||
    (industry ?? "").toLowerCase().includes(q) ||
    (people[id] ?? []).some(
      (p) =>
        p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
    );

  const passesActivity = (b: LiveBriefing) =>
    activity === "all" ||
    (activity === "busy" ? b.itemsThisMonth >= 10 : b.itemsThisMonth === 0);

  const shown = briefings
    .filter((b) => matches(b.id, b.name) && passesActivity(b))
    .sort((a, b) =>
      sort === "az"
        ? a.name.localeCompare(b.name)
        : sort === "month"
          ? b.itemsThisMonth - a.itemsThisMonth
          : b.posts.length + b.news.length - (a.posts.length + a.news.length)
    );

  // Pending companies have no items yet, so they count as quiet.
  const shownPending =
    activity === "busy"
      ? []
      : pending.filter((c) => matches(c.id, c.name, c.industry));

  const total = briefings.length + pending.length;
  const visible = shown.length + shownPending.length;

  return (
    <>
      <SearchPriority
        query={query}
        className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5"
      >
        <PrioritySearchInput
          grow
          className="flex-1"
          value={query}
          onChange={setQuery}
          placeholder={
            group === "competitor"
              ? "Search competitors or people…"
              : "Search customers or people…"
          }
          ariaLabel={
            group === "competitor"
              ? "Search competitors"
              : "Search customers"
          }
        />
        <span className="px-1 text-[12px] font-medium text-text-secondary tnum">
          {visible} of {total}
        </span>
        <ColorSelect
          value={activity}
          onChange={(v) => setActivity(v as Activity)}
          ariaLabel="Filter by activity"
          minWidth={168}
          options={[
            { value: "all", label: "All activity", icon: Layers, color: "#0071E3" },
            { value: "busy", label: "Busy this month", icon: Flame, color: "#C2410C" },
            { value: "quiet", label: "Quiet this month", icon: Moon, color: "#6D28D9" },
          ]}
        />
        <ColorSelect
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          ariaLabel="Sort companies"
          minWidth={150}
          options={[
            { value: "active", label: "Most items", icon: ArrowDownWideNarrow, color: "#0071E3" },
            { value: "month", label: "This month", icon: CalendarClock, color: "#0F766E" },
            { value: "az", label: "A to Z", icon: ArrowDownAZ, color: "#B4318F" },
          ]}
        />
      </SearchPriority>

      {visible === 0 ? (
        <div className="rounded-xl border border-dashed border-border-light bg-white p-10 text-center text-[13px] text-text-secondary">
          Nothing matches{q ? ` “${query.trim()}”` : " those filters"}. Clear
          the {q ? "search" : "filters"} to see all {total}{" "}
          {group === "competitor" ? "competitors" : "customers"}.
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {shown.map((briefing) => (
            <LiveCompanyCard
              key={briefing.id}
              briefing={briefing}
              people={people[briefing.id]}
            />
          ))}

          {shownPending.map((company) => {
            const peopleCount = (people[company.id] ?? []).length;
            return (
              <Link
                key={company.id}
                href={`/market-intel/${company.id}`}
                className="group block rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo
                      name={company.name}
                      className="h-9 w-9 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                        {company.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-text-tertiary">
                        {company.industry || "Tracked company"}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:#0071E3]">
                    New
                  </span>
                </div>
                <div className="mt-3 flex h-9 items-center justify-center rounded-md border border-dashed border-border-light text-[10.5px] font-medium text-text-tertiary">
                  Collecting the first weeks of activity
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                    <Users size={10.5} strokeWidth={2.2} />
                    {peopleCount} {peopleCount === 1 ? "person" : "people"} followed
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-[rgba(180,49,143,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#B4318F]">
                    <Swords size={10.5} strokeWidth={2.2} />
                    {company.competitors.length}{" "}
                    {company.competitors.length === 1
                      ? "competitor"
                      : "competitors"}
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-1.5 border-t border-border-light pt-2.5 text-[12px] leading-snug text-text-secondary">
                  <Hourglass
                    size={12}
                    strokeWidth={2.2}
                    className="shrink-0 text-blue-primary"
                  />
                  First briefing lands on the next refresh.
                </p>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
