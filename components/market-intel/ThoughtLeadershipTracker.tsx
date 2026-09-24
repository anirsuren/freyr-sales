"use client";

import { readableTitle } from "@/lib/marketIntelText";
import { useState } from "react";
import { safeHref } from "@/lib/safeUrl";
import { fmtWhen } from "@/lib/whenLabel";
import {
  ArrowDownAZ,
  CalendarClock,
  ExternalLink,
  FileText,
  Layers,
  LayoutGrid,
  List,
  Pill,
  Podcast,
  Presentation,
  ScrollText,
  ShoppingBag,
  Stethoscope,
  ClipboardList,
  Telescope,
  Scale,
  Microscope,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { PrioritySearchInput, SearchPriority } from "@/components/ui/SearchPriority";
import type { ThoughtBoard, ThoughtItem } from "@/lib/marketIntelFeed";
import { THOUGHT_FIRMS } from "@/lib/marketIntelThoughtSources";
import { tint } from "@/lib/tint";

/**
 * THE THOUGHT-LEADERSHIP TRACKER (Anant via Saras, Sep 10): what the big
 * consulting and analyst firms are publishing about pharma, devices, consumer
 * health and regulation. Same anatomy as the M&A board beside it: a search,
 * multiselect filters, one card per publication, every card linking to the
 * firm's own page.
 */
const TOPIC_META: Record<ThoughtItem["topic"], { color: string; icon: LucideIcon }> = {
  "Medicinal Products": { color: "var(--ink-bright-blue)", icon: Pill },
  "Medical Devices": { color: "var(--ink-teal-deep)", icon: Stethoscope },
  Consumer: { color: "var(--ink-orange)", icon: ShoppingBag },
  Regulatory: { color: "var(--ink-violet)", icon: Scale },
  "Life sciences": { color: "#0F6E56", icon: Microscope },
};

const TYPE_META: Record<ThoughtItem["type"], { label: string; icon: LucideIcon }> = {
  report: { label: "Report", icon: FileText },
  study: { label: "Study", icon: ClipboardList },
  survey: { label: "Survey", icon: ClipboardList },
  outlook: { label: "Outlook", icon: Telescope },
  article: { label: "Article", icon: ScrollText },
  webinar: { label: "Webinar", icon: Presentation },
  podcast: { label: "Podcast", icon: Podcast },
};

const fmtDate = fmtWhen;

type Sort = "newest" | "firm" | "topic";

export function ThoughtLeadershipTracker({ board, layout, onLayoutChange }: { board: ThoughtBoard | null; layout: "table" | "tile"; onLayoutChange: (layout: "table" | "tile") => void }) {
  const [firms, setFirms] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState("");

  const items = (board?.items ?? []).filter((item) => readableTitle(item.title));
  const q = query.trim().toLowerCase();
  const shown = items
    .filter((item) => {
      if (firms.length > 0 && !firms.includes(item.firm)) return false;
      if (topics.length > 0 && !topics.includes(item.topic)) return false;
      if (types.length > 0 && !types.includes(item.type)) return false;
      return (
        !q ||
        [item.firm, item.title, item.summary, item.topic].join(" ").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "firm") return a.firm.localeCompare(b.firm) || byDate(a, b);
      if (sort === "topic") return a.topic.localeCompare(b.topic) || byDate(a, b);
      return byDate(a, b);
    });
  const firmsSeen = [...new Set(items.map((i) => i.firm))].sort();

  return (
    <div>
      <SearchPriority query={query} className="mb-4 flex flex-wrap items-center gap-2">
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search reports and studies…"
          ariaLabel="Search thought leadership"
          grow
          className="min-w-[200px] flex-1"
        />
        <span className="px-1 text-[12px] font-medium text-text-secondary tnum">
          {shown.length} of {items.length}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <FilterMenu
            ariaLabel="Filter publications"
            groups={[
              { key: "firm", label: "Firm", values: firms, onChange: setFirms,
                options: (firmsSeen.length ? firmsSeen : THOUGHT_FIRMS.map((firm) => firm.name)).map((firm) => ({
                  value: firm, label: firm, logoName: firm,
                })) },
              { key: "topic", label: "Topic", values: topics, onChange: setTopics,
                options: (Object.keys(TOPIC_META) as ThoughtItem["topic"][]).map((topic) => ({
                  value: topic, label: topic, color: TOPIC_META[topic].color, icon: TOPIC_META[topic].icon,
                })) },
              { key: "type", label: "Type", values: types, onChange: setTypes,
                options: (Object.keys(TYPE_META) as ThoughtItem["type"][]).map((type) => ({
                  value: type, label: TYPE_META[type].label, color: "var(--ink-violet)", icon: TYPE_META[type].icon,
                })) },
            ]}
            onClearAll={() => { setFirms([]); setTopics([]); setTypes([]); }}
          />
          <ColorSelect
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            ariaLabel="Sort publications"
            minWidth={165}
            dense
            collapsible={false}
            options={[
              { value: "newest", label: "By newest", color: "var(--ink-bright-blue)", icon: CalendarClock },
              { value: "firm", label: "By firm (A to Z)", color: "var(--ink-violet-soft)", icon: ArrowDownAZ },
              { value: "topic", label: "By topic", color: "#0F6E56", icon: Layers },
            ]}
          />
          <ColorSelect
            value={layout}
            onChange={(value) => onLayoutChange(value as "table" | "tile")}
            ariaLabel={`Publication view: ${layout === "table" ? "Table" : "Tile"}`}
            iconOnly
            options={[
              { value: "table", label: "Table view", color: "var(--ink-bright-blue)", icon: List },
              { value: "tile", label: "Tile view", color: "var(--ink-bright-blue)", icon: LayoutGrid },
            ]}
          />
        </span>
      </SearchPriority>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-[13px] leading-relaxed text-text-secondary">
          {items.length === 0
            ? "The tracker fills with reports and studies on the next refresh."
            : "Nothing matches that search and filter."}
        </Card>
      ) : layout === "table" ? (
        <div key="thought-table" className="market-layout-enter overflow-x-auto rounded-2xl border border-border-light bg-white">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[170px_minmax(300px,1fr)_175px_110px_120px] gap-4 border-b border-border-light bg-surface/80 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
              <span>Firm</span><span>Publication</span><span>Topic</span><span>Type</span><span>Published</span>
            </div>
            <div className="divide-y divide-border-light">
              {shown.map((item, index) => {
                const topic = TOPIC_META[item.topic];
                const type = TYPE_META[item.type];
                const TIcon = topic.icon;
                const KIcon = type.icon;
                const href = safeHref(item.url);
                return (
                  <div key={`${item.url}-${index}`} className="grid grid-cols-[170px_minmax(300px,1fr)_175px_110px_120px] items-start gap-4 px-5 py-4 hover:bg-surface/60">
                    <span className="flex items-center gap-2.5"><CompanyLogo name={item.firm} className="h-8 w-8 shrink-0" /><span className="text-[12.5px] font-semibold text-text-primary">{item.firm}</span></span>
                    <span className="min-w-0">
                      {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-[12.5px] font-semibold leading-snug text-blue-primary hover:underline">{item.title}<ExternalLink size={12} className="mt-0.5 shrink-0" /></a> : <span className="text-[12.5px] font-semibold text-text-primary">{item.title}</span>}
                      {item.summary && <span className="mt-1 block text-[11.5px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{item.summary}</span>}
                    </span>
                    <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: topic.color, background: tint(topic.color, 8) }}><TIcon size={11} />{item.topic}</span>
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[rgba(109,40,217,0.10)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--ink-violet)]"><KIcon size={11} />{type.label}</span>
                    <span className="text-[11.5px] text-text-secondary" suppressHydrationWarning>{fmtDate(item.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div key="thought-tile" className="market-layout-enter grid grid-cols-1 gap-3 md:grid-cols-2 stagger">
          {shown.map((item, index) => {
            const topic = TOPIC_META[item.topic];
            const type = TYPE_META[item.type];
            const TIcon = topic.icon;
            const KIcon = type.icon;
            return (
              <Card
                key={`${item.url}-${index}`}
                className="flex flex-col border-l-[3px] p-5"
                style={{ borderLeftColor: topic.color }}
              >
                <div className="flex items-start gap-3">
                  <CompanyLogo name={item.firm} className="h-9 w-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-text-primary">{item.firm}</span>
                      <span className="text-[11.5px] text-text-tertiary" suppressHydrationWarning>
                        {fmtDate(item.date)}
                      </span>
                    </p>
                    <h3 className="mt-1 text-[14px] font-semibold leading-snug text-text-primary">
                      {item.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                    style={{ color: topic.color, background: tint(topic.color, 8) }}
                  >
                    <TIcon size={10.5} strokeWidth={2.2} /> {item.topic}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-[rgba(109,40,217,0.10)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-violet)]">
                    <KIcon size={10.5} strokeWidth={2.2} /> {type.label}
                  </span>
                </p>
                {item.summary && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">
                    {item.summary}
                  </p>
                )}
                <a
                  href={safeHref(item.url) as string}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-auto inline-flex items-center gap-1 pt-2 text-[12px] font-semibold text-blue-primary hover:underline"
                >
                  Read it on {item.firm}&apos;s site <ExternalLink size={11} strokeWidth={2.2} />
                </a>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}

function byDate(a: ThoughtItem, b: ThoughtItem): number {
  return (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0);
}
