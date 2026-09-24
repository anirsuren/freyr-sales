"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowDownAZ,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  Clock3,
  Globe2,
  Handshake,
  History,
  ListChecks,
  Mail,
  Maximize2,
  Megaphone,
  Search,
  Send,
  UserRound,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { AreaChart, DonutChart, type TipItem } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
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
  type LeadStatus,
} from "@/lib/leadsShared";
import { repSlug } from "@/lib/team";
import { tint } from "@/lib/tint";
import { companyDestination } from "@/lib/companyDestination";
import { formatPhoneNumber } from "@/lib/phone";

const DAY = 86_400_000;
const WEEK = DAY * 7;
const WEEKS = 12;

const LEAD_SOURCE_ICONS: Record<LeadSource, LucideIcon> = {
  Website: Globe2,
  Conference: CalendarDays,
  Referral: UserRoundCheck,
  Campaign: Megaphone,
  "Inbound email": Mail,
  Partner: Handshake,
  Outbound: Send,
  Other: CircleEllipsis,
};

function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function percentage(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function LeadRowDetails({ lead, columns, companyHref }: { lead: Lead; columns: number; companyHref: string }) {
  return (
    <tr className="bg-surface/50">
      <td colSpan={columns} className="px-5 py-4">
        <div className="rounded-xl border border-border-light bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">What they asked about</p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-text-primary">{lead.interest || "No request recorded"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Contact</p>
              <div className="mt-1 flex flex-col gap-1 text-[12.5px]">
                {lead.name ? <Link href={lead.contactId ? `/contacts/${lead.contactId}` : `/leads/${lead.id}/contact`} className="font-semibold text-blue-primary hover:underline">Open {lead.name}&apos;s contact record</Link> : null}
                {lead.email ? <a href={`mailto:${lead.email}`} className="text-blue-primary hover:underline">{lead.email}</a> : null}
                {lead.phone ? <a href={`tel:${lead.phone}`} className="text-blue-primary hover:underline">{formatPhoneNumber(lead.phone)}</a> : null}
                {lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-primary hover:underline">LinkedIn profile ↗</a> : null}
                {!lead.email && !lead.phone && !lead.linkedinUrl ? <span className="text-text-tertiary">No contact details</span> : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Background</p>
              <p className="mt-1 text-[12.5px] leading-5 text-text-primary">
                {lead.title && <>{lead.title} · </>}
                <Link href={companyHref} className="font-semibold text-blue-primary hover:underline">{lead.company}</Link>
                {lead.country && <> · {lead.country}</>}
              </p>
              {lead.note ? <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-text-secondary">{lead.note}</p> : null}
              {lead.disqualifiedReason ? <p className="mt-2 text-[12px] leading-5 text-text-secondary">Reason: {lead.disqualifiedReason}</p> : null}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Timeline</p>
              <p className="mt-1 text-[12px] text-text-secondary">Came in <LocalTime value={lead.createdAt} /></p>
              <p className="mt-1 text-[12px] text-text-secondary">Last moved <LocalTime value={lead.updatedAt || lead.createdAt} /></p>
              <p className="mt-1 text-[12px] text-text-secondary">Owner: {lead.owner || "Unassigned"}</p>
            </div>
          </div>
          <Link href={`/leads?lead=${encodeURIComponent(lead.ref)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline">
            Open full lead <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

export function LeadAnalytics({ leads }: { leads: Lead[] }) {
  const companyHref = (lead: Lead) => companyDestination(lead.company, lead.customerId);
  const [statusWorkspaceOpen, setStatusWorkspaceOpen] = useState(false);
  const [statusWorkspaceFilter, setStatusWorkspaceFilter] = useState<
    LeadStatus | "all"
  >("all");
  const [statusWorkspaceQuery, setStatusWorkspaceQuery] = useState("");
  const [sourceWorkspaceOpen, setSourceWorkspaceOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sourceSort, setSourceSort] = useState<
    | "newest"
    | "oldest"
    | "recently_moved"
    | "stale"
    | "name"
    | "company"
    | "source"
    | "status"
    | "owner"
  >("newest");
  const [sourceQuery, setSourceQuery] = useState("");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
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
          logo: lead.company,
          avatar: lead.name,
          name: lead.company,
          stage: lead.status,
        })),
      };
    });

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
            logo: lead.company,
            avatar: lead.name,
            name: lead.company,
            stage: lead.status,
          })
        )
      ),
      pointDetails: weekly.map((week) => ({
        label: `${shortDate(week.start)}–${shortDate(week.start + WEEK - DAY)}`,
        records: [...week.leads]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((lead) => ({
            label: lead.name,
            meta: [lead.company, lead.title, lead.source, lead.owner || "Unassigned"].filter(Boolean).join(" · "),
            value: lead.status,
          })),
      })),
      statusSegments,
      sourceBars,
    };
  }, [leads]);

  if (!data) return null;
  const activeStatusSegments = data.statusSegments.filter(
    (segment) => segment.value > 0
  );
  const maxSourceValue = Math.max(...data.sourceBars.map((bar) => bar.value), 1);
  const sourceLeads =
    sourceFilter === "all"
      ? leads
      : leads.filter((lead) => lead.source === sourceFilter);
  const sourceNeedle = sourceQuery.trim().toLowerCase();
  const matchingSourceLeads = sourceLeads
    .filter(
      (lead) =>
        statusFilter === "all" || lead.status === statusFilter
    )
    .filter(
      (lead) => ownerFilter === "all" || (lead.owner || "Unassigned") === ownerFilter
    )
    .filter(
      (lead) =>
        !sourceNeedle ||
        [
          lead.name,
          lead.company,
          lead.title,
          lead.source,
          lead.status,
          lead.owner,
          lead.interest,
          lead.ref,
        ].some((value) => value?.toLowerCase().includes(sourceNeedle))
    )
    .sort((a, b) => {
      if (sourceSort === "oldest") {
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      }
      if (sourceSort === "name") return a.name.localeCompare(b.name);
      if (sourceSort === "company") return a.company.localeCompare(b.company);
      if (sourceSort === "source") return a.source.localeCompare(b.source);
      if (sourceSort === "status") return a.status.localeCompare(b.status);
      if (sourceSort === "owner") {
        return (a.owner || "Unassigned").localeCompare(b.owner || "Unassigned");
      }
      if (sourceSort === "recently_moved") {
        return (
          Date.parse(b.updatedAt || b.createdAt) -
          Date.parse(a.updatedAt || a.createdAt)
        );
      }
      if (sourceSort === "stale") {
        return (
          Date.parse(a.updatedAt || a.createdAt) -
          Date.parse(b.updatedAt || b.createdAt)
        );
      }
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  const sourceConverted = sourceLeads.filter((lead) => lead.status === "Converted").length;
  const sourceStillOpen = sourceLeads.filter((lead) =>
    lead.status !== "Converted" && lead.status !== "Disqualified"
  ).length;
  const sourceOwners = Array.from(
    new Set(leads.map((lead) => lead.owner || "Unassigned"))
  ).sort((a, b) => a.localeCompare(b));

  const statusNeedle = statusWorkspaceQuery.trim().toLowerCase();
  const statusWorkspaceLeads = leads
    .filter(
      (lead) =>
        statusWorkspaceFilter === "all" || lead.status === statusWorkspaceFilter
    )
    .filter(
      (lead) =>
        !statusNeedle ||
        [
          lead.name,
          lead.company,
          lead.title,
          lead.source,
          lead.owner,
          lead.interest,
          lead.ref,
        ].some((value) => value?.toLowerCase().includes(statusNeedle))
    )
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt) -
        Date.parse(a.updatedAt || a.createdAt)
    );

  function openStatusWorkspace(status: LeadStatus | "all") {
    setStatusWorkspaceFilter(status);
    setStatusWorkspaceQuery("");
    setStatusWorkspaceOpen(true);
  }

  function openSourceWorkspace(source: LeadSource | "all") {
    setSourceFilter(source);
    setStatusFilter("all");
    setOwnerFilter("all");
    setSourceSort("newest");
    setSourceQuery("");
    setSourceWorkspaceOpen(true);
  }

  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="border-b border-border-light px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">How leads are moving</h2>
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">
            Intake, current stage and source performance from the leads in this workspace.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(620px,1.2fr)]">
        <div className="min-w-0 divide-y divide-border-light">
        <section className="min-w-0 px-5 pb-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                New leads · last 12 weeks
              </h3>
              <InfoHint text="Each point is the exact number of leads received in that seven-day period. The window ends on the newest lead in this workspace." />
            </div>
            <ExpandedChartModal
              title="New leads · last 12 weeks"
              triggerLabel="Expand lead intake"
              chart={{
                kind: "area",
                id: "lead-intake",
                label: "New leads",
                color: "#0071E3",
                data: data.series,
                xLabels: data.labels,
                pointTips: data.tips,
                pointDetails: data.pointDetails,
                format: "number",
                unit: "leads",
              }}
            />
          </div>
          <p className="mt-1 text-[22px] font-bold text-text-primary tnum">
            {data.series.reduce((sum, value) => sum + value, 0)}
          </p>
          <p className="text-[11.5px] text-text-secondary">received during this window</p>
          <div className="mt-4 pb-2">
            <AreaChart
              id="lead-intake-area"
              data={data.series}
              xLabels={data.labels}
              pointTips={data.tips}
              height={196}
              format="number"
              unit="leads"
            />
          </div>
        </section>

        <section className="min-w-0 px-5 pb-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Where they sit now
              </h3>
              <InfoHint text="Current lead status. This does not pretend to be stage history: the lead record stores its current stage, not every previous stage change." />
            </div>
            <button
              type="button"
              onClick={() => openStatusWorkspace("all")}
              aria-label="Open lead status and records"
              title="Open lead status and records"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-text-primary shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
            >
              <Maximize2 size={14} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid items-center gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="flex justify-center">
              <DonutChart
                segments={activeStatusSegments}
                centerLabel={String(leads.length)}
                centerSub="leads"
                size={132}
                thickness={15}
                format="number"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
              {activeStatusSegments.map((segment) => (
                <button
                  type="button"
                  key={segment.label}
                  onClick={() => openStatusWorkspace(segment.label as LeadStatus)}
                  aria-label={`Open ${segment.value} ${segment.label} leads`}
                  className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[11.5px] transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
                  <span className="truncate text-text-secondary">{segment.label}</span>
                  <span className="ml-auto font-semibold text-text-primary tnum">{segment.value}</span>
                  <ChevronRight size={12} className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </section>
        </div>

        <section className="min-w-0 border-t border-border-light px-5 pb-5 pt-4 xl:border-l xl:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Source performance
              </h3>
              <InfoHint text="Bar length is lead volume. The aligned figures show total leads and how many reached an opportunity. Every value comes from the lead records in this workspace." />
            </div>
            <button
              type="button"
              onClick={() => openSourceWorkspace("all")}
              aria-label="Expand Source Performance"
              title="Expand Source Performance"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-text-primary shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
            >
              <Maximize2 size={14} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(150px,1fr)_72px_154px_14px] items-end gap-3 border-b border-border-light px-1.5 pb-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
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
                  openSourceWorkspace(bar.label);
                }}
                aria-label={`Open all ${bar.value} ${bar.label} leads`}
                className="group grid w-full grid-cols-[minmax(150px,1fr)_72px_154px_14px] grid-rows-[auto_8px] items-center gap-x-3 gap-y-1.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary"
              >
                <span className="col-start-1 row-start-1 block min-w-0 truncate text-[11.5px] font-medium leading-5 text-text-secondary">
                  {bar.label}
                </span>
                <strong className="col-start-2 row-start-1 self-center text-[12px] font-semibold leading-5 text-text-primary tnum">
                  {bar.value}
                </strong>
                <span className="col-start-3 row-start-1 flex min-w-0 self-center items-baseline gap-1.5 whitespace-nowrap text-left leading-5 tnum">
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
                  className="col-start-4 row-start-1 self-center text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                  aria-hidden="true"
                />
                <span className="relative col-start-1 row-start-2 block h-2 overflow-hidden rounded-full bg-surface">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    title={`${bar.label}: ${bar.value} leads, ${bar.converted} converted (${bar.conversionRate}%)`}
                    style={{
                      width: `${Math.max(5, (bar.value / maxSourceValue) * 100)}%`,
                      background: bar.color,
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <Modal
        open={statusWorkspaceOpen}
        onClose={() => setStatusWorkspaceOpen(false)}
        title="Where leads sit now"
        titleAfter={
          <span className="rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-bold text-blue-primary tnum">
            {statusWorkspaceLeads.length}
          </span>
        }
        size="chart"
        tall
        bodyClassName="!p-0"
      >
        <div className="grid h-full min-h-0 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-border-light bg-surface/55 p-5 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Lead status
            </p>
            <div className="mt-4 flex justify-center">
              <DonutChart
                segments={activeStatusSegments}
                centerLabel={String(leads.length)}
                centerSub="leads"
                size={210}
                thickness={24}
                format="number"
                selectedIndex={statusWorkspaceFilter === "all" ? null : activeStatusSegments.findIndex((segment) => segment.label === statusWorkspaceFilter)}
                onSegmentClick={(index) => {
                  const status = activeStatusSegments[index].label as LeadStatus;
                  setStatusWorkspaceFilter((current) => current === status ? "all" : status);
                }}
                tooltipOnHover={false}
              />
            </div>
            <div className="mt-5 space-y-1.5">
              <button
                type="button"
                onClick={() => setStatusWorkspaceFilter("all")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  statusWorkspaceFilter === "all"
                    ? "bg-blue-light text-blue-primary"
                    : "text-text-secondary hover:bg-white"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-blue-primary" />
                <span className="flex-1 text-[13px] font-semibold">All leads</span>
                <span className="text-[12px] font-bold tnum">{leads.length}</span>
              </button>
              {activeStatusSegments.map((segment) => (
                <button
                  type="button"
                  key={segment.label}
                  onClick={() =>
                    setStatusWorkspaceFilter(segment.label as LeadStatus)
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    statusWorkspaceFilter === segment.label
                      ? "bg-white shadow-sm ring-1 ring-border-light"
                      : "text-text-secondary hover:bg-white"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: segment.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {segment.label}
                  </span>
                  <span className="text-[12px] font-bold text-text-primary tnum">
                    {segment.value}
                  </span>
                  <span className="w-8 text-right text-[10.5px] text-text-tertiary tnum">
                    {percentage(segment.value, leads.length)}%
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-white">
            <div className="shrink-0 border-b border-border-light p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    {statusWorkspaceFilter === "all"
                      ? "All leads"
                      : `${statusWorkspaceFilter} leads`}
                  </h3>
                  <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                    Click a company or opportunity to open its full record.
                  </p>
                </div>
                <label className="relative block w-full sm:w-[360px]">
                  <Search
                    size={16}
                    strokeWidth={2}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                    aria-hidden="true"
                  />
                  <input
                    value={statusWorkspaceQuery}
                    onChange={(event) => setStatusWorkspaceQuery(event.target.value)}
                    placeholder="Search these leads…"
                    aria-label="Search leads in this status"
                    className="h-10 w-full rounded-xl border border-border-light bg-surface pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:bg-white"
                  />
                </label>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {statusWorkspaceLeads.length ? (
                <table className="w-full min-w-[1050px] table-fixed text-left">
                  <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border-light)]">
                    <tr className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-4 [&>th]:py-2.5">
                      <th className="w-[17%]">Lead</th>
                      <th className="w-[16%]">Company</th>
                      <th className="w-[11%]">Status</th>
                      <th className="w-[12%]">Source</th>
                      <th className="w-[14%]">Owner</th>
                      <th className="w-[20%]">What they asked about</th>
                      <th className="w-[10%]">Last moved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {statusWorkspaceLeads.map((lead) => {
                      const sourceColor = leadSourceColor(lead.source);
                      const SourceIcon = LEAD_SOURCE_ICONS[lead.source];
                      const statusColor = leadStatusColor(lead.status);
                      return (
                        <Fragment key={lead.id}>
                        <tr onClick={(event) => { if (!(event.target as HTMLElement).closest("a, button")) setExpandedLeadId((id) => id === lead.id ? null : lead.id); }} className="cursor-pointer align-top transition-colors hover:bg-surface/60 [&>td]:px-4 [&>td]:py-3">
                          <td>
                            <span className="flex min-w-0 items-start gap-2.5">
                              <Avatar name={lead.name} initialsOnly className="h-8 w-8 shrink-0 text-[9px]" />
                              <span className="min-w-0">
                                <button type="button" aria-expanded={expandedLeadId === lead.id} onClick={() => setExpandedLeadId((id) => id === lead.id ? null : lead.id)} className="flex max-w-full items-center gap-1 text-left text-[12.5px] font-semibold text-text-primary hover:text-blue-primary">
                                  <span className="truncate">{lead.name}</span><ChevronDown size={13} className={`shrink-0 transition-transform ${expandedLeadId === lead.id ? "rotate-180" : ""}`} aria-hidden="true" />
                                </button>
                                {lead.title ? <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{lead.title}</span> : null}
                              </span>
                            </span>
                          </td>
                          <td>
                            <Link href={companyHref(lead)} className="group/company flex min-w-0 items-center gap-2 text-[12px] font-medium text-text-secondary hover:text-blue-primary">
                              <CompanyLogo name={lead.company} className="h-7 w-7 shrink-0 text-[8px]" />
                              <span className="min-w-0 truncate group-hover/company:underline">{lead.company}</span>
                              <ArrowUpRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover/company:opacity-100" aria-hidden="true" />
                            </Link>
                          </td>
                          <td>
                            <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(statusColor, 9), color: statusColor }}>
                              {lead.status}
                            </span>
                            {lead.convertedOpportunityId ? (
                              <Link href={`/opportunities/${lead.convertedOpportunityId}`} className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-blue-primary hover:underline">
                                Opportunity <ArrowUpRight size={11} aria-hidden="true" />
                              </Link>
                            ) : null}
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(sourceColor, 9), color: sourceColor }}>
                              <SourceIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                              {lead.source}
                            </span>
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
                            <LocalTime value={lead.updatedAt || lead.createdAt} />
                          </td>
                        </tr>
                        {expandedLeadId === lead.id && <LeadRowDetails lead={lead} columns={7} companyHref={companyHref(lead)} />}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">No leads match</p>
                    <p className="mt-1 text-[12px] text-text-secondary">Try another status or clear the search.</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </Modal>

      <Modal
        open={sourceWorkspaceOpen}
        onClose={() => setSourceWorkspaceOpen(false)}
        title={sourceFilter === "all" ? "Source performance" : `${sourceFilter} leads`}
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
              ["Still open", sourceStillOpen],
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
          <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(280px,1fr)_190px_180px_210px_180px]">
            <label className="relative block min-w-0">
              <Search
                size={16}
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                aria-hidden="true"
              />
              <input
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="Search leads, companies, owners, or requests…"
                aria-label="Search source performance leads"
                autoFocus
                className="h-10 w-full rounded-xl border border-border-light bg-surface pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:bg-white"
              />
            </label>
            <ColorSelect
              value={sourceFilter}
              onChange={(value) => setSourceFilter(value as LeadSource | "all")}
              ariaLabel="Filter by source"
              fill
              collapsible={false}
              searchable
              options={[
                { value: "all", label: "All sources", color: "#0071E3" },
                ...data.sourceBars.map((bar) => ({
                  value: bar.label,
                  label: bar.label,
                  color: bar.color,
                  badge: String(bar.value),
                })),
              ]}
            />
            <ColorSelect
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter by status"
              fill
              collapsible={false}
              searchable
              options={[
                { value: "all", label: "All statuses", color: "#0071E3" },
                ...LEAD_STATUSES.map((status) => ({
                  value: status,
                  label: status,
                  color: leadStatusColor(status),
                })),
              ]}
            />
            <ColorSelect
              value={ownerFilter}
              onChange={setOwnerFilter}
              ariaLabel="Filter by owner"
              fill
              menuMinWidth={350}
              collapsible={false}
              searchable
              options={[
                { value: "all", label: "All owners", color: "#0071E3" },
                ...sourceOwners.map((owner) => ({
                  value: owner,
                  label: owner,
                  avatarName: owner === "Unassigned" ? undefined : owner,
                  color: owner === "Unassigned" ? "#8E98A8" : undefined,
                })),
              ]}
            />
            <ColorSelect
              value={sourceSort}
              onChange={(value) =>
                setSourceSort(value as typeof sourceSort)
              }
              ariaLabel="Sort source leads"
              fill
              collapsible={false}
              options={[
                { value: "newest", label: "Newest first", color: "#0071E3", icon: CalendarDays },
                { value: "oldest", label: "Oldest first", color: "#64748B", icon: Clock3 },
                { value: "recently_moved", label: "Recently moved", color: "var(--ink-teal-deep)", icon: History },
                { value: "stale", label: "Stalest first", color: "#C2410C", icon: AlarmClock },
                { value: "name", label: "Lead name", color: "var(--ink-violet-soft)", icon: ArrowDownAZ },
                { value: "company", label: "Company", color: "var(--ink-violet-soft)", icon: Building2 },
                { value: "source", label: "Source", color: "var(--ink-bright-blue)", icon: Globe2 },
                { value: "status", label: "Status", color: "var(--ink-orange)", icon: ListChecks },
                { value: "owner", label: "Owner", color: "var(--ink-teal-deep)", icon: UserRound },
              ]}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-text-tertiary">
            <span>
              Showing {matchingSourceLeads.length} of {leads.length} leads
            </span>
            {(sourceQuery || statusFilter !== "all" || ownerFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSourceQuery("");
                  setStatusFilter("all");
                  setOwnerFilter("all");
                }}
                className="cursor-pointer font-semibold text-blue-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {matchingSourceLeads.length ? (
            <table className="w-full min-w-[1280px] table-fixed text-left">
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border-light)]">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-4 [&>th]:py-2.5">
                  <th className="w-[16%]">Lead</th>
                  <th className="w-[15%]">Company</th>
                  <th className="w-[11%]">Source</th>
                  <th className="w-[11%]">Status</th>
                  <th className="w-[12%]">Owner</th>
                  <th className="w-[19%]">What they asked about</th>
                  <th className="w-[8%]">Came in</th>
                  <th className="w-[8%]">Last moved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {matchingSourceLeads.map((lead) => {
                  const statusColor = leadStatusColor(lead.status);
                  return (
                    <Fragment key={lead.id}>
                    <tr onClick={(event) => { if (!(event.target as HTMLElement).closest("a, button")) setExpandedLeadId((id) => id === lead.id ? null : lead.id); }} className="cursor-pointer align-top transition-colors hover:bg-surface/60 [&>td]:px-4 [&>td]:py-3">
                      <td>
                        <span className="flex min-w-0 items-start gap-2.5">
                          <Avatar name={lead.name} initialsOnly className="h-8 w-8 shrink-0 text-[9px]" />
                          <span className="min-w-0">
                            <button type="button" aria-expanded={expandedLeadId === lead.id} onClick={() => setExpandedLeadId((id) => id === lead.id ? null : lead.id)} className="flex max-w-full items-center gap-1 text-left text-[12.5px] font-semibold text-text-primary hover:text-blue-primary">
                              <span className="truncate">{lead.name}</span><ChevronDown size={13} className={`shrink-0 transition-transform ${expandedLeadId === lead.id ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                            {lead.title ? <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{lead.title}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Link
                          target="_blank"
                          rel="noopener noreferrer"
                          href={companyHref(lead)} className="group/company flex min-w-0 items-center gap-2 text-[12px] font-medium text-text-secondary hover:text-blue-primary">
                          <CompanyLogo name={lead.company} className="h-7 w-7 shrink-0 text-[8px]" />
                          <span className="min-w-0 truncate group-hover/company:underline">{lead.company}</span>
                          <ArrowUpRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover/company:opacity-100" aria-hidden="true" />
                        </Link>
                      </td>
                      <td>
                        {(() => {
                          const SourceIcon = LEAD_SOURCE_ICONS[lead.source];
                          const sourceColor = leadSourceColor(lead.source);
                          return (
                            <span
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: tint(sourceColor, 9), color: sourceColor }}
                            >
                              <SourceIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                              {lead.source}
                            </span>
                          );
                        })()}
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
                          <Link
                            target="_blank"
                            rel="noopener noreferrer"
                            href={`/opportunities/${lead.convertedOpportunityId}`} className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-primary hover:underline">
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
                    {expandedLeadId === lead.id && <LeadRowDetails lead={lead} columns={8} companyHref={companyHref(lead)} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center px-6 text-center">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">No one matches these filters</p>
                <p className="mt-1 text-[12px] text-text-secondary">Try a different person, company, status, or owner.</p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
