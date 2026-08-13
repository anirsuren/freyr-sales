"use client";

import Link from "next/link";
import { useFillHeight } from "@/components/ui/useFillHeight";
import { FullScreenButton } from "@/components/ui/FullScreenPanel";
import { X } from "lucide-react";
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
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/InfoHint";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
 * like pin the row headers and the column headers if i want"). First built as
 * a toolbar dropdown; he threw that out (Aug 10: "this should not be a
 * drop-down. This has to be something on the row and in the column... it's
 * not a filter, right?") — and he is right: pinning is a property of the
 * headers, so the controls live in the CORNER CELL where the two headers
 * meet, one chip per axis, like freeze handles on a sheet.
 */
const PIN_STATES = ["on", "off"] as const;

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
  const [pinCustomersState, setPinCustomersState] = useStoredView<
    "on" | "off"
  >("freyr.heatmap.pin.customers", "on", PIN_STATES);
  const [pinOfferingsState, setPinOfferingsState] = useStoredView<
    "on" | "off"
  >("freyr.heatmap.pin.offerings", "on", PIN_STATES);
  const pinCustomers = pinCustomersState === "on";
  const pinOfferings = pinOfferingsState === "on";
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
  /* CROSSHAIR (Anir, Aug 10: "when I hover here, make it easier to see which
     square is in which column in which row. Do some cool highlight effect").
     Hovering a cell lights its whole row and whole column as two soft beams
     that intersect at the cursor, and both headers answer the question the
     beams are asking: THIS customer, THIS offering. */
  const [cross, setCross] = useState<{ row: string; col: string } | null>(
    null
  );
  /* The matrix ends where the window ends, whatever is stacked above it. The
     gap clears the floating Freyr AI bubble, so the last row stops right above
     it and there is nothing left to scroll past (Anir, Aug 13: "it should only
     scroll until here, until it's right above the AI assistant"). */
  const { ref: gridRef, height: gridHeight } = useFillHeight(96, 320);
  const [fullScreen, setFullScreen] = useState(false);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selected) setFullScreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullScreen, selected]);

  /** Which activity's remove-from-heat-map is awaiting a yes. */
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
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
    // A parked shared draft, or a cell bridged from an older deal/usage
    // record, still opens as an editable pending draft. A genuinely EMPTY
    // cell no longer invents one: it opens to an empty log with an explicit
    // add button (Anir, Aug 13: "why is it even creating a draft as soon as I
    // click it? It should have a button for me to click").
    const bridged = !!resolved.engagement || !!resolved.activity;
    const isPendingDraft = Boolean(storedDraft) || (!explicit && bridged);
    const emptyCell = !explicit && !storedDraft && !bridged;
    const savedReportId = history.find((version) => version.linked)?.id || null;
    setSelected({ customerId: customer.id, offeringId: offering.id });
    if (emptyCell) {
      setEditingExisting(false);
      setDraftIsNew(false);
      setDraft(null);
      setInitialDraft(null);
      setPendingVersionDraft(null);
      setPendingVersionBase(null);
      setExpandedVersionId(null);
      setReportVersionId(null);
      setReportSelectionError(false);
      return;
    }
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
    if (!selectedCustomer || !selectedOffering) return;
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
      currency: draft?.currency || "USD",
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

  /** Delete one activity: a saved row leaves the log, an unsaved draft is
   *  simply discarded. Deleting the report row promotes the newest survivor,
   *  because the heat map always reads exactly one. */
  async function deleteVersion(versionId: string) {
    setConfirmUnlink(null);
    if (versionId === pendingVersionDraft?.id) {
      cancelExpandedVersion();
      return;
    }
    if (!selectedCustomer || !selectedOffering) return;
    const remaining = engagementHistory(
      selectedCustomer,
      selectedOffering.id
    ).filter((version) => version.id !== versionId);
    const nextReport =
      reportVersionId === versionId
        ? (remaining[0]?.id ?? null)
        : reportVersionId;
    setReportVersionId(nextReport);
    if (expandedVersionId === versionId) setExpandedVersionId(null);
    await persistVersions(
      remaining.map((version) => ({
        ...version,
        linked: version.id === nextReport,
      })),
      "Activity deleted.",
      { clearDraft: draft?.id === versionId }
    );
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
          <FullScreenButton
            onOpen={() => setFullScreen(true)}
            label="heat map"
            className="ml-auto"
          />
        </SearchPriority>
      </Card>

      {fullScreen && (
        <div
          onClick={() => setFullScreen(false)}
          className="matrix-backdrop-in fixed inset-0 z-[200] bg-[rgba(15,23,42,0.45)] backdrop-blur-[1px]"
          aria-hidden="true"
        />
      )}
      {/* FULL SCREEN IS THE SAME CARD, PROMOTED (Anir, Aug 13: "click a button,
          and it's gonna literally take up my entire screen… It's literally only
          the entire table"). Promoting the element that is already there beats
          rendering the matrix twice: there is one grid, so the two views can
          never drift, and every filter and selection survives the switch. */}
      <Card
        className={cn(
          fullScreen
            // Inset, so the page stays visible around it and it reads as a
            // popup rather than a navigation (Anir, Aug 13: "it should still be
            // a pop-up… I should be able to see the edges").
            ? "matrix-pop-in fixed inset-6 z-[201] m-0 overflow-hidden rounded-2xl p-0 shadow-[0_40px_100px_-20px_rgba(15,23,42,0.5)]"
            : "-mb-28 overflow-hidden p-0"
        )}
      >
        {fullScreen && (
          <div className="flex h-[53px] items-center justify-between gap-4 border-b border-border-light px-5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Customer Offering Heat Map
            </h2>
            <button
              type="button"
              onClick={() => setFullScreen(false)}
              aria-label="Close full screen"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
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
            ref={gridRef}
            style={!fullScreen && gridHeight ? { height: gridHeight } : undefined}
            className={cn(
              // The matrix takes the screen: it is the page's whole point, and
              // a short window meant scrolling a grid inside a scrolling page
              // (Anir, Aug 12: "make this entire spreadsheet bigger… all the
              // way till the bottom of the screen"). The exact height comes
              // from useFillHeight, measured from where this element actually
              // starts. NO min-h/max-h here on purpose: a Tailwind clamp beats
              // the inline height, and a min-height of "most of the viewport"
              // made the grid overshoot the bottom by exactly the amount the
              // measurement was trying to remove.
              "heat-map-scroll overflow-auto",
              fullScreen && "h-[calc(100vh-101px)]",
              // A pinned offering row needs something to outlast: give the
              // matrix its own scroll area so the header can stay while the
              // rows move under it. Unpinned, the table grows and the page
              // scrolls exactly as it always did.
            )}
          >
            <table
              onMouseLeave={() => setCross(null)}
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
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                        Customer ↓
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-blue-primary">
                        Offering →
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-1">
                      {(
                        [
                          {
                            label: "Customers",
                            on: pinCustomers,
                            flip: () =>
                              setPinCustomersState(pinCustomers ? "off" : "on"),
                            hint: pinCustomers
                              ? "Customer names stay put while you scroll sideways. Click to unpin."
                              : "Pin the customer column so names stay while you scroll sideways.",
                          },
                          {
                            label: "Offerings",
                            on: pinOfferings,
                            flip: () =>
                              setPinOfferingsState(pinOfferings ? "off" : "on"),
                            hint: pinOfferings
                              ? "Offering names stay put while you scroll down. Click to unpin."
                              : "Pin the offering row so names stay while you scroll down.",
                          },
                        ] as const
                      ).map((axis) => (
                        <Tooltip key={axis.label} label={axis.hint}>
                          <button
                            type="button"
                            aria-pressed={axis.on}
                            onClick={axis.flip}
                            className={cn(
                              "flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-[3px] text-[9.5px] font-semibold transition-colors",
                              axis.on
                                ? "border-blue-subtle bg-blue-light text-blue-primary"
                                : "border-border-light bg-white text-text-tertiary hover:border-blue-subtle hover:text-text-secondary"
                            )}
                          >
                            {axis.on ? (
                              <Pin size={9} strokeWidth={2.4} />
                            ) : (
                              <PinOff size={9} strokeWidth={2.4} />
                            )}
                            {axis.label}
                          </button>
                        </Tooltip>
                      ))}
                    </span>
                  </th>
                  {matrixOfferings.map((offering) => (
                    <th
                      key={offering.id}
                      className={cn(
                        "h-[78px] w-[156px] border-b border-r border-border px-2.5 py-2 transition-colors duration-150",
                        cross?.col === offering.id ? "bg-blue-light" : "bg-surface",
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
                        <p
                          className={cn(
                            "flex h-[26px] w-full items-start justify-center overflow-hidden text-[10.5px] font-semibold leading-[1.2] transition-colors duration-150 group-hover:text-primary",
                            cross?.col === offering.id
                              ? "text-blue-primary"
                              : "text-text-primary"
                          )}
                        >
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
                        "w-[220px] border-b border-r border-border px-3.5 py-2 transition-colors duration-150",
                        cross?.row === customer.id ? "bg-blue-light" : "bg-white",
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
                            className={cn(
                              "truncate text-[12px] font-semibold transition-colors duration-150",
                              cross?.row === customer.id
                                ? "text-blue-primary"
                                : "text-text-primary"
                            )}
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
                            onMouseEnter={() =>
                              setCross({ row: customer.id, col: offering.id })
                            }
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
                            {/* The beam: always mounted, opacity-toggled, so
                                it GLIDES between cells instead of blinking.
                                It lies over coloured cells too — a beam that
                                skipped them would read as broken — and goes
                                quiet on the hovered cell itself, whose inset
                                ring already says "you are here". */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 bg-blue-primary/[0.07] transition-opacity duration-150"
                              style={{
                                opacity:
                                  cross &&
                                  (cross.row === customer.id ||
                                    cross.col === offering.id) &&
                                  !(
                                    cross.row === customer.id &&
                                    cross.col === offering.id
                                  )
                                    ? 1
                                    : 0,
                              }}
                            />
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
        open={!!selected && !!selectedCustomer && !!selectedOffering}
        onClose={closeModal}
        dock={fullScreen}
        title={
          selectedCustomer && selectedOffering
            ? `${selectedCustomer.company_name} × ${selectedOffering.name}`
            : "Customer offering activity"
        }
        size="workflow"
        dialogClassName="h-[min(760px,calc(100vh-2rem))]"
      >
        {/* AN EMPTY CELL OPENS TO AN EMPTY LOG, not to an invented draft.
            The button is the only way an activity comes into being (Anir,
            Aug 13: "It should have a button for me to click"). */}
        {!draft && selectedCustomer && selectedOffering && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border-light bg-surface/70 p-3">
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
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border-light px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-text-primary">
                No activities yet
              </p>
              <p className="max-w-[420px] text-[12.5px] leading-snug text-text-secondary">
                Nothing has been logged for this customer and offering, so the
                heat map shows None. Add the first activity to put it on the
                map.
              </p>
              <Button onClick={createNewVersion} className="mt-1.5">
                <Plus size={14} strokeWidth={2.2} /> Add the first activity
              </Button>
            </div>
          </div>
        )}
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
                <div
                  className={cn(
                    "hidden grid-cols-[116px_minmax(0,1.4fr)_120px_90px_140px_24px_36px] items-center gap-3 rounded-t-xl bg-surface px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary",
                    // The docked side panel is too narrow for these columns;
                    // rows show their compact stacked layout there instead.
                    !fullScreen && "lg:grid"
                  )}
                >
                  <span className="flex items-center gap-1">
                    Report row
                    <InfoHint text={"The one activity this offering shows on the customer heat map. Exactly one per offering.\nTick a different row to report that one instead."} />
                  </span>
                  <span>Activity</span>
                  <span>Status</span>
                  <span>Value</span>
                  <span>Dates</span>
                  <span className="sr-only">Open</span>
                  <span className="sr-only">Actions</span>
                </div>
              {versionRows.length === 0 && (
                <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    No activities yet
                  </p>
                  <p className="max-w-[420px] text-[12px] leading-snug text-text-secondary">
                    Nothing has been logged for this customer and offering, so
                    the heat map shows None. Add the first activity to put it
                    on the map.
                  </p>
                  <Button onClick={createNewVersion} className="mt-1">
                    <Plus size={14} strokeWidth={2.2} /> Add the first activity
                  </Button>
                </div>
              )}
              {versionRows.map((version) => {
                const versionMeta =
                  CUSTOMER_OFFERING_ACTIVITIES[version.activity];
                const versionStatus =
                  CUSTOMER_OFFERING_STATUSES[version.status];
                const VersionIcon = ACTIVITY_ICONS[version.activity];
                const VersionStatusIcon = STATUS_ICONS[version.status];
                const expanded =
                  expandedVersionId === version.id && draft?.id === version.id;
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
                      "relative transition-colors",
                      expanded
                        // Row + form as one visibly bounded card: lifted out of
                        // the list, tinted, ringed in blue. Without the shared
                        // boundary the form read as a separate unrelated panel
                        // (Anir, Aug 13: "I'm not getting the sense that this
                        // is part of that").
                        ? "z-20 my-1.5 overflow-visible rounded-xl bg-blue-light/30 ring-2 ring-inset ring-blue-primary/40"
                        : "overflow-hidden border-t border-border-light bg-white first:border-t-0"
                    )}
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
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
                          "inline-flex w-[104px] shrink-0 items-center justify-start gap-2 self-stretch rounded-lg px-2 text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary disabled:cursor-default lg:w-[116px]",
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
                        className={cn(
                          "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary",
                          !fullScreen &&
                            "lg:grid-cols-[minmax(0,1.4fr)_120px_90px_140px]"
                        )}
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
                            <span title="One saved activity for this customer and offering. The number counts how many have been logged." className={cn("block truncate text-[10px] text-text-tertiary", !fullScreen && "lg:hidden")}>
                              Attempt {version.version} · {versionStatus.label} · {valueSummary}
                            </span>
                            <span
                              className={cn(
                                "hidden text-[10px] text-text-tertiary",
                                !fullScreen && "lg:block"
                              )}
                            >
                              Attempt {version.version}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn("hidden w-fit max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-text-primary", !fullScreen && "lg:inline-flex")}
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
                        <span className={cn("hidden truncate text-[11px] font-semibold text-text-primary", !fullScreen && "lg:block")}>
                          {valueSummary}
                        </span>
                        <span
                          className={cn(
                            "hidden truncate text-[10px] text-text-secondary",
                            !fullScreen && "lg:block"
                          )}
                          title={dateSummary}
                        >
                          {dateSummary}
                        </span>
                      </button>
                      {confirmUnlink === version.id ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void deleteVersion(version.id)}
                              className="cursor-pointer rounded-full bg-[color:#DC2626] px-2.5 py-1 text-[11px] font-semibold text-white transition-all hover:opacity-90"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmUnlink(null)}
                              className="cursor-pointer rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-border-light"
                            >
                              Deny
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Delete this activity"
                            aria-label="Delete this activity"
                            onClick={() => setConfirmUnlink(version.id)}
                            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                      )}
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse this activity" : "Open this activity"}
                        onClick={() => toggleVersion(version.id)}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary"
                      >
                        <ChevronDown
                          size={16}
                          strokeWidth={2.1}
                          className={cn(
                            "transition-transform",
                            expanded && "rotate-180"
                          )}
                        />
                      </button>
                    </div>
                    {expanded && (
                      /* CLEARLY PART OF THE ROW ABOVE IT (Anir, Aug 13: "it's
                         kind of hard to see that this is all part of that first
                         row… make it clear, indent it"). The form used to start
                         hard against the left edge at the same width as the
                         table, so it read as a second, unrelated panel. Now it
                         is indented, tinted, and hangs off a blue rule that
                         runs down from the row it belongs to. */
                      <div className="tab-panel mx-3 mb-3 space-y-4 rounded-lg border border-border-light bg-white p-4">
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
                <Button
                  onClick={saveDraft}
                  loading={saving}
                  disabled={!hasDraftChanges && !draftIsNew}
                >
                  <Link2 size={14} strokeWidth={2.2} />
                  {draftIsNew ? "Save activity" : "Save changes"}
                </Button>
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
