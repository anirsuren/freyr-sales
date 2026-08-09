"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Activity,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Coins,
  FileCheck2,
  Filter,
  History,
  Link2,
  Package,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ColorSelect,
  MultiColorSelect,
  type ColorOption,
} from "@/components/ui/ColorSelect";
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
import { useStoredView } from "@/lib/useStoredView";
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
  | "dollar_value"
  | "start_date"
  | "end_date";

type SelectedCell = {
  customerId: string;
  offeringId: string;
};

const ACTIVITY_ICONS: Record<CustomerOfferingActivity, LucideIcon> = {
  lead: Send,
  opportunity: Target,
  pilot: CircleDot,
  contract: FileCheck2,
  delivery: Sparkles,
};

const STATUS_ICONS: Record<CustomerOfferingStatus, LucideIcon> = {
  initiated: Clock3,
  under_progress: Activity,
  completed: CheckCircle2,
};


/**
 * WHAT STAYS PUT WHILE YOU SCROLL (Anir, Aug 9: "there should be an option to
 * like pin the row headers and the column headers if i want").
 *
 * A matrix this wide is unreadable once either header leaves the screen — you
 * are looking at a coloured cell with no idea which customer or which offering
 * it belongs to. Both headers were already marked sticky, but only the
 * customer column actually held: the offering row was sticky against a box
 * that never scrolled vertically, so it did nothing. Pinning the top now gives
 * the matrix its own bounded scroll area, which is the only way a header row
 * can outlast the rows beneath it.
 *
 * It is a choice rather than a rule because pinning costs screen height, and on
 * a short list you would rather have the rows.
 */
type PinMode = "both" | "customers" | "offerings" | "none";
const PIN_MODES: readonly PinMode[] = ["both", "customers", "offerings", "none"];

const PIN_OPTIONS: ColorOption[] = [
  { value: "both", label: "Pin both headers", color: "#0071E3", icon: Pin },
  { value: "customers", label: "Pin customers only", color: "#0891B2", icon: Pin },
  { value: "offerings", label: "Pin offerings only", color: "#7C3AED", icon: Pin },
  { value: "none", label: "Pin nothing", color: "#6B6B70", icon: PinOff },
];

const DISPLAY_OPTIONS: ColorOption[] = [
  { value: "activity", label: "Show the activity", color: "#0071E3", icon: Activity },
  {
    value: "dollar_value",
    label: "Show dollar value",
    color: "#C2410C",
    icon: BadgeDollarSign,
  },
  // "Key dates" was one option covering two different questions, and it read
  // as jargon (Suren, Aug 9: "don't say key dates. I think start date and end
  // date, start date activity and end date activity"). Two plain options now,
  // each printing exactly one date.
  {
    value: "start_date",
    label: "Show the start date",
    color: "#7C3AED",
    icon: CalendarClock,
  },
  {
    value: "end_date",
    label: "Show the end date",
    color: "#0F766E",
    icon: CalendarClock,
  },
];

/**
 * The activity filter, built with live counts in the labels.
 *
 * There used to be a second row of chips under the toolbar doing the same job.
 * It ate a full row, and its selected ring was being clipped by the scroller
 * it sat in (Anir, Aug 9: "fix selectors its getting covered and i dont like
 * how its taking up space maybe put it with the dropdowns as a dropdown").
 * Now that the dropdown is multi-select it IS that control, so the chips are
 * gone and their counts ride in the option labels instead.
 */
/** The same five activities with no counts, for the cell editor: a count of
 *  how many OTHER accounts are at this stage is noise when you are setting
 *  the stage for one of them. */
const ACTIVITY_EDIT_OPTIONS: ColorOption[] = CUSTOMER_OFFERING_ACTIVITY_ORDER.map(
  (value) => ({
    value,
    label: CUSTOMER_OFFERING_ACTIVITIES[value].label,
    color: CUSTOMER_OFFERING_ACTIVITIES[value].color,
    icon: ACTIVITY_ICONS[value],
  })
);

function activityOptions(counts: Record<CustomerOfferingActivity, number>): ColorOption[] {
  return CUSTOMER_OFFERING_ACTIVITY_ORDER.map((value) => ({
    value,
    label: `${CUSTOMER_OFFERING_ACTIVITIES[value].label} (${counts[value] ?? 0})`,
    color: CUSTOMER_OFFERING_ACTIVITIES[value].color,
    icon: ACTIVITY_ICONS[value],
  }));
}

const STATUS_OPTIONS: ColorOption[] = [
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

function FormSectionHeading({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
        {title}
      </p>
      {hint && (
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[9.5px] font-semibold text-text-tertiary">
          {hint}
        </span>
      )}
      <span className="h-px min-w-4 flex-1 bg-border-light" />
    </div>
  );
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
  if (!resolved.activity) return "None";
  if (mode === "activity")
    return CUSTOMER_OFFERING_ACTIVITIES[resolved.activity].short;
  if (mode === "dollar_value")
    return engagement?.dollar_value
      ? formatCurrency(
          engagement.dollar_value,
          engagement.currency || "USD"
        )
      : "None";
  if (mode === "start_date") {
    const start = engagement?.status_dates?.initiated || engagement?.start_date;
    return start ? formatDate(start) : "None";
  }
  // The end date a person actually recorded. The old close-date guess is not
  // the same thing and is not substituted in when the field is empty.
  return engagement?.end_date ? formatDate(engagement.end_date) : "None";
}

function replaceEngagementVersions(
  usage: OfferingUsage[],
  offeringId: string,
  versions: CustomerOfferingEngagementVersion[],
  engagementDraft?: CustomerOfferingEngagementVersion | null
): OfferingUsage[] {
  const existing = usageForOffering({ offering_usage: usage }, offeringId);
  const next = usage.filter((item) => item.offering_id !== offeringId);
  next.push({
    offering_id: offeringId,
    revenue_lines: existing?.revenue_lines || [],
    engagement_versions: versions,
    engagement_draft:
      engagementDraft === undefined
        ? existing?.engagement_draft || null
        : engagementDraft,
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
  const [pinMode, setPinMode] = useStoredView<PinMode>(
    "freyr.heatmap.pin",
    "both",
    PIN_MODES
  );
  const pinCustomers = pinMode === "both" || pinMode === "customers";
  const pinOfferings = pinMode === "both" || pinMode === "offerings";
  /**
   * PICK AS MANY AS YOU WANT. These were single-select, so asking for
   * "opportunity and contract" was impossible: choosing one dropped the other
   * (Suren, Aug 9: "if I pick only opportunity and contract, it should show
   * both... it should be multi-select"). Empty array means no restriction,
   * which is what "All activities" / "All statuses" reads as.
   *
   * The display dropdown beside them stays single-select on purpose: a cell
   * can only print one thing ("this is the only thing that is there, which is
   * a single select").
   */
  const [activityFilter, setActivityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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
  const [draftIsNew, setDraftIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportVersionId, setReportVersionId] = useState<string | null>(null);
  const [reportSelectionError, setReportSelectionError] = useState(false);
  const draftSaveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

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

  useEffect(() => {
    if (!selected || !pendingVersionDraft || editingExisting || saving) return;
    const timeout = window.setTimeout(() => {
      void queueActivityDraftSave(
        selected.customerId,
        selected.offeringId,
        pendingVersionDraft,
        false
      );
    }, 650);
    return () => window.clearTimeout(timeout);
    // queueActivityDraftSave is intentionally omitted: including a render-local
    // function would restart the debounce on every render; the save chain lives
    // in a stable ref and serializes the writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingExisting, pendingVersionDraft, saving, selected]);

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
    if (!activityFilter.length && !statusFilter.length)
      return searchFiltered.offerings;

    return searchFiltered.offerings.filter((offering) =>
      searchFiltered.customers.some((customer) => {
        const resolved = resolveHeatMapCell(customer, offering);
        if (
          activityFilter.length &&
          (!resolved.activity || !activityFilter.includes(resolved.activity))
        )
          return false;
        if (
          statusFilter.length &&
          (!resolved.status || !statusFilter.includes(resolved.status))
        )
          return false;
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
    if (!activityFilter.length && !statusFilter.length)
      return searchFiltered.customers;

    return searchFiltered.customers.filter((customer) =>
      matrixOfferings.some((offering) => {
        const resolved = resolveHeatMapCell(customer, offering);
        if (
          activityFilter.length &&
          (!resolved.activity || !activityFilter.includes(resolved.activity))
        )
          return false;
        if (
          statusFilter.length &&
          (!resolved.status || !statusFilter.includes(resolved.status))
        )
          return false;
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
        if (resolved.activity && resolved.activity !== "lead") active += 1;
        if (resolved.engagement?.dollar_value)
          value += resolved.engagement.dollar_value;
        if (resolved.activity && resolved.activity !== "lead") covered += 1;
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
    if (
      activityFilter.length &&
      (!resolved.activity || !activityFilter.includes(resolved.activity))
    )
      return false;
    if (
      statusFilter.length &&
      (!resolved.status || !statusFilter.includes(resolved.status))
    )
      return false;
    return true;
  }

  function openCell(customer: Customer, offering: HeatMapOffering) {
    const resolved = resolveHeatMapCell(customer, offering);
    const history = engagementHistory(customer, offering.id);
    const storedDraft =
      usageForOffering(customer, offering.id)?.engagement_draft || null;
    const explicit =
      history.find((version) => version.linked) || history[0] || null;
    const now = new Date().toISOString();
    const nextDraft: CustomerOfferingEngagementVersion = explicit
      ? { ...explicit }
      : {
          id: uid(),
          version: nextEngagementVersion(customer, offering.id),
          linked: true,
          activity: resolved.activity || "lead",
          activity_description:
            resolved.engagement?.activity_description || null,
          status:
            resolved.status ||
            defaultStatusForActivity(resolved.activity || "lead"),
          dollar_value: resolved.engagement?.dollar_value || 0,
          currency: resolved.engagement?.currency || "USD",
          start_date: resolved.engagement?.start_date || null,
          end_date: resolved.engagement?.end_date || null,
          potential_close_date:
            resolved.engagement?.potential_close_date || null,
          opportunity_ids: resolved.engagement?.opportunity_ids || [],
          proposal_ids: resolved.engagement?.proposal_ids || [],
          contract_ids: resolved.engagement?.contract_ids || [],
          created_at: now,
          updated_at: now,
        };
    const activeDraft = storedDraft || nextDraft;
    // Cells backed only by an older deal/usage record still need an editable
    // first activity. Treat that derived bridge (and a genuinely empty cell)
    // as a shared draft until the rep explicitly saves it into the activity
    // log. This also makes every empty matrix cell open consistently.
    const isPendingDraft = Boolean(storedDraft) || !explicit;
    const savedReportId = history.find((version) => version.linked)?.id || null;
    setSelected({ customerId: customer.id, offeringId: offering.id });
    setEditingExisting(!isPendingDraft && !!explicit);
    setDraftIsNew(isPendingDraft);
    setDraft({ ...activeDraft });
    setInitialDraft({ ...activeDraft });
    setPendingVersionDraft(isPendingDraft ? { ...activeDraft } : null);
    setPendingVersionBase(isPendingDraft ? { ...activeDraft } : null);
    setExpandedVersionId(isPendingDraft ? activeDraft.id : null);
    setReportVersionId(
      activeDraft.linked ? activeDraft.id : savedReportId
    );
    setReportSelectionError(false);
  }

  async function closeModal() {
    if (saving) return;
    if (versionRows.length > 0 && !reportVersionId) {
      setReportSelectionError(true);
      toast("Choose one activity as the report row before closing.", "error");
      return;
    }
    if (selected && pendingVersionDraft && !editingExisting) {
      const saved = await queueActivityDraftSave(
        selected.customerId,
        selected.offeringId,
        pendingVersionDraft,
        true
      );
      if (!saved) return;
    }
    setSelected(null);
    setDraft(null);
    setInitialDraft(null);
    setPendingVersionDraft(null);
    setPendingVersionBase(null);
    setExpandedVersionId(null);
    setEditingExisting(false);
    setDraftIsNew(false);
    setReportVersionId(null);
    setReportSelectionError(false);
  }

  function queueActivityDraftSave(
    customerId: string,
    offeringId: string,
    engagementDraft: CustomerOfferingEngagementVersion,
    showError: boolean
  ): Promise<boolean> {
    const nextSave = draftSaveChainRef.current.then(() =>
      persistActivityDraft(
        customerId,
        offeringId,
        engagementDraft,
        showError
      )
    );
    draftSaveChainRef.current = nextSave.catch(() => false);
    return nextSave;
  }

  async function persistActivityDraft(
    customerId: string,
    offeringId: string,
    engagementDraft: CustomerOfferingEngagementVersion,
    showError: boolean
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveEngagementDraft: {
            offering_id: offeringId,
            draft: engagementDraft,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.customer) {
        throw new Error(data.error || "Could not save this draft.");
      }
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === data.customer.id ? data.customer : customer
        )
      );
      return true;
    } catch (error) {
      if (showError) {
        toast(
          error instanceof Error
            ? error.message
            : "Could not save this draft.",
          "error"
        );
      }
      return false;
    }
  }

  async function clearActivityDraft(customerId: string, offeringId: string) {
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearEngagementDraft: offeringId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.customer) {
        throw new Error(data.error || "Could not discard this draft.");
      }
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === data.customer.id ? data.customer : customer
        )
      );
      return true;
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Could not discard this draft.",
        "error"
      );
      return false;
    }
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
      id: uid(),
      version: nextEngagementVersion(
        selectedCustomer,
        selectedOffering.id
      ),
      linked: !selectedHistory.some((version) => version.linked),
      activity: "lead",
      activity_description: null,
      status: defaultStatusForActivity("lead"),
      dollar_value: 0,
      currency: draft.currency || "USD",
      start_date: null,
      end_date: null,
      potential_close_date: null,
      opportunity_ids: [],
      proposal_ids: [],
      contract_ids: [],
      created_at: now,
      updated_at: now,
    };
    setDraft(nextDraft);
    setInitialDraft({ ...nextDraft });
    setPendingVersionDraft({ ...nextDraft });
    setPendingVersionBase({ ...nextDraft });
    setExpandedVersionId(nextDraft.id);
    setEditingExisting(false);
    setDraftIsNew(true);
    setReportVersionId((current) =>
      nextDraft.linked ? nextDraft.id : current
    );
    setReportSelectionError(false);
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
    setDraftIsNew(false);
  }

  function toggleVersion(versionId: string) {
    if (expandedVersionId === versionId) {
      setExpandedVersionId(null);
      return;
    }
    selectVersion(versionId);
  }

  async function chooseHeatMapActivity(versionId: string) {
    const source =
      pendingVersionDraft?.id === versionId
        ? pendingVersionDraft
        : selectedHistory.find((version) => version.id === versionId);
    if (!source) return;
    if (reportVersionId === versionId) {
      setReportVersionId(null);
      setReportSelectionError(false);
      if (draft?.id === versionId) {
        setDraft((current) =>
          current ? { ...current, linked: false } : current
        );
      }
      return;
    }
    setReportVersionId(versionId);
    setReportSelectionError(false);
    if (pendingVersionDraft?.id === versionId) {
      setDraft({ ...source, linked: true });
      setInitialDraft({ ...source });
      setExpandedVersionId(versionId);
      setEditingExisting(false);
      return;
    }
    const nextSource = { ...source, linked: true };
    setDraft(nextSource);
    setInitialDraft(nextSource);
    setExpandedVersionId(versionId);
    setEditingExisting(true);
    setDraftIsNew(false);
    const versions = selectedHistory.map((version) => ({
      ...version,
      linked: version.id === versionId,
    }));
    await persistVersions(versions, "Heat map activity updated.", {
      closeAfterSave: false,
      activeVersionId: versionId,
    });
  }

  async function cancelExpandedVersion() {
    if (!draft) return;
    if (!editingExisting) {
      const linked =
        selectedHistory.find((version) => version.linked) ||
        selectedHistory[0] ||
        null;
      setPendingVersionDraft(null);
      setPendingVersionBase(null);
      if (selected) {
        const cleared = await clearActivityDraft(
          selected.customerId,
          selected.offeringId
        );
        if (!cleared) return;
      }
      if (linked) {
        setDraft({ ...linked });
        setInitialDraft({ ...linked });
        setEditingExisting(true);
        setDraftIsNew(false);
      }
      setExpandedVersionId(null);
      setReportVersionId(linked?.id || null);
      setReportSelectionError(false);
      return;
    }
    if (initialDraft) setDraft({ ...initialDraft });
    setExpandedVersionId(null);
  }

  async function persistVersions(
    versions: CustomerOfferingEngagementVersion[],
    successMessage: string,
    options: {
      closeAfterSave?: boolean;
      activeVersionId?: string;
      clearDraft?: boolean;
    } = {}
  ) {
    if (!selectedCustomer || !selectedOffering) return;
    const nextUsage = replaceEngagementVersions(
      selectedCustomer.offering_usage || [],
      selectedOffering.id,
      versions,
      options.clearDraft ? null : undefined
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
      if (options.closeAfterSave === false) {
        const refreshedHistory = engagementHistory(
          data.customer,
          selectedOffering.id
        );
        const activeVersion =
          refreshedHistory.find(
            (version) => version.id === options.activeVersionId
          ) || refreshedHistory[0];
        if (activeVersion) {
          setDraft({ ...activeVersion });
          setInitialDraft({ ...activeVersion });
          setEditingExisting(true);
          setExpandedVersionId(activeVersion.id);
        }
        setPendingVersionDraft(null);
        setPendingVersionBase(null);
        setDraftIsNew(false);
        return;
      }
      setSelected(null);
      setDraft(null);
      setInitialDraft(null);
      setPendingVersionDraft(null);
      setPendingVersionBase(null);
      setExpandedVersionId(null);
      setEditingExisting(false);
      setDraftIsNew(false);
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
    if (!reportVersionId) {
      setReportSelectionError(true);
      toast("Choose one activity as the report row before saving.", "error");
      return;
    }
    // Finish any queued autosave first so the final activity save always wins
    // and clears the shared draft deterministically.
    setSaving(true);
    await draftSaveChainRef.current;
    const now = new Date().toISOString();
    const current = engagementHistory(selectedCustomer, selectedOffering.id);
    const normalizedDraft = {
      ...draft,
      linked: draft.id === reportVersionId,
      activity_description: draft.activity_description?.trim() || null,
      dollar_value: Math.max(0, Math.round(draft.dollar_value || 0)),
      updated_at: now,
    };
    const versions = [
      normalizedDraft,
      ...current
        .filter((version) => version.id !== normalizedDraft.id)
        .map((version) => ({
          ...version,
          linked: version.id === reportVersionId,
        })),
    ].sort((a, b) => b.version - a.version);
    await persistVersions(
      versions,
      editingExisting ? "Activity updated." : "Activity added.",
      { clearDraft: !editingExisting }
    );
  }

  function unlinkCurrent(versionId = draft?.id) {
    if (!versionId || reportVersionId !== versionId) return;
    setReportVersionId(null);
    setReportSelectionError(false);
    if (draft?.id === versionId) {
      setDraft((current) =>
        current ? { ...current, linked: false } : current
      );
    }
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
            sub: "across reported activities",
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
            value={pinMode}
            onChange={(value) => setPinMode(value as PinMode)}
            options={PIN_OPTIONS}
            ariaLabel="Which headers stay on screen while you scroll"
            minWidth={168}
          />
          <MultiColorSelect
            values={activityFilter}
            onChange={setActivityFilter}
            options={activityOptions(summary.counts)}
            allLabel="All activities"
            allIcon={Filter}
            ariaLabel="Filter by activity"
            minWidth={165}
          />
          <MultiColorSelect
            values={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            allLabel="All statuses"
            allIcon={Filter}
            ariaLabel="Filter by status"
            minWidth={155}
          />
        </SearchPriority>
      </Card>

      <Card className="overflow-hidden p-0">
        {matrixCustomers.length === 0 ||
        matrixOfferings.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <Search size={28} strokeWidth={1.5} className="text-text-tertiary" />
            <h2 className="mt-3 text-[15px] font-semibold text-text-primary">
              Nothing matches {activityFilter.length || statusFilter.length ? "those filters" : "that search"}
            </h2>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {activityFilter.length || statusFilter.length
                ? "Choose another activity or status to update the matrix."
                : "Search by customer, offering name, or offering category."}
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "heat-map-scroll min-h-[420px] overflow-auto pb-1.5",
              // A pinned offering row needs something to outlast: give the
              // matrix its own scroll area so the header can stay while the
              // rows move under it. Unpinned, the table grows and the page
              // scrolls exactly as it always did.
              pinOfferings && "max-h-[70vh]"
            )}
          >
            <table
              className="table-fixed border-separate border-spacing-0 text-left"
              style={{
                width: 220 + matrixOfferings.length * 156,
              }}
            >
              <thead>
                <tr>
                  <th
                    className={cn(
                      "w-[220px] border-b border-r border-border bg-surface px-4 py-3",
                      // The corner belongs to both headers, so it sticks in
                      // whichever directions they do — and outranks them, or
                      // the customer names would slide underneath it.
                      (pinCustomers || pinOfferings) && "sticky z-30",
                      pinCustomers && "left-0",
                      pinOfferings && "top-0"
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                      Customer
                    </span>
                  </th>
                  {matrixOfferings.map((offering) => (
                    <th
                      key={offering.id}
                      className={cn(
                        "h-[78px] w-[156px] border-b border-r border-border bg-surface px-2.5 py-2",
                        pinOfferings && "sticky top-0 z-20"
                      )}
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
                    <th
                      className={cn(
                        "w-[220px] border-b border-r border-border bg-white px-3.5 py-2",
                        pinCustomers && "sticky left-0 z-10"
                      )}
                    >
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
                        : "None";
                      const isBaseline =
                        activity === "lead" && !resolved.hasHistory;
                      const categorical = displayMode === "activity";
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
                              <span
                                className={cn(
                                  "flex min-w-0 max-w-full items-center justify-center gap-1.5",
                                  resolved.hasHistory && "px-3"
                                )}
                              >
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
                                None
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
        dialogClassName="h-[min(760px,calc(100vh-2rem))]"
      >
        {draft && selectedCustomer && selectedOffering && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border-light bg-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between">
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
              {selectedHistory.length > 0 && !draftIsNew && (
                <Button
                  onClick={createNewVersion}
                  disabled={editingExisting && hasDraftChanges}
                  title={
                    editingExisting && hasDraftChanges
                      ? "Save or cancel the current changes before adding another activity"
                      : undefined
                  }
                  className="px-3 py-1.5 text-[12px]"
                >
                  <Plus size={13} strokeWidth={2.2} />
                  {pendingVersionDraft ? "Continue activity" : "Add activity"}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[14px] font-semibold text-text-primary">
                    Activity log
                  </h3>
                  <p className="text-[10.5px] text-text-tertiary">
                    Open a row to edit it. Mark one activity as the report row
                    used in the heat map.
                  </p>
                </div>
                <p className="text-[10px] font-medium text-text-tertiary">
                  {versionRows.length} {versionRows.length === 1 ? "attempt" : "attempts"}
                </p>
              </div>
              {reportSelectionError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-error"
                >
                  Choose one activity as the report row before saving or closing.
                </div>
              )}
              <div className="overflow-visible rounded-xl border border-border-light bg-white">
                <div className="hidden grid-cols-[116px_minmax(0,1.4fr)_120px_90px_140px_24px_36px] items-center gap-3 rounded-t-xl bg-surface px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary lg:grid">
                  <span>Report row</span>
                  <span>Activity</span>
                  <span>Status</span>
                  <span>Value</span>
                  <span>Dates</span>
                  <span className="sr-only">Open</span>
                  <span className="sr-only">Actions</span>
                </div>
              {versionRows.map((version) => {
                const versionMeta =
                  CUSTOMER_OFFERING_ACTIVITIES[version.activity];
                const versionStatus =
                  CUSTOMER_OFFERING_STATUSES[version.status];
                const VersionIcon = ACTIVITY_ICONS[version.activity];
                const VersionStatusIcon = STATUS_ICONS[version.status];
                const expanded =
                  expandedVersionId === version.id && draft.id === version.id;
                const unsaved = version.id === pendingVersionDraft?.id;
                const isNewRow = unsaved && draftIsNew;
                const reported = reportVersionId === version.id;
                const valueSummary = version.dollar_value
                  ? formatCurrency(
                      version.dollar_value,
                      version.currency || "USD"
                    )
                  : "None";
                const dateSummary = version.potential_close_date
                  ? `Close ${formatDate(version.potential_close_date)}`
                  : version.start_date && version.end_date
                    ? `${formatDate(version.start_date)} – ${formatDate(version.end_date)}`
                    : version.start_date
                      ? `From ${formatDate(version.start_date)}`
                      : "None";
                return (
                  <section
                    key={version.id}
                    className={cn(
                      "relative border-t border-border-light bg-white transition-colors first:border-t-0",
                      expanded
                        ? "z-20 overflow-visible bg-blue-light/10"
                        : "overflow-hidden"
                    )}
                  >
                    <div className="flex items-stretch gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={reported}
                        disabled={saving}
                        aria-label={`${reported ? "Reported" : "Report"} in the heat map: ${versionMeta.label}`}
                        title={
                          reported
                            ? "Uncheck temporarily while choosing another report row"
                            : "Report this activity in the heat map"
                        }
                        onClick={() => chooseHeatMapActivity(version.id)}
                        className={cn(
                          "inline-flex w-[104px] shrink-0 items-center justify-center gap-2 rounded-lg px-2 text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary disabled:cursor-default lg:w-[116px]",
                          reported
                            ? "bg-blue-light text-blue-primary"
                            : "text-text-secondary hover:bg-blue-light/40 hover:text-blue-primary"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-[17px] w-[17px] items-center justify-center rounded-[5px] border-2",
                            reported
                              ? "border-blue-primary bg-blue-primary text-white"
                              : "border-[#8E8E93] bg-white"
                          )}
                        >
                          {reported && (
                            <Check size={11} strokeWidth={3} />
                          )}
                        </span>
                        <span>Report</span>
                      </button>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleVersion(version.id)}
                        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_24px] items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary lg:grid-cols-[minmax(0,1.4fr)_120px_90px_140px_24px]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              background: versionMeta.color,
                              color: versionMeta.text,
                            }}
                          >
                            <VersionIcon size={15} strokeWidth={2.2} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[12.5px] font-semibold text-text-primary">
                                {versionMeta.label}
                              </span>
                              {isNewRow && (
                                <span className="shrink-0 rounded-full bg-blue-light px-1.5 py-0.5 text-[9px] font-bold text-blue-primary">
                                  Draft
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[10px] text-text-tertiary lg:hidden">
                              Attempt {version.version} · {versionStatus.label} · {valueSummary}
                            </span>
                            <span className="hidden text-[10px] text-text-tertiary lg:block">
                              Attempt {version.version}
                            </span>
                          </span>
                        </span>
                        <span
                          className="hidden w-fit max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-text-primary lg:inline-flex"
                          style={{
                            background: `${versionStatus.color}1F`,
                          }}
                        >
                          <VersionStatusIcon
                            size={11}
                            strokeWidth={2.2}
                            style={{ color: versionStatus.color }}
                          />
                          {versionStatus.label}
                        </span>
                        <span className="hidden truncate text-[11px] font-semibold text-text-primary lg:block">
                          {valueSummary}
                        </span>
                        <span
                          className="hidden truncate text-[10px] text-text-secondary lg:block"
                          title={dateSummary}
                        >
                          {dateSummary}
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
                      {reported && !unsaved ? (
                        <button
                          type="button"
                          onClick={() => unlinkCurrent(version.id)}
                          disabled={saving}
                          title={`Remove ${versionMeta.label} from the heat map`}
                          className="inline-flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-lg bg-error text-white shadow-sm transition-[transform,background-color,opacity] hover:bg-[#D92D20] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Remove ${versionMeta.label} from the heat map`}
                        >
                          <Trash2
                            size={14}
                            strokeWidth={2.4}
                            className="text-white"
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <span className="w-8 shrink-0" />
                      )}
                    </div>
                    {expanded && (
                      <div className="space-y-4 border-t border-blue-subtle bg-white p-4">
            {draftIsNew && (
              <div className="rounded-lg border border-blue-subtle bg-blue-light px-3 py-2.5">
                <p className="text-[11.5px] font-semibold text-text-primary">
                  Draft activity {draft.version}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-text-secondary">
                  Saved as a shared workspace draft. You can close this window
                  and continue later; it reaches the activity log only when you
                  save it.
                </p>
              </div>
            )}
            <FormSectionHeading
              title={draftIsNew ? "New activity details" : "Activity details"}
            />
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
                  options={ACTIVITY_EDIT_OPTIONS}
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

            <FormSectionHeading title="Timing and value" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Potential value">
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
                    type="text"
                    inputMode="decimal"
                    value={
                      draft.dollar_value
                        ? draft.dollar_value.toLocaleString("en-US")
                        : ""
                    }
                    onChange={(event) => {
                      const normalized = event.currentTarget.value
                        .replace(/,/g, "")
                        .replace(/[^\d.]/g, "");
                      const dollarValue = Number(normalized) || 0;
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
                    aria-label={`Potential value in ${draft.currency || "USD"}`}
                    className="h-10 bg-white text-[13px] tnum"
                  />
                </div>
              </Field>
              <Field label="Potential closure date">
                <Input
                  type="date"
                  value={dateValue(draft.potential_close_date)}
                  onChange={(event) => {
                    const potentialCloseDate =
                      event.currentTarget.value || null;
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            potential_close_date: potentialCloseDate,
                          }
                        : current
                    );
                  }}
                  className="h-10 bg-white text-[13px]"
                />
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

            <FormSectionHeading title="Linked CRM records" hint="Optional" />
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

            <div className="flex justify-end gap-2 border-t border-border-light pt-4">
                {editingExisting && hasDraftChanges && (
                  <Button variant="secondary" onClick={cancelExpandedVersion}>
                    Cancel changes
                  </Button>
                )}
                {!editingExisting && (
                  <Button variant="secondary" onClick={cancelExpandedVersion}>
                    {draftIsNew ? "Discard activity" : "Close details"}
                  </Button>
                )}
                {(hasDraftChanges || draftIsNew) && (
                  <Button onClick={saveDraft} loading={saving} className="page-in">
                    <Link2 size={14} strokeWidth={2.2} />
                    {editingExisting
                      ? "Save changes"
                      : draftIsNew
                        ? "Save activity"
                        : "Save details"}
                  </Button>
                )}
            </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
