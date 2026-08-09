"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, CheckCircle2, Sparkles, ExternalLink, X, Package, DollarSign, Plus, Trash2, ChevronDown, ChevronUp, Paperclip, CalendarClock, Briefcase, Wrench, KeyRound, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { OfferingActivities } from "@/components/customers/OfferingActivities";
import { Avatar } from "@/components/ui/Avatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";
import { DonutChart, type TipItem } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { VIZ } from "@/components/charts/palette";
import { formatMoney } from "@/lib/pipeline";
import { formatDate } from "@/lib/utils";
import { REVENUE_TYPES, REVENUE_TYPE_META } from "@/lib/revenue";
import {
  ACCESS_LEVEL_META,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_ICON,
  asAccessLevel,
  asJourneyStage,
  asMaterialKind,
} from "@/lib/offeringMaterials";
import type {
  CustomerOfferingEngagementVersion,
  OfferingUsage,
  OfferingRevenueLine,
  RevenueType,
} from "@/lib/types";
import { SIZE_TIER_META } from "@/components/ui/Badge";

// One colour + glyph per revenue type — the same accents the offering report's
// header chips use, so a type reads identically wherever it appears.
const REVENUE_TYPE_ACCENT: Record<RevenueType, { color: string; icon: LucideIcon }> = {
  annual: { color: "#0071E3", icon: CalendarClock },
  project: { color: "#7C3AED", icon: Briefcase },
  annual_service: { color: "#0F766E", icon: Wrench },
  license: { color: "#C2410C", icon: KeyRound },
};


// Compact CR-3 tag pills inside a material chip: journey stage + access level,
// each colour + icon (standing rule — no gray chips). Untagged materials render
// no pill at all, so legacy runtime data never shows a broken tag.
function MaterialTagPills({
  journeyStage,
  accessLevel,
}: {
  journeyStage?: string;
  accessLevel?: string;
}) {
  const stage = asJourneyStage(journeyStage);
  const level = asAccessLevel(accessLevel);
  if (!stage && !level) return null;
  return (
    <>
      {[
        stage ? JOURNEY_STAGE_META[stage] : null,
        level ? ACCESS_LEVEL_META[level] : null,
      ]
        .filter((meta): meta is NonNullable<typeof meta> => !!meta)
        .map((meta) => {
          const Icon = meta.icon;
          return (
            <span
              key={meta.label}
              title={meta.label}
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none"
              style={{ background: `${meta.color}14`, color: meta.color }}
            >
              <Icon size={9} strokeWidth={2.2} />
              {meta.short}
            </span>
          );
        })}
    </>
  );
}

// One colour per revenue type — shared by the donut and its legend so the
// "already using" revenue reads as a real chart, not a plain list (Suren:
// "I'm expecting some sort of chart… a better distinction").
const REV_COLOR: Record<RevenueType, string> = {
  annual: VIZ.blue,
  annual_service: VIZ.teal,
  project: VIZ.indigo,
  license: VIZ.amber,
};

// Short money for the donut centre / hero ($250K, $1.2M) — the itemised lines
// still show the exact figure.
function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

// Colour-code each customer segment by its family so the picker reads at a
// glance (Suren: "the colors need to be color-coded"). Bio Pharmaceutical is
// checked before Pharmaceutical since it contains that word.
export function segmentColor(type: string): string {
  const t = type.toLowerCase();
  // Family colours (match the offering page): Pharma = blue, Biologics = rose,
  // Bio Pharmaceutical = violet (Suren: "pharmaceutical blue, biologics red…").
  if (t.includes("bio pharma") || t.includes("biopharma")) return "#7C3AED"; // violet
  if (t.includes("biologic")) return "#E11D48"; // rose
  if (t.includes("pharma")) return "#0071E3"; // blue
  if (t.includes("device")) return "#C2410C"; // burnt orange (amber was illegible as chip text)
  if (t.includes("consumer")) return "#0F9E8E"; // teal
  return "#8E98A8"; // slate
}

// Size colours come from the one shared size palette (SIZE_TIER_META) rather
// than a second local set — the same "Large" was green here and violet in the
// badge, so one concept wore two colours depending on which card you looked at.
function segmentParts(type: string) {
  const [family, ...sizeParts] = type.split(/\s+-\s+/);
  const size = sizeParts.join(" - ") || "Segment";
  const key = size.toLowerCase();
  const tier = key.includes("small") ? "small" : key.includes("large") ? "large" : "mid";
  const meta = SIZE_TIER_META[tier];
  return { family, size, color: meta.color, bg: meta.bg };
}

// One offering, serialized for this tab by the server page (materials carry a
// pre-computed plain-English kind label so we don't pull lib/offerings into the
// client bundle).
export type TabOffering = {
  id: string;
  name: string;
  category: string;
  type: string;
  availability: string;
  poc: string;
  description: string;
  materials: {
    id: string;
    kind: string;
    /** Raw MaterialKind — resolves the format glyph; `kind` is its label. */
    kindKey?: string;
    label: string;
    url: string;
    journeyStage?: string;
    accessLevel?: string;
  }[];
};

// Suren's customer⇄offering link (Jul 3 dictation): classify the customer
// against the SAME customer-type master list the offerings use, then — right
// here on the customer page — show every applicable offering with its
// description and sales materials, split into what they're ALREADY using vs.
// what's left to sell. The rep never has to go to the offerings page.
// Revenue lines for one in-use offering — list, total, and an inline add form
// (no popup). Captures exactly the fields Suren dictated: revenue type, amount,
// number of licenses (for license revenue), start/end dates, and a note.
function RevenueSection({
  lines,
  onSave,
}: {
  lines: OfferingRevenueLine[];
  onSave: (lines: OfferingRevenueLine[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [rType, setRType] = useState<RevenueType>("annual");
  const [amount, setAmount] = useState("");
  const [licenses, setLicenses] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [desc, setDesc] = useState("");

  const total = lines.reduce((s, l) => s + (l.amount || 0), 0);
  // Revenue split by type — feeds the donut + its one-column legend. Each type
  // carries the actual revenue lines behind it so the donut hover shows the
  // contracts, not just the total (Suren: show the entities behind a slice).
  const byType = REVENUE_TYPES.map((t) => {
    const typeLines = lines.filter((l) => l.revenue_type === t);
    return {
      type: t,
      label: REVENUE_TYPE_META[t].short,
      color: REV_COLOR[t],
      value: typeLines.reduce((s, l) => s + (l.amount || 0), 0),
      tip: typeLines.map(
        (l): TipItem => ({
          name: l.description || REVENUE_TYPE_META[t].label,
          sub: l.num_licenses ? `${l.num_licenses} licenses` : undefined,
          value: formatMoney(l.amount),
        })
      ),
    };
  }).filter((x) => x.value > 0);
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9.]/g, "")) || 0));
  const inp =
    "rounded-md border border-border bg-white px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";

  function reset() {
    setRType("annual");
    setAmount("");
    setLicenses("");
    setStart("");
    setEnd("");
    setDesc("");
    setAdding(false);
  }

  function add() {
    const amt = num(amount);
    const lic = rType === "license" ? num(licenses) : 0;
    if (amt === 0 && lic === 0) return;
    const line: OfferingRevenueLine = {
      id: `rev-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      revenue_type: rType,
      amount: amt,
      num_licenses: rType === "license" ? lic : null,
      start_date: start || null,
      end_date: end || null,
      description: desc.trim() || null,
    };
    onSave([...lines, line]);
    reset();
  }

  return (
    // No rule under the title. A full-width divider directly below the offering
    // name read as the end of the card, so the revenue panel underneath looked
    // like a separate thing (Anir, Jul 25: "remove the line below the title, it
    // throws me off — i think its over but its not"). Spacing carries the break.
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <DollarSign size={13} strokeWidth={2} className="text-success" />
          Revenue on this offering
        </p>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <ExpandedChartModal
              title="Revenue on this offering"
              subtitle="Revenue split by commercial model."
              chart={{
                kind: "donut",
                segments: byType.map((b) => ({
                  label: b.label,
                  value: b.value,
                  color: b.color,
                  tip: b.tip,
                })),
                centerLabel: compactMoney(total),
                centerSub: "on file",
                format: "money",
              }}
              className="h-8 px-2.5 text-[11px]"
            />
          )}
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
            >
              <Plus size={13} strokeWidth={2.2} />
              Add revenue
            </button>
          )}
        </div>
      </div>

      {/* Chart, not a bare list (Suren: "expecting some sort of chart… a better
          distinction"): a donut of the revenue split with a one-column legend,
          the total called out in the centre. */}
      {/* Legend column capped tighter too: at 420px the two bars ran the full
          width of the card for a two-item split, which read as a chart in its
          own right competing with the donut. The donut gets more room so the
          centre total isn't pressed against the ring. */}
      {total > 0 && (
        // Neutral card, not a green wash. Tinting the whole panel green made the
        // revenue block read as an alert rather than a figure (Anir, Jul 26: "I
        // don't know why you're doing the green background on the revenue card.
        // It looks weird"). Colour now lives only in the donut and its legend.
        <div className="mb-2.5 grid grid-cols-[150px_minmax(0,1fr)] items-center gap-6 rounded-xl border border-border-light bg-white px-4 py-4">
          <div className="flex justify-center">
            <DonutChart
              size={132}
              thickness={13}
              segments={byType.map((b) => ({
                label: b.label,
                value: b.value,
                color: b.color,
                tip: b.tip,
              }))}
              centerLabel={compactMoney(total)}
              centerSub="on file"
              format="money"
            />
          </div>
          {/* Label, then the bar taking every spare pixel, then the money and
              share pinned to the right edge. The bar used to sit under the row
              at its own short width, which left a dead strip of white to the
              right of "$220K / $480K" (Anir, Jul 26: "there should be something
              to the right of the two lines… it's just empty white space"). */}
          <ul className="min-w-0 space-y-2.5">
            {byType.map((b) => (
              <li
                key={b.type}
                className="grid min-w-0 grid-cols-[minmax(90px,auto)_minmax(40px,1fr)_auto] items-center gap-3 text-[12.5px]"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: b.color }}
                  />
                  <span>{b.label}</span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(b.value / total) * 100}%`,
                      background: b.color,
                    }}
                  />
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold text-text-primary tnum">
                  {formatMoney(b.value)}
                  <span className="ml-1.5 font-normal text-text-tertiary">
                    {Math.round((b.value / total) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lines.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {lines.map((l) => {
            const typeColor = REV_COLOR[l.revenue_type];
            return (
              <li
                key={l.id}
                className="flex items-start justify-between gap-2 text-[12.5px] bg-surface/70 rounded-md px-2.5 py-1.5"
              >
              <span className="min-w-0">
                <span className="font-semibold text-text-primary tnum">
                  {formatMoney(l.amount)}
                </span>{" "}
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: typeColor, background: `${typeColor}14` }}
                >
                  {REVENUE_TYPE_META[l.revenue_type].short}
                </span>
                {l.revenue_type === "license" && l.num_licenses ? (
                  <span className="text-text-secondary"> · {l.num_licenses} licenses</span>
                ) : null}
                {(l.start_date || l.end_date) && (
                  <span className="text-text-tertiary tnum">
                    {" "}
                    · {formatDate(l.start_date)} → {formatDate(l.end_date)}
                  </span>
                )}
                {l.description && (
                  <span className="block text-[12px] text-text-secondary mt-0.5">
                    {l.description}
                  </span>
                )}
              </span>
              <button
                onClick={() => onSave(lines.filter((x) => x.id !== l.id))}
                aria-label="Remove revenue line"
                className="shrink-0 text-text-tertiary hover:text-error transition-colors mt-0.5"
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add revenue opens a dialog, not an inline form that shoves the card's
          own content down the page (Anir, Jul 26: "when I press Add Revenue,
          that should be a pop-up… anything that has an Add button should be a
          pop-up"). Same fields, same save handler. */}
      <Modal open={adding} onClose={reset} title="Add revenue">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Revenue type
              <ColorSelect
                ariaLabel="Revenue type"
                value={rType}
                onChange={(v) => setRType(v as RevenueType)}
                className="w-full"
                collapsible={false}
                options={REVENUE_TYPES.map((t) => ({
                  value: t,
                  label: REVENUE_TYPE_META[t].label,
                  color: REVENUE_TYPE_ACCENT[t].color,
                  icon: REVENUE_TYPE_ACCENT[t].icon,
                }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              {rType === "project" ? "Project revenue ($)" : "Revenue ($)"}
              <input
                aria-label="Revenue amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="250000"
                className={`${inp} tnum`}
              />
            </label>
          </div>
          {rType === "license" && (
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Number of licenses
              <input
                aria-label="Number of licenses"
                inputMode="numeric"
                value={licenses}
                onChange={(e) => setLicenses(e.target.value)}
                placeholder="60"
                className={`${inp} tnum`}
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Start date
              <input
                aria-label="Start date"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={inp}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              End date
              <input
                aria-label="End date"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={inp}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            Description (optional)
            <input
              aria-label="Revenue description"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. implementation project"
              className={inp}
            />
          </label>
          <div className="flex justify-end gap-2 pt-0.5">
            <button
              onClick={reset}
              className="text-[12px] font-semibold text-text-secondary hover:text-text-primary px-3 py-1.5"
            >
              Cancel
            </button>
            <Button onClick={add} className="px-3 py-1.5 text-[12px]">
              Save revenue
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function CustomerOfferingsTab({
  customerId,
  customerType,
  typeOptions,
  applicable,
  inUse,
  usage = [],
}: {
  customerId: string;
  customerType: string | null;
  typeOptions: string[];
  applicable: TabOffering[];
  inUse: TabOffering[];
  // Commercial detail per in-use offering (Suren, Jul 5).
  usage?: OfferingUsage[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [savingType, setSavingType] = useState(false);
  const [selectedType, setSelectedType] = useState(customerType || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Local copy of the revenue lines so add/remove feels instant.
  const [usageState, setUsageState] = useState<OfferingUsage[]>(usage);
  // Collapsed by default. Expanding every in-use offering on mount buried the
  // "Opportunities to pitch" list under a stack of revenue panels, so the tab
  // opened on detail nobody had asked for (Anir, Jul 25: "the individual
  // offerings should not be open by default — if i want to see i can open it").
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set<string>()
  );

  const inUseIds = useMemo(() => new Set(inUse.map((o) => o.id)), [inUse]);
  const toPitch = useMemo(
    () => applicable.filter((o) => !inUseIds.has(o.id)),
    [applicable, inUseIds]
  );

  useEffect(() => setSelectedType(customerType || ""), [customerType]);

  const segmentOptions = useMemo<ColorOption[]>(() => {
    const values = selectedType && !typeOptions.includes(selectedType)
      ? [selectedType, ...typeOptions]
      : typeOptions;
    return values.map((type) => {
      const parts = segmentParts(type);
      return {
        value: type,
        label: parts.family,
        color: segmentColor(type),
        icon: Layers,
        badge: parts.size,
        badgeColor: parts.color,
      };
    });
  }, [selectedType, typeOptions]);

  const linesForOffering = (id: string) =>
    usageState.find((u) => u.offering_id === id)?.revenue_lines || [];

  const activitiesForOffering = (id: string) =>
    usageState.find((u) => u.offering_id === id)?.engagement_versions || [];

  /** Save this offering's activity history. The heat map reads the one marked
   *  current, so this is where its cells actually come from. */
  async function saveActivities(
    offeringId: string,
    versions: CustomerOfferingEngagementVersion[]
  ) {
    const existing = usageState.find((u) => u.offering_id === offeringId);
    const next = usageState.filter((u) => u.offering_id !== offeringId);
    if (versions.length || existing?.revenue_lines?.length) {
      next.push({
        offering_id: offeringId,
        revenue_lines: existing?.revenue_lines || [],
        engagement_versions: versions,
        engagement_draft: existing?.engagement_draft ?? null,
      });
    }
    setUsageState(next);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_usage: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Activity saved.");
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the activity.", "error");
      }
    } catch {
      toast("Couldn't save the activity.", "error");
    }
  }

  // Replace the revenue lines for one offering, persist the whole map.
  async function saveLines(offeringId: string, lines: OfferingRevenueLine[]) {
    const next = usageState.filter((u) => u.offering_id !== offeringId);
    const existing = usageState.find((u) => u.offering_id === offeringId);
    if (lines.length || existing?.engagement_versions?.length) {
      next.push({
        offering_id: offeringId,
        revenue_lines: lines,
        engagement_versions: existing?.engagement_versions || [],
      });
    }
    setUsageState(next);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_usage: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Revenue saved.");
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the revenue.", "error");
      }
    } catch {
      toast("Couldn't save the revenue.", "error");
    }
  }

  async function saveType(type: string) {
    if (!type) return;
    const previous = selectedType;
    setSelectedType(type);
    setSavingType(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_type: type }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Classified as ${type}: here's everything that applies.`);
        router.refresh();
      } else {
        setSelectedType(previous);
        toast(data.error || "Couldn't save the customer type.", "error");
      }
    } catch {
      setSelectedType(previous);
      toast("Couldn't save the customer type.", "error");
    } finally {
      setSavingType(false);
    }
  }

  async function toggleInUse(id: string, nowUsing: boolean) {
    setBusyId(id);
    const currentIds = inUse.map((o) => o.id);
    const next = nowUsing
      ? [...currentIds, id]
      : currentIds.filter((x) => x !== id);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerings_in_use: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          nowUsing
            ? "Marked as already using: moved out of the pitch list."
            : "Moved back to the pitch list."
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't update.", "error");
      }
    } catch {
      toast("Couldn't update.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ------------------------------------------------------------------ cards
  const OfferingCard = ({
    o,
    using,
  }: {
    o: TabOffering;
    using: boolean;
  }) => {
    const expanded = !using || expandedIds.has(o.id);
    return (
    <Card className="p-5" data-testid={`cust-offering-${o.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <OfferingIcon name={o.name} className="w-9 h-9 rounded-lg shrink-0" />
          <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/offerings/${o.id}`}
              className="text-[15px] font-semibold text-text-primary hover:text-blue-primary"
            >
              {o.name}
            </Link>
            {o.availability && (
              <span
                className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${
                  /current|now|available/i.test(o.availability)
                    ? "text-success bg-success/10"
                    : "text-warning bg-warning/10"
                }`}
              >
                {o.availability}
              </span>
            )}
            {using && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: "rgba(34,197,94,0.14)", color: "#16A34A" }}
              >
                <CheckCircle2 size={12} strokeWidth={2.2} />
                In use
              </span>
            )}
          </div>
          {(o.category || o.type) && (
            <p className="text-[12px] text-text-tertiary mt-0.5">
              {[o.category, o.type].filter(Boolean).join(" · ")}
            </p>
          )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {using && (
            <button
              type="button"
              onClick={() => toggleExpanded(o.id)}
              aria-label={expanded ? `Collapse ${o.name}` : `Expand ${o.name}`}
              title={expanded ? "Collapse offering" : "Expand offering"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-light text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/50 hover:text-blue-primary"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          <button
            onClick={() => toggleInUse(o.id, !using)}
            disabled={busyId === o.id}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              using
                ? "border-error/30 text-error hover:bg-error/10"
                : "border-border-light text-success hover:bg-success/10"
            }`}
          >
            {using ? (
              <>
                <X size={13} strokeWidth={2.2} />
                {busyId === o.id ? "…" : "Not using anymore"}
              </>
            ) : (
              <>
                <CheckCircle2 size={13} strokeWidth={2} />
                {busyId === o.id ? "…" : "Mark as already using"}
              </>
            )}
          </button>
        </div>
      </div>

      {expanded && o.description && (
        <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line line-clamp-3 mt-2.5 pl-12">
          {o.description}
        </p>
      )}

      {/* Revenue on this offering — only for the ones they're actually using
          (Suren, Jul 5: revenue type / amount / licenses / dates / notes). */}
      {using && expanded && (
        <RevenueSection
          lines={linesForOffering(o.id)}
          onSave={(lines) => saveLines(o.id, lines)}
        />
      )}

      {/* ACTIVITIES LIVE WHERE THE OFFERING DOES (Suren, Aug 8): the customer
          gets an offering, and the activity history for that offering sits
          right under it — with one row marked current for the heat map.
          NOT behind the card's expander: in-use cards start collapsed, so
          the Add activity button was invisible until you happened to open one
          (Anir, Aug 8: "I still cannot see a button to add an activity"). */}
      {using && (
        <OfferingActivities
          versions={activitiesForOffering(o.id)}
          onSave={(versions) => void saveActivities(o.id, versions)}
        />
      )}

      {expanded && (using || o.materials.length > 0) && (
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-light">
        <div className="min-w-0 flex-1">
          {(using || o.materials.length > 0) && (
          <>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
            Sales Materials ({o.materials.length})
          </p>
          {o.materials.length === 0 ? (
            <p className="text-[12px] text-text-tertiary">
              None yet, add them on the offering and they&apos;ll show here.
            </p>
          ) : (
            /* One material per row. Two-up packed the titles, the format and
               the CR-3 pills into half a card each and read as clutter (Anir,
               Jul 26: "the sales material just looks horrible… it shouldn't be
               a row with two; it should just be one row with one"). A full-width
               row gives the title room, puts the format glyph up front, and
               parks the tags on the right edge where they line up down the list. */
            <div className="flex flex-col gap-1.5">
              {o.materials.map((m) => {
                const kind = asMaterialKind(m.kindKey);
                const Icon = kind ? MATERIAL_ICON[kind] : Paperclip;
                const tone = kind ? MATERIAL_COLOR[kind] : "#4F46E5";
                return (
                  <a
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-border-light bg-surface px-2.5 py-2 transition-colors hover:border-blue-subtle hover:bg-white"
                  >
                    {/* Format glyph in the format's own colour — a video, a deck
                        and a case study are told apart before you read a word. */}
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: tone }}
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">
                        {m.label}
                      </span>
                      <span
                        className="block text-[11px] font-medium leading-tight"
                        style={{ color: tone }}
                      >
                        {m.kind}
                      </span>
                    </span>
                    <MaterialTagPills
                      journeyStage={m.journeyStage}
                      accessLevel={m.accessLevel}
                    />
                    <ExternalLink
                      size={12}
                      strokeWidth={1.8}
                      className="shrink-0 text-text-tertiary group-hover:text-blue-primary"
                    />
                  </a>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>
      </div>
      )}
    </Card>
    );
  };

  // Compact tile for the "opportunities to pitch" grid — four to a row, every
  // card the SAME height (Suren: "rows of four… four distinct cards, all the
  // same length"). Content flexes; the action button is pinned to the bottom
  // so uneven descriptions never make the cards ragged.
  const PitchCard = ({ o }: { o: TabOffering }) => (
    <Card
      className="p-4 flex flex-col h-full"
      data-testid={`cust-offering-${o.id}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <OfferingIcon name={o.name} className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/offerings/${o.id}`}
            title={o.name}
            className="text-[14.5px] font-semibold text-text-primary leading-snug break-words hover:text-blue-primary"
          >
            {o.name}
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {o.availability && (
              <span
                className={`text-[10.5px] font-medium rounded px-1.5 py-0.5 ${
                  /current|now|available/i.test(o.availability)
                    ? "text-success bg-success/10"
                    : "text-warning bg-warning/10"
                }`}
              >
                {o.availability}
              </span>
            )}
            {(o.category || o.type) && (
              <span className="min-w-0 text-[11.5px] text-text-tertiary break-words">
                {[o.category, o.type].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {o.description && (
        <p className="text-[12.5px] text-text-secondary leading-relaxed line-clamp-3 mt-1.5">
          {o.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-light pt-3">
        <span className="text-[11px] text-text-tertiary">
          {o.materials.length} {o.materials.length === 1 ? "material" : "materials"}
        </span>
        <button
          onClick={() => toggleInUse(o.id, true)}
          disabled={busyId === o.id}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-subtle bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-primary transition-colors hover:border-blue-primary hover:bg-blue-light/50 disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={2.2} />
          {busyId === o.id ? "Adding…" : "Add to account"}
        </button>
      </div>
    </Card>
  );

  // -------------------------------------------------------- unclassified view
  if (!customerType) {
    return (
      // Centered empty-state with the customer types as one-click tiles — fills
      // the space instead of a lone dropdown in the corner (Suren: "so ugly").
      <div className="max-w-[760px] mx-auto text-center py-10 px-4">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-blue-light text-blue-primary items-center justify-center mb-4">
          <Layers size={26} strokeWidth={1.8} />
        </span>
        <h2 className="text-[20px] font-bold text-text-primary">
          What type of customer is this?
        </h2>
        <p className="text-[13.5px] text-text-secondary leading-relaxed max-w-[520px] mx-auto mt-2 mb-6">
          Pick the segment, the same master list your offerings are mapped to.
          The moment you classify it, every offering that applies shows up here
          with its description and sales materials.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-left">
          {typeOptions.map((t) => {
            const parts = segmentParts(t);
            const family = segmentColor(t);
            // Size chips use the SAME tier system as SizeBadge everywhere —
            // per-segment hues made Small/Mid/Large "look very similar"
            // (Anir). Icon + colour now identify the size at a glance.
            const sizeKey = /small/i.test(parts.size)
              ? "small"
              : /large/i.test(parts.size)
                ? "large"
                : "mid";
            const tier = SIZE_TIER_META[sizeKey];
            const TierIcon = tier.icon;
            return (
              <button
                key={t}
                aria-label={t}
                onClick={() => saveType(t)}
                disabled={savingType}
                className="flex min-h-[54px] items-center gap-2 rounded-lg border border-border-light bg-white px-3 py-3 text-[12.5px] font-medium text-text-primary hover:border-blue-primary hover:shadow-[0_2px_10px_rgba(0,113,227,0.10)] transition-all disabled:opacity-50 text-left active:scale-[0.98]"
                style={{ borderLeft: `3px solid ${family}` }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: family }}
                />
                <span className="min-w-0 flex-1 leading-tight">{parts.family}</span>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold"
                  style={{ color: tier.color, background: tier.bg }}
                >
                  <TierIcon size={10} strokeWidth={2.1} aria-hidden="true" />
                  {parts.size}
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-text-tertiary mt-6">
          <Sparkles size={13} strokeWidth={1.8} className="text-blue-primary" />
          Not sure? &ldquo;Analyze the customer&rdquo; on the Overview tab
          researches it from the web.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------- classified view
  const adoptionPct = applicable.length
    ? Math.round((inUse.length / applicable.length) * 100)
    : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-secondary">
            <span className="font-semibold text-text-primary tnum">
              {applicable.length}
            </span>{" "}
            {applicable.length === 1 ? "offering applies" : "offerings apply"} to{" "}
            <span className="font-semibold text-text-primary">
              {customerType}
            </span>
            {inUse.length > 0 && (
              <>
                {" "}
                · already using{" "}
                <span className="font-semibold text-text-primary tnum">
                  {inUse.length}
                </span>{" "}
                <span className="text-text-tertiary tnum">({adoptionPct}%)</span>
              </>
            )}
          </p>
          {/* adoption at a glance — green = using, the rest is whitespace to sell */}
          {applicable.length > 0 && (
            <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-1.5 max-w-[420px]">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${Math.max(adoptionPct, inUse.length > 0 ? 3 : 0)}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
          <span className="inline-flex items-center gap-1">
            Segment
            <InfoHint text="What kind of company this is: its industry and its size, like Biologics or mid-size. It decides which offerings apply to them, listed below. Change it if it was classified wrong." />
          </span>
          <ColorSelect
            ariaLabel="Change customer segment"
            value={selectedType}
            onChange={saveType}
            options={segmentOptions}
            minWidth={250}
            className={savingType ? "pointer-events-none opacity-60" : undefined}
          />
        </div>
      </div>

      {inUse.length > 0 && (
        <section>
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
            <CheckCircle2
              size={14}
              strokeWidth={2}
              className="text-success"
            />
            Already using
            <span className="text-text-primary tnum">({inUse.length})</span>
          </h3>
          <div className="space-y-3">
            {inUse.map((o) => (
              <OfferingCard key={o.id} o={o} using />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          <Sparkles size={14} strokeWidth={2} className="text-blue-primary" />
          Opportunities to pitch
          <span className="text-text-primary tnum">({toPitch.length})</span>
        </h3>
        {applicable.length === 0 ? (
          <EmptyState
            icon={Package}
            title={`No offerings mapped to ${customerType} yet`}
            description="Map this customer type on your offerings and everything that applies will show up here."
          />
        ) : toPitch.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            They&apos;re already using everything that applies, a good problem
            to have.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch stagger">
            {toPitch.map((o) => (
              <PitchCard key={o.id} o={o} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
