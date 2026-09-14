"use client";

import { useMemo } from "react";
import { AreaChart, BarChart, DonutChart, VIZ_SERIES, type TipItem } from "@/components/charts/Charts";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadSourceColor,
  leadStatusColor,
  type Lead,
} from "@/lib/leadsShared";

const DAY = 86_400_000;
const WEEK = DAY * 7;
const WEEKS = 12;

function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function percentage(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export function LeadAnalytics({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const dated = leads
      .map((lead) => ({ lead, time: Date.parse(lead.createdAt) }))
      .filter((item) => Number.isFinite(item.time));

    if (!dated.length) return null;

    // End the window on the newest real intake. Mock fixtures and imported
    // workspaces may intentionally live in another date range; anchoring to
    // Date.now() would turn those real records into an empty graph.
    const latest = Math.max(...dated.map((item) => item.time));
    const end = new Date(latest);
    end.setHours(23, 59, 59, 999);
    const start = end.getTime() - WEEKS * WEEK;

    const weekly = Array.from({ length: WEEKS }, (_, index) => ({
      start: start + index * WEEK,
      leads: [] as Lead[],
    }));
    for (const item of dated) {
      const index = Math.floor((item.time - start) / WEEK);
      if (index >= 0 && index < WEEKS) weekly[index].leads.push(item.lead);
    }

    const statusSegments = LEAD_STATUSES.map((status) => {
      const records = leads.filter((lead) => lead.status === status);
      return {
        label: status,
        value: records.length,
        color: leadStatusColor(status),
        tip: records.map((lead) => ({
          avatar: lead.name,
          name: lead.company,
          sub: lead.name,
          value: lead.ref,
        })),
      };
    }).filter((segment) => segment.value > 0);

    const sourceBars = LEAD_SOURCES.map((source, index) => {
      const records = leads.filter((lead) => lead.source === source);
      const converted = records.filter((lead) => lead.status === "Converted").length;
      return {
        label: source,
        value: records.length,
        color: leadSourceColor(source) || VIZ_SERIES[index % VIZ_SERIES.length],
        caption: `${converted} converted`,
        tipNote: `${percentage(converted, records.length)}% reached an opportunity`,
        tip: records.map((lead) => ({
          avatar: lead.name,
          name: lead.company,
          sub: `${lead.name} · ${lead.status}`,
          value: lead.ref,
        })),
      };
    }).filter((bar) => bar.value > 0);

    return {
      latest,
      series: weekly.map((week) => week.leads.length),
      labels: weekly.map((week) => shortDate(week.start)),
      tips: weekly.map((week) =>
        week.leads.map(
          (lead): TipItem => ({
            avatar: lead.name,
            name: lead.company,
            sub: `${lead.name} · ${lead.status}`,
            value: lead.ref,
          })
        )
      ),
      statusSegments,
      sourceBars,
    };
  }, [leads]);

  if (!data) return null;

  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">How leads are moving</h2>
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">
            Intake, current stage and source performance from the leads in this workspace.
          </p>
        </div>
        <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary tnum">
          Through {shortDate(data.latest)}
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border-light xl:grid-cols-[1.35fr_.8fr_1.15fr] xl:divide-x xl:divide-y-0">
        <section className="min-w-0 px-5 pb-6 pt-4">
          <div className="flex items-center gap-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              New leads · last 12 weeks
            </h3>
            <InfoHint text="Each point is the exact number of leads received in that seven-day period. The window ends on the newest lead in this workspace." />
          </div>
          <p className="mt-1 text-[22px] font-bold text-text-primary tnum">
            {data.series.reduce((sum, value) => sum + value, 0)}
          </p>
          <p className="text-[11.5px] text-text-secondary">received during this window</p>
          <div className="mt-5 pb-4">
            <AreaChart
              id="lead-intake-area"
              data={data.series}
              xLabels={data.labels}
              pointTips={data.tips}
              height={176}
              format="number"
              unit="leads"
            />
          </div>
        </section>

        <section className="min-w-0 px-5 pb-5 pt-4">
          <div className="flex items-center gap-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Where they sit now
            </h3>
            <InfoHint text="Current lead status. This does not pretend to be stage history: the lead record stores its current stage, not every previous stage change." />
          </div>
          <div className="mt-4 flex justify-center">
            <DonutChart
              segments={data.statusSegments}
              centerLabel={String(leads.length)}
              centerSub="leads"
              size={148}
              thickness={17}
              format="number"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {data.statusSegments.map((segment) => (
              <div key={segment.label} className="flex min-w-0 items-center gap-2 text-[11.5px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
                <span className="truncate text-text-secondary">{segment.label}</span>
                <span className="ml-auto font-semibold text-text-primary tnum">{segment.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 px-5 pb-5 pt-4">
          <div className="flex items-center gap-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Leads by source
            </h3>
            <InfoHint text="Bar height is lead volume. The caption under each source shows how many of those leads became opportunities." />
          </div>
          <p className="mt-1 text-[11.5px] text-text-secondary">
            Volume at rest; conversion detail on hover.
          </p>
          <div className="mt-3">
            <BarChart
              data={data.sourceBars}
              height={210}
              format="number"
              unit="leads"
              tipRecordsLabel="Leads from this source"
              hideFullHeightGhost
              maxBarWidth={54}
            />
          </div>
        </section>
      </div>
    </Card>
  );
}
