"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Coins,
  FileCheck2,
  Filter,
  History,
  Link2,
  Link2Off,
  ListFilter,
  PauseCircle,
  Package,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import {
  CUSTOMER_OFFERING_ACTIVITIES,
  CUSTOMER_OFFERING_ACTIVITY_ORDER,
  CUSTOMER_OFFERING_STATUSES,
  CUSTOMER_OFFERING_STATUS_ORDER,
  defaultStatusForActivity,
  engagementHistory,
  nextEngagementVersion,
  resolveHeatMapCell,
  usageForOffering,
  type HeatMapOffering,
} from "@/lib/customerOfferingHeatMap";
import { formatMoney } from "@/lib/pipeline";
import type {
  Customer,
  CustomerOfferingActivity,
  CustomerOfferingCurrency,
  CustomerOfferingEngagementVersion,
  CustomerOfferingStatus,
  OfferingUsage,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type DisplayMode =
  | "activity"
  | "status"
  | "start_date"
  | "end_date"
  | "dollar_value"
  | "version";

type SelectedCell = {
  customerId: string;
  offeringId: string;
};

const ACTIVITY_ICONS: Record<CustomerOfferingActivity, LucideIcon> = {
  to_pitch: Send,
  opportunity: Target,
  proposal: FileCheck2,
  under_contract: Clock3,
  contract_signed: CheckCircle2,
  need_to_deliver: CircleDot,
  implementation: Sparkles,
  implemented: CheckCircle2,
  on_hold: PauseCircle,
};

const STATUS_ICONS: Record<CustomerOfferingStatus, LucideIcon> = {
  not_started: Clock3,
  in_progress: Activity,
  submitted: Send,
  in_review: FileCheck2,
  approved: CheckCircle2,
  completed: CheckCircle2,
  blocked: PauseCircle,
  lost: Link2Off,
};

const DISPLAY_OPTIONS: ColorOption[] = [
  { value: "activity", label: "Activity", color: "#0071E3", icon: Activity },
  { value: "status", label: "Status", color: "#F47A45", icon: ListFilter },
  {
    value: "start_date",
    label: "Start date",
    color: "#0F9E8E",
    icon: CalendarClock,
  },
  {
    value: "end_date",
    label: "End date",
    color: "#7C3AED",
    icon: CalendarClock,
  },
  {
    value: "dollar_value",
    label: "Dollar value",
    color: "#C2410C",
    icon: BadgeDollarSign,
  },
  { value: "version", label: "Version", color: "#2563EB", icon: History },
];

const ACTIVITY_OPTIONS: ColorOption[] = [
  { value: "", label: "All activities", color: "#0071E3", icon: Filter },
  ...CUSTOMER_OFFERING_ACTIVITY_ORDER.map((value) => ({
    value,
    label: CUSTOMER_OFFERING_ACTIVITIES[value].label,
    color: CUSTOMER_OFFERING_ACTIVITIES[value].color,
    icon: ACTIVITY_ICONS[value],
  })),
];

const STATUS_OPTIONS: ColorOption[] = [
  { value: "", label: "All statuses", color: "#0071E3", icon: Filter },
  ...CUSTOMER_OFFERING_STATUS_ORDER.map((value) => ({
    value,
    label: CUSTOMER_OFFERING_STATUSES[value].label,
    color: CUSTOMER_OFFERING_STATUSES[value].color,
    icon: STATUS_ICONS[value],
  })),
];

const CURRENCY_OPTIONS: ColorOption[] = [
  { value: "USD", label: "$ USD", color: "#2563EB", icon: Coins },
  { value: "EUR", label: "€ EUR", color: "#7C3AED", icon: Coins },
  { value: "GBP", label: "£ GBP", color: "#C2410C", icon: Coins },
  { value: "CHF", label: "CHF", color: "#0F766E", icon: Coins },
  { value: "CAD", label: "C$ CAD", color: "#DC4C4C", icon: Coins },
  { value: "AUD", label: "A$ AUD", color: "#059669", icon: Coins },
  { value: "JPY", label: "¥ JPY", color: "#B45309", icon: Coins },
  { value: "CNY", label: "¥ CNY", color: "#B91C1C", icon: Coins },
  { value: "INR", label: "₹ INR", color: "#EA580C", icon: Coins },
  { value: "SGD", label: "S$ SGD", color: "#0369A1", icon: Coins },
  { value: "AED", label: "د.إ AED", color: "#047857", icon: Coins },
  { value: "SAR", label: "﷼ SAR", color: "#15803D", icon: Coins },
  { value: "SEK", label: "kr SEK", color: "#1D4ED8", icon: Coins },
  { value: "NOK", label: "kr NOK", color: "#BE123C", icon: Coins },
  { value: "DKK", label: "kr DKK", color: "#DC2626", icon: Coins },
  { value: "NZD", label: "NZ$ NZD", color: "#0F766E", icon: Coins },
  { value: "ZAR", label: "R ZAR", color: "#CA8A04", icon: Coins },
  { value: "BRL", label: "R$ BRL", color: "#16A34A", icon: Coins },
  { value: "MXN", label: "MX$ MXN", color: "#4D7C0F", icon: Coins },
];

function formatCurrency(
  value: number,
  currency: CustomerOfferingCurrency = "USD"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function ids(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function uid(): string {
  return `eng-${Date.now().toString(36)}${Math.floor(
    Math.random() * 1e5
  ).toString(36)}`;
}

function cellLabel(
  mode: DisplayMode,
  resolved: ReturnType<typeof resolveHeatMapCell>
): string {
  const engagement = resolved.engagement;
  if (!resolved.activity) return "—";
  if (mode === "activity")
    return CUSTOMER_OFFERING_ACTIVITIES[resolved.activity].label;
  if (mode === "status")
    return resolved.status
      ? CUSTOMER_OFFERING_STATUSES[resolved.status].label
      : "—";
  if (mode === "start_date")
    return engagement?.start_date ? formatDate(engagement.start_date) : "—";
  if (mode === "end_date")
    return engagement?.end_date ? formatDate(engagement.end_date) : "—";
  if (mode === "dollar_value")
    return engagement?.dollar_value
      ? formatCurrency(
          engagement.dollar_value,
          engagement.currency || "USD"
        )
      : "—";
  return engagement ? `v${engagement.version}` : "—";
}

function replaceEngagementVersions(
  usage: OfferingUsage[],
  offeringId: string,
  versions: CustomerOfferingEngagementVersion[]
): OfferingUsage[] {
  const existing = usageForOffering({ offering_usage: usage }, offeringId);
  const next = usage.filter((item) => item.offering_id !== offeringId);
  next.push({
    offering_id: offeringId,
    revenue_lines: existing?.revenue_lines || [],
    engagement_versions: versions,
  });
  return next;
}

export function CustomerOfferingHeatMap({
  initialCustomers,
  offerings,
}: {
  initialCustomers: Customer[];
  offerings: HeatMapOffering[];
}) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState(initialCustomers);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("activity");
  const [activityFilter, setActivityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [draft, setDraft] =
    useState<CustomerOfferingEngagementVersion | null>(null);
  const [initialDraft, setInitialDraft] =
    useState<CustomerOfferingEngagementVersion | null>(null);
  const [pendingVersionDraft, setPendingVersionDraft] =
    useState<CustomerOfferingEngagementVersion | null>(null);
  const [pendingVersionBase, setPendingVersionBase] =
    useState<CustomerOfferingEngagementVersion | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(
    null
  );
  const [editingExisting, setEditingExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCustomer = selected
    ? customers.find((customer) => customer.id === selected.customerId) || null
    : null;
  const selectedOffering = selected
    ? offerings.find((offering) => offering.id === selected.offeringId) || null
    : null;
  const selectedHistory = useMemo(
    () =>
      selectedCustomer && selectedOffering
        ? engagementHistory(selectedCustomer, selectedOffering.id)
        : [],
    [selectedCustomer, selectedOffering]
  );
  const hasDraftChanges = useMemo(
    () =>
      !!draft &&
      !!initialDraft &&
      JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft]
  );
  const versionRows = useMemo(() => {
    const versions = [...selectedHistory];
    if (
      pendingVersionDraft &&
      !versions.some((version) => version.id === pendingVersionDraft.id)
    ) {
      versions.push(pendingVersionDraft);
    }
    return versions.sort((a, b) => b.version - a.version);
  }, [pendingVersionDraft, selectedHistory]);

  useEffect(() => {
    if (draft && !editingExisting) {
      setPendingVersionDraft({ ...draft });
    }
  }, [draft, editingExisting]);

  const searchFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return { customers, offerings };
    const customerMatches = customers.filter((customer) =>
      customer.company_name.toLowerCase().includes(needle)
    );
    const offeringMatches = offerings.filter(
      (offering) =>
        offering.name.toLowerCase().includes(needle) ||
        offering.category.toLowerCase().includes(needle)
    );
    return {
      customers: customerMatches.length
        ? customerMatches
        : offeringMatches.length
        ? customers
        : [],
      offerings: offeringMatches.length
        ? offeringMatches
        : customerMatches.length
        ? offerings
        : [],
    };
  }, [customers, offerings, query]);

  const matrixOfferings = useMemo(() => {
    if (!activityFilter && !statusFilter) return searchFiltered.offerings;

    return searchFiltered.offerings.filter((offering) =>
      searchFiltered.customers.some((customer) => {
        const resolved = resolveHeatMapCell(customer, offering);
        if (activityFilter && resolved.activity !== activityFilter) return false;
        if (statusFilter && resolved.status !== statusFilter) return false;
        return true;
      })
    );
  }, [
    activityFilter,
    searchFiltered.customers,
    searchFiltered.offerings,
    statusFilter,
  ]);

  const matrixCustomers = useMemo(() => {
    if (!activityFilter && !statusFilter) return searchFiltered.customers;

    return searchFiltered.customers.filter((customer) =>
      matrixOfferings.some((offering) => {
        const resolved = resolveHeatMapCell(customer, offering);
        if (activityFilter && resolved.activity !== activityFilter) return false;
        if (statusFilter && resolved.status !== statusFilter) return false;
        return true;
      })
    );
  }, [
    activityFilter,
    matrixOfferings,
    searchFiltered.customers,
    statusFilter,
  ]);

  const summary = useMemo(() => {
    let active = 0;
    let value = 0;
    let covered = 0;
    const counts = Object.fromEntries(
      CUSTOMER_OFFERING_ACTIVITY_ORDER.map((activity) => [activity, 0])
    ) as Record<CustomerOfferingActivity, number>;
    for (const customer of customers) {
      for (const offering of offerings) {
        const resolved = resolveHeatMapCell(customer, offering);
        if (resolved.activity) counts[resolved.activity] += 1;
        if (resolved.activity && resolved.activity !== "to_pitch") active += 1;
        if (resolved.engagement?.dollar_value)
          value += resolved.engagement.dollar_value;
        if (resolved.activity && resolved.activity !== "to_pitch") covered += 1;
      }
    }
    const total = customers.length * offerings.length;
    return {
      active,
      value,
      coverage: total ? Math.round((covered / total) * 100) : 0,
      counts,
    };
  }, [customers, offerings]);

  function cellPassesFilters(customer: Customer, offering: HeatMapOffering) {
    const resolved = resolveHeatMapCell(customer, offering);
    if (activityFilter && resolved.activity !== activityFilter) return false;
    if (statusFilter && resolved.status !== statusFilter) return false;
    return true;
  }

  function openCell(customer: Customer, offering: HeatMapOffering) {
    const resolved = resolveHeatMapCell(customer, offering);
    const explicit = engagementHistory(customer, offering.id).find(
      (version) => version.linked
    );
    const now = new Date().toISOString();
    const nextDraft: CustomerOfferingEngagementVersion = explicit
      ? { ...explicit }
      : {
          id: uid(),
          version: nextEngagementVersion(customer, offering.id),
          linked: true,
          activity: resolved.activity || "to_pitch",
          activity_description:
            resolved.engagement?.activity_description || null,
          status:
            resolved.status ||
            defaultStatusForActivity(resolved.activity || "to_pitch"),
          dollar_value: resolved.engagement?.dollar_value || 0,
          currency: resolved.engagement?.currency || "USD",
          start_date: resolved.engagement?.start_date || null,
          end_date: resolved.engagement?.end_date || null,
          opportunity_ids: resolved.engagement?.opportunity_ids || [],
          proposal_ids: resolved.engagement?.proposal_ids || [],
          contract_ids: resolved.engagement?.contract_ids || [],
          created_at: now,
          updated_at: now,
        };
    setSelected({ customerId: customer.id, offeringId: offering.id });
    setEditingExisting(!!explicit);
    setDraft(nextDraft);
    setInitialDraft({ ...nextDraft });
    setPendingVersionDraft(explicit ? null : { ...nextDraft });
    setPendingVersionBase(explicit ? null : { ...nextDraft });
    setExpandedVersionId(nextDraft.id);
  }

  function closeModal() {
    if (saving) return;
    setSelected(null);
    setDraft(null);
    setInitialDraft(null);
    setPendingVersionDraft(null);
    setPendingVersionBase(null);
    setExpandedVersionId(null);
    setEditingExisting(false);
  }

  function createNewVersion() {
    if (!selectedCustomer || !selectedOffering || !draft) return;
    if (pendingVersionDraft) {
      setDraft({ ...pendingVersionDraft });
      setInitialDraft({
        ...(pendingVersionBase || pendingVersionDraft),
      });
      setEditingExisting(false);
      setExpandedVersionId(pendingVersionDraft.id);
      return;
    }
    const now = new Date().toISOString();
    const nextDraft: CustomerOfferingEngagementVersion = {
      ...draft,
      id: uid(),
      version: nextEngagementVersion(
        selectedCustomer,
        selectedOffering.id
      ),
      linked: true,
      currency: draft.currency || "USD",
      created_at: now,
      updated_at: now,
    };
    setDraft(nextDraft);
    setInitialDraft({ ...nextDraft });
    setPendingVersionDraft({ ...nextDraft });
    setPendingVersionBase({ ...nextDraft });
    setExpandedVersionId(nextDraft.id);
    setEditingExisting(false);
  }

  function selectVersion(versionId: string) {
    setExpandedVersionId(versionId);
    if (pendingVersionDraft?.id === versionId) {
      setDraft({ ...pendingVersionDraft });
      setInitialDraft({
        ...(pendingVersionBase || pendingVersionDraft),
      });
      setEditingExisting(false);
      return;
    }
    const saved = selectedHistory.find((version) => version.id === versionId);
    if (!saved) return;
    setDraft({ ...saved });
    setInitialDraft({ ...saved });
    setEditingExisting(true);
  }

  function toggleVersion(versionId: string) {
    if (expandedVersionId === versionId) {
      setExpandedVersionId(null);
      return;
    }
    selectVersion(versionId);
  }

  function cancelExpandedVersion() {
    if (!draft) return;
    if (!editingExisting) {
      const linked =
        selectedHistory.find((version) => version.linked) ||
        selectedHistory[0] ||
        null;
      setPendingVersionDraft(null);
      setPendingVersionBase(null);
      if (linked) {
        setDraft({ ...linked });
        setInitialDraft({ ...linked });
        setEditingExisting(true);
      }
      setExpandedVersionId(null);
      return;
    }
    if (initialDraft) setDraft({ ...initialDraft });
    setExpandedVersionId(null);
  }

  async function persistVersions(
    versions: CustomerOfferingEngagementVersion[],
    successMessage: string
  ) {
    if (!selectedCustomer || !selectedOffering) return;
    const nextUsage = replaceEngagementVersions(
      selectedCustomer.offering_usage || [],
      selectedOffering.id,
      versions
    );
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_usage: nextUsage }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.customer) {
        throw new Error(data.error || "Could not save this activity.");
      }
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === data.customer.id ? data.customer : customer
        )
      );
      toast(successMessage);
      setSelected(null);
      setDraft(null);
      setInitialDraft(null);
      setPendingVersionDraft(null);
      setPendingVersionBase(null);
      setExpandedVersionId(null);
      setEditingExisting(false);
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Could not save this activity.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft || !selectedCustomer || !selectedOffering) return;
    const now = new Date().toISOString();
    const current = engagementHistory(selectedCustomer, selectedOffering.id);
    const normalizedDraft = {
      ...draft,
      linked: true,
      activity_description: draft.activity_description?.trim() || null,
      dollar_value: Math.max(0, Math.round(draft.dollar_value || 0)),
      updated_at: now,
    };
    const versions = [
      normalizedDraft,
      ...current
        .filter((version) => version.id !== normalizedDraft.id)
        .map((version) => ({ ...version, linked: false })),
    ].sort((a, b) => b.version - a.version);
    await persistVersions(
      versions,
      editingExisting ? "Activity updated." : `Version ${draft.version} linked.`
    );
  }

  async function unlinkCurrent() {
    if (!selectedCustomer || !selectedOffering || !editingExisting) return;
    const versions = engagementHistory(selectedCustomer, selectedOffering.id).map(
      (version) => ({ ...version, linked: false })
    );
    await persistVersions(versions, "Version unlinked. History was preserved.");
  }

  return (
    <div className="customer-offering-heat-map space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label: "Customers",
            value: customers.length.toLocaleString(),
            sub: "accounts in view",
            icon: Building2,
          },
          {
            label: "Offerings",
            value: offerings.length.toLocaleString(),
            sub: "catalogue columns",
            icon: Package,
          },
          {
            label: "Active motions",
            value: summary.active.toLocaleString(),
            sub: "beyond to pitch",
            icon: Activity,
          },
          {
            label: "Recorded value",
            value: formatMoney(summary.value),
            sub: "across linked versions",
            icon: BadgeDollarSign,
          },
          {
            label: "Coverage",
            value: `${summary.coverage}%`,
            sub: "offerings in motion",
            icon: Target,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.label}
              className="relative flex h-[96px] min-w-0 flex-col p-4"
            >
              <span className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                <Icon size={15} strokeWidth={2} />
              </span>
              <p className="whitespace-nowrap pr-9 text-[9.5px] font-semibold uppercase tracking-[0.045em] text-text-tertiary">
                {item.label}
              </p>
              <p className="mt-1.5 whitespace-nowrap text-[21px] font-bold leading-none tracking-[-0.02em] text-text-primary tnum">
                {item.value}
              </p>
              <p
                className="mt-1.5 truncate whitespace-nowrap text-[10.5px] text-text-tertiary"
                title={item.sub}
              >
                {item.sub}
              </p>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-visible p-3">
        <SearchPriority
          query={query}
          className="flex flex-wrap items-center gap-2"
        >
          <PrioritySearchInput
            grow
            className="min-w-[250px] flex-1"
            value={query}
            onChange={setQuery}
            placeholder="Search a customer, offering or category"
            ariaLabel="Search heat map"
            inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-[border-color,box-shadow] focus:border-blue-primary focus:shadow-input-focus"
            iconClassName="left-3"
            iconSize={16}
          />
          <ColorSelect
            value={displayMode}
            onChange={(value) => setDisplayMode(value as DisplayMode)}
            options={DISPLAY_OPTIONS}
            ariaLabel="Cell display"
            minWidth={150}
          />
          <ColorSelect
            value={activityFilter}
            onChange={setActivityFilter}
            options={ACTIVITY_OPTIONS}
            ariaLabel="Filter by activity"
            minWidth={165}
          />
          <ColorSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            ariaLabel="Filter by status"
            minWidth={155}
          />
        </SearchPriority>
        <div className="mt-2 border-t border-border-light pt-2">
          <div className="flex w-full flex-wrap items-center gap-2">
            {CUSTOMER_OFFERING_ACTIVITY_ORDER.map((activity) => {
              const meta = CUSTOMER_OFFERING_ACTIVITIES[activity];
              const LegendIcon = ACTIVITY_ICONS[activity];
              const selectedActivity = activityFilter === activity;
              return (
                <button
                  key={activity}
                  type="button"
                  aria-pressed={selectedActivity}
                  title={`Filter to ${meta.label}`}
                  onClick={() =>
                    setActivityFilter((current) =>
                      current === activity ? "" : activity
                    )
                  }
                  className={cn(
                    "heat-map-stage-filter inline-flex min-w-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-1.5 text-[10.5px] font-semibold shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,background-color,box-shadow] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary",
                    selectedActivity &&
                      "ring-2 ring-blue-primary/70 ring-offset-1"
                  )}
                  style={
                    {
                      "--stage-color": meta.color,
                      "--stage-border": selectedActivity
                        ? meta.color
                        : `${meta.color}55`,
                      "--stage-background": selectedActivity
                        ? `${meta.color}1F`
                        : `${meta.color}0D`,
                      "--stage-background-dark": selectedActivity
                        ? `color-mix(in srgb, ${meta.color} 32%, #1c1c1e)`
                        : `color-mix(in srgb, ${meta.color} 18%, #1c1c1e)`,
                    } as CSSProperties
                  }
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: meta.color,
                      color: meta.text,
                    }}
                  >
                    <LegendIcon size={11} strokeWidth={2.2} />
                  </span>
                  <span>{meta.short}</span>
                  <span
                    className="heat-map-stage-count rounded-full px-1.5 py-0.5 text-[9.5px] font-bold leading-none tnum"
                  >
                    {summary.counts[activity]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {matrixCustomers.length === 0 ||
        matrixOfferings.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <Search size={28} strokeWidth={1.5} className="text-text-tertiary" />
            <h2 className="mt-3 text-[15px] font-semibold text-text-primary">
              Nothing matches {activityFilter || statusFilter ? "those filters" : "that search"}
            </h2>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {activityFilter || statusFilter
                ? "Choose another activity or status to update the matrix."
                : "Search by customer, offering name, or offering category."}
            </p>
          </div>
        ) : (
          <div className="min-h-[420px] overflow-x-auto">
            <table
              className="table-fixed border-separate border-spacing-0 text-left"
              style={{
                width: 220 + matrixOfferings.length * 156,
              }}
            >
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 w-[220px] border-b border-r border-border bg-surface px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                      Customer
                    </span>
                  </th>
                  {matrixOfferings.map((offering) => (
                    <th
                      key={offering.id}
                      className="h-[78px] w-[156px] border-b border-r border-border bg-surface px-2.5 py-2"
                    >
                      <Link
                        href={`/offerings/${offering.id}`}
                        aria-label={`Open ${offering.name} offering`}
                        className="heat-map-offering-link group flex h-full flex-col items-center justify-center gap-1.5 rounded-lg text-center transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        <OfferingIcon
                          name={offering.name}
                          className="h-5 w-5 shrink-0 rounded-md transition-transform group-hover:scale-105"
                        />
                        <p className="flex h-[26px] w-full items-start justify-center overflow-hidden text-[10.5px] font-semibold leading-[1.2] text-text-primary group-hover:text-primary">
                          <span className="line-clamp-2">
                            {offering.name}
                          </span>
                        </p>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <th className="sticky left-0 z-10 w-[220px] border-b border-r border-border bg-white px-3.5 py-2">
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo
                          name={customer.company_name}
                          className="h-6 w-6 shrink-0"
                        />
                        <div className="min-w-0">
                          <p
                            className="truncate text-[12px] font-semibold text-text-primary"
                            title={customer.company_name}
                          >
                            {customer.company_name}
                          </p>
                          <p className="truncate text-[9.5px] font-normal text-text-tertiary">
                            {customer.industry || "Industry not set"}
                          </p>
                        </div>
                      </div>
                    </th>
                    {matrixOfferings.map((offering) => {
                      const resolved = resolveHeatMapCell(customer, offering);
                      const activity = resolved.activity;
                      const meta = activity
                        ? CUSTOMER_OFFERING_ACTIVITIES[activity]
                        : null;
                      const CellIcon = activity
                        ? ACTIVITY_ICONS[activity]
                        : null;
                      const passes = cellPassesFilters(customer, offering);
                      const label = passes
                        ? cellLabel(displayMode, resolved)
                        : "—";
                      const isBaseline =
                        activity === "to_pitch" && !resolved.hasHistory;
                      const categorical =
                        displayMode === "activity" || displayMode === "status";
                      const showLabel =
                        passes && (!categorical || !isBaseline);
                      const cellText =
                        meta?.text === "#FFFFFF"
                          ? meta.color
                          : meta?.text || "var(--text-tertiary)";
                      return (
                        <td
                          key={offering.id}
                          className="w-[156px] border-b border-r border-border p-0"
                        >
                          <button
                            type="button"
                            onClick={() => openCell(customer, offering)}
                            title={`${customer.company_name} × ${offering.name}: ${
                              activity
                                ? CUSTOMER_OFFERING_ACTIVITIES[activity].label
                                : "No linked version"
                            }`}
                            className={cn(
                              "group relative flex h-[42px] w-full items-center justify-center gap-1 overflow-hidden px-2 text-center transition-[opacity,background-color,box-shadow] hover:z-[1] hover:brightness-[0.97] hover:shadow-[inset_0_0_0_2px_rgba(0,113,227,0.28)] focus-visible:z-[2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-primary",
                              !passes && "opacity-15"
                            )}
                            style={{
                              background:
                                passes && meta && !isBaseline
                                  ? meta.color
                                  : passes && isBaseline
                                    ? `${meta?.color || "#94A3B8"}0D`
                                    : "var(--surface)",
                              color:
                                passes && meta
                                  ? isBaseline
                                    ? cellText
                                    : meta.text
                                  : "var(--text-tertiary)",
                            }}
                          >
                            {passes && isBaseline ? (
                              categorical ? (
                                <span className="sr-only">{label}</span>
                              ) : (
                                <span className="truncate text-[10.5px] font-semibold text-text-tertiary">
                                  {label}
                                </span>
                              )
                            ) : showLabel ? (
                              <span className="flex min-w-0 items-center justify-center gap-1.5">
                                {CellIcon && (
                                  <CellIcon
                                    size={12}
                                    strokeWidth={2.1}
                                    className="shrink-0"
                                  />
                                )}
                                <span className="truncate text-[10.5px] font-semibold">
                                  {label}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-text-tertiary">
                                —
                              </span>
                            )}
                            {resolved.hasHistory && (
                              <History
                                size={11}
                                strokeWidth={2}
                                className="absolute right-1.5 shrink-0 opacity-65"
                              />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!selected && !!draft && !!selectedCustomer && !!selectedOffering}
        onClose={closeModal}
        title={
          selectedCustomer && selectedOffering
            ? `${selectedCustomer.company_name} × ${selectedOffering.name}`
            : "Customer offering activity"
        }
        size="workflow"
      >
        {draft && selectedCustomer && selectedOffering && (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-border-light bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyLogo
                  name={selectedCustomer.company_name}
                  className="h-10 w-10 shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-text-primary">
                    {selectedCustomer.company_name}
                  </p>
                  <p className="truncate text-[11px] text-text-tertiary">
                    {selectedOffering.name}
                  </p>
                </div>
              </div>
              {selectedHistory.length > 0 &&
                (editingExisting || !pendingVersionDraft) && (
                <Button
                  variant="secondary"
                  onClick={createNewVersion}
                  className="px-3 py-1.5 text-[12px]"
                >
                  <Plus size={13} strokeWidth={2.2} />
                  {pendingVersionDraft
                    ? `Continue version ${pendingVersionDraft.version}`
                    : "New version"}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {versionRows.map((version) => {
                const versionMeta =
                  CUSTOMER_OFFERING_ACTIVITIES[version.activity];
                const expanded =
                  expandedVersionId === version.id && draft.id === version.id;
                const versionState =
                  version.id === pendingVersionDraft?.id
                    ? "Draft"
                    : version.linked
                      ? "Linked"
                      : "History";
                return (
                  <section
                    key={version.id}
                    className={cn(
                      "relative rounded-xl border bg-white transition-colors",
                      expanded
                        ? "z-20 overflow-visible border-blue-subtle"
                        : "overflow-hidden border-border-light"
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleVersion(version.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: versionMeta.color,
                          color: versionMeta.text,
                        }}
                      >
                        <History size={15} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-text-primary">
                          Version {version.version}
                        </span>
                        {!expanded && (
                          <span className="block truncate text-[10.5px] text-text-tertiary">
                            {versionMeta.label} ·{" "}
                            {
                              CUSTOMER_OFFERING_STATUSES[version.status]
                                .label
                            }
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-bold text-text-primary">
                        {versionState === "Draft" ? "Unsaved" : versionState}
                      </span>
                      <ChevronDown
                        size={16}
                        strokeWidth={2.1}
                        className={cn(
                          "shrink-0 text-text-primary transition-transform",
                          expanded && "rotate-180"
                        )}
                      />
                    </button>
                    {expanded && (
                      <div className="space-y-5 border-t border-border-light p-4">
            {!editingExisting && (
              <p className="rounded-lg border border-blue-subtle bg-blue-light px-3 py-2 text-[11.5px] leading-relaxed text-text-primary">
                This version is not saved yet. Make a change to enable{" "}
                <span className="font-semibold">Link version</span>. Discarding
                it or closing this dialog removes the draft.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Activity" required>
                <ColorSelect
                  value={draft.activity}
                  onChange={(value) => {
                    const activity = value as CustomerOfferingActivity;
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            activity,
                            status: defaultStatusForActivity(activity),
                          }
                        : current
                    );
                  }}
                  options={ACTIVITY_OPTIONS.slice(1)}
                  ariaLabel="Activity"
                  minWidth={220}
                  className="w-full"
                  collapsible={false}
                />
              </Field>
              <Field label="Status" required>
                <ColorSelect
                  value={draft.status}
                  onChange={(value) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            status: value as CustomerOfferingStatus,
                          }
                        : current
                    )
                  }
                  options={STATUS_OPTIONS.slice(1)}
                  ariaLabel="Status"
                  minWidth={220}
                  className="w-full"
                  collapsible={false}
                />
              </Field>
            </div>

            <Field label="Activity description">
              <Textarea
                value={draft.activity_description || ""}
                onChange={(event) => {
                  const activityDescription = event.currentTarget.value;
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          activity_description: activityDescription,
                        }
                      : current
                  );
                }}
                rows={3}
                placeholder="What is happening, who owns the next step, and what needs to move?"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Value">
                <div className="grid min-w-0 grid-cols-[136px_minmax(0,1fr)] gap-2">
                  <ColorSelect
                    value={draft.currency || "USD"}
                    options={CURRENCY_OPTIONS}
                    onChange={(value) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              currency: value as CustomerOfferingCurrency,
                            }
                          : current
                      )
                    }
                    ariaLabel="Currency"
                    minWidth={136}
                    className="min-w-0"
                    collapsible={false}
                  />
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.dollar_value || ""}
                    onChange={(event) => {
                      const dollarValue =
                        Number(event.currentTarget.value) || 0;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              dollar_value: dollarValue,
                            }
                          : current
                      );
                    }}
                    placeholder="0"
                    aria-label={`Value in ${draft.currency || "USD"}`}
                    className="h-10 bg-white text-[13px] tnum"
                  />
                </div>
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={dateValue(draft.start_date)}
                  onChange={(event) => {
                    const startDate = event.currentTarget.value || null;
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            start_date: startDate,
                          }
                        : current
                    );
                  }}
                  className="h-10 bg-white text-[13px]"
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={dateValue(draft.end_date)}
                  onChange={(event) => {
                    const endDate = event.currentTarget.value || null;
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            end_date: endDate,
                          }
                        : current
                    );
                  }}
                  className="h-10 bg-white text-[13px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "Opportunity IDs",
                  key: "opportunity_ids" as const,
                  placeholder: "OPP-1042, OPP-1068",
                },
                {
                  label: "Proposal IDs",
                  key: "proposal_ids" as const,
                  placeholder: "PROP-220",
                },
                {
                  label: "Contract IDs",
                  key: "contract_ids" as const,
                  placeholder: "CTR-804",
                },
              ].map((field) => (
                <Field key={field.key} label={field.label}>
                  <Input
                    value={draft[field.key].join(", ")}
                    onChange={(event) => {
                      const linkedIds = ids(event.currentTarget.value);
                      setDraft((current) =>
                        current
                          ? { ...current, [field.key]: linkedIds }
                          : current
                      );
                    }}
                    placeholder={field.placeholder}
                    className="h-10 bg-white text-[13px]"
                  />
                </Field>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border-light pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {editingExisting && (
                  <Button
                    variant="secondary"
                    onClick={unlinkCurrent}
                    loading={saving}
                    className="border-violet-200 px-3 text-violet-700 hover:bg-violet-50"
                  >
                    <Link2Off size={14} strokeWidth={2} />
                    Unlink current
                  </Button>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={cancelExpandedVersion}>
                  {editingExisting
                    ? hasDraftChanges
                      ? "Cancel changes"
                      : "Collapse"
                    : "Discard draft"}
                </Button>
                {hasDraftChanges && (
                  <Button onClick={saveDraft} loading={saving} className="page-in">
                    <Link2 size={14} strokeWidth={2.2} />
                    {editingExisting ? "Save changes" : "Link version"}
                  </Button>
                )}
              </div>
            </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
