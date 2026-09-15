"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { AreaChart, DonutChart, type TipItem } from "@/components/charts/Charts";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { LocalTime } from "@/components/ui/LocalTime";
import { Modal } from "@/components/ui/Modal";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadSourceColor,
  leadStatusColor,
  type Lead,
  type LeadSource,
} from "@/lib/leadsShared";
import { repSlug } from "@/lib/team";
import { tint } from "@/lib/tint";

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
  const [sourceDetail, setSourceDetail] = useState<LeadSource | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
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
        })),
      };
    }).filter((segment) => segment.value > 0);

    const sourceBars = LEAD_SOURCES.map((source) => {
      const records = leads.filter((lead) => lead.source === source);
      const converted = records.filter((lead) => lead.status === "Converted").length;
      return {
        label: source,
        value: records.length,
        converted,
        conversionRate: percentage(converted, records.length),
        color: leadSourceColor(source),
      };
    })
      .filter((bar) => bar.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

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
          })
        )
      ),
      statusSegments,
      sourceBars,
    };
  }, [leads]);

  if (!data) return null;
  const maxSourceValue = Math.max(...data.sourceBars.map((bar) => bar.value), 1);
  const sourceLeads = sourceDetail
    ? leads.filter((lead) => lead.source === sourceDetail)
    : [];
  const sourceNeedle = sourceQuery.trim().toLowerCase();
  const matchingSourceLeads = sourceNeedle
    ? sourceLeads.filter((lead) =>
        [
          lead.name,
          lead.company,
          lead.title,
          lead.status,
          lead.owner,
          lead.interest,
          lead.ref,
        ].some((value) => value?.toLowerCase().includes(sourceNeedle))
      )
    : sourceLeads;
  const sourceConverted = sourceLeads.filter((lead) => lead.status === "Converted").length;
  const sourceOpen = sourceLeads.filter((lead) =>
    lead.status !== "Converted" && lead.status !== "Disqualified"
  ).length;

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
              Source performance
            </h3>
            <InfoHint text="Bar length is lead volume. The aligned figures show total leads and how many reached an opportunity. Every value comes from the lead records in this workspace." />
          </div>
          <div className="mt-3 grid grid-cols-[minmax(150px,1fr)_72px_154px_14px] items-end gap-3 border-b border-border-light pb-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <span>Source &amp; volume</span>
            <span>Total leads</span>
            <span>Became opportunities</span>
            <span aria-hidden="true" />
          </div>
          <div className="mt-1.5 space-y-0.5">
            {data.sourceBars.map((bar) => (
              <button
                type="button"
                key={bar.label}
                onClick={() => {
                  setSourceQuery("");
                  setSourceDetail(bar.label);
                }}
                aria-label={`Open all ${bar.value} ${bar.label} leads`}
                className="group grid w-full grid-cols-[minmax(150px,1fr)_72px_154px_14px] items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary"
                title={`${bar.label}: ${bar.value} leads, ${bar.converted} converted (${bar.conversionRate}%)`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-medium text-text-secondary">
                    {bar.label}
                  </span>
                  <span className="relative mt-1.5 block h-2 overflow-hidden rounded-full bg-surface">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.max(5, (bar.value / maxSourceValue) * 100)}%`,
                        background: bar.color,
                      }}
                    />
                  </span>
                </span>
                <strong className="text-[12px] font-semibold text-text-primary tnum">
                  {bar.value}
                </strong>
                <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-left tnum">
                  <strong className="text-[12px] font-semibold" style={{ color: bar.color }}>
                    {bar.converted}
                  </strong>
                  <span className="text-[10.5px] text-text-tertiary">
                    {bar.conversionRate}% of leads
                  </span>
                </span>
                <ChevronRight
                  size={14}
                  strokeWidth={2.2}
                  className="text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      </div>

      <Modal
        open={!!sourceDetail}
        onClose={() => setSourceDetail(null)}
        title={sourceDetail ? `${sourceDetail} leads` : "Source leads"}
        titleAfter={
          <span className="rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-bold text-blue-primary tnum">
            {sourceLeads.length}
          </span>
        }
        size="chart"
        tall
        bodyClassName="flex flex-col !p-0"
      >
        <div className="shrink-0 border-b border-border-light bg-white p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Total leads", sourceLeads.length],
              ["Still open", sourceOpen],
              ["Converted", sourceConverted],
              ["Conversion", `${percentage(sourceConverted, sourceLeads.length)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border-light bg-surface/55 px-3 py-2.5">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {label}
                </span>
                <strong className="mt-0.5 block text-[18px] font-bold text-text-primary tnum">
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <label className="relative mt-3 block">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              aria-hidden="true"
            />
            <input
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              placeholder={`Search ${sourceDetail ?? "source"} leads...`}
              aria-label={`Search ${sourceDetail ?? "source"} leads`}
              autoFocus
              className="h-10 w-full rounded-xl border border-border-light bg-surface pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:bg-white"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {matchingSourceLeads.length ? (
            <table className="w-full min-w-[1120px] table-fixed text-left">
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border-light)]">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-4 [&>th]:py-2.5">
                  <th className="w-[18%]">Lead</th>
                  <th className="w-[17%]">Company</th>
                  <th className="w-[12%]">Status</th>
                  <th className="w-[14%]">Owner</th>
                  <th className="w-[21%]">What they asked about</th>
                  <th className="w-[9%]">Came in</th>
                  <th className="w-[9%]">Last moved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {matchingSourceLeads.map((lead) => {
                  const statusColor = leadStatusColor(lead.status);
                  return (
                    <tr key={lead.id} className="align-top transition-colors hover:bg-surface/60 [&>td]:px-4 [&>td]:py-3">
                      <td>
                        <span className="flex min-w-0 items-start gap-2.5">
                          <Avatar name={lead.name} initialsOnly className="h-8 w-8 shrink-0 text-[9px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-[12.5px] font-semibold text-text-primary">{lead.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{lead.title || lead.ref}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        {lead.customerId ? (
                          <Link href={`/customers/${lead.customerId}`} className="group/company flex min-w-0 items-center gap-2 text-[12px] font-medium text-text-secondary hover:text-blue-primary">
                            <CompanyLogo name={lead.company} className="h-7 w-7 shrink-0 text-[8px]" />
                            <span className="min-w-0 truncate group-hover/company:underline">{lead.company}</span>
                            <ArrowUpRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover/company:opacity-100" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-text-secondary">
                            <CompanyLogo name={lead.company} className="h-7 w-7 shrink-0 text-[8px]" />
                            <span className="min-w-0 truncate">{lead.company}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: tint(statusColor, 9), color: statusColor }}
                        >
                          {lead.status}
                        </span>
                        {lead.disqualifiedReason ? (
                          <span className="mt-1.5 block line-clamp-2 text-[10.5px] leading-4 text-text-tertiary" title={lead.disqualifiedReason}>
                            {lead.disqualifiedReason}
                          </span>
                        ) : null}
                        {lead.convertedOpportunityId ? (
                          <Link href={`/opportunities/${lead.convertedOpportunityId}`} className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-primary hover:underline">
                            Open opportunity <ArrowUpRight size={11} aria-hidden="true" />
                          </Link>
                        ) : null}
                      </td>
                      <td>
                        {lead.owner ? (
                          <Link href={`/analytics/reps/${repSlug(lead.owner)}`} className="group/owner flex min-w-0 items-center gap-2 text-[12px] text-text-secondary hover:text-blue-primary">
                            <Avatar name={lead.owner} className="h-6 w-6 shrink-0 text-[8px]" />
                            <span className="min-w-0 truncate group-hover/owner:underline">{lead.owner}</span>
                          </Link>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <p className="line-clamp-3 text-[11.5px] leading-[1.45] text-text-secondary" title={lead.interest || undefined}>
                          {lead.interest || "No request recorded"}
                        </p>
                      </td>
                      <td className="text-[11px] leading-4 text-text-secondary tnum">
                        <LocalTime value={lead.createdAt} />
                      </td>
                      <td className="text-[11px] leading-4 text-text-secondary tnum">
                        <LocalTime value={lead.updatedAt || lead.createdAt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex min-h-56 items-center justify-center px-6 text-center">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">No matching leads</p>
                <p className="mt-1 text-[12px] text-text-secondary">Try a different person, company, status, or owner.</p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
