"use client";

import { Fragment, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
} from "@/components/ui/SearchPriority";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { useStoredView } from "@/lib/useStoredView";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowRight,
  ChevronDown,
  CalendarDays,
  DollarSign,
  Globe2,
  Layers,
  Mail,
  MapPin,
  Phone,
  TrendingUp,
  Hourglass,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { PRESENCE_META, presenceOf } from "@/lib/presence";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ROLE_META, RoleTag, roleKey } from "@/components/ui/RoleTag";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { HoverCard } from "@/components/ui/HoverCard";
import {
  DonutChart,
  DonutLegend,
  Sparkline,
  VIZ,
} from "@/components/charts/Charts";
import { formatMoney } from "@/lib/pipeline";
import { flagForGeography } from "@/lib/countryFlags";
import { cn, formatDate } from "@/lib/utils";

export type RosterRep = {
  identityKey: string;
  name: string;
  slug: string;
  title: string;
  role: "Admin" | "Owner" | "BD Member";
  /**
   * INVITED, NOT ARRIVED (Anir, Aug 25: "it's gonna show up as the person in
   * this list of people, but it's gonna say Pending, and it's gonna be in
   * yellow"). An invitation that was sent and never accepted was invisible on
   * the one page whose job is showing who is in the workspace — you had to go
   * to Settings to find out whether anybody was waiting.
   */
  pending?: boolean;
  /** When the invitation expires, so a stale one reads as stale. */
  invitedExpiresAt?: string | null;
  invitedBy?: string | null;
  you?: boolean;
  region: string;
  email: string;
  phone: string;
  // Empty string = no chip. Synthetic reps carry a stable demo profile URL;
  // the real signed-in member only ever shows the URL they pasted in
  // Settings › Profile (never a fabricated one).
  linkedin: string;
  teamsUrl: string;
  openValue: number;
  /* No weighted field: the number came off every surface on Anir, Sep 2
     ("they dont use weighted"), and nothing feeds or reads it now. */
  openCount: number;
  meetings: number;
  quota: number;
  wonFY: number;
  trend: number[];
  stageValues: { stage: string; color: string; value: number; count: number }[];
  // The actual deals sitting in each stage — so a hovered slice / row shows the
  // real company + contact + value behind the number, not just the aggregate.
  stageDeals?: Record<string, { company: string; contact: string; value: number }[]>;
  /**
   * When this person was last using the app, for the live presence dot beside
   * their photo. Only real workspace members have one — the synthetic roster
   * carries null, and a null reads "Never signed in" rather than inventing a
   * plausible time for somebody who does not exist.
   */
  lastSeenAt?: string | null;
  /** WHEN THEY JOINED THE WORKSPACE (Anir, Aug 23: "same thing for: Offering,
   *  Opportunities, Customers, Team"). Real workspace members carry the date
   *  their membership row was created; the synthetic roster carries null and
   *  simply says nothing, rather than inventing a start date for somebody who
   *  does not exist. */
  joinedAt?: string | null;
};

// The rep's biggest open deals across every stage — for the row-hover "Top open
// deals" list, so pointing at a rep surfaces what they're actually working.
function topOpenDeals(rep: RosterRep, n = 4) {
  return Object.values(rep.stageDeals ?? {})
    .flat()
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/**
 * ONE ROLE PALETTE, NOT TWO (Anir, Aug 13: "when it says sales rep, isn't there
 * a colour associated with that? can you make sure the colour is right?").
 *
 * This page had grown a private map, and every single entry contradicted the
 * shared one in RoleTag: Admin wore Manager's purple, Manager wore Rep's blue,
 * and Rep wore green — a status colour that must never carry identity
 * ([[status-colours-are-reserved]]). So the same person read as one colour in
 * the account menu and a different colour on the roster.
 *
 * Nothing is defined here now. RoleTag is the role chip everywhere: same
 * colour, same icon, same words, and it re-skins itself in dark mode.
 */

// Attainment colour band — red under target, burnt orange near, green ahead.
// The mid band is painted as TEXT on the quota row, and amber can't hold text
// (Anir, Jul 27: "that yellow, never use that yellow"); #C2410C is the app-wide
// caution token — warm, legible, and clearly not the error red.
function attainColor(pct: number): string {
  if (pct >= 50) return "#1A7A35";
  if (pct >= 35) return "#C2410C";
  return "#B02020";
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// One chrome for both contact chips (Teams, LinkedIn) so the pair reads as
// siblings — border, padding, radius and hover lifted from the Contacts grid's
// LinkedIn chip, the version Suren approved. Icon-only on purpose (Suren:
// "you don't even need to say Teams; the logo is enough… they'll save some
// space") — the accessible name lives on aria-label/title instead.
const CONTACT_CHIP =
  "rounded-lg border border-border-light bg-white px-2 py-1.5 text-text-secondary cursor-pointer hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary transition-colors";

function TeamsButton({ url, name }: { url: string; name: string }) {
  /* No address, no chip. An invited teammate has no Teams account yet, and an
     anchor with href="" is a button that reloads the page — the same rule the
     roster already keeps for LinkedIn: a link that goes nowhere is worse than
     no link. */
  if (!url) return null;
  const label = `Message ${name.split(" ")[0]} on Teams`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className={cn("inline-flex items-center", CONTACT_CHIP)}
    >
      <TeamsIcon size={15} />
    </a>
  );
}

function RegionLabel({
  region,
  className,
}: {
  region: string;
  className?: string;
}) {
  const flag = flagForGeography(region);
  const isGlobal = region.trim().toLowerCase() === "global";

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {flag ? (
        <span aria-hidden="true" className="shrink-0">
          {flag}
        </span>
      ) : isGlobal ? (
        <Globe2 size={12} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
      ) : (
        <MapPin size={12} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
      )}
      <span className="min-w-0">{region}</span>
    </span>
  );
}

// Shared "what this rep is working" analytics — a donut (pipeline mix) with the
// count right after each stage. Used in the grid card's resting body and the
// table row's hover popover, so a rep reads the same story everywhere.
function StageDonut({ rep, size = 82 }: { rep: RosterRep; size?: number }) {
  const mix = rep.stageValues.filter((s) => s.value > 0);
  if (mix.length === 0) {
    return (
      <p className="text-[12px] text-text-tertiary py-3">No open pipeline yet.</p>
    );
  }
  const items = mix.map((s) => ({
    label: s.stage,
    value: s.value,
    color: s.color,
    // Hovering a slice shows the actual deals in that stage (Suren) — company
    // logo, name, contact, and value, straight from the rep's stageDeals.
    tip: (rep.stageDeals?.[s.stage] ?? []).map((d) => ({
      logo: d.company,
      avatar: d.contact,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    })),
  }));
  return (
    <div className="flex items-center gap-3">
      <DonutChart
        syncId={`team-mix-${rep.name}`}
        segments={items}
        size={size}
        thickness={size > 78 ? 11 : 9}
        centerLabel={String(rep.openCount)}
        centerSub="deals"
        format="money"
      />
      <DonutLegend items={items} format="money" syncId={`team-mix-${rep.name}`} />
    </div>
  );
}

function TripleStat({ rep }: { rep: RosterRep }) {
  return (
    /* WEIGHTED IS GONE (Anir, Sep 2: "they dont use weighted"). This was
       three stats; the grid drops to two so the pair still fills the row. */
    <div className="grid grid-cols-2 gap-2">
      {[
        { l: "Open deals", v: String(rep.openCount) },
        { l: "Meetings", v: String(rep.meetings) },
      ].map((s) => (
        <div key={s.l} className="rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.01em] whitespace-nowrap text-text-tertiary">
            {s.l}
          </p>
          <p className="text-[14px] font-bold text-text-primary tnum leading-none mt-0.5">
            {s.v}
          </p>
        </div>
      ))}
    </div>
  );
}

const STAGE_DETAIL: Record<string, string> = {
  Prospect: "Early-stage account with no meaningful two-way engagement yet.",
  Engaged: "The account is responding and an active sales conversation has started.",
  Qualified: "Need, relevance, and buying potential have been confirmed.",
  "Meeting Booked": "A concrete sales meeting is scheduled with the account.",
};

function PipelineInspector({
  rep,
  focusedStage,
}: {
  rep: RosterRep;
  focusedStage: string | null;
}) {
  const total = rep.stageValues.reduce((sum, stage) => sum + stage.value, 0) || 1;
  const selected = rep.stageValues.find((stage) => stage.stage === focusedStage) || null;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border-light pb-2.5">
        <Avatar name={rep.name} className="h-9 w-9 shrink-0 text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-text-primary">
            {rep.name}{rep.you ? " · you" : ""}
          </p>
          <p className="truncate text-[10.5px] text-text-tertiary">{selected ? STAGE_DETAIL[selected.stage] : `${rep.openCount} open deals by stage`}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold leading-none text-text-primary tnum">{formatMoney(selected?.value ?? rep.openValue)}</p>
          <p className="mt-1 text-[9.5px] text-text-tertiary">{selected ? selected.stage : "open pipeline"}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2 text-[10px]">
        {/* A weighted chip led this row until Anir, Sep 2: "they dont use
            weighted". */}
        <span className="rounded-md bg-surface px-2 py-1 text-text-secondary"><strong className="text-text-primary tnum">{rep.openCount}</strong> deals</span>
        <span className="rounded-md bg-surface px-2 py-1 text-text-secondary"><strong className="text-text-primary tnum">{rep.meetings}</strong> meetings</span>
      </div>

      <div className="mt-2.5 space-y-1">
        {rep.stageValues.filter((stage) => stage.value > 0).map((stage) => {
          const isFocused = selected?.stage === stage.stage;
          const share = Math.round((stage.value / total) * 100);
          return (
            // The focused row is the whole point of hovering a segment, so it
            // has to be unmissable: a wash of the stage's own colour plus a
            // matching left rail. The old blue-light/35 tint was invisible
            // (Anir, Jul 25: "that's not enough for me to see").
            <div
              key={stage.stage}
              className={cn(
                "rounded-md py-1.5 pr-2 transition-colors border-l-[3px]",
                isFocused
                  ? "pl-[9px] font-medium"
                  : "pl-[9px] border-l-transparent"
              )}
              style={
                isFocused
                  ? { background: `${stage.color}22`, borderLeftColor: stage.color }
                  : undefined
              }
            >
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} />
                <span className="min-w-0 flex-1 font-semibold text-text-primary">{stage.stage}</span>
                <span className="text-text-tertiary tnum">{stage.count} {stage.count === 1 ? "deal" : "deals"}</span>
                <span className="w-12 text-right font-semibold text-text-primary tnum">{share}%</span>
                <span className="w-14 text-right text-text-secondary tnum">{formatMoney(stage.value)}</span>
              </div>
              {/* Starts at the dot, not indented past it — the dot hanging
                  outside the bar's left edge is what made these rows read as
                  misaligned. */}
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: stage.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineBarInspector({ rep }: { rep: RosterRep }) {
  const [focusedStage, setFocusedStage] = useState<string | null>(null);
  const total = rep.stageValues.reduce((sum, stage) => sum + stage.value, 0) || 1;
  return (
    <HoverCard
      side="top"
      width={360}
      className="w-[200px]"
      content={<PipelineInspector rep={rep} focusedStage={focusedStage} />}
    >
      <div
        className="group flex h-5 items-center rounded-full cursor-pointer"
        aria-label={`${rep.name} open pipeline: ${formatMoney(rep.openValue)}`}
      >
        <div className="flex h-2.5 w-full origin-center overflow-hidden rounded-full bg-surface transition-transform duration-150 group-hover:scale-y-[1.35] group-hover:shadow-[0_3px_9px_rgba(0,0,0,0.12)]">
          {rep.stageValues.filter((stage) => stage.value > 0).map((stage) => (
            <button
              key={stage.stage}
              type="button"
              aria-label={`${stage.stage}: ${formatMoney(stage.value)}, ${Math.round((stage.value / total) * 100)}% of pipeline`}
              onMouseEnter={() => setFocusedStage(stage.stage)}
              onFocus={() => setFocusedStage(stage.stage)}
              className="h-full border-0 transition-[filter,box-shadow] hover:z-10 hover:brightness-110 hover:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.8)] focus:z-10 focus:outline-none focus:shadow-[inset_0_0_0_2px_white]"
              style={{ width: `${(stage.value / total) * 100}%`, background: stage.color }}
            />
          ))}
        </div>
      </div>
    </HoverCard>
  );
}

function ActivityInspector({ rep }: { rep: RosterRep }) {
  const total = rep.trend.reduce((sum, value) => sum + value, 0);
  const latest = rep.trend[rep.trend.length - 1] || 0;
  const average = rep.trend.length ? total / rep.trend.length : 0;
  const peak = Math.max(...rep.trend, 0);
  const max = Math.max(peak, 1);

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border-light pb-2.5">
        <Avatar name={rep.name} className="h-9 w-9 shrink-0 text-[11px]" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Sales activity · last 10 weeks</p>
          <h3 className="mt-0.5 truncate text-[14px] font-semibold text-text-primary">
            {rep.name}{rep.you ? " · you" : ""}
          </h3>
        </div>
      </div>

      <div className="my-2.5 grid grid-cols-4 gap-1.5">
        {[
          { label: "This week", value: String(latest), detail: "touches" },
          { label: "10w total", value: String(total), detail: "touches" },
          { label: "Avg / week", value: average.toFixed(1), detail: "touches" },
          { label: "Peak week", value: String(peak), detail: "touches" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-md border border-border-light bg-surface/55 px-2 py-2">
            <p className="truncate text-[8.5px] font-semibold uppercase tracking-[0.03em] text-text-tertiary">{stat.label}</p>
            <p className="mt-0.5 text-[15px] font-bold leading-none text-text-primary tnum">{stat.value}</p>
            <p className="mt-1 text-[9px] text-text-tertiary">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border-light bg-surface/25 px-3 pb-2 pt-2.5">
        <div className="flex h-[92px] items-end gap-2">
          {rep.trend.map((value, index) => {
            const current = index === rep.trend.length - 1;
            return (
              <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                <span className="mb-1 text-[10px] font-semibold text-text-secondary tnum">{value}</span>
                <div
                  className={cn("mx-auto w-full max-w-[30px] rounded-t transition-all", current ? "bg-blue-primary" : "bg-blue-primary/45")}
                  style={{ height: `${Math.max(6, (value / max) * 58)}px` }}
                />
                <span className={cn("mt-1.5 whitespace-nowrap text-[8.5px]", current ? "font-semibold text-blue-primary" : "text-text-tertiary")}>
                  {current ? "Now" : `${rep.trend.length - 1 - index}w`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivityTrendInspector({ rep }: { rep: RosterRep }) {
  return (
    <HoverCard side="top" width={360} content={<ActivityInspector rep={rep} />}>
      <div
        className="group w-[100px] cursor-pointer rounded-md p-1 transition-all hover:bg-blue-light/45 hover:shadow-[0_3px_10px_rgba(10,115,232,0.12)]"
        aria-label={`${rep.name} activity over the last 10 weeks`}
        tabIndex={0}
      >
        <div className="transition-transform duration-200 group-hover:scale-[1.04]">
          <Sparkline
            points={rep.trend}
            color={VIZ.blue}
            height={30}
            interactive={false}
          />
        </div>
      </div>
    </HoverCard>
  );
}

/** The dot's colors decoded on hover (Anir, Aug 12: "what does the orange
 *  thing mean... when I hover over that circle, it tells me what that means"). */
function presenceTip(lastSeenAt: string | null | undefined): string {
  const meta = PRESENCE_META[presenceOf(lastSeenAt ?? null, Date.now())];
  return `${meta.label}. ${meta.title}`;
}

export function TeamRoster({ reps }: { reps: RosterRep[] }) {
  // FOUR WAYS TO NARROW THE FLOOR (Anir, Aug 9: "have some filters here to
  // look better, like three or four filters maybe"). Every one reads a field
  // the row already prints, so nothing here can disagree with what you see.
  /* Role and pipeline are MULTI, like region beside them and like every
     filter on the heat map (Anir, Aug 10: "these should all be multiselect
     like the other pages") — nothing selected means everyone. The sort next
     to them stays single on purpose: a list can only be ordered by one key. */
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("pipeline");
  /** Which rep is unfolded. Same mechanic as a goal row on Performance — the
   *  glance stays on this page, the arrow still goes to their full analytics
   *  (Anir, Aug 16: "I like the idea that I can just click on a rep and it'll
   *  show me. Copy how it looks on the performance page"). */
  const [openRep, setOpenRep] = useState<string | null>(null);
  const [view, setView] = useStoredView<"table" | "grid">(
    "freyr.team.view",
    "table",
    ["table", "grid"]
  );
  // FIND A PERSON WITHOUT READING THE FLOOR. Eight names fit on a screen; a
  // real sales org does not, and every other list in the app opens with a
  // search (Anir, Aug 9: "there should be a search bar for the sales floor. I
  // literally said that"). Name, email and role, because "who is the manager"
  // is as common a question as "where is Priyanka".
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? reps.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q) ||
          (r.role || "").toLowerCase().includes(q) ||
          (r.title || "").toLowerCase().includes(q)
      )
    : reps;

  const regions = Array.from(new Set(reps.map((r) => r.region).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );

  const visible = [...shown]
    .filter((r) => roleFilter.length === 0 || roleFilter.includes(r.role))
    .filter((r) => regionFilter.length === 0 || regionFilter.includes(r.region))
    .filter(
      (r) =>
        pipelineFilter.length === 0 ||
        (pipelineFilter.includes("with") && r.openValue > 0) ||
        (pipelineFilter.includes("without") && r.openValue <= 0)
    )
    .sort((a, b) => {
      /* TIES BREAK ALPHABETICALLY (Anir, Aug 25: "it shouldnt show up at the
         bottom, it should show up normal alphabetically"). The default
         pipeline sort ties every $0 row and left them in insertion order, so
         a freshly-invited person landed at the absolute bottom of the list
         and read as missing. Pending rows get no special treatment — they
         sort like anybody else, and every equal value falls back to the name. */
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "deals")
        return b.openCount - a.openCount || a.name.localeCompare(b.name);
      if (sortBy === "meetings")
        return b.meetings - a.meetings || a.name.localeCompare(b.name);
      return b.openValue - a.openValue || a.name.localeCompare(b.name);
    });

  return (
    <div data-tour="team-roster">
      {/* SEARCH ON THE LEFT, WHERE EVERY OTHER LIST PUTS IT (Anir, Aug 9:
          "not a good place for the search bar right? def on the left side
          needs to be there"). It was crammed against the view toggle in the
          title row, so the one control you reach for first sat furthest from
          where the eye starts and moved every time the heading changed width.
          Offerings, Customers and Components all open with a left-aligned
          search and keep view controls on the right; the floor now matches. */}
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-text-primary">
          The sales floor{" "}
          <span className="text-text-tertiary tnum font-normal">({reps.length})</span>
        </h2>
        <p className="text-[12.5px] text-text-tertiary mt-0.5">
          Ranked by open pipeline. Message on Teams or call, click a rep for their full analytics.
        </p>
      </div>
        {/* SearchPriority provider: without it the box focused but nothing
            around it responded — the filters never yielded their labels, so
            this toolbar alone sat still (Anir, Aug 12: "you're still not
            doing the search bar thing here").

            THE BAND IS NOT INSIDE THE CARD any more (Anir, Aug 21: "even the
            team page, that gray shit is so close to the text"): a grey strip
            nested in a white card, with a white search box nested in that,
            was three frames deep and pushed in by the card's padding so it
            lined up with nothing. It now sits on the page above the card,
            the same as Offerings and Opportunities. */}
        <PageToolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search the floor…"
          searchAriaLabel="Search the sales floor"
          onClearAll={() => {
            setQuery("");
            setRoleFilter([]);
            setRegionFilter([]);
            setPipelineFilter([]);
          }}
          groups={[
            {
              key: "role",
              label: "Role",
              values: roleFilter,
              onChange: setRoleFilter,
              // Built from ROLE_META, not typed out again — this list had its
              // own third scrambling of the palette (Rep was wearing Admin's
              // teal), so filtering by Rep highlighted a colour no Rep chip
              // ever used.
              options: (["Admin", "Owner", "BD Member"] as const).map((value) => ({
                value,
                label: ROLE_META[roleKey(value)].label,
                color: ROLE_META[roleKey(value)].color,
              })),
            },
            {
              key: "region",
              label: "Region",
              values: regionFilter,
              onChange: setRegionFilter,
              options: regions.map((region) => ({
                value: region,
                label: region,
                color: "#0891B2",
              })),
            },
            {
              key: "pipeline",
              label: "Pipeline",
              values: pipelineFilter,
              onChange: setPipelineFilter,
              options: [
                { value: "with", label: "Holding pipeline", color: "#1A7A35" },
                { value: "without", label: "Nothing open", color: "#B4318F" },
              ],
            },
          ]}
          sort={
            <ColorSelect
              value={sortBy}
              onChange={setSortBy}
              ariaLabel="Sort the floor"
              minWidth={150}
              dense
              collapsible={false}
              className="w-[150px] shrink-0"
              options={[
                { value: "pipeline", label: "Open pipeline", color: "#1A7A35", icon: TrendingUp },
                { value: "deals", label: "Open deals", color: "#0071E3", icon: Layers },
                { value: "meetings", label: "Meetings", color: "#6D28D9", icon: CalendarDays },
                { value: "name", label: "Name", color: "#0891B2", icon: ArrowDownAZ },
              ]}
            />
          }
          view={
            <ViewSelect
              value={view}
              onChange={setView}
              tileValue="grid"
              tableValue="table"
            />
          }
        />

      <Card className="p-0 overflow-hidden">
      {/* key=view re-mounts the panel so switching grid↔table animates. It used
          `page-in`, which is OPACITY-ONLY by design (a transform there would
          trap fixed/sticky descendants app-wide), at 0.24s with no movement
          the switch read as nothing happening (Anir, Jul 27: "what happened to
          the animation here when I go from tiles to grid? There's nothing").
          `tab-panel` is the app's own view-switch animation: it lifts 6px AND
          fades, and it's the class the customer tabs already use. */}
      <div key={view}>
      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-secondary">
          Nobody on the floor matches{" "}
          <span className="font-semibold text-text-primary">
            &ldquo;{query.trim()}&rdquo;
          </span>
          .
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4 stagger">
          {visible.map((r) => {
            const pct = r.quota > 0 ? Math.round((r.wonFY / r.quota) * 100) : 0;
            const ac = attainColor(pct);
            const trendSum = r.trend.reduce((s, x) => s + x, 0);
            return (
              <HoverExpandCard
                key={r.identityKey}
                summary={
                  <>
                    <div className="flex items-center gap-3">
                      {/* Live presence on the photo. Rendered only for real workspace
                          members — the synthetic mock roster passes no
                          lastSeenAt at all, and a dot on a person who does not
                          exist would be the exact fiction this replaced. */}
                      {r.lastSeenAt !== undefined ? (
                        <Tooltip label={presenceTip(r.lastSeenAt)} className="shrink-0">
                          <Avatar name={r.name} initialsOnly={!!r.pending} className="w-11 h-11 text-[14px] shrink-0" />
                          <PresenceDot
                            lastSeenAt={r.lastSeenAt}
                            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
                          />
                        </Tooltip>
                      ) : (
                        <span className="relative shrink-0">
                          <Avatar name={r.name} initialsOnly={!!r.pending} className="w-11 h-11 text-[14px] shrink-0" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {/* Stretched nav link — the whole card opens the rep. */}
                          <Link
                            href={`/analytics/reps/${r.slug}`}
                            className="min-w-0 text-[14.5px] font-semibold text-text-primary truncate group-hover:text-blue-primary outline-none rounded-sm after:absolute after:inset-0 after:content-['']"
                          >
                            {r.name}
                          </Link>
                          <RoleTag role={r.role} size="sm" className="relative z-10 shrink-0" />
                          {r.pending && (
                            <span
                              title={
                                r.invitedExpiresAt
                                  ? `Invited${r.invitedBy ? ` by ${r.invitedBy}` : ""} · expires ${formatDate(r.invitedExpiresAt)}`
                                  : "Invited, has not signed up yet"
                              }
                              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B45309]"
                            >
                              <Hourglass size={10} strokeWidth={2.6} aria-hidden="true" />
                              Pending
                            </span>
                          )}
                        </div>
                        {/* Title alone — the region moved to its own full-width
                            row under the rule so "UK & Ireland" never truncates
                            to "UK & Irela…" up here (Suren: "put the flag and
                            the country below the rule so that it never gets
                            cut off"). */}
                        <p className="text-[12px] text-text-secondary truncate">
                          {r.title}
                        </p>
{/* NO JOIN DATE ON THE ROSTER (Saras, Sep 2: "can you shift user
                            joining date info from the 'Team' module to 'Admin'
                            module > 'Team members' tab... No one other than
                            Admin users need to see this info", approved by
                            Anir Sep 3).

                            /team is the roster everybody reads: who somebody
                            is, what they do, how to reach them. When they
                            joined is an administrative fact, and it now lives
                            on Admin > Team members, which only admins open, in
                            all three views. */}
                      </div>
                      <span className="relative z-10 flex shrink-0 items-center gap-1.5">
                        <TeamsButton url={r.teamsUrl} name={r.name} />
                        <LinkedInLink url={r.linkedin} size={15} className={CONTACT_CHIP} />
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Open pipeline
                        </p>
                        <p className="text-[17px] font-bold text-text-primary tnum leading-none mt-1">
                          {formatMoney(r.openValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Won FY26
                        </p>
                        <p className="text-[17px] font-bold tnum leading-none mt-1" style={{ color: "#1A7A35" }}>
                          {formatMoney(r.wonFY)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                          Quota {formatMoney(r.quota)}
                        </span>
                        <span className="text-[12px] font-bold tnum" style={r.quota > 0 ? { color: ac } : undefined}>
                          {r.quota > 0 ? `${pct}%` : "No quota"}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                      </div>
                    </div>

                    {/* Clean at-a-glance card at rest — identity, headline
                        numbers, quota bar + the call action. The analytics
                        (pipeline mix, activity, stage bars, stats) reveal on
                        hover (Suren: "everything below the quota bar should
                        only show when I hover"). */}
                    {/* Both ways to reach them, in both views — the card
                        showed a number and no address at all (Anir: "the
                        email doesn't show up… it has to show for both
                        views"). */}
                    <div className="relative z-10 mt-4 flex flex-col gap-1 w-fit">
                      <a
                        href={`mailto:${r.email}`}
                        title={`Email ${r.name}`}
                        className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-blue-primary transition-colors w-fit"
                      >
                        <Mail size={12} strokeWidth={1.9} className="shrink-0" />
                        <span className="truncate">{r.email}</span>
                      </a>
                      {r.phone && (
                        <a
                          href={tel(r.phone)}
                          title={`Call ${r.phone}`}
                          className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-blue-primary transition-colors tnum w-fit"
                        >
                          <Phone size={12} strokeWidth={1.9} className="shrink-0" />
                          {r.phone}
                        </a>
                      )}
                      {/* Flag + FULL region on its own row — full width and
                          allowed to wrap, so it can never be cut off. Reps with
                          no region (the real signed-in person) get no row and
                          no dangling separator. */}
                      {r.region && (
                        <RegionLabel
                          region={r.region}
                          className="items-start whitespace-normal text-[12px] text-text-secondary"
                        />
                      )}
                    </div>
                  </>
                }
                extra={
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                      Pipeline mix by stage
                    </p>
                    <div className="mb-3.5">
                      <StageDonut rep={r} />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        Activity · last 10 weeks
                      </p>
                      <p className="text-[11px] text-text-tertiary tnum">{trendSum} touches</p>
                    </div>
                    <Sparkline
                      points={r.trend}
                      color={VIZ.blue}
                      height={38}
                      unit="touches"
                      label={`${r.name} activity`}
                      xLabels={r.trend.map((_, i) =>
                        i === r.trend.length - 1 ? "this week" : `${r.trend.length - 1 - i}w ago`
                      )}
                    />
                    <div className="mt-3.5">
                      <TripleStat rep={r} />
                    </div>
                  </>
                }
              />
            );
          })}
        </div>
      ) : (
        <PinnableTable id="team-roster">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              {/* One line, always. "Open deals" was wrapping in its own column
                  and doubling the header's height, so the rows appeared to
                  start halfway down the table (Anir, Jul 27: "that header row
                  is too thick… the actual data starts halfway through").
                  whitespace-nowrap forbids the wrap, the tighter tracking and
                  px-4 buy back the width it needs, and py-2.5 trims the strip
                  to a single text line's worth of padding. */}
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary border-b border-border-light bg-surface/50 [&>th]:whitespace-nowrap">
                <th className="px-4 py-2.5">Person</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 w-[230px]">Open pipeline</th>
                {/* A Weighted column sat here until Anir, Sep 2: "they dont
                    use weighted". Seven columns now, so the expanded panel
                    below spans seven. Every heading stays left-aligned (Anir,
                    Aug 29: "these have to be left aligned"). */}
                <th className="px-4 py-2.5">Open deals</th>
                <th className="px-4 py-2.5">Meetings</th>
                <th className="px-4 py-2.5 w-[120px]">Activity · 10w</th>
                {/* Trailing arrow column: header aligns like its cells. */}
                <th className="px-4 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light stagger">
              {visible.map((r) => {
                    const pct = r.quota > 0 ? Math.round((r.wonFY / r.quota) * 100) : 0;
                const ac = attainColor(pct);
                return (
                  <Fragment key={r.identityKey}>
                  <tr
                    onClick={() =>
                      setOpenRep(openRep === r.identityKey ? null : r.identityKey)
                    }
                    aria-expanded={openRep === r.identityKey}
                    /* THE RAIL STARTS AT THE NAME, NOT UNDER IT (Anir, Aug 26:
                       "it's almost a start where the person's name is… it's
                       supposed to take up the entire spot. You do better on
                       the goals page, so just copy whatever you did there").

                       The header row and the panel it opens are two <tr>s, and
                       only the second carried the rail — so the line began
                       halfway down the thing it was supposed to bracket. Both
                       rows carry it now, and the open header takes the same
                       surface tint the pipeline's open row uses, so the pair
                       reads as one block. */
                    className={cn(
                      "cursor-pointer transition-colors",
                      openRep === r.identityKey
                        ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        : r.you
                          ? "bg-blue-light/35 hover:bg-blue-light/50"
                          : "hover:bg-surface"
                    )}
                  >
                    <td className="px-4 py-3.5">
                      {/* Row hover popover (Suren: "on the rows page there's no
                          pop-up like the grid"), the rep's mix + headline stats. */}
{/* ONLY THE NAME NAVIGATES (Anir, Aug 17: "when my
                            cursor is on the name, that's the only time it
                            should take me to the separate page — otherwise
                            just the dropdown"). Everything else in this cell
                            falls through to the row's own toggle. */}
                        <span className="flex items-center gap-3">
                          {r.lastSeenAt !== undefined ? (
                            <Tooltip label={presenceTip(r.lastSeenAt)} className="shrink-0">
                              <Avatar name={r.name} initialsOnly={!!r.pending} className="w-10 h-10 text-[13px] shrink-0" />
                              <PresenceDot
                                lastSeenAt={r.lastSeenAt}
                                className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
                              />
                            </Tooltip>
                          ) : (
                            <span className="relative shrink-0">
                              <Avatar name={r.name} initialsOnly={!!r.pending} className="w-10 h-10 text-[13px] shrink-0" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
{/* THE CARD OPENS FROM THE NAME (Anir, Aug 20: "I should only be
                                  giving me this pop-up if my hover is over the
                                  name of the person, not the entire row"). It
                                  used to wrap the whole cell, so brushing past
                                  the avatar or the title threw a 420px card over
                                  the table. */}
                              <HoverCard
                                    side="bottom"
                                    width={420}
                                    content={
                                      <div>
                                        {/* NO IDENTITY HEADER (Anir, Aug 20: "this stuff
                                            is redundant. You already said it above"). The
                                            row you are hovering already shows the face, the
                                            name, the title and the region — repeating them
                                            inside the card spent its top third saying what
                                            the cursor is already pointing at. The card is
                                            the NUMBERS you cannot see in the row. */}
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                                            Quota attainment
                                          </span>
                                          <span className="text-[12px] font-bold tnum" style={r.quota > 0 ? { color: ac } : undefined}>
                                            {r.quota > 0 ? `${pct}%` : "No quota"}
                                          </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-3">
                                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                                        </div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Pipeline mix by stage</p>
                                        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
                                          {r.stageValues.filter((stage) => stage.value > 0).map((stage) => (
                                            <span key={stage.stage} style={{ width: `${(stage.value / Math.max(r.openValue, 1)) * 100}%`, background: stage.color }} />
                                          ))}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                                          {r.stageValues.filter((stage) => stage.value > 0).map((stage) => (
                                            <div key={stage.stage} className="flex items-center gap-1.5 text-[10px]">
                                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} />
                                              <span className="min-w-0 flex-1 text-text-secondary">{stage.stage}</span>
                                              <span className="shrink-0 font-semibold text-text-primary tnum">{Math.round((stage.value / Math.max(r.openValue, 1)) * 100)}%</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="mt-2.5"><TripleStat rep={r} /></div>

                                        {topOpenDeals(r).length > 0 && (
                                          <div className="mt-3 border-t border-border-light pt-2.5">
                                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Top open deals</p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                              {topOpenDeals(r).map((d, i) => (
                                                <div key={`${d.company}-${d.contact}-${i}`} className="flex min-w-0 items-center gap-2 rounded-md bg-surface/55 px-2 py-1.5">
                                                  {/* Company logo AND the contact's face —
                                                      the person was named in text with no
                                                      photo while the account got a mark
                                                      (Anir, Jul 26: "profile pictures,
                                                      hello"). Every person shows a face. */}
                                                  {/* The company logo stands alone; the
                                                      person's face sits WITH their name on
                                                      the line below (Anir, Jul 27: "the
                                                      profile picture of the person needs to
                                                      come next to the name, and then just
                                                      leave the company logo where it is by
                                                      itself"). Overlapping the two marks
                                                      read as one blob and attached the face
                                                      to the wrong label. */}
                                                  <CompanyLogo name={d.company} className="h-[20px] w-[20px] shrink-0 text-[7px]" />
                                                  <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[10.5px] font-medium text-text-primary">{d.company}</span>
                                                    <span className="mt-0.5 flex min-w-0 items-center gap-1">
                                                      <Avatar name={d.contact} className="h-[14px] w-[14px] shrink-0 text-[6px]" />
                                                      <span className="min-w-0 truncate text-[9px] text-text-tertiary">{d.contact}</span>
                                                    </span>
                                                  </span>
                                                  <span className="shrink-0 text-[9.5px] text-text-secondary tnum">{formatMoney(d.value)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        <div className="mt-3 border-t border-border-light pt-2.5">
                                          <div className="mb-1 flex items-center justify-between">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Activity · last 10 weeks</p>
                                            <span className="text-[10px] text-text-tertiary tnum">{r.trend.reduce((s, x) => s + x, 0)} touches</span>
                                          </div>
                                          <Sparkline points={r.trend} height={52} interactive={false} />
                                        </div>
                                        <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                                          View full breakdown →
                                        </p>
                                      </div>
                                    }
                                  >
                                  <Link
                                    href={`/analytics/reps/${r.slug}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="truncate text-[14px] font-semibold text-text-primary transition-colors hover:text-blue-primary hover:underline"
                                  >
                                    {r.name}
                                  </Link>
                              </HoverCard>
                              <RoleTag role={r.role} size="sm" className="shrink-0" />
                              {r.pending && (
                                <span
                                  title={
                                    r.invitedExpiresAt
                                      ? `Invited${r.invitedBy ? ` by ${r.invitedBy}` : ""} · expires ${formatDate(r.invitedExpiresAt)}`
                                      : "Invited, has not signed up yet"
                                  }
                                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B45309]"
                                >
                                  <Hourglass size={10} strokeWidth={2.6} aria-hidden="true" />
                                  Pending
                                </span>
                              )}
                              {/* WHICH ONE AM I (Anir, Aug 13: "can you
                                  highlight who I am? I think that would be
                                  helpful. like whichever account i am"). On a
                                  roster of fifteen near-identical rows, and
                                  especially while switching between accounts,
                                  finding yourself was a squint at the email. */}
                              {r.you && (
                                <span className="shrink-0 rounded-full bg-blue-primary px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em] text-white">
                                  You
                                </span>
                              )}
                            </span>
                            {/* Inline is fine here — the table column has the
                                width, but wrap instead of ellipsizing so a
                                long region never clips mid-word. */}
                            <span className="block text-[12px] text-text-secondary whitespace-normal break-normal">
                              {r.title}
                            </span>
                            {/* Region on its OWN line, no middot — sharing the
                                line let long titles wrap and strand the flag
                                from its place (Anir: "the country and the role
                                should always be on separate lines"). */}
                            {r.region ? (
                              <RegionLabel
                                region={r.region}
                                className="whitespace-nowrap text-[12px] text-text-secondary"
                              />
                            ) : null}
                            {/* WHEN THEY JOINED (Anir, Aug 23: "same thing
                                for: Offering, Opportunities, Customers, Team
                                — when they joined"). On the name cell, under
                                the region, in both views: the table is the
                                default one, so putting it only on the tile
                                would have shipped it where nobody looks.
                                Silent for the synthetic roster, which has no
                                real join date to report. */}
{/* NO JOIN DATE ON THE ROSTER (Saras, Sep 2: "can you shift user
                            joining date info from the 'Team' module to 'Admin'
                            module > 'Team members' tab... No one other than
                            Admin users need to see this info", approved by
                            Anir Sep 3).

                            /team is the roster everybody reads: who somebody
                            is, what they do, how to reach them. When they
                            joined is an administrative fact, and it now lives
                            on Admin > Team members, which only admins open, in
                            all three views. */}
                          </span>
                        </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <TeamsButton url={r.teamsUrl} name={r.name} />
                          <LinkedInLink url={r.linkedin} size={15} className={CONTACT_CHIP} />
                          {r.phone && (
                            <a
                              href={tel(r.phone)}
                              title={`Call ${r.phone}`}
                              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors tnum whitespace-nowrap"
                            >
                              <Phone size={13} strokeWidth={2} />
                              {r.phone}
                            </a>
                          )}
                        </div>
                        <a
                          href={`mailto:${r.email}`}
                          title={`Email ${r.name}`}
                          className="inline-flex items-center gap-1.5 text-[11.5px] text-text-tertiary hover:text-blue-primary transition-colors min-w-0"
                        >
                          <Mail size={12} strokeWidth={1.8} className="shrink-0" />
                          <span className="truncate">{r.email}</span>
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-[14px] font-semibold text-text-primary tnum">
                        {formatMoney(r.openValue)}
                      </p>
                      <div className="mt-0.5">
                        <PipelineBarInspector rep={r} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[14px] text-text-secondary tnum">
                      {r.openCount}
                    </td>
                    <td className="px-4 py-3.5 text-[14px] text-text-secondary tnum">
                      {r.meetings}
                    </td>
                    <td className="px-4 py-3.5">
                      <ActivityTrendInspector rep={r} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="flex items-center justify-end gap-0.5">
                        <Link
                          href={`/analytics/reps/${r.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open ${r.name}'s analytics`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-blue-primary hover:bg-blue-light/50 transition-colors"
                        >
                          <ArrowRight size={16} strokeWidth={1.9} />
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRep(openRep === r.identityKey ? null : r.identityKey);
                          }}
                          aria-expanded={openRep === r.identityKey}
                          aria-label={`${openRep === r.identityKey ? "Hide" : "Show"} ${r.name}'s numbers`}
                          className="cursor-pointer rounded-md p-1 transition-colors hover:bg-surface"
                        >
                          <ChevronDown
                            size={16}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "text-text-tertiary transition-transform",
                              openRep === r.identityKey && "rotate-180 text-blue-primary"
                            )}
                          />
                        </button>
                      </span>
                    </td>
                  </tr>
                  {openRep === r.identityKey && (
                    <tr className="!border-t-0 bg-surface">
                      <td
                        colSpan={7}
                        className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                      >
                        {/* THE NUMBERS AS TILES, IN ONE ROW (Anir, Aug 16:
                            "when I click on the team member, it should show me
                            something like this instead of whatever you have
                            right now. Again, remove those separations. its
                            part of one row right"). Eight identical label/value
                            pairs made the four numbers that matter look like
                            metadata. They are tiles now — icon, name, number —
                            divided by a rule rather than boxed one by one,
                            because it is one row. */}
                        <div className="tab-panel rounded-xl bg-white ring-1 ring-inset ring-[color:var(--border-light)]">
                          {/* Three tiles, not four: the Weighted forecast tile
                              came out on Anir, Sep 2 ("they dont use
                              weighted"), and the grid closes up behind it so
                              the row still divides evenly. */}
                          <div className="grid grid-cols-3 divide-x divide-border-light">
                            {[
                              { icon: DollarSign, label: "Open pipeline", value: formatMoney(r.openValue), sub: `${r.openCount} live ${r.openCount === 1 ? "deal" : "deals"}` },
                              { icon: Layers, label: "Open deals", value: String(r.openCount), sub: "in the pipeline" },
                              { icon: CalendarDays, label: "Meetings", value: String(r.meetings), sub: "booked" },
                            ].map((t) => (
                              <div key={t.label} className="min-w-0 px-4 py-3">
                                <span className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                                    <t.icon size={14} strokeWidth={2.2} />
                                  </span>
                                  <span className="truncate text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                    {t.label}
                                  </span>
                                </span>
                                <span className="mt-2 flex items-baseline gap-1.5">
                                  <b className="text-[21px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
                                    {t.value}
                                  </b>
                                  <span className="truncate text-[11.5px] text-text-secondary">
                                    {t.sub}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* Who they are, under the numbers, on one line. */}
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border-light px-4 py-2.5 text-[12px]">
                            <span className="text-text-secondary">{r.title}</span>
                            <span className="flex items-center gap-1.5 text-text-secondary">
                              <MapPin size={12} strokeWidth={2.2} className="text-text-tertiary" />
                              {r.region || ", "}
                            </span>
                            {r.email && (
                              <a
                                href={`mailto:${r.email}`}
                                className="flex items-center gap-1.5 text-blue-primary hover:underline"
                              >
                                <Mail size={12} strokeWidth={2.2} /> {r.email}
                              </a>
                            )}
                            {r.phone && (
                              <a
                                href={`tel:${r.phone}`}
                                className="flex items-center gap-1.5 text-blue-primary hover:underline"
                              >
                                <Phone size={12} strokeWidth={2.2} /> {r.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </PinnableTable>
      )}
      </div>
      </Card>
    </div>
  );
}


