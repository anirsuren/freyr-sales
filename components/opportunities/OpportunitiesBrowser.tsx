"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Flag,
  Target as TargetIcon,
  ListChecks as ListChecksIcon,
  Briefcase,
  ChevronDown,
  Sparkles,
  Tag,
  Pencil,
  Play,
  Loader,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDollarSign,
  PanelsTopLeft,
  Plus,
  Rows3,
  Trash2,
  TrendingUp,
  Target,
  Percent,
  Workflow,
  Crosshair,
  CalendarClock,
  Search,
  FlaskConical,
  FileSignature,
  FileText,
  Send,
  Hourglass,
  PauseCircle,
  Trophy,
  CircleSlash,
  Repeat,
  Zap,
  type LucideIcon,
  AlertTriangle,
  CalendarCheck,
} from "lucide-react";
import { PriorityTooltip } from "@/components/ui/SearchPriority";
import { FormRoom } from "@/components/ui/FormRoom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DateEcho } from "@/components/ui/DateEcho";
import { stampedAt } from "@/lib/performanceShared";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn, formatDate } from "@/lib/utils";
import { refreshOpportunities } from "@/lib/useOpportunities";
import { useStoredSet, useStoredView } from "@/lib/useStoredView";
import {
  CONFIDENCE_GO_GET,
  CONFIDENCE_HIGH,
  OPPORTUNITY_LEVELS,
  revenueTypeFromConfidence,
  revenueTypeRule,
  OPPORTUNITY_STATUSES,
  REVENUE_TYPES,
  offeringCount,
  opportunityValue,
  weightedValue,
  lines as linesOf,
  lineLabel,
  lineWeighted,
  opportunityConfidence,
  resolveOfferingLabel,
  type Opportunity,
  type OpportunityLine,
} from "@/lib/opportunitiesShared";
import { MultiPicker } from "@/components/ui/MultiPicker";
import {
  OfferingChip,
  offeringTypeColors,
} from "@/components/ui/OfferingChip";
import { typeMeta } from "@/components/performance/bits";
import { CURRENCIES, convert, fmtMoney, type CurrencyCode, type CurrencyRates } from "@/lib/currency";
import { currencyGlyph } from "@/components/ui/CurrencyGlyph";
import { OpportunityActivities } from "@/components/opportunities/OpportunityActivities";
import { Customer360 } from "@/components/customers/Customer360";
import type { Customer360Band } from "@/lib/customer360Shared";

/**
 * OPPORTUNITIES — Suren's pipeline, as records you can change.
 *
 * The columns are his sheet's, in his order: level, client, offering,
 * ARR/OTS, estimated sign date, total contract value, status, confidence,
 * next steps, and Freyr's own opportunity id. Add, edit and remove all live
 * here; the goal drill-down reads the same records as its line items.
 */

const LEVEL_COLOR: Record<string, string> = {
  Pipeline: "#0071E3",
  "Go get": "#B4318F",
  "High confidence": "#0F766E",
  Future: "#7C3AED",
};

/**
 * EVERY CATEGORY CARRIES A MARK, NOT JUST A COLOUR (Anir, Aug 19: "I don't
 * care about these blue circles... I need to see the actual icons").
 * House rule: a category chip is colour AND icon, never a bare dot.
 */
const LEVEL_ICON: Record<string, LucideIcon> = {
  Pipeline: Workflow,
  "Go get": Crosshair,
  "High confidence": TrendingUp,
  Future: CalendarClock,
};

const STATUS_ICON: Record<string, LucideIcon> = {
  Qualify: Search,
  Pilot: FlaskConical,
  Propose: FileText,
  "Submitted to client": Send,
  "Create contract": FileSignature,
  "Under review": Hourglass,
  "On hold": PauseCircle,
  Won: Trophy,
  Lost: CircleSlash,
};

const REVENUE_TYPE_META: Record<string, { color: string; icon: LucideIcon }> = {
  ARR: { color: "#0F766E", icon: Repeat },
  OTS: { color: "#C2410C", icon: Zap },
};

const STATUS_COLOR: Record<string, string> = {
  Qualify: "#0891B2",
  Pilot: "#5E5CE6",
  Propose: "#0071E3",
  "Submitted to client": "#7C3AED",
  /* Deep indigo: the last sales step before delivery owns it. Not green —
     green is Won, and drafting a contract is not the same as signing one. */
  "Create contract": "#4338CA",
  "Under review": "#B4318F",
  "On hold": "#8E98A8",
  Won: "#16A34A",
  Lost: "#DC2626",
};

/**
 * THE MONEY CELL IS BLUE-ON-BLUE, NOT A VERDICT WALL. The first cut coloured
 * confidence red/amber/green and a young pipeline became a page of red —
 * "red means horrible", and 25% confidence is not horrible, it is early
 * (Anir, Aug 17: "this isn't what I envision… make it look more premium").
 * So the cell uses the exact idiom every Performance bar already speaks:
 * solid blue for the weighted share, washed blue for the rest of the total.
 * The dropdown's per-row confidence keeps a quiet blue too.
 */
const MONEY_BLUE = "#0071E3";
function confidenceColor(_pct: number): string {
  return MONEY_BLUE;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** One editable offering row. Everything is text while it is being typed, so
 *  a half-written number is never eaten out from under the person typing it. */
type DraftLine = {
  key: string;
  /** A catalogue offering, or "" when it is being typed as free text. */
  offeringId: string;
  offeringLabel: string;
  /** True only when the person explicitly picked "Not in the catalogue". */
  offeringOther: boolean;
  revenueType: string;
  value: string;
  /** What the client pays in their own money — display only, USD counts. */
  localValue: string;
  localCurrency: string;
  status: string;
  confidence: string;
  estSignDate: string;
};

type Draft = {
  id?: string;
  externalId: string;
  name: string;
  customer: string;
  customerId: string;
  /** True only when the person explicitly picked "Not on the list" — a fresh
   *  form shows a neutral "Pick the account…" instead of looking like the
   *  type-it option chose itself (Anir, Aug 17: "why does it auto select
   *  not on the list?"). */
  customerOther: boolean;
  rows: DraftLine[];
  goalIds: string[];
  /** The goal table (Suren, Aug 18: goal + person + value + Met). */
  goalRows: DraftGoalRow[];
  level: string;
  status: string;
  /** Free-form activities on the deal (Suren, Aug 18: "we don't need a fixed
   *  list. They can enter whatever activity name, and then start date, end
   *  date, and then status"). */
  activities: DraftActivity[];
  owner: string;
  /** No longer shown in the form (Suren, Aug 18: "don't give this comment")
   *  but carried through saves so stored text is never silently erased. */
  nextSteps: string;
};

type DraftActivity = {
  key: string;
  id: string;
  name: string;
  /** What the stored record called it and the label it wore, so an untouched
   *  master-vocabulary entry saves back unchanged instead of being rewritten
   *  as its display label. */
  sourceActivity: string;
  sourceLabel: string;
  status: string;
  startDate: string;
  endDate: string;
};

type DraftGoalRow = {
  key: string;
  id: string;
  goalId: string;
  person: string;
  value: string;
  met: boolean;
  actualId?: string;
};

let goalRowSeq = 0;
function blankGoalRow(): DraftGoalRow {
  goalRowSeq += 1;
  return {
    key: `gl-new-${goalRowSeq}`,
    id: "",
    goalId: "",
    person: "",
    value: "",
    met: false,
  };
}

let actSeq = 0;
function blankActivity(): DraftActivity {
  actSeq += 1;
  return {
    key: `act-new-${actSeq}`,
    id: "",
    name: "",
    sourceActivity: "",
    sourceLabel: "",
    status: "initiated",
    startDate: "",
    endDate: "",
  };
}

/** Suren's three words for where an activity stands ("is it initiated, is it
 *  in progress, is it completed"), on the stored vocabulary. */
const ACT_STATUS_OPTIONS = [
  { value: "initiated", label: "Initiated", color: "#0071E3", icon: Play },
  { value: "under_progress", label: "In progress", color: "#7C3AED", icon: Loader },
  { value: "completed", label: "Completed", color: "#0F766E", icon: CheckCircle2 },
];

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `new-${lineSeq}`,
    offeringId: "",
    offeringLabel: "",
    offeringOther: false,
    revenueType: "",
    value: "",
    localValue: "",
    localCurrency: "",
    status: "",
    confidence: "",
    estSignDate: "",
  };
}

const BLANK: Draft = {
  externalId: "",
  name: "",
  customer: "",
  customerId: "",
  customerOther: false,
  rows: [],
  goalIds: [],
  goalRows: [],
  level: "Pipeline",
  status: "",
  activities: [],
  owner: "",
  nextSteps: "",
};

function toDraft(
  o: Opportunity,
  /** So a sheet row that says "GRI" opens with Regulatory Intelligence
   *  Services already picked, instead of asking someone to re-find it. */
  catalogue: { id: string; name: string }[] = [],
  /** Old entries stored a master id ("lead"); the form shows its label. */
  masters: { id: string; label: string }[] = []
): Draft {
  const existing = linesOf(o);
  // An opportunity saved before rows existed opens as ONE row holding exactly
  // what it always held, so editing an old record never silently drops it.
  const rows: DraftLine[] = existing.length
    ? existing.map((l) => {
        lineSeq += 1;
        return {
          key: l.id || `row-${lineSeq}`,
          offeringId:
            l.offeringId ??
            (l.offeringLabel
              ? (resolveOfferingLabel(l.offeringLabel, catalogue) ?? "")
              : ""),
          offeringLabel: l.offeringLabel ?? "",
          offeringOther: !l.offeringId && !!l.offeringLabel,
          revenueType: l.revenueType ?? "",
          value: l.value ? String(l.value) : "",
          localValue: l.localValue ? String(l.localValue) : "",
          localCurrency: l.localCurrency ?? "",
          status: l.status ?? "",
          confidence: l.confidence === undefined ? "" : String(l.confidence),
          estSignDate: l.estSignDate ?? "",
        };
      })
    : [
        {
          ...blankLine(),
          offeringId:
            o.offeringIds[0] ??
            (o.offeringLabels[0]
              ? (resolveOfferingLabel(o.offeringLabels[0], catalogue) ?? "")
              : ""),
          offeringLabel: o.offeringLabels[0] ?? "",
          offeringOther: o.offeringIds.length === 0 && !!o.offeringLabels[0],
          revenueType: o.revenueType ?? "",
          value: o.value ? String(o.value) : "",
          status: o.status ?? "",
          confidence: o.confidence === undefined ? "" : String(o.confidence),
          estSignDate: o.estSignDate ?? "",
        },
      ];
  return {
    id: o.id,
    externalId: o.externalId ?? "",
    name: o.name,
    customer: o.customer,
    customerId: o.customerId ?? "",
    // A typed name opens as the SELECTED chip in the list — typing mode is
    // only ever the person's explicit choice (Anir, Aug 18: clicking the
    // dropdown on a custom name "resets it… it shouldn't even be
    // resetting").
    customerOther: false,
    rows,
    goalIds: [...(o.goalIds ?? [])],
    // Old records carry bare goalIds; they open as table rows to fill in.
    goalRows: (o.goalLinks ?? []).length
      ? (o.goalLinks ?? []).map((l, i) => ({
          key: l.id || `gl-${i}`,
          id: l.id,
          goalId: l.goalId,
          person: l.person ?? "",
          value: l.value !== undefined ? String(l.value) : "",
          met: Boolean(l.met),
          actualId: l.actualId,
        }))
      : (o.goalIds ?? []).map((goalId, i) => ({
          key: `gl-old-${i}`,
          id: "",
          goalId,
          person: "",
          value: "",
          met: false,
        })),
    level: o.level,
    status: o.status ?? "",
    activities: (o.activities ?? []).map((a, i) => {
      const label = masters.find((m) => m.id === a.activity)?.label ?? a.activity;
      return {
        key: a.id || `act-${i}`,
        id: a.id,
        name: label,
        sourceActivity: a.activity,
        sourceLabel: label,
        status: a.status,
        startDate: a.startDate ?? "",
        endDate: a.endDate ?? "",
      };
    }),
    owner: o.owner ?? "",
    nextSteps: o.nextSteps ?? "",
  };
}

/**
 * The day a deal entered the pipeline, spelled out. Separate from its owner,
 * which is who carries it now and can change hands (Anir, Aug 23).
 */
/** The deal's creation stamp, with its clock — see stampedAt. */
const createdOn = stampedAt;

/**
 * IS THIS DEAL'S MONEY PLANNED, AND DOES THE PLAN STILL HOLD?
 *
 * Suren, Aug 26: "the moment you plan a deal, you put an icon which says that
 * the plan for the accrual is already done, and then have another icon if that
 * plan is invalid... somebody puts a symbol on this so that they will look at
 * all the things that are invalid, and then they come and fix it. Who fixes
 * it? The account owner."
 *
 * Amber, never red: a plan that needs re-doing is a nudge, and red in this app
 * means somebody rejected something. Nothing at all when there is no plan —
 * most deals do not have one and a row of grey "no plan" marks would drown the
 * two that matter.
 */
function AccrualMark({ badge }: { badge?: AccrualBadge }) {
  if (!badge?.planned) return null;
  const broken = badge.problems.length > 0;
  const Icon = broken ? AlertTriangle : CalendarCheck;
  return (
    <PriorityTooltip
      label={
        broken
          ? `${badge.headline} ${badge.owner || "The account owner"} needs to re-plan it.`
          : "The accrual months for this deal are planned."
      }
    >
      <span
        aria-label={
          broken ? "Accrual plan needs re-doing" : "Accrual months planned"
        }
        className="inline-flex h-4 w-4 shrink-0 cursor-default items-center justify-center"
        style={{ color: broken ? "#B45309" : "#16A34A" }}
      >
        <Icon size={13} strokeWidth={2.3} />
      </span>
    </PriorityTooltip>
  );
}

export type AccrualBadge = {
  planned: boolean;
  problems: string[];
  headline: string;
  owner: string;
};

export function OpportunitiesBrowser({
  opportunities,
  meetingsByDeal = {},
  bandsByDeal = {},
  accrualPlans = {},
  offerings,
  offeringTypes = [],
  customers,
  goals,
  masterActivities = [],
  rates = {},
  people = [],
  meName,
  canEdit,
  privileged = true,
  live,
}: {
  opportunities: Opportunity[];
  /** Meetings held against each deal, newest first (Suren, Aug 28:
   *  "similarly against opportunities"). */
  /** Everything connected to each deal — the same strip the customer page
   *  carries, scoped to one opportunity. */
  bandsByDeal?: Record<string, Customer360Band[]>;
  meetingsByDeal?: Record<
    string,
    {
      id: string;
      ref: string;
      title: string;
      type: string;
      owner: string;
      meetingAt: string;
      status: string;
    }[]
  >;
  /**
   * PER DEAL: is its money planned, and does that plan still hold?
   *
   * Suren, Aug 26: "the moment you plan a deal, you put an icon which says
   * that the plan for the accrual is already done, and then have another icon
   * if that plan is invalid... the system makes these things invalid."
   */
  accrualPlans?: Record<string, AccrualBadge>;
  offerings: { id: string; name: string; type?: string }[];
  /** Ordered, so an offering's colour matches its card on the Offerings page. */
  offeringTypes?: { name: string }[];
  customers: { id: string; name: string }[];
  goals: { id: string; name: string; year: number; type?: string }[];
  /** The activity master's stages — the deal says which one it is AT. */
  masterActivities?: { id: string; label: string; color: string }[];
  /** Admin-entered FX rates (units per USD) — a EUR entry converts itself. */
  rates?: CurrencyRates;
  /** The roster the Owner dropdown offers. */
  people?: string[];
  meName: string;
  canEdit: boolean;
  /** Managers and admins touch every deal; a rep only their own. Drives
   *  which rows draw the pencil at all (Anir, Aug 22, hitting the refusal
   *  toast as a rep: "if I can't edit I shouldn't be able to edit it in the
   *  first place — I should only be allowed to do the dropdown"). The server
   *  keeps enforcing the same rule; this stops offering buttons it refuses. */
  privileged?: boolean;
  live: boolean;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<Opportunity[]>(opportunities);
  /** CURRENT | FUTURE — two tabs, one page (Anir, Aug 17: "shouldn't it be
   *  separate, like a separate tab within the pipeline page?"). Future deals
   *  have no money yet, so they get their own table instead of $0 rows
   *  diluting the pipeline's numbers. Remembered per person. */
  const [pipeView, setPipeView] = useStoredView<"current" | "future">(
    "freyr.opportunities.view",
    "current",
    ["current", "future"]
  );
  /** GROUPING IS A LENS, NOT A STRUCTURE (Suren, Aug 17 call: "bring all the
   *  opportunities together under one customer… it's just a grouping
   *  mechanism — every row is an opportunity, I'm not taking that out"). */
  /* TABLE OR SPLIT, LIKE THE OTHER LIST PAGES (Anir, Aug 30: "so I probably
     want the table and split view here too now that I think of it").
     The split reuses pipeTable() with a single row and that row forced open,
     so the right pane IS the table's own detail panel — no second rendering of
     a deal to drift from the first. */
  const [dealView, setDealView] = useStoredView<"table" | "split">(
    "freyr.opportunities.view",
    "table",
    ["table", "split"] as const
  );
  const [groupBy, setGroupBy] = useStoredView<"none" | "customer" | "offering">(
    "freyr.opportunities.groupBy",
    "customer",
    ["none", "customer", "offering"]
  );
  const futures = useMemo(
    () => list.filter((o) => o.level === "Future"),
    [list]
  );
  const currentList = useMemo(
    () => list.filter((o) => o.level !== "Future"),
    [list]
  );
  const [query, setQuery] = useState("");
  // MULTISELECT filters (Anir, Aug 18: "multiselect. wherever this applies…
  // across other pages and dropdowns too") — empty pick means everything.
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  /** Suren, Aug 16: "I need two column names where you can filter based on
   *  customer… it's like how you do customers, and within the customers,
   *  certain opportunities are coming." */
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  /** Drafts closed WITHOUT saving, by deal id ("new" for a fresh one) — X-ing
   *  the form must never eat typed work (Anir, Aug 18: "if they exit this
   *  screen and press the x, when they come back and press edit they have to
   *  [still have] the data"). A landed save clears its entry. */
  const draftStash = useRef<Record<string, Draft>>({});
  /** The row a save just landed on — scrolled to and briefly lit, because the
   *  list re-sorts on save and the deal LOOKED like it vanished (Suren, Aug 18:
   *  "I was working on an opportunity. How can it disappear, man?"). */
  const [flashId, setFlashId] = useState<string | null>(null);
  /**
   * ARRIVING FROM SEARCH LANDS ON THE DEAL, not merely on the page. Global
   * search indexes opportunities now, and a result that dropped you at the
   * top of a 102-row pipeline would have been the same dead end the customer
   * links were. Same flash-and-scroll the save path already uses.
   */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("deal");
    if (!wanted) return;
    if (list.some((o) => o.id === wanted && o.level === "Future")) {
      setPipeView("future");
    }
    setFlashId(wanted);
    const at = window.setTimeout(() => {
      document
        .querySelector(`[data-opp-row="${wanted}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 400);
    const off = window.setTimeout(() => setFlashId(null), 3200);
    return () => {
      window.clearTimeout(at);
      window.clearTimeout(off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  /** X keeps the draft; Cancel throws it away. Both used to stash it, so an
   *  abandoned form could never be cleared — reopening New opportunity handed
   *  back last week's half-typed deal, and there was no way to start clean
   *  short of saving something. (Found testing, Aug 19.) */
  const closeEditor = (discard = false) => {
    setEditing((current) => {
      if (!current) return null;
      const key = current.id || "new";
      if (discard) delete draftStash.current[key];
      else draftStash.current[key] = current;
      return null;
    });
  };
  /** Each deal's frozen list position for this visit — see the sort below. */
  const stableRank = useRef<Map<string, number>>(new Map());
  /** The deal saved a moment ago, held above everything until you navigate. */
  const justAdded = useRef<string | null>(null);
  /** The draft exactly as the editor opened — Save stays greyed out until the
   *  form actually differs from it (Anir, Aug 18: "I didn't change anything,
   *  so why is it asking me to save?"). Null while adding a NEW deal, where
   *  saving is always a change. */
  const [editBaseline, setEditBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) {
      setEditBaseline(null);
      return;
    }
    if (editing.id) setEditBaseline(JSON.stringify(editing));
    // Snapshot only when the editor OPENS or switches deals — field edits
    // must not move the baseline under the comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing !== null, editing?.id]);
  const [confirmRemove, setConfirmRemove] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);

  const offeringName = useMemo(
    () => new Map(offerings.map((o) => [o.id, o.name])),
    [offerings]
  );

  /**
   * EVERY OFFERING WEARS ITS OWN COLOUR (Anir, Aug 16: "the offering has to
   * have the color, the icon, etc., to make sure it's completely accurate").
   * Resolved by type, the same way the Offerings page does it, so the two
   * screens never disagree about what colour an offering is. Free-text
   * offerings from the sheet have no type, so they get no colour rather than
   * borrowing one that means something else.
   */
  const typeColor = useMemo(
    () => offeringTypeColors(offeringTypes),
    [offeringTypes]
  );
  const colorForOfferingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offerings) {
      // The same fallback the Offerings page uses when a type name has
      // drifted from the types master (its pill goes violet, not gray) —
      // "Freyr Services" vs the master's spelling left GRI colourless in
      // Real (Anir, Aug 17: "that has to be color-coded with the tag and
      // the pill and stuff"). Only truly untyped offerings stay neutral.
      const c = o.type ? (typeColor[o.type] ?? "#7C3AED") : undefined;
      if (c) map.set(o.id, c);
    }
    return map;
  }, [offerings, typeColor]);
  /** Free text off the sheet: match it to the catalogue by name when we can,
   *  so "GRI" is not colourless just because it arrived as words. */
  const colorForOfferingLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offerings) {
      const c = o.type ? (typeColor[o.type] ?? "#7C3AED") : undefined;
      if (c) map.set(o.name.trim().toLowerCase(), c);
    }
    return map;
  }, [offerings, typeColor]);
  const lineColor = (line: OpportunityLine): string | undefined => {
    if (line.offeringId) return colorForOfferingId.get(line.offeringId);
    if (!line.offeringLabel) return undefined;
    const direct = colorForOfferingLabel.get(line.offeringLabel.trim().toLowerCase());
    if (direct) return direct;
    // "GRI" is Regulatory Intelligence Services said the way the team says it,
    // so it wears that offering's colour rather than reading as untyped.
    const resolved = resolveOfferingLabel(line.offeringLabel, offerings);
    return resolved ? colorForOfferingId.get(resolved) : undefined;
  };

  /** Every account with a deal on it, for the filter. Names as they are
   *  stored, so an account that arrived from the sheet is reachable too. */
  const customersInPipeline = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of list) {
      const name = o.customer.trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [list]);

  const groupKeyOf = (o: Opportunity): string =>
    groupBy === "customer"
      ? o.customer
      : (o.offeringIds[0]
          ? (offeringName.get(o.offeringIds[0]) ?? o.offeringIds[0])
          : o.offeringLabels[0]) ?? "No offering";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = currentList
      .filter((o) => levelFilter.length === 0 || levelFilter.includes(o.level))
      .filter(
        (o) => statusFilter.length === 0 || statusFilter.includes(o.status ?? "")
      )
      .filter(
        (o) =>
          customerFilter.length === 0 ||
          customerFilter.some(
            (c) => o.customer.trim().toLowerCase() === c.toLowerCase()
          )
      )
      .filter(
        (o) =>
          !q ||
          o.name.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          (o.externalId ?? "").toLowerCase().includes(q) ||
          (o.owner ?? "").toLowerCase().includes(q) ||
          o.offeringLabels.some((l) => l.toLowerCase().includes(q)) ||
          o.offeringIds.some((id) =>
            (offeringName.get(id) ?? "").toLowerCase().includes(q)
          )
      );
    // THE LIST HOLDS ITS ORDER WHILE YOU WORK (Suren, Aug 18: "I was working
    // on an opportunity. How can it disappear, man… whichever order it is in,
    // it need to be there"). Money decides the order ONCE per visit; editing
    // a value or confidence no longer teleports the row mid-session. A newly
    // created deal joins at the top, where the save just happened.
    const ranks = stableRank.current;
    const unseen = filtered.filter((o) => !ranks.has(o.id));
    if (unseen.length) {
      if (ranks.size === 0) {
        [...unseen]
          .sort((a, b) => b.value - a.value)
          .forEach((o, i) => ranks.set(o.id, i));
      } else {
        let top = Math.min(...ranks.values());
        for (const o of unseen) ranks.set(o.id, --top);
      }
    }
    /**
     * THE ONE YOU JUST ADDED IS THE ONE YOU ARE LOOKING FOR (Anir, Aug 21:
     * "when I add an opportunity it should show up at the top, not the
     * bottom — that's why I picked the wrong one").
     *
     * The rank above already floats a NEW row, but the default grouping is
     * "Group by customer", and the group is ordered by its best-placed deal
     * from a ranks map that gets rebuilt whenever the list is re-read. So a
     * fresh deal could land inside a Kenvue card halfway down 79 rows. This
     * pins it below every other rank until the next visit, which also drags
     * its group to the top, because a group sits where its best deal sits.
     */
    if (justAdded.current) {
      const pinned = filtered.find((o) => o.id === justAdded.current);
      if (pinned) ranks.set(pinned.id, Number.NEGATIVE_INFINITY);
      else justAdded.current = null;
    }
    return filtered.sort(
      (a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0)
    );
  }, [currentList, query, levelFilter, statusFilter, customerFilter, offeringName]);

  const groupedShown = useMemo(() => {
    if (groupBy === "none") return shown;
    // Groups hold still too — a value edit must not reshuffle the cards any
    // more than the rows (same Suren rule as the sort above). A group sits
    // where its best-placed deal sits.
    const ranks = stableRank.current;
    const best = new Map<string, number>();
    for (const o of shown) {
      const k = groupKeyOf(o);
      const r = ranks.get(o.id) ?? 0;
      if (!best.has(k) || r < (best.get(k) ?? 0)) best.set(k, r);
    }
    return [...shown].sort((a, b) => {
      const ka = groupKeyOf(a), kb = groupKeyOf(b);
      if (ka !== kb) {
        const d = (best.get(ka) ?? 0) - (best.get(kb) ?? 0);
        return d !== 0 ? d : ka.localeCompare(kb);
      }
      return (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, offeringName]);

  /** Which grouped cards are folded shut. Remembered across navigations, not
   *  session-local: closing eleven customers to read the twelfth and finding
   *  all eleven open again on the way back is the page not listening (Anir,
   *  Aug 28: "also ur not saving if I had it closed or opened"). */
  const [shutGroups, setShutGroups] = useStoredSet("freyr.opportunities.shutGroups");

  const groupSections = useMemo(() => {
    if (groupBy === "none") return [] as { key: string; rows: Opportunity[] }[];
    const sections = new Map<string, Opportunity[]>();
    for (const o of groupedShown) {
      const k = groupKeyOf(o);
      sections.set(k, [...(sections.get(k) ?? []), o]);
    }
    return [...sections.entries()].map(([key, rows]) => ({ key, rows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedShown, groupBy]);

  const totals = useMemo(() => {
    /* Sum of the rows, not the deal-level field — the two can drift and the
       rows are the truth (opportunityValue's own doctrine). */
    const value = shown.reduce((s, o) => s + opportunityValue(o), 0);
    const weighted = shown.reduce((s, o) => s + weightedValue(o), 0);
    /* THE SAME NUMBER THE ROWS SHOW. A deal built in this form stores its
       confidence on the offering row, not on the deal, so reading the
       deal-level field alone made the tile say "none recorded yet" while
       every row underneath it read "65% confident". */
    const withConfidence = shown
      .map((o) => opportunityConfidence(o))
      .filter((c): c is number => typeof c === "number");
    return {
      value,
      weighted,
      count: shown.length,
      avgConfidence: withConfidence.length
        ? Math.round(
            withConfidence.reduce((sum, c) => sum + c, 0) / withConfidence.length
          )
        : null,
    };
  }, [shown]);

  /**
   * WHAT AN OPPORTUNITY CANNOT SAVE WITHOUT (Anir, Aug 17: "why is it letting
   * me add this stuff if i didn't fill out the fields"): a name, a customer,
   * at least one offering, and every offering row named and carrying money.
   * Status, confidence and dates can genuinely be unknown — his own imported
   * deals have blanks there — so those stay optional.
   */
  // The NEXT deal number, shown before saving (Anir, Aug 19: "Show me the
  // opportunity ID, don't just say 'assigned automatically'"). The server
  // still assigns authoritatively at save time; two people saving at once
  // simply take consecutive numbers.
  const nextOppId = useMemo(() => {
    let max = 0;
    for (const o of list) {
      const m = /^OPP-(\d+)$/.exec(o.externalId ?? "");
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `OPP-${String(max + 1).padStart(4, "0")}`;
  }, [list]);

  const missing: string[] = !editing
    ? []
    : [
        !editing.name.trim() ? "a name for the opportunity" : "",
        !editing.customerId && !editing.customer.trim() ? "the customer" : "",
        editing.rows.length === 0 ? "at least one offering" : "",
        editing.rows.some((r) => !r.offeringId && !r.offeringLabel.trim())
          ? "the offering"
          : "",
        // Value is demanded on rows ADDED here and now — five of his real
        // imported deals genuinely carry no value yet, and editing those must
        // not trap him behind a rule about a number nobody has.
        editing.rows.some(
          (r) =>
            r.key.startsWith("new-") &&
            (r.offeringId || r.offeringLabel.trim()) &&
            (r.value === "" || !(Number(r.value) > 0))
        )
          ? "a value on the offering"
          : "",
      ].filter(Boolean);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      // The rows ARE the money. The server sums them, so nothing here types a
      // total that could disagree with what is listed under it.
      const payload = {
        op: editing.id ? "update" : "add",
        id: editing.id,
        externalId: editing.externalId,
        name: editing.name,
        customer: editing.customer,
        customerId: editing.customerId || undefined,
        lines: editing.rows.map((r) => ({
          id: r.key.startsWith("new-") ? undefined : r.key,
          offeringId: r.offeringId || undefined,
          offeringLabel: r.offeringId ? undefined : r.offeringLabel || undefined,
          revenueType: r.revenueType || undefined,
          /* Whole dollars. The box now tolerates a decimal point so "2.5m"
             can be typed a character at a time; a half-finished "2.5" that
             never got its suffix must not land as a $2.50 deal. */
          value: r.value === "" ? 0 : Math.round(Number(r.value)) || 0,
          localValue:
            r.localValue === ""
              ? undefined
              : Math.round(Number(r.localValue)) || undefined,
          localCurrency: r.localCurrency || undefined,
          status: r.status || undefined,
          confidence: r.confidence === "" ? undefined : Number(r.confidence),
          estSignDate: r.estSignDate || undefined,
        })),
        // goalIds stays derived for the pacing line; the table is the record.
        goalIds: [
          ...new Set(
            editing.goalRows.filter((r) => r.goalId).map((r) => r.goalId)
          ),
        ],
        goalLinks: editing.goalRows
          .filter((r) => r.goalId)
          .map((r) => ({
            id: r.id || undefined,
            goalId: r.goalId,
            person: r.person || undefined,
            value:
              r.value.trim() !== "" && Number.isFinite(Number(r.value.replace(/,/g, "")))
                ? Number(r.value.replace(/,/g, ""))
                : undefined,
            met: r.met,
            actualId: r.actualId,
          })),
        /* Derived on the way out as well as on screen, so a legacy row that
           was saved with a hand-picked level lands consistent the moment
           anybody edits it. */
        level: revenueTypeFromConfidence(
          editing.rows[0]?.confidence === "" || editing.rows[0]?.confidence === undefined
            ? undefined
            : Number(editing.rows[0].confidence),
          editing.level === "Future"
        ),
        status: editing.status || undefined,
        owner: editing.owner || undefined,
        nextSteps: editing.nextSteps || undefined,
        // The form's list IS the record (Suren, Aug 18: "add as many
        // activities as possible"). Person, note and logged date ride along
        // from the stored entry so renaming never rewrites who did what.
        activities: (() => {
          const existing = editing.id
            ? (list.find((x) => x.id === editing.id)?.activities ?? [])
            : [];
          const out = editing.activities
            .filter((a) => a.name.trim())
            .map((a) => {
              const prev = existing.find((x) => x.id && x.id === a.id);
              return {
                id: a.id || undefined,
                activity:
                  prev && a.name.trim() === a.sourceLabel
                    ? a.sourceActivity
                    : a.name.trim(),
                status: a.status || "initiated",
                person: prev?.person ?? meName,
                note: prev?.note,
                date: prev?.date ?? new Date().toISOString().slice(0, 10),
                startDate: a.startDate || undefined,
                endDate: a.endDate || undefined,
              };
            });
          // An empty list still posts when rows were deleted, so removing
          // the last activity actually clears it; undefined means untouched.
          return out.length || existing.length ? out : undefined;
        })(),
      };
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      const saved: Opportunity = data.opportunity;
      if (!editing.id) justAdded.current = saved.id;
      setList((prev) =>
        editing.id
          ? prev.map((o) => (o.id === saved.id ? saved : o))
          : [saved, ...prev]
      );
      refreshOpportunities();
      toast(editing.id ? `${saved.name} saved` : `${saved.name} added`);
      delete draftStash.current[editing.id || "new"];
      setEditing(null);
      // The list re-sorts on save, so walk the eye to where the deal landed.
      setFlashId(saved.id);
      setTimeout(() => {
        document
          .querySelector(`[data-opp-row="${saved.id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 150);
      setTimeout(() => setFlashId(null), 2600);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(o: Opportunity) {
    setBusy(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "remove", id: o.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't delete.");
      setList((prev) => prev.filter((x) => x.id !== o.id));
      refreshOpportunities();
      toast(`${o.name} removed`);
      setConfirmRemove(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't delete.", "error");
    } finally {
      setBusy(false);
    }
  }

  const writable = canEdit && live;
  /** May THIS row be changed by the reader? Same rule the API applies. */
  const mayTouch = (o: Opportunity) => privileged || (o.owner ?? "") === meName;

  /** THE ONE TABLE SHELL, shared by the flat list and the grouped cards —
   *  same columns everywhere, so separate cards still read as one table
   *  (the Goal Master trick). */
  const pipeTable = (rowsToShow: Opportunity[]) => (
    <>
            {/* table-fixed, because auto layout poured every spare pixel
                into the first two columns — 500px for "Novartis" — and shoved
                Value, Confidence, Status and Actions past a horizontal scroll
                nobody could see (Anir, Aug 17: "I couldn't even tell that
                there was more stuff in the table"). Fixed widths on the data
                columns; Customer and Opportunity share the rest and truncate
                instead of ballooning. */}
            <table className="w-full min-w-[1024px] table-fixed border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-bold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                  <th className="w-[21%] px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Opportunity</th>
                  <th className="w-[13%] px-4 py-2.5">Offerings</th>
                  {/* ONE COLUMN FOR THE MONEY (Anir, Aug 17: "does weighted
                      have any relation to value? you could probably merge the
                      two… and color-code it, like a bar"). Weighted IS value ×
                      confidence, so the bar draws the relation instead of
                      three columns asking the reader to compute it: the track
                      is the contract value, the fill is the weighted share,
                      the colour is the confidence verdict. */}
                  <th className="w-[200px] px-4 py-2.5">Value · weighted</th>
                  <th className="w-[132px] px-4 py-2.5">Status</th>
                  <th className="w-[104px] px-4 py-2.5">Est. sign</th>
                  <th className="w-[84px] px-4 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {rowsToShow.map((o) => {
                  const open = openRow === o.id;
                  const names = [
                    ...o.offeringIds.map((id) => offeringName.get(id) ?? id),
                    ...o.offeringLabels,
                  ];
                  const rows = linesOf(o);
                  const shownConfidence = opportunityConfidence(o);
                  return (
                    <Fragment key={o.id}>
                      <tr
                        data-opp-row={o.id}
                        onClick={() => setOpenRow(open ? null : o.id)}
                        aria-expanded={open}
                        className={cn(
                          "cursor-pointer transition-colors",
                          open
                            ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                            : "hover:bg-surface",
                          flashId === o.id &&
                            "bg-blue-light/60 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        )}
                      >
                        {/* THE ACCOUNT GETS ITS OWN COLUMN (Suren, Aug 16:
                            "where is the customer name? I need two column
                            names where you can filter based on customer"). It
                            was a grey subtitle under the deal name, so the one
                            thing you scan a pipeline by could not be scanned. */}
                        <td className="px-4 py-3.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <CompanyLogo
                              name={o.customer}
                              className="h-8 w-8 shrink-0 text-[10px]"
                            />
                            <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
                              {o.customer}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 truncate text-[13.5px] font-semibold text-text-primary">
                                {o.name}
                              </span>
                              <AccrualMark badge={accrualPlans[o.id]} />
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                                style={{
                                  background: `${LEVEL_COLOR[o.level]}18`,
                                  color: LEVEL_COLOR[o.level],
                                }}
                              >
                                {o.level}
                              </span>
                              {o.externalId && (
                                <span className="text-[10px] text-text-tertiary tnum">
                                  {o.externalId}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        {/* THE OFFERINGS, IN THEIR OWN COLOURS. A row per
                            offering when the deal has rows, so "which
                            offerings does this cover" is answered without
                            opening anything. */}
                        <td className="px-4 py-3.5">
                          {rows.length === 0 && names.length === 0 ? (
                            <span className="text-[12px] text-text-tertiary">·</span>
                          ) : rows.length > 0 ? (
                            /* One chip per DISTINCT offering — a deal quoted
                               as ARR + OTS is two rows of the same offering,
                               and "GRI GRI" said less than "GRI" (the split
                               lives in the dropdown). */
                            <span className="flex flex-wrap items-center gap-1">
                              {(() => {
                                const seen = new Map<string, (typeof rows)[number]>();
                                for (const line of rows) {
                                  const label = lineLabel(line, (id) => offeringName.get(id));
                                  if (!seen.has(label)) seen.set(label, line);
                                }
                                const uniq = [...seen.entries()];
                                return (
                                  <>
                                    {uniq.slice(0, 2).map(([label, line]) => (
                                      <OfferingChip
                                        key={label}
                                        name={label}
                                        color={lineColor(line)}
                                        size="xs"
                                        className="max-w-[150px]"
                                      />
                                    ))}
                                    {uniq.length > 2 && (
                                      <span className="text-[11px] font-semibold text-text-tertiary">
                                        +{uniq.length - 2}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              {names.slice(0, 2).map((n) => {
                                const resolved = resolveOfferingLabel(n, offerings);
                                return (
                                  <OfferingChip
                                    key={n}
                                    name={n}
                                    color={
                                      colorForOfferingLabel.get(n.trim().toLowerCase()) ??
                                      (resolved
                                        ? colorForOfferingId.get(resolved)
                                        : undefined)
                                    }
                                    size="xs"
                                    className="max-w-[150px]"
                                  />
                                );
                              })}
                              {names.length > 2 && (
                                <span className="text-[11px] font-semibold text-text-tertiary">
                                  +{names.length - 2}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        {/* Value, weighted and confidence as ONE picture —
                            and each number SAYS which it is (Anir, Aug 17:
                            "I need to see specifically this much is weighted,
                            this much is the total. color code, not grey").
                            Weighted wears the confidence colour, same as the
                            bar it explains. */}
                        {/* Left-anchored like its neighbours (Anir: "it's
                            right-aligned. It's not left-aligned"). Fixed
                            width, so the totals still stack on one line. */}
                        <td className="px-4 py-3.5">
                          <div className="flex w-[168px] flex-col gap-1">
                            <div className="flex items-end justify-between gap-3">
                              <span className="flex flex-col items-start">
                                <span className="text-[9px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Weighted
                                </span>
                                <span
                                  className="text-[13px] font-bold tnum"
                                  style={
                                    shownConfidence === undefined
                                      ? undefined
                                      : { color: confidenceColor(shownConfidence) }
                                  }
                                >
                                  {shownConfidence === undefined
                                    ? "·"
                                    : money(weightedValue(o))}
                                </span>
                              </span>
                              <span className="flex flex-col items-end">
                                <span className="text-[9px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Total
                                </span>
                                <span className="text-[14px] font-bold text-text-primary tnum">
                                  {money(opportunityValue(o))}
                                </span>
                              </span>
                            </div>
                            <span className="flex h-2 w-full overflow-hidden rounded-full bg-[rgba(0,113,227,0.14)]">
                              {shownConfidence !== undefined && (
                                <span
                                  className="block h-full rounded-full bg-blue-primary transition-[width]"
                                  style={{ width: `${shownConfidence}%` }}
                                />
                              )}
                            </span>
                            <span className="text-[10.5px] tnum">
                              {shownConfidence === undefined ? (
                                <span className="text-text-tertiary">
                                  no confidence set
                                </span>
                              ) : o.status === "Won" || o.status === "Lost" ? (
                                /* A DECIDED DEAL HAS NO CONFIDENCE LEFT. Once
                                   weighted value stopped discounting a signed
                                   deal, this line derived 100% and read "100%
                                   confident" under a Won badge — confidence is
                                   a forecast word and the forecast is over.
                                   Say what happened instead. */
                                <span className="font-semibold text-[color:#0058B0]">
                                  {o.status === "Won" ? "signed, counts in full" : "lost, counts as nothing"}
                                </span>
                              ) : (
                                <span className="font-semibold text-[color:#0058B0]">
                                  {shownConfidence}% confident
                                </span>
                              )}
                              {rows.length > 1 && (
                                <span className="text-text-tertiary">
                                  {" "}· {rows.length} rows
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {o.status ? (
                            <span
                              className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                              style={{
                                background: `${STATUS_COLOR[o.status]}18`,
                                color: STATUS_COLOR[o.status],
                              }}
                            >
                              {o.status}
                            </span>
                          ) : (
                            <span className="text-[12px] text-text-tertiary">
                              not set
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-text-secondary tnum">
                          {o.estSignDate ?? "·"}
                        </td>
                        <td className="px-2 py-3.5">
                          <span className="flex items-center justify-start gap-0.5">
                            {writable && mayTouch(o) && (
                              <>
                                <button
                                  type="button"
                                  title={`Edit ${o.name}`}
                                  aria-label={`Edit ${o.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing(draftStash.current[o.id] ?? toDraft(o, offerings, masterActivities));
                                  }}
                                  className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                                >
                                  <Pencil size={13} strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  title={`Remove ${o.name}`}
                                  aria-label={`Remove ${o.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmRemove(o);
                                  }}
                                  className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                                >
                                  <Trash2 size={13} strokeWidth={2.2} />
                                </button>
                              </>
                            )}
                            <ChevronDown
                              size={15}
                              strokeWidth={2.2}
                              aria-hidden="true"
                              className={cn(
                                "text-text-tertiary transition-transform",
                                open && "rotate-180 text-blue-primary"
                              )}
                            />
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="!border-t-0 bg-surface">
                          <td
                            colSpan={7}
                            className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          >
                            {/* THE OFFERING ROWS, IN FULL (Suren, Aug 16:
                                "under opportunity, offering 1 value, offering
                                2 value, offering 3 value… all the values
                                together will become the total opportunity
                                value"). Each row carries its own money, its
                                own status and its own confidence, because that
                                is the point: "within that opportunity, this
                                offering has a better status and confidence
                                level, more." */}
                            <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white">
                            {rows.length > 1 && (
                              /* No caption, no column headers — each line
                                 says itself: the offering chip, its ARR/OTS,
                                 the money with the same blue weighted bar the
                                 row above wears, the status, the date. ONLY
                                 when there are several offerings — a single
                                 offering's line just restated the row above
                                 it (Anir, Aug 17: "you don't have to say
                                 250k, 1 million, 25% again"). */
                              <div className="divide-y divide-border-light">
                                {rows.map((line) => (
                                  <div
                                    key={line.id}
                                    className="grid grid-cols-[minmax(150px,1fr)_230px_130px_110px] items-center gap-x-6 px-3.5 py-2.5"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <OfferingChip
                                        name={lineLabel(line, (id) => offeringName.get(id))}
                                        color={lineColor(line)}
                                        size="xs"
                                      />
                                      {line.revenueType && (
                                        <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10px] font-bold text-[color:#0058B0]">
                                          {line.revenueType}
                                        </span>
                                      )}
                                    </span>
                                    {/* Same shape as the column above it: the
                                        bar, then the amounts under the bar.
                                        Grey = the whole deal, light blue =
                                        this offering, strong blue = weighted. */}
                                    <span className="flex flex-col gap-1">
                                      {/* A single-offering deal's bar would
                                          just repeat the row above it (Anir,
                                          Aug 17: "this is kind of redundant,
                                          having 2 bars") — the bar and the
                                          "of the whole deal" only appear when
                                          there are several offerings to
                                          compare. */}
                                      {rows.length > 1 && (
                                        <span className="relative flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                                          <span
                                            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary opacity-[0.32]"
                                            style={{
                                              width: `${o.value > 0 ? Math.min(100, (line.value / o.value) * 100) : 0}%`,
                                            }}
                                          />
                                          <span
                                            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary"
                                            style={{
                                              width: `${opportunityValue(o) > 0 ? Math.min(100, (lineWeighted(line) / opportunityValue(o)) * 100) : 0}%`,
                                            }}
                                          />
                                        </span>
                                      )}
                                      <span className="whitespace-nowrap text-[11px] tnum">
                                        {/* One offering = the header above
                                            already says all three numbers
                                            (Anir, Aug 17: "you don't have to
                                            say 250k, 1 million, 25% again").
                                            Only several offerings earn their
                                            own money lines. */}
                                        {rows.length > 1 && (
                                          <>
                                            <b className="text-blue-primary">
                                              {line.confidence === undefined
                                                ? "·"
                                                : money(lineWeighted(line))}
                                            </b>
                                            <span className="font-semibold text-[color:rgba(0,113,227,0.55)]">
                                              {" "}of {money(line.value)}
                                            </span>
                                            <span className="text-text-tertiary">
                                              {" "}of {money(opportunityValue(o))}
                                            </span>
                                            {line.confidence !== undefined && (
                                              <span className="text-text-secondary"> · {line.confidence}%</span>
                                            )}
                                          </>
                                        )}
                                        {line.localValue && line.localCurrency && (
                                          // What the client actually pays, in
                                          // their money. Reference only — the
                                          // USD number is what counts.
                                          <span className="text-text-tertiary">
                                            {" "}· {fmtMoney(line.localValue, line.localCurrency)} local
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                    <span>
                                      {line.status ? (
                                        <span
                                          className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                                          style={{
                                            background: `${STATUS_COLOR[line.status]}18`,
                                            color: STATUS_COLOR[line.status],
                                          }}
                                        >
                                          {line.status}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-text-tertiary">not set</span>
                                      )}
                                    </span>
                                    <span className="text-right text-[11.5px] text-text-tertiary tnum">
                                      {line.estSignDate ?? "no date"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* SUBSTANCE FIRST (Anir, Aug 17: "the stuff
                                below the row, in the container in the
                                dropdown, looks bad"): next steps lead as the
                                widest thing on the panel, the owner and the
                                CRM id sit in a quiet rail beside them, and
                                the activities strip gets the full width
                                under a divider. No half-empty label grid. */}
                            <div className={cn("grid grid-cols-1 gap-x-10 gap-y-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_230px]", rows.length > 1 && "border-t border-border-light")}>
                              {/* WHAT CAME IN WITH THE SHEET, when there is any.
                                  Next steps left the form when activities
                                  replaced it, so this text can no longer be
                                  written or changed - leading the panel with a
                                  frozen field while the live activity list sat
                                  underneath had it exactly backwards. It stays
                                  visible because it is real imported detail,
                                  but it no longer leads and it no longer
                                  pretends to be fillable. */}
                              <div className="min-w-0">
                                {o.nextSteps ? (
                                  <>
                                    <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                      Note from the sheet
                                    </span>
                                    <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-primary">
                                      {o.nextSteps}
                                    </p>
                                  </>
                                ) : (
                                  <span className="block text-[12px] text-text-tertiary">
                                    Everything happening on this deal is in the
                                    activities below.
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 space-y-3.5 sm:border-l sm:border-border-light sm:pl-8">
                                {/* MEETINGS HELD AGAINST THIS DEAL (Suren,
                                    Aug 28: "similarly against opportunities"
                                    — a meeting connects to the customer, the
                                    person and the deal, and each of them
                                    should be able to say which meetings
                                    touched it). Only when there are any: an
                                    empty heading on every deal is noise. */}
                                {(meetingsByDeal[o.id] ?? []).length > 0 && (
                                  <div>
                                    <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                      Meetings
                                    </span>
                                    <ul className="mt-1.5 space-y-1.5">
                                      {(meetingsByDeal[o.id] ?? [])
                                        .slice(0, 4)
                                        .map((mt) => (
                                          <li key={mt.id}>
                                            {/* THE TITLE GETS THE LINE, the
                                                reference and the date share
                                                the one under it. All three
                                                on one row in a 230px rail
                                                left the title seven
                                                characters wide — "Inittia…"
                                                beside a date with room to
                                                spare (found in the browser,
                                                Aug 28). What the meeting was
                                                about is the half a reader
                                                needs; a ref they can read
                                                after they have found it. */}
                                            <Link
                                              href={`/meetings/${mt.id}`}
                                              className="block text-[12.5px] hover:text-blue-primary"
                                            >
                                              <span className="block truncate font-medium text-text-primary">
                                                {mt.title}
                                              </span>
                                              <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                                                <span className="font-bold tnum">{mt.ref}</span>
                                                <span aria-hidden="true">·</span>
                                                <span className="tnum">
                                                  {formatDate(mt.meetingAt)}
                                                </span>
                                              </span>
                                            </Link>
                                          </li>
                                        ))}
                                    </ul>
                                    {(meetingsByDeal[o.id] ?? []).length > 4 && (
                                      <span className="mt-1 block text-[11.5px] text-text-tertiary">
                                        and {(meetingsByDeal[o.id] ?? []).length - 4} more
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div>
                                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                    Owner
                                  </span>
                                  {o.owner ? (
                                    <span className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                                      <Avatar
                                        name={o.owner}
                                        className="h-6 w-6 shrink-0 text-[8px]"
                                      />
                                      {o.owner}
                                    </span>
                                  ) : (
                                    <span className="mt-1.5 block text-[12.5px] text-text-tertiary">
                                      Nobody yet
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                    Opportunity id
                                  </span>
                                  {o.externalId ? (
                                    <span className="mt-1.5 inline-block rounded-md bg-surface px-2 py-0.5 text-[12px] font-semibold text-text-secondary tnum">
                                      {o.externalId}
                                    </span>
                                  ) : (
                                    <span className="mt-1.5 block text-[12.5px] text-text-tertiary">
                                      none
                                    </span>
                                  )}
                                </div>
                                {/* WHEN THIS DEAL WAS CREATED (Anir, Aug 23:
                                    "same thing here, I need to see who and
                                    when created this opportunity").

                                    The owner is who carries it NOW, which is
                                    a different fact and can change hands;
                                    this is the day it entered the pipeline
                                    and never moves. Month spelled out for the
                                    same reason every date in the app is —
                                    08/09 is two different days depending on
                                    which office reads it. Deals imported from
                                    the sheet carry their import stamp, which
                                    is the truthful answer for them. */}
                                {createdOn(o.createdAt) && (
                                  <div>
                                    <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                      Created
                                    </span>
                                    <span className="mt-1.5 block text-[12.5px] text-text-secondary tnum">
                                      {createdOn(o.createdAt)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* EVERYTHING CONNECTED TO THIS DEAL — the same
                                  strip the customer page carries, scoped to
                                  one opportunity (Suren, Aug 28: "if I go to
                                  opportunities and click on opportunity, all
                                  the presentation and everything will come...
                                  all the materials, everything, like how
                                  you're showing customers").

                                  Only drawn when something is actually
                                  connected: an all-zero strip repeated down
                                  78 deals is noise, and the deal already says
                                  what it has in the panel above. */}
                              {(bandsByDeal[o.id] ?? []).some((b) => b.count > 0) && (
                                <div className="border-t border-border-light pt-3.5 sm:col-span-2">
                                  <Customer360
                                    bands={bandsByDeal[o.id] ?? []}
                                    company={o.customer}
                                    emptyLine="Nothing is connected to this deal yet."
                                  />
                                </div>
                              )}
                              <div className="border-t border-border-light pt-3.5 sm:col-span-2">
                                <OpportunityActivities
                                  opportunity={o}
                                  canEdit={canEdit && live}
                                  onSaved={(saved) =>
                                    setList((prev) =>
                                      prev.map((x) => (x.id === saved.id ? saved : x))
                                    )
                                  }
                                />
                              </div>
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
    </>
  );

  return (
    <div>
      {/* THE SELECTOR IS THE TITLE (Anir, Aug 25: "do it like how you do it on
          the performance page — you have the tags at the top. You have current
          pipeline and future, so copy that. You don't need to say
          opportunities or what it is. Just have that at the top").

          The performance rooms settled this on Aug 14: a heading naming the
          room with a tab bar under it naming the same room again says it
          twice and puts the control below the label it duplicates. The pills
          move up to where the title was and carry the name themselves; the h1
          stays for screen readers and the document outline, and the one action
          keeps its place on the right. */}
      <h1 className="sr-only">
        {pipeView === "future" ? "Future pipeline" : "Current pipeline"}
      </h1>
      {/* Same pill idiom as the performance rooms, at the same size. NO
          entrance animation on these — the performance lesson holds here too. */}
      <div className="relative z-40 mb-6 mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            { key: "current" as const, label: "Current pipeline", count: currentList.length, icon: Workflow, color: "#0071E3" },
            { key: "future" as const, label: "Future", count: futures.length, icon: CalendarClock, color: "#7C3AED" },
          ]).map((t) => {
            const Icon = t.icon;
            const active = pipeView === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => setPipeView(t.key)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold tracking-[-0.01em] transition-all",
                  active
                    ? "bg-white text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={active ? { color: t.color } : undefined}
                />
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tnum",
                    t.key === "future"
                      ? "bg-[rgba(124,58,237,0.12)] text-[color:#7C3AED]"
                      : "bg-[rgba(0,113,227,0.10)] text-[color:#0058B0]"
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="shrink-0">{
          writable ? (
            <Button
              onClick={() =>
                // Opens on one empty offering row, because that is the first
                // thing to fill in and an empty list reads as a dead end.
                setEditing(
                  draftStash.current["new"] ?? {
                    ...BLANK,
                    owner: meName,
                    // ONE offering per opportunity (Suren, Aug 17 call) — the
                    // form opens with its single offering block ready.
                    rows: [blankLine()],
                    level: pipeView === "future" ? "Future" : "Pipeline",
                  }
                )
              }
            >
              <Plus size={14} strokeWidth={2.2} /> New opportunity
            </Button>
          ) : null}</div>
      </div>

      {/* Same entrance the performance rooms play when the tab flips — the
          pills above hold still, only the content below arrives. */}
      <div key={pipeView} className="tab-panel">
      {pipeView === "future" ? (
        <FutureSection
          futures={futures}
          flashId={flashId}
          writable={writable}
          mayTouch={mayTouch}
          offeringName={offeringName}
          colorForOffering={(o) =>
            o.offeringIds[0]
              ? (colorForOfferingId.get(o.offeringIds[0]) ?? "#7C3AED")
              : "#7C3AED"
          }
          onEdit={(o) => setEditing(draftStash.current[o.id] ?? toDraft(o, offerings, masterActivities))}
          onRemove={(o) => setConfirmRemove(o)}
        />
      ) : (
      <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Briefcase}
          label="Opportunities"
          value={String(totals.count)}
          sub={
            levelFilter.length === 0
              ? "in the pipeline"
              : levelFilter.map((l) => l.toLowerCase()).join(", ")
          }
        />
        <StatTile
          icon={Target}
          label="Total value"
          value={money(totals.value)}
          sub="contract value"
        />
        <StatTile
          icon={TrendingUp}
          label="Weighted"
          value={money(totals.weighted)}
          sub="value × confidence"
        />
        <StatTile
          icon={Percent}
          label="Average confidence"
          value={totals.avgConfidence === null ? "·" : `${totals.avgConfidence}%`}
          sub={
            totals.avgConfidence === null
              ? "none recorded yet"
              : "across those that have one"
          }
        />
      </div>

      {/* THE TOOLBAR STANDS ON ITS OWN, exactly as it does on Offerings
          (Anir, Aug 21: "you have a big white rectangle, then a gray
          rectangle, then also a search bar rectangle — remove the outer
          rectangle... whatever you have on the offerings page, put that on
          the opportunities page"). It used to live INSIDE the results card,
          which made the grey band a box in a box and pushed it in by the
          card's own padding so it no longer lined up with anything else on
          the page. Out here it is full width and the card below holds only
          results. */}
      <PageToolbar
        className="mt-4"
        query={query}
            onQuery={setQuery}
            placeholder="Search deals, accounts, offerings, owners…"
            placeholders={[
              "Search deals…",
              "Search accounts…",
              "Search offerings…",
              "Search owners…",
            ]}
            searchAriaLabel="Search opportunities"
            onClearAll={() => {
              setQuery("");
              setCustomerFilter([]);
              setLevelFilter([]);
              setStatusFilter([]);
            }}
            groups={[
              {
                // THE ACCOUNT IS THE FIRST THING YOU NARROW BY (Suren, Aug 16:
                // "it's like how you do customers, and within the customers,
                // certain opportunities are coming"), so it leads the filters.
                key: "customer",
                label: "Customer",
                values: customerFilter,
                onChange: setCustomerFilter,
                options: customersInPipeline.map((c) => ({
                  value: c,
                  label: c,
                  logoName: c,
                })),
              },
              {
                key: "level",
                label: "Revenue type",
                values: levelFilter,
                onChange: setLevelFilter,
                options: OPPORTUNITY_LEVELS.filter((l) => l !== "Future").map((l) => ({
                  value: l,
                  label: l,
                  color: LEVEL_COLOR[l],
                })),
              },
              {
                key: "status",
                label: "Status",
                values: statusFilter,
                onChange: setStatusFilter,
                options: OPPORTUNITY_STATUSES.map((st) => ({
                  value: st,
                  label: st,
                  color: STATUS_COLOR[st],
                })),
              },
            ]}
            sortLabel="Group"
            sort={
              <ColorSelect
                value={groupBy}
                ariaLabel="Group rows"
                onChange={(v) => setGroupBy(v as "none" | "customer" | "offering")}
                minWidth={180}
                dense
                collapsible={false}
                className="w-[180px] shrink-0"
                options={[
                  { value: "none", label: "No grouping", color: "#8E98A8" },
                  { value: "customer", label: "Group by customer", color: "#0071E3", icon: Briefcase },
                  { value: "offering", label: "Group by offering", color: "#B4318F", icon: Sparkles },
                ]}
              />
            }
            view={
              <span
                role="group"
                aria-label="How to show the pipeline"
                className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface p-0.5"
              >
                {(
                  [
                    { key: "table", label: "Table", icon: Rows3 },
                    { key: "split", label: "Split", icon: PanelsTopLeft },
                  ] as const
                ).map((o) => {
                  const Icon = o.icon;
                  const on = dealView === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setDealView(o.key)}
                      aria-pressed={on}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-all",
                        on
                          ? "bg-white text-text-primary shadow-sm"
                          : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                      {o.label}
                    </button>
                  );
                })}
              </span>
            }
            display={
              /* ONE button that knows which way it goes (Anir, Aug 19: "It
                 should just be one button. It'll know if I close all or open
                 all"): any card open means the next press closes everything;
                 all shut means it opens everything. */
              groupBy !== "none" && shown.length > 0
                ? (() => {
                    const allKeys = groupSections.map((sec) => sec.key);
                    const anyOpen = allKeys.some((k) => !shutGroups.includes(k));
                    return (
                      <button
                        type="button"
                        onClick={() => setShutGroups(anyOpen ? allKeys : [])}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-light bg-white px-3 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                      >
                        {anyOpen ? (
                          <ChevronsDownUp size={14} strokeWidth={2.2} />
                        ) : (
                          <ChevronsUpDown size={14} strokeWidth={2.2} />
                        )}
                        {anyOpen ? "Close all" : "Open all"}
                      </button>
                    );
                  })()
                : null
          }
        />

      {/* The card now holds RESULTS ONLY, so when the rows have gone off into
          their own group cards below there is nothing left for it to draw and
          it does not render an empty frame. */}
      {/* THE SPLIT IS ITS OWN GROUPING. Without this the split rendered only
          when grouping was off, so turning it on while grouped did nothing
          visible — found in the browser, Aug 30. A left-hand running list and
          a grouped set of cards are two answers to the same question; the
          split wins while it is on. */}
      {(shown.length === 0 || groupBy === "none" || dealView === "split") && (
        shown.length === 0 ? (
          <Card className="overflow-hidden p-0">
            <EmptyState
              icon={Briefcase}
              title={list.length === 0 ? "No opportunities yet" : "Nothing matches"}
              description={
                list.length === 0
                  ? "Add the first deal and it shows up here, on its account, and as a line item under any goal it feeds."
                  : "Clear the search or the filters to see the rest of the pipeline."
              }
            />
          </Card>
        ) : dealView === "split" ? (
          (() => {
            const picked =
              groupedShown.find((d) => d.id === openRow) ?? groupedShown[0];
            return (
              <div
                key="split"
                className="tab-panel grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
              >
                <div className="max-h-[720px] overflow-y-auto rounded-xl border border-border-light bg-white">
                  {groupedShown.map((d) => {
                    const on = picked?.id === d.id;
                    const value = opportunityValue(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setOpenRow(d.id)}
                        aria-current={on ? "true" : undefined}
                        title={d.name}
                        className={cn(
                          "flex w-full cursor-pointer items-start gap-2.5 border-b border-border-light px-3 py-2.5 text-left transition-colors last:border-b-0",
                          on
                            ? "bg-blue-light/50 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                            : "hover:bg-surface"
                        )}
                      >
                        <CompanyLogo
                          name={d.customer}
                          className="mt-0.5 h-7 w-7 shrink-0 text-[9px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[12.5px] font-semibold",
                              on ? "text-blue-primary" : "text-text-primary"
                            )}
                          >
                            {d.name}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                            <span className="min-w-0 truncate">{d.customer}</span>
                            <span className="shrink-0 tnum">
                              · {money(value)}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Card key={picked?.id ?? "none"} className="tab-panel overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    {picked ? pipeTable([picked]) : null}
                  </div>
                </Card>
              </div>
            );
          })()
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">{pipeTable(groupedShown)}</div>
          </Card>
        )
      )}

      {/* SEPARATE CARDS, NOT ONE LONG TABLE — the Goal Master idiom exactly
          (Anir, Aug 18: "Look at performance goal master and separate it
          like that"): each customer or offering is its own card with a
          tinted header that folds it away; what lies between the cards is
          the page itself. */}
      {/* …and the grouped cards stand down while it is (see above). */}
      {shown.length > 0 && groupBy !== "none" && dealView !== "split" && (
        <div className="mt-5 space-y-6">
          {groupSections.map(({ key, rows: sectionRows }) => {
            const shut = shutGroups.includes(key);
            return (
              <Card key={key} className="overflow-hidden p-0">
                {/* A BLUE band, not another pale strip: the group header used
                    to wear the same near-white as the column strip below it,
                    so where one account ended and the next began was a squint
                    (Anir, Aug 19: "the separations between BMS and Haleon are
                    a little confusing"). */}
                <button
                  type="button"
                  onClick={() =>
                    setShutGroups(
                      shutGroups.includes(key)
                        ? shutGroups.filter((k) => k !== key)
                        : [...shutGroups, key]
                    )
                  }
                  aria-expanded={!shut}
                  className={cn(
                    /* THE RAIL ONLY WHILE OPEN (Anir, Aug 27: "were these lines
                       there before?" -- since Aug 19, on shut groups too, which
                       contradicts the rule set since: a rail demarcates an OPEN
                       block. The blue band keeps doing the separating; the rail
                       now says what every other rail in the app says). */
                    "flex w-full cursor-pointer items-center gap-2 bg-blue-light/50 px-4 py-2.5 text-left transition-colors hover:bg-blue-light/75",
                    !shut &&
                      "border-b border-border-light shadow-[inset_3px_0_0_0_var(--blue-primary)]"
                  )}
                >
                  <ChevronDown
                    size={15}
                    strokeWidth={2.2}
                    className={cn(
                      "shrink-0 text-text-tertiary transition-transform duration-200",
                      shut && "-rotate-90"
                    )}
                  />
                  {groupBy === "customer" ? (
                    <>
                      <CompanyLogo name={key} className="h-6 w-6 shrink-0 text-[8px]" />
                      <b className="text-[13px] text-text-primary">{key}</b>
                    </>
                  ) : (
                    <OfferingChip name={key} color={lineColor({ id: "g", offeringLabel: key, value: 0 }) ?? "#B4318F"} size="xs" />
                  )}
                  <span className="text-[11px] font-semibold text-text-tertiary tnum">
                    {sectionRows.length} {sectionRows.length === 1 ? "deal" : "deals"}
                  </span>
                  {/* THE BAR, not a money sentence (Anir, Aug 18: "instead of
                      saying 8.1 million or whatever show me the total progress
                      bar") — same picture as every row: track = total value,
                      fill = the weighted share. */}
                  {(() => {
                    const total = sectionRows.reduce((sum, x) => sum + opportunityValue(x), 0);
                    const weighted = sectionRows.reduce(
                      (sum, x) => sum + weightedValue(x),
                      0
                    );
                    const pct =
                      total > 0
                        ? Math.min(100, Math.round((weighted / total) * 100))
                        : 0;
                    return (
                      <span className="ml-1 inline-flex min-w-0 items-center gap-2">
                        <span className="flex h-2 w-36 shrink-0 overflow-hidden rounded-full bg-[rgba(0,113,227,0.14)]">
                          {pct > 0 && (
                            <span
                              className="block h-full rounded-full bg-blue-primary"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </span>
                        <span className="text-[11px] font-bold tnum text-[color:#0058B0]">
                          {money(weighted)}
                        </span>
                        <span className="text-[11px] tnum text-text-tertiary">
                          of {money(total)}
                        </span>
                      </span>
                    );
                  })()}
                </button>
                {!shut && (
                  <div className="tab-panel overflow-x-auto border-t border-border-light">
                    {pipeTable(sectionRows)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}
      </div>

      {!live && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Sample pipeline — switch to Real mode to add or change deals.
        </p>
      )}

      <Modal
        open={editing !== null}
        onClose={() => closeEditor()}
        title={editing?.id ? `Edit ${editing.name}` : "New opportunity"}
        size="workflow"
        tall
        /* ONE SIZE, WHATEVER IS OPEN (Anir, Aug 21: "when I press the dropdown
           it changes the dimensions of it — just have a set dimension").
           Four collapsible rooms means the dialog grew and shrank under the
           cursor on every open and close, and the buttons you were reaching
           for moved while you reached. The height is fixed and the body
           scrolls inside it, the same treatment the goal editor and the heat
           map already use. */
        dialogClassName="!h-[min(760px,calc(100vh-3rem))]"
      >
        {editing && (
          /* Fills the fixed-height dialog, so the pinned footer below lands on
             the bottom edge instead of floating halfway up with dead white
             under it when only one room is open. */
          <div className="flex min-h-full flex-col gap-3.5 pb-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Opportunity name" hint="What this deal is called internally.">
                <input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="e.g. GRI platform. Novartis"
                  className={inputCls}
                />
              </Field>
              <Field label="Customer" hint="The account. Pick one of ours, or type a name that is not on the list yet.">
                {/* The browser-native datalist looked nothing like the app
                    (Anir, Aug 17: "shitty dropdown fix it so its our
                    standards") — same ColorSelect as everywhere, logos and
                    all, with the offering rows' free-text escape hatch. */}
                {(() => {
                  // Imported deals carry the account NAME but no id — resolve
                  // by name so a real account never greets its editor with
                  // "Not on the list". A FRESH form shows a neutral "Pick the
                  // account…" — the type-it row is an explicit choice, never
                  // pre-selected (Anir, Aug 17: "why does it auto select not
                  // on the list?").
                  const resolvedId =
                    editing.customerId ||
                    (customers.find(
                      (c) =>
                        c.name.trim().toLowerCase() ===
                        editing.customer.trim().toLowerCase()
                    )?.id ??
                      "");
                  const customName = !resolvedId && editing.customer.trim();
                  const selectValue = resolvedId || (customName ? "__custom" : "");
                  return editing.customerOther ? (
                    /* TYPING HAPPENS IN THE CONTROL ITSELF (Anir, Aug 17:
                       "you can't have the customer name have its own line —
                       if I select new, I'll enter it right there in the
                       dropdown"). One line: the input wears the trigger's
                       clothes; the chevron goes back to the list. */
                    <span className="relative block">
                      <Tag
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                      />
                      <input
                        autoFocus
                        value={editing.customer}
                        onChange={(e) =>
                          setEditing({ ...editing, customer: e.target.value })
                        }
                        placeholder="Type the account name…"
                        aria-label="Customer account name"
                        className={cn(inputCls, "pl-9 pr-10")}
                      />
                      <button
                        type="button"
                        title="Back to the account list"
                        aria-label="Back to the account list"
                        // KEEPS what was typed — the name rides back to the
                        // list as the selected chip. Wiping it here was the
                        // reset Anir hit on Aug 18.
                        onClick={() =>
                          setEditing({ ...editing, customerOther: false })
                        }
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                      >
                        <ChevronDown size={15} strokeWidth={2} />
                      </button>
                    </span>
                  ) : (
                    <ColorSelect
                      value={selectValue}
                      ariaLabel="Customer account"
                      collapsible={false}
                      className="w-full"
                      onChange={(val) => {
                        if (val === "__custom") return; // re-picked their own name
                        if (val === "__other") {
                          setEditing({
                            ...editing,
                            customerId: "",
                            customerOther: true,
                          });
                          return;
                        }
                        const hit = customers.find((c) => c.id === val);
                        setEditing({
                          ...editing,
                          customerId: val,
                          customer: hit ? hit.name : val ? editing.customer : "",
                          customerOther: false,
                        });
                      }}
                      options={[
                        { value: "", label: "Pick the account…", color: "#C7CDD6" },
                        // The typed name is a first-class row while it is the
                        // pick, so reopening the list never loses it.
                        ...(customName
                          ? [
                              {
                                value: "__custom",
                                label: editing.customer.trim(),
                                color: "#0071E3",
                                icon: Tag,
                              },
                            ]
                          : []),
                        {
                          value: "__other",
                          label: customName
                            ? "Type a different name"
                            : "Not on the list. Type it",
                          color: "#8E98A8",
                          icon: Tag,
                        },
                        ...customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          logoName: c.name,
                        })),
                      ]}
                    />
                  );
                })()}
              </Field>
            </div>

            {/* ONE OFFERING PER OPPORTUNITY (Suren, Aug 17 call: "don't do
                multiple offerings on an opportunity — make it one offering on
                an opportunity… it should be a very simple screen"). A second
                offering means a second opportunity. */}
            <SingleOfferingEditor
              line={editing.rows[0] ?? blankLine()}
              offerings={offerings}
              colorForOfferingId={colorForOfferingId}
              rates={rates}
              onChange={(line) => setEditing({ ...editing, rows: [line] })}
            />

            <FormRoom
              icon={Flag}
              title="Where it stands"
              hint="Status, how this revenue is counted, and who owns it."
              summary={`${editing.status || "No status"} · ${editing.owner || "Unassigned"}`}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* REVENUE TYPE IS READ, NOT PICKED (Suren, Aug 25: "instead of
                  the user selecting this… the person only says confidence
                  level. You play with the bar — the moment you put it at 99,
                  that means I'll take it as go get"). Two fields that could
                  disagree are now one that cannot, which is the whole point:
                  "people are not understanding that difference between go get
                  and high confidence and the confidence level percentage."

                  Future is deliberately NOT on the same scale. It answers WHEN
                  the money lands, not how likely it is ("I might sign today
                  but this revenue will come in a year and a half"), so a 99%
                  deal can still be future revenue. */}
              <Field label="Revenue type">
                {(() => {
                  const isFuture = editing.level === "Future";
                  const conf =
                    editing.rows[0]?.confidence === "" ||
                    editing.rows[0]?.confidence === undefined
                      ? undefined
                      : Number(editing.rows[0].confidence);
                  const derived = revenueTypeFromConfidence(conf, isFuture);
                  /* A DROPDOWN, NOT A TICK BOX (Anir, Aug 28: "this is
                     weird — they should make the revenue type a drop down.
                     Why is it a checkbox?"). It was a read-only pill with a
                     checkbox underneath, so the one field had two controls
                     and neither looked like the others on the row.

                     There are exactly TWO things a person can choose here,
                     so the menu offers exactly two. Pipeline, High
                     confidence and Go get are not choices — the confidence
                     bar decides which one applies (Suren, Aug 18: "you play
                     with the bar, the moment you put it at 99 that means
                     I'll take it as go get") — so they appear as ONE row
                     wearing whichever the bar currently says. Future is the
                     real decision: it answers WHEN the money lands, not how
                     likely it is, which is why a 99% deal can still be
                     future revenue. */
                  const barLevel = revenueTypeFromConfidence(conf, false);
                  const BarIcon = LEVEL_ICON[barLevel];
                  return (
                    <div className="mt-1 space-y-1.5">
                      <span data-derived-revenue-type={derived} className="block">
                        <ColorSelect
                          value={isFuture ? "Future" : "bar"}
                          ariaLabel="Revenue type"
                          collapsible={false}
                          className="w-full"
                          minWidth={0}
                          dense
                          onChange={(v) =>
                            setEditing({
                              ...editing,
                              level: v === "Future" ? "Future" : barLevel,
                            })
                          }
                          options={[
                            {
                              value: "bar",
                              label: barLevel,
                              color: LEVEL_COLOR[barLevel],
                              ...(BarIcon ? { icon: BarIcon } : {}),
                            },
                            {
                              value: "Future",
                              label: "Future",
                              color: LEVEL_COLOR.Future,
                              ...(LEVEL_ICON.Future ? { icon: LEVEL_ICON.Future } : {}),
                            },
                          ]}
                        />
                      </span>
                      <p className="text-[11px] leading-snug text-text-tertiary">
                        {isFuture
                          ? "Revenue lands in a later financial year."
                          : `Follows the confidence bar. ${revenueTypeRule(derived)}.`}
                      </p>
                    </div>
                  );
                })()}
              </Field>
              <Field label="Status">
                <ColorSelect
                  value={editing.status}
                  ariaLabel="Opportunity status"
                  collapsible={false}
                  className="w-full"
                  minWidth={110}
                  dense
                  /* Eight options sits under the automatic ten-option bar, but
                     this is a list people know the answer to before they open
                     it (Anir, Aug 21: "for the status, you definitely want to
                     search for that there as well, with the press Enter to
                     select that"). Typing "wo" + Enter beats reading eight
                     rows. */
                  searchable
                  onChange={(v) => setEditing({ ...editing, status: v })}
                  options={[
                    { value: "", label: "Not set", color: "#8E98A8" },
                    ...OPPORTUNITY_STATUSES.map((st) => ({
                      value: st,
                      label: st,
                      color: STATUS_COLOR[st],
                      icon: STATUS_ICON[st],
                    })),
                  ]}
                />
              </Field>
              <Field label="Owner">
                {/* A dropdown like everything else (Anir, Aug 17) — the
                    roster with faces, plus whatever name an imported deal
                    already carries so editing never loses it. */}
                <ColorSelect
                  value={editing.owner}
                  ariaLabel="Deal owner"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => setEditing({ ...editing, owner: v })}
                  options={[
                    { value: "", label: "Unassigned", color: "#8E98A8" },
                    /* You first, wearing the blue tag — not alphabetised into
                       the middle of the roster (Anir, Aug 22: "have it always
                       be the first option... clearly label with a blue tag"). */
                    ...[...new Set([
                      ...people,
                      ...(editing.owner ? [editing.owner] : []),
                    ])]
                      .sort(
                        (a, b) =>
                          Number(b === meName) - Number(a === meName) ||
                          a.localeCompare(b)
                      )
                      .map((n) => ({
                        value: n,
                        label: n,
                        tag: n === meName ? "You" : undefined,
                        avatarName: n,
                      })),
                  ]}
                />
              </Field>
              <Field
                label="Opportunity id"
                hint="Created by the system the moment the deal is saved, so it is never typed by hand. Deals imported from Freyr's CRM keep the reference they arrived with."
              >
                {/* Nobody types this anymore — it is assigned, not entered. */}
                {editing.externalId ? (
                  <p className={cn(inputCls, "flex items-center bg-surface/60 text-text-secondary tnum select-all")}>
                    {editing.externalId}
                  </p>
                ) : (
                  <p className={cn(inputCls, "flex items-center gap-1.5 bg-surface/60 tnum")}>
                    <span className="font-semibold text-text-secondary">{nextOppId}</span>
                    <span className="text-[11px] text-text-tertiary">on save</span>
                  </p>
                )}
              </Field>
              </div>
            </FormRoom>


            {/* THE GOAL TABLE (Suren, Aug 18 call: "let them assign that goal,
                let them assign the value for the goal, and then they may say
                met. The moment they say met, you take this value and add it
                against [the goal], and also put the person name. Let it be
                manual right now."). Rows come from the Goal Master; nothing
                touches performance until Met is on and the form is saved. */}
            <FormRoom
              icon={TargetIcon}
              title="Goals this deal feeds"
              hint="Nothing counts on performance until a row is marked met and saved."
              summary={
                editing.goalRows.length
                  ? `${editing.goalRows.length} goal${editing.goalRows.length === 1 ? "" : "s"}`
                  : "None yet"
              }
            >
              <div className="space-y-2">
                {editing.goalRows.map((r, i) => (
                  <div
                    key={r.key}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-surface/50 p-2"
                  >
                    <ColorSelect
                      value={r.goalId}
                      ariaLabel={`Goal ${i + 1}`}
                      collapsible={false}
                      dense
                      minWidth={200}
                      className="min-w-[200px] flex-1"
                      onChange={(v) =>
                        setEditing({
                          ...editing,
                          goalRows: editing.goalRows.map((x) =>
                            x.key === r.key ? { ...x, goalId: v } : x
                          ),
                        })
                      }
                      /* GROUPED BY GOAL TYPE (Anir, Aug 28: "I would like
                         the categories here, please — I think you do this
                         somewhere else, like on the offering"). Sorted so
                         each family's rows are contiguous, which is all the
                         heading needs to draw itself. */
                      options={[
                        { value: "", label: "Pick a goal…", color: "#8E98A8" },
                        ...[...goals]
                          .sort(
                            (a, b) =>
                              (a.type ?? "").localeCompare(b.type ?? "") ||
                              a.name.localeCompare(b.name)
                          )
                          .map((g) => ({
                            value: g.id,
                            label: `${g.name} · ${g.year}`,
                            section: g.type || "Other goals",
                            color: typeMeta(g.type ?? "").color,
                            icon: typeMeta(g.type ?? "").icon,
                          })),
                      ]}
                    />
                    <ColorSelect
                      value={r.person}
                      ariaLabel={`Goal ${i + 1} person`}
                      collapsible={false}
                      dense
                      minWidth={150}
                      onChange={(v) =>
                        setEditing({
                          ...editing,
                          goalRows: editing.goalRows.map((x) =>
                            x.key === r.key ? { ...x, person: v } : x
                          ),
                        })
                      }
                      options={[
                        { value: "", label: "Deal owner", color: "#8E98A8" },
                        ...[...new Set([...people, ...(r.person ? [r.person] : [])])]
                          .sort(
                            (a, b) =>
                              Number(b === meName) - Number(a === meName) ||
                              a.localeCompare(b)
                          )
                          .map((n) => ({
                            value: n,
                            label: n,
                            tag: n === meName ? "You" : undefined,
                            avatarName: n,
                          })),
                      ]}
                    />
                    <input
                      value={r.value}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          goalRows: editing.goalRows.map((x) =>
                            x.key === r.key
                              ? { ...x, value: withCommas(e.target.value) }
                              : x
                          ),
                        })
                      }
                      inputMode="numeric"
                      placeholder="Value"
                      aria-label={`Goal ${i + 1} value`}
                      className={cn(inputCls, "!w-[104px] tnum")}
                    />
                    {/* GREEN IS EARNED HERE: met is a real state, not identity. */}
                    <button
                      type="button"
                      aria-pressed={r.met}
                      aria-label={`Goal ${i + 1} met`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          goalRows: editing.goalRows.map((x) =>
                            x.key === r.key ? { ...x, met: !x.met } : x
                          ),
                        })
                      }
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                        r.met
                          ? "border-transparent bg-[color:#16A34A] text-white"
                          : "border-border-light bg-white text-text-secondary hover:border-[color:#16A34A]/50 hover:text-[color:#16A34A]"
                      )}
                    >
                      <CheckCircle2 size={12.5} strokeWidth={2.6} />
                      {r.met ? "Met" : "Mark met"}
                    </button>
                    <button
                      type="button"
                      title="Remove this goal row"
                      aria-label={`Remove goal ${i + 1}`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          goalRows: editing.goalRows.filter((x) => x.key !== r.key),
                        })
                      }
                      className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[color:#DC2626]/10"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                {editing.goalRows.length === 0 && (
                  /* The room's header already carries the met-and-saved rule;
                     repeating it here was two sentences for one fact. */
                  <p className="text-[12px] text-text-tertiary">
                    Nothing attached yet.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      goalRows: [...editing.goalRows, blankGoalRow()],
                    })
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <Plus size={11} strokeWidth={2.6} /> Add goal
                </button>
              </div>
            </FormRoom>

            {/* ACTIVITIES, NOT A COMMENT BOX (Suren, Aug 18: "instead of next
                steps and pending actions… ask them to add as many activities
                as possible — whatever activity name, start date, end date,
                and status. We don't need a fixed list."). */}
            <FormRoom
              icon={ListChecksIcon}
              title="Activities"
              hint="What's actually happening on this deal: a demo, a pilot, a bid defence."
              summary={
                editing.activities.length
                  ? `${editing.activities.length} logged`
                  : "None yet"
              }
            >
              <div className="space-y-2">
                {editing.activities.map((a, i) => (
                  <div
                    key={a.key}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-surface/50 p-2"
                  >
                    <input
                      value={a.name}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          activities: editing.activities.map((x) =>
                            x.key === a.key ? { ...x, name: e.target.value } : x
                          ),
                        })
                      }
                      placeholder="e.g. Customer demo"
                      aria-label={`Activity ${i + 1} name`}
                      className={cn(inputCls, "!w-auto min-w-[150px] flex-1")}
                    />
                    <span className="flex flex-col">
                      <input
                        type="date"
                        value={a.startDate}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            activities: editing.activities.map((x) =>
                              x.key === a.key ? { ...x, startDate: e.target.value } : x
                            ),
                          })
                        }
                        aria-label={`Activity ${i + 1} start date`}
                        title="When this activity started"
                        className={cn(inputCls, "!w-[138px] tnum")}
                      />
                      <DateEcho value={a.startDate} />
                    </span>
                    <span className="self-start pt-2.5 text-[11.5px] font-semibold text-text-tertiary">to</span>
                    <span className="flex flex-col">
                      <input
                        type="date"
                        value={a.endDate}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            activities: editing.activities.map((x) =>
                              x.key === a.key ? { ...x, endDate: e.target.value } : x
                            ),
                          })
                        }
                        aria-label={`Activity ${i + 1} end date`}
                        title="When this activity ended, or should end"
                        className={cn(inputCls, "!w-[138px] tnum")}
                      />
                      <DateEcho value={a.endDate} />
                    </span>
                    <ColorSelect
                      value={a.status}
                      ariaLabel={`Activity ${i + 1} status`}
                      collapsible={false}
                      dense
                      minWidth={140}
                      onChange={(v) =>
                        setEditing({
                          ...editing,
                          activities: editing.activities.map((x) =>
                            x.key === a.key ? { ...x, status: v } : x
                          ),
                        })
                      }
                      options={ACT_STATUS_OPTIONS}
                    />
                    <button
                      type="button"
                      title="Remove this activity"
                      aria-label={`Remove activity ${i + 1}`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          activities: editing.activities.filter((x) => x.key !== a.key),
                        })
                      }
                      className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[color:#DC2626]/10"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                {editing.activities.length === 0 && (
                  /* The room's own header already says what an activity is;
                     saying it again under it was the same sentence twice. */
                  <p className="text-[12px] text-text-tertiary">
                    Nothing logged yet. Add as many as you like.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      activities: [...editing.activities, blankActivity()],
                    })
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <Plus size={11} strokeWidth={2.6} /> Add activity
                </button>
              </div>
            </FormRoom>

            {/* PINNED, so Save never hides below the fold of a tall form
                (Anir, Aug 17: "the save changes button in the bottom right…
                doesn't even show up"). Sticky inside the modal's scroller,
                white over the content it floats above. */}
            <div className="sticky bottom-[-20px] -mx-5 -mb-5 mt-auto flex items-center justify-end gap-3 border-t border-border-light bg-white px-5 pb-5 pt-3">
              {editing.id && canEdit && live && (
                <button
                  type="button"
                  onClick={() => {
                    const full = list.find((x) => x.id === editing.id);
                    if (full) setConfirmRemove(full);
                  }}
                  className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                >
                  <Trash2 size={13} strokeWidth={2.2} /> Remove this opportunity
                </button>
              )}
              {missing.length > 0 && (
                <p className="min-w-0 flex-1 truncate text-right text-[12px] text-text-tertiary">
                  Still needed: {missing.join(", ")}.
                </p>
              )}
              <Button variant="secondary" onClick={() => closeEditor(true)}>
                Cancel
              </Button>
              <Button
                onClick={save}
                loading={busy}
                disabled={
                  missing.length > 0 ||
                  (!!editing.id &&
                    (editBaseline === null ||
                      JSON.stringify(editing) === editBaseline))
                }
              >
                {editing.id ? "Save changes" : "Add opportunity"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && void remove(confirmRemove)}
        busy={busy}
        title="Remove this opportunity?"
        body={
          <>
            <b>{confirmRemove?.name}</b> comes off the pipeline, and off any goal
            that counted it as a line item.
          </>
        }
        detail="Results already logged against it stay; they simply stop naming a deal."
        confirmLabel="Remove opportunity"
      />
    </div>
  );
}

const inputCls =
  "h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none focus:border-blue-subtle";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-text-primary">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      {children}
    </label>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        {label}
      </span>
      <span className="mt-1 block truncate text-[13px] font-medium text-text-primary">
        {children}
      </span>
    </div>
  );
}

/**
 * A SEARCHABLE PICKER, NOT A WALL OF CHIPS (Anir, Aug 16: "whateven is this
 * fix it").
 *
 * The form listed every offering and every goal as a chip — sixty-odd of them
 * — so the two fields that matter (name, customer) were pushed off the top of
 * the dialog and picking one thing meant reading all of them. Collapsed it is
 * two lines: what you have chosen, and a box to find the next one.
 */
/**
 * THE OFFERING ROWS, EDITABLE.
 *
 * Suren, Aug 16: "right now you have only one offering. If you have offering 1,
 * then one row will come, then a second row, then a third row, and a fourth
 * row… all the values together will become the total opportunity value."
 *
 * The total is shown, never typed, so it cannot disagree with the rows. Each
 * row carries its own status and confidence because that was the other half of
 * what he said: "within that opportunity, this offering has a better status and
 * confidence level, more. For each offering, you can set all these."
 *
 * An offering that is not in the catalogue is typed on its own row rather than
 * in a separate comma-separated field, so the sheet's wording keeps its money
 * and its dates instead of being dumped in a bucket at the bottom of the form.
 */
/**
 * CONFIDENCE AS A 0-100 SLIDER, colour-coded (Anir, Aug 17: "make this a
 * progress bar, like a 0 to 100 thing that's color-coded"). Drag for the
 * shape, type for the exact number — same contract as the target slider.
 * The colour says what the number means while you set it: green when it is
 * nearly won, caution in the middle, red for a long shot.
 */

/** "1000000" reads as "1,000,000" while you type (Anir, Aug 18: "if I type
 *  1000, it should automatically add the comma"). Display only — the stored
 *  value stays bare digits. */
function withCommas(digits: string): string {
  // Letters never belong in a money box (Anir, Aug 19: "why am I able to
  // write jjj?") — strip anything that is not a digit before grouping.
  // ONE decimal point survives, because it has to: the K/M/B shorthand is
  // typed a character at a time, and eating the dot turned "2.5m" into "25m"
  // — twenty-five million (found by the Aug 22 UI sweep).
  const clean = digits.replace(/[^\d.]/g, "");
  const dot = clean.indexOf(".");
  const whole = (dot === -1 ? clean : clean.slice(0, dot)).replace(/[^\d]/g, "");
  const frac = dot === -1 ? null : clean.slice(dot + 1).replace(/[^\d]/g, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === null ? grouped : `${grouped}.${frac}`;
}

/**
 * WHERE THE THUMB LANDS. Fives everywhere, plus 99.
 *
 * Anir set the fives on Aug 17 ("the bar moves smoothly but the numbers go
 * every 5 — I can still enter in 72"), and that stands. But Suren's Aug 25
 * rule turns on one number the fives skip straight over: "the moment you say
 * 95 that I will treat it as high confidence; if you say 99 it is go get. 100
 * is just one step there — 99, I'm there, so that means it's go get."
 *
 * Dragging could reach 95 and 100 and never 99, so the one gesture he
 * described could not produce the one verdict he described. Above 95 the stops
 * become 95 / 99 / 100; below it nothing changes. Typing an exact figure is
 * untouched and still accepts 72, or 97.
 */
function snapConfidence(raw: number): number {
  const n = Math.max(0, Math.min(100, raw));
  if (n <= 95) return Math.round(n / 5) * 5;
  /* 96, 97 round back to 95; 98 and 99 land on 99; 100 stays 100. */
  if (n >= 99.5) return 100;
  return n >= 97.5 ? 99 : 95;
}

function ConfidenceSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Dragging is CONTINUOUS and the stored number snaps to 5s; typing is exact
  // (Anir, Aug 17: "the bar moves smoothly but the numbers go every 5 but i
  // can still enter in 72"). `drag` holds the thumb's true position while the
  // pointer is down so the bar glides instead of chunking through 5% steps.
  const [drag, setDrag] = useState<number | null>(null);
  const n = value === "" ? null : Number(value);
  const committed =
    n === null || Number.isNaN(n) ? null : Math.max(0, Math.min(100, n));
  const pct = drag ?? committed ?? 0;
  // ONE CONTINUOUS SWEEP from red through amber to green (Anir, Aug 18:
  // "a gradual red-to-green thing, not just red, yellow, or green") — the
  // hue tracks the value degree by degree instead of snapping at bands.
  const active = !(committed === null && drag === null);
  // The middle of the sweep must actually look YELLOW (Anir, Aug 19: "there's
  // not enough yellow"): between orange and green the lightness holds at 47%
  // and saturation runs hotter, because a yellow hue at 40% lightness reads
  // as olive, not yellow.
  const hue = Math.round(pct * 1.2);
  const midField = hue > 30 && hue < 100;
  const color = active
    ? `hsl(${hue}, ${midField ? 85 : 76}%, ${midField ? 47 : Math.round(44 - pct * 0.06)}%)`
    : "#8E98A8";
  const dragging = drag !== null;
  return (
    /* STACKED, NOT SIDE-BY-SIDE (Anir, Aug 18: "it would look so much better
       if the textbox was underneath… make it look premium"): the track gets
       the whole width, and the number sits under its right end as a bare
       bold figure in the same colour — still typeable, still exact. */
    <div className="space-y-1">
      <span
        className="relative flex h-5 min-w-0 items-center"
        style={{ ["--range-color" as string]: color }}
      >
        <span className="pointer-events-none absolute inset-x-0 h-[6px] overflow-hidden rounded-full bg-[color:var(--border-light)]">
          <span
            className={cn(
              "block h-full rounded-full transition-[filter] duration-200",
              dragging && "brightness-110"
            )}
            style={{
              width: `${pct}%`,
              // A two-stop red-to-green gradient interpolates through BROWN.
              // The bright stop at the sweep's hue midpoint is what makes the
              // middle of the bar genuinely yellow.
              background: `linear-gradient(90deg, hsl(4, 76%, 48%), hsl(${Math.round(pct * 0.6)}, 88%, 50%), ${color})`,
              boxShadow: dragging ? `0 0 10px ${color}66` : undefined,
            }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => {
            const raw = Number(e.target.value);
            setDrag(raw);
            onChange(String(snapConfidence(raw)));
          }}
          onPointerUp={() => setDrag(null)}
          onBlur={() => setDrag(null)}
          aria-label="Confidence. Drag to set"
          className="freyr-range relative z-[1] h-5 w-full cursor-pointer appearance-none bg-transparent"
        />
      </span>
      {/* The figure RIDES THE DOT (Suren, Aug 18: "the number should be under
          the dot always") — anchored at the thumb's percent and clamped so it
          never slides off the ends. Translate and scale are both Tailwind
          transforms so the drag pop still composes with the centering. */}
      <div className="relative h-[26px]">
        {/* THE FIGURE IS A CHIP, NOT LOOSE DIGITS (Anir, Aug 28: "even at
            30%, it looks weird, something's wrong"). A bold number and a
            small grey % floating alone under the bar, at whatever percent
            the thumb happens to sit, read as strays: three rows, three
            different alignments. In a tinted chip carrying the bar's own
            colour it reads as the thumb's own label, which is what it is,
            and it is still typeable. */}
        <div
          className={cn(
            "absolute top-0 flex -translate-x-1/2 items-center gap-0.5 rounded-full border px-2 py-[1px] transition-transform duration-150",
            dragging && "scale-110"
          )}
          style={{
            left: `clamp(34px, ${pct}%, calc(100% - 34px))`,
            background: active ? `${color}14` : "var(--surface)",
            borderColor: active ? `${color}40` : "var(--border-light)",
          }}
        >
          <input
            value={value}
            onChange={(e) => {
              // Confidence is 0–100, full stop (Anir: "this shouldn't be
              // allowed" at 145%). Anything typed past the ends snaps to them.
              const text = e.target.value;
              const typed = Number(text);
              onChange(
                text.trim() !== "" && Number.isFinite(typed)
                  ? String(Math.max(0, Math.min(100, typed)))
                  : text
              );
            }}
            inputMode="numeric"
            placeholder="25"
            aria-label="Confidence. Type an exact figure"
            className="w-[30px] border-0 bg-transparent p-0 text-center text-[14.5px] font-bold tnum outline-none placeholder:text-text-tertiary"
            style={{ color }}
          />
          <span className="text-[10.5px] font-semibold" style={{ color: active ? color : undefined }}>
            %
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * THE FUTURE TAB — deals nobody has pitched yet, from the workbook's Future
 * Pipeline sheet. No money columns: these rows honestly have none. What they
 * do have: who, which offering, when the first pitch is planned, and the
 * quarter it targets. Editing one and flipping its level to Pipeline is the
 * promotion path.
 */
function FutureSection({
  futures,
  writable,
  mayTouch = () => true,
  offeringName,
  colorForOffering,
  onEdit,
  onRemove,
  flashId = null,
}: {
  futures: Opportunity[];
  writable: boolean;
  /** Same per-row rule as the pipeline: only rows the reader may change
   *  draw the pencil. */
  mayTouch?: (o: Opportunity) => boolean;
  offeringName: Map<string, string>;
  colorForOffering: (o: Opportunity) => string;
  onEdit: (o: Opportunity) => void;
  onRemove: (o: Opportunity) => void;
  /** The row a save just landed on — briefly lit so it never looks vanished. */
  flashId?: string | null;
}) {
  /**
   * THE SAME TOOLS AS THE PIPELINE (Anir, Aug 20: "Why would we not have
   * filters and search bars here either on the future page? Just copy
   * whatever you have on the current pipeline and do it for future as well").
   *
   * 23 rows is already more than a screen, and this tab had no way to find
   * one. Search reads the same fields the pipeline's does; the two pickers are
   * the ones that mean anything here — which account, and which quarter it is
   * aimed at. The tiles keep counting ALL futures, because they answer "what
   * is queued" and must not move when you narrow the list.
   */
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState("all");
  const [quarter, setQuarter] = useState("all");
  const customers = useMemo(
    () => [...new Set(futures.map((o) => o.customer).filter(Boolean))].sort(),
    [futures]
  );
  const quarters = useMemo(
    () => [...new Set(futures.map((o) => o.targetQuarter).filter(Boolean) as string[])].sort(),
    [futures]
  );
  const shownFutures = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return futures.filter((o) => {
      if (customer !== "all" && o.customer !== customer) return false;
      if (quarter !== "all" && o.targetQuarter !== quarter) return false;
      if (!needle) return true;
      const hay = [
        o.name,
        o.customer,
        o.owner,
        offeringName.get(o.offeringIds?.[0] ?? "") ?? "",
        ...(o.offeringLabels ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [futures, q, customer, quarter, offeringName]);

  const dated = futures.filter((o) => o.targetPitchDate);
  const nextPitch = dated
    .map((o) => o.targetPitchDate!)
    .sort()
    .find((d) => d >= new Date().toISOString().slice(0, 10));
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={Briefcase}
          label="Future deals"
          value={String(futures.length)}
          sub="not pitched yet. No money, honestly"
          color="#7C3AED"
        />
        <StatTile
          icon={Target}
          label="With a pitch date"
          value={`${dated.length} of ${futures.length}`}
          sub="the rest only name a quarter"
          color="#7C3AED"
        />
        <StatTile
          icon={TrendingUp}
          label="Next pitch"
          value={
            nextPitch
              ? new Date(`${nextPitch}T12:00:00`).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                })
              : "None"
          }
          sub={nextPitch ? "the soonest planned pitch" : "no upcoming date set"}
          color="#7C3AED"
        />
      </div>

      {futures.length > 0 && (
          <div className="mt-4">
            <PageToolbar
              query={q}
              onQuery={setQ}
              placeholder="Search future deals, accounts, offerings…"
              placeholders={[
                "Search future deals…",
                "Search accounts…",
                "Search offerings…",
              ]}
              searchAriaLabel="Search future deals"
              onClearAll={() => {
                setQ("");
                setCustomer("all");
                setQuarter("all");
              }}
              groups={[
                {
                  key: "customer",
                  label: "Customer",
                  values: customer === "all" ? [] : [customer],
                  onChange: (next) => setCustomer(next[next.length - 1] ?? "all"),
                  options: customers.map((c) => ({ value: c, label: c, logoName: c })),
                },
                {
                  key: "quarter",
                  label: "Target quarter",
                  values: quarter === "all" ? [] : [quarter],
                  onChange: (next) => setQuarter(next[next.length - 1] ?? "all"),
                  options: quarters.map((qt) => ({
                    value: qt,
                    label: qt,
                    color: "#7C3AED",
                  })),
                },
              ]}
              display={
                <span className="shrink-0 text-[12px] font-semibold text-text-tertiary tnum">
                  {shownFutures.length} of {futures.length}
                </span>
              }
            />
          </div>
        )}
      <Card className={cn("overflow-hidden p-0", futures.length === 0 && "mt-4")}>
        {futures.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Briefcase}
              title="Nothing queued for the future yet"
              description="Add a deal with the revenue type Future and it lives here until it is pitched."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="w-[26%] px-4 py-2.5">Customer</th>
                  <th className="w-[20%] px-2 py-2.5">Offering</th>
                  <th className="w-[13%] px-2 py-2.5">Target pitch</th>
                  <th className="w-[12%] px-2 py-2.5">Target quarter</th>
                  <th className="px-2 py-2.5">Activities</th>
                  {writable && <th className="w-[84px] px-2 py-2.5 pr-4 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shownFutures.length === 0 && (
                  <tr>
                    <td colSpan={writable ? 6 : 5} className="px-4 py-8 text-center text-[13px] text-text-secondary">
                      No future deal matches that. Clear the filters to see all {futures.length}.
                    </td>
                  </tr>
                )}
                {shownFutures.map((o) => {
                  const label =
                    o.offeringIds[0]
                      ? (offeringName.get(o.offeringIds[0]) ?? o.offeringLabels[0])
                      : o.offeringLabels[0];
                  return (
                    <tr
                      key={o.id}
                      data-opp-row={o.id}
                      className={cn(
                        "transition-colors hover:bg-surface/60",
                        flashId === o.id && "bg-blue-light/60"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <CompanyLogo name={o.customer} className="h-7 w-7 shrink-0 text-[9px]" />
                          <span className="truncate text-[13px] font-semibold text-text-primary">
                            {o.customer}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {label ? (
                          <OfferingChip name={label} color={colorForOffering(o)} size="xs" />
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">·</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-text-secondary tnum">
                        {o.targetPitchDate
                          ? new Date(`${o.targetPitchDate}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
                          : <span className="text-text-tertiary">not set</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {o.targetQuarter ? (
                          <span className="rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:#7C3AED]">
                            {o.targetQuarter}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">·</span>
                        )}
                      </td>
                      {/* THE COLUMN FOLLOWS THE FORM. Next steps came out of the
                          editor when activities replaced it, which left this
                          column showing a field nothing could ever fill again. */}
                      <td className="px-2 py-2.5 text-[12.5px] text-text-secondary">
                        {(o.activities ?? []).length > 0 ? (
                          <span className="flex flex-wrap items-center gap-1">
                            {(o.activities ?? []).slice(0, 2).map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary"
                              >
                                {a.activity}
                              </span>
                            ))}
                            {(o.activities ?? []).length > 2 && (
                              <span className="text-[11px] text-text-tertiary tnum">
                                +{(o.activities ?? []).length - 2}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">nothing logged yet</span>
                        )}
                      </td>
                      {writable && (
                        <td className="px-2 py-2.5 pr-4 text-left">
                          {mayTouch(o) && (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title={`Edit ${o.name}. Flip its revenue type to Pipeline when it is pitched`}
                              onClick={() => onEdit(o)}
                              className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                            >
                              <Pencil size={13} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              title={`Remove ${o.name}`}
                              onClick={() => onRemove(o)}
                              className="cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                            >
                              <Trash2 size={13} strokeWidth={2.2} />
                            </button>
                          </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * THE ONE OFFERING ON THE DEAL (Suren, Aug 17 call: "make it one offering on
 * an opportunity… a very simple screen"). Flat fields, always open — the
 * offering with its category fly-out, ARR/OTS, and the money row where the
 * amount is typed in whatever the client pays and USD is computed by the
 * admin rates.
 */
function SingleOfferingEditor({
  line,
  offerings,
  colorForOfferingId,
  rates = {},
  onChange,
}: {
  line: DraftLine;
  offerings: { id: string; name: string; type?: string }[];
  colorForOfferingId: Map<string, string>;
  rates?: CurrencyRates;
  onChange: (line: DraftLine) => void;
}) {
  const labelCls =
    "flex items-center gap-1 text-[12px] font-semibold text-text-primary";
  const set = (patch: Partial<DraftLine>) => onChange({ ...line, ...patch });
  /** The USD figure a local amount is worth, by the admin-entered rate.
   *  "" when no rate exists — never a silent 1:1 (lib/currency's rule). */
  const usdFrom = (amountText: string, cur: string): string => {
    const n = Number(amountText);
    if (!Number.isFinite(n) || n <= 0) return "";
    const c = convert(n, cur as CurrencyCode, "USD", rates);
    return c.exact ? String(Math.round(c.value)) : "";
  };
  return (
    /* ITS OWN ROOM IN THE FORM (Anir, Aug 18: "make it more clear that this
       is the offering… make it look good"): a whisper of blue behind the
       whole block and a named header, so the eye reads one bounded thing —
       the offering and its money — without anything moving. */
    /* The one room that opens with the form — it is the first thing you fill
       in and the only one that is empty on a new deal. */
    <FormRoom icon={CircleDollarSign} title="What's being sold" defaultOpen>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <div className="min-w-0">
          <label className={labelCls}>Offering</label>
          <div className="mt-1">
            <MultiPicker
              variant="dropdown"
              single
              ariaLabel="Offering on this opportunity"
              placeholder="Pick the offering…"
              emptyLabel="No offerings in the catalogue yet."
              selected={
                line.offeringId
                  ? [line.offeringId]
                  : line.offeringOther || line.offeringLabel
                    ? ["__other"]
                    : []
              }
              onToggle={(id) => {
                if (id === "__other") {
                  set({ offeringId: "", offeringOther: true });
                  return;
                }
                set({ offeringId: id, offeringLabel: "", offeringOther: false });
              }}
              topOptions={[
                {
                  id: "__other",
                  label: "Not in the catalogue. Type it",
                  color: "#8E98A8",
                  icon: Tag,
                },
              ]}
              options={offerings.map((o) => ({
                id: o.id,
                label: o.name,
                group: o.type || "Other",
                color: colorForOfferingId.get(o.id) ?? "#475569",
                icon: Sparkles,
              }))}
            />
          </div>
        </div>
        <div className="min-w-0">
          <label className={labelCls}>ARR / OTS</label>
          <div className="mt-1">
            <ColorSelect
              value={line.revenueType}
              ariaLabel="ARR or OTS"
              collapsible={false}
              minWidth={140}
              className="w-full"
              onChange={(val) => set({ revenueType: val })}
              options={[
                { value: "", label: "Not set", color: "#8E98A8" },
                ...REVENUE_TYPES.map((t) => ({
                  value: t,
                  label: t,
                  color: REVENUE_TYPE_META[t].color,
                  icon: REVENUE_TYPE_META[t].icon,
                })),
              ]}
            />
          </div>
        </div>
      </div>

      {!line.offeringId && (line.offeringOther || line.offeringLabel) && (
        <div>
          <label className={labelCls}>What it&apos;s called</label>
          <input
            value={line.offeringLabel}
            onChange={(e) => set({ offeringLabel: e.target.value })}
            placeholder="e.g. Customized solution. Standards IA"
            className={cn(inputCls, "mt-1")}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="min-w-0 sm:col-span-2">
          <label className={labelCls}>Value</label>
          {/* ONE amount, in whatever the client pays — USD is computed. */}
          <div className="mt-1 flex gap-1.5">
            <ColorSelect
              value={line.localCurrency || "USD"}
              ariaLabel="Currency"
              collapsible={false}
              dense
              minWidth={88}
              onChange={(cur) => {
                if (cur === "USD") {
                  set({ localCurrency: "", localValue: "" });
                } else {
                  set({
                    localCurrency: cur,
                    localValue: line.localValue,
                    value: usdFrom(line.localValue, cur),
                  });
                }
              }}
              options={CURRENCIES.map((c) => ({
                value: c.code,
                label: c.code,
                color: c.code === "USD" ? "#0071E3" : "#0F766E",
                short: c.symbol.trim(),
                icon: currencyGlyph(c.symbol),
              }))}
            />
            <input
              value={withCommas(
                String(line.localCurrency ? line.localValue : line.value)
              )}
              onChange={(e) => {
                /* 250K IS A NUMBER HERE TOO (Anir, Aug 22, typing in this
                   exact box: "why can't I enter 250k here"). The Log-a-result
                   amount takes K/M/B shorthand; this box silently ate the
                   letter. The moment the letter lands, it expands — typing
                   2 5 0 k paints 250,000. */
                const typed = e.target.value.replace(/\s|,/g, "");
                const short = /^([0-9]*\.?[0-9]+)([kKmMbB])$/.exec(typed);
                const text = short
                  ? String(
                      Math.round(
                        Number(short[1]) *
                          ({ k: 1e3, m: 1e6, b: 1e9 } as const)[
                            short[2].toLowerCase() as "k" | "m" | "b"
                          ]
                      )
                    )
                  : /* A lone trailing dot is a number being typed, not a
                       broken one — "2." has to survive long enough for the
                       "5m" to arrive. */
                    typed.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");
                if (line.localCurrency) {
                  set({ localValue: text, value: usdFrom(text, line.localCurrency) });
                } else {
                  set({ value: text });
                }
              }}
              inputMode="decimal"
              placeholder="e.g. 500000 or 500K"
              aria-label="Deal value"
              className={cn(inputCls, "mt-0 min-w-0 flex-1 tnum")}
            />
          </div>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <label className={labelCls}>Confidence</label>
          <div className="mt-1">
            <ConfidenceSlider
              value={line.confidence}
              onChange={(val) => set({ confidence: val })}
            />
          </div>
          {/* THE VERDICT SITS UNDER THE BAR THAT SETS IT (Suren, Aug 25: "you
              play with the bar — the moment you put it at 99, that means I'll
              take it as go get"). It also reads in "Where it stands" further
              down, but that panel is folded shut while somebody is dragging
              this, and a rule you cannot see while you use it is a rule
              nobody learns. */}
          {(() => {
            const conf =
              line.confidence === "" || line.confidence === undefined
                ? undefined
                : Number(line.confidence);
            const derived = revenueTypeFromConfidence(conf, false);
            const Icon = LEVEL_ICON[derived];
            /* ONE LINE, ALWAYS THE SAME HEIGHT (Anir, Aug 28: "when it hits
               99 or 95, it takes up two lines now, which is weird. I don't
               want it to move"). The rule used to end with "the revenue
               type follows the bar", which at Go get pushed the sentence
               past the column and wrapped, so the whole block grew a line
               and everything under it jumped. The pill moving as you drag
               teaches that rule better than the sentence did, so the tail
               is gone and the row is pinned to one line at a fixed height:
               drag from 0 to 100 and nothing below shifts by a pixel. */
            const rule =
              conf === undefined
                ? "Move the bar to set this"
                : derived === "Go get"
                  ? `${CONFIDENCE_GO_GET}% and up, paperwork is the only thing left`
                  : derived === "High confidence"
                    ? `${CONFIDENCE_HIGH}% to ${CONFIDENCE_GO_GET - 1}%`
                    : derived === "Future"
                      ? "Lands in a later financial year"
                      : `Under ${CONFIDENCE_HIGH}%`;
            return (
              <p
                data-confidence-verdict={derived}
                className="mt-1.5 flex h-[20px] items-center gap-1.5 overflow-hidden text-[11.5px] text-text-tertiary"
              >
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-bold"
                  style={{
                    background: `${LEVEL_COLOR[derived]}18`,
                    color: LEVEL_COLOR[derived],
                  }}
                >
                  {Icon && <Icon size={11} strokeWidth={2.4} />}
                  {derived}
                </span>
                <span className="min-w-0 truncate">{rule}</span>
              </p>
            );
          })()}
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Est. sign</label>
          <input
            type="date"
            value={line.estSignDate}
            onChange={(e) => set({ estSignDate: e.target.value })}
            className={cn(inputCls, "mt-1 tnum")}
          />
          <DateEcho value={line.estSignDate} />
        </div>
      </div>

      {line.localCurrency && (
        <p className="text-[11.5px] leading-snug">
          {line.value ? (
            <span className="text-text-secondary">
              ≈ <b className="text-text-primary tnum">{money(Number(line.value))}</b> at the admin rate — goals and totals count the USD figure.
            </span>
          ) : (
            <span className="font-semibold text-[color:#B45309]">
              No {line.localCurrency} rate set yet — an admin adds it on the Goals page; until then this deal has no USD value.
            </span>
          )}
        </p>
      )}
    </FormRoom>
  );
}
