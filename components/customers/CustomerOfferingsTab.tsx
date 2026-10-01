"use client";
import { DateField } from "@/components/ui/DateField";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/currency";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MaterialPeek } from "@/components/offerings/MaterialPeek";
import { addMockModePrefix, isMockModePath } from "@/lib/modeUrl";
import { Layers, CheckCircle2, Sparkles, ExternalLink, X, Package, DollarSign, Plus, Trash2, ChevronDown, ChevronUp, Paperclip, CalendarClock, Briefcase, Wrench, KeyRound, Search, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DateEcho } from "@/components/ui/DateEcho";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { OptionalMark, RequiredMark } from "@/components/ui/RequiredMark";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { OfferingActivities } from "@/components/customers/OfferingActivities";
import {
  ActivityGoalPrompt,
  type PromptGoal,
} from "@/components/customers/ActivityGoalPrompt";
import {
  masterFor,
  statusCounts,
  type ActivityMasterState,
} from "@/lib/activityMasterShared";
import { InfoHint } from "@/components/ui/InfoHint";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";
import { UnlinkX } from "@/components/ui/UnlinkButton";
import { DonutChart, type TipItem } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { VIZ } from "@/components/charts/palette";
import { formatMoney } from "@/lib/pipeline";
import { REVENUE_TYPES, REVENUE_TYPE_META } from "@/lib/revenue";
import {
  ACCESS_LEVEL_META,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_ICON,
  asAccessLevel,
  asJourneyStage,
  asMaterialKind,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import type {
  CustomerOfferingEngagementVersion,
  OfferingUsage,
  OfferingRevenueLine,
  RevenueType,
} from "@/lib/types";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { tint } from "@/lib/tint";
import { DateText } from "@/components/ui/DateText";
import { formatDate } from "@/lib/utils";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";

// One colour + glyph per revenue type — the same accents the offering report's
// header chips use, so a type reads identically wherever it appears.
const REVENUE_TYPE_ACCENT: Record<RevenueType, { color: string; icon: LucideIcon }> = {
  annual: { color: "var(--ink-bright-blue)", icon: CalendarClock },
  project: { color: "var(--ink-violet-soft)", icon: Briefcase },
  annual_service: { color: "var(--ink-teal-deep)", icon: Wrench },
  license: { color: "var(--ink-orange)", icon: KeyRound },
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
              style={{ background: tint(meta.color, 8), color: meta.color }}
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
/* ONE SHORTHAND, EVERYWHERE. This used to be its own copy, and the copies had
   drifted into four different answers for the same figure: $2,000,000 read
   "$2M" here and "$2.0M" there, $15,500,000 rounded to "$16M" on two screens,
   and every one of them printed $999,999 as "$1000K" — the carry bug
   lib/currency fixed for itself and nobody else (Anir, Sep 4: "the same figure
   read $2K on one screen and $1.5K on another"). */
function compactMoney(n: number): string {
  return fmtMoney(n);
}

// Colour-code each customer segment by its family so the picker reads at a
// glance (Suren: "the colors need to be color-coded"). Bio Pharmaceutical is
// checked before Pharmaceutical since it contains that word.
export function segmentColor(type: string): string {
  const t = type.toLowerCase();
  // Family colours (match the offering page): Pharma = blue, Biologics = rose,
  // Bio Pharmaceutical = violet (Suren: "pharmaceutical blue, biologics red…").
  if (t.includes("bio pharma") || t.includes("biopharma")) return "var(--ink-violet-soft)"; // violet
  if (t.includes("biologic")) return "#E11D48"; // rose
  if (t.includes("pharma")) return "var(--ink-bright-blue)"; // blue
  if (t.includes("device")) return "var(--ink-orange)"; // burnt orange (amber was illegible as chip text)
  if (t.includes("consumer")) return "#0F9E8E"; // teal
  return "#8E98A8"; // slate
}

// Size colours come from the one shared size palette (SIZE_TIER_META) rather
// than a second local set — the same "Large" was green here and violet in the
// badge, so one concept wore two colours depending on which card you looked at.
function segmentParts(type: string) {
  const [family, ...sizeParts] = type.split(/\s+-\s+/);
  const storedSize = sizeParts.join(" - ") || "Size not set";
  const key = storedSize.toLowerCase();
  const tier = key.includes("small") ? "small" : key.includes("large") ? "large" : "mid";
  const meta = SIZE_TIER_META[tier];
  const size = key === "mid size" || key === "mid-size" ? "Mid" : storedSize;
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
    description?: string;
    /** Storage path means this is an uploaded file with an in-app preview. */
    docsPath?: string;
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
  customerName = "",
  offeringName = "",
}: {
  lines: OfferingRevenueLine[];
  onSave: (lines: OfferingRevenueLine[]) => void;
  /** Named in the remove confirmation, so it says exactly whose line goes. */
  customerName?: string;
  offeringName?: string;
}) {
  const [confirmLine, setConfirmLine] = useState<{ id: string; label: string } | null>(null);
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
  const allRevenueTypes = REVENUE_TYPES.map((t) => {
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
  });
  const byType = allRevenueTypes.filter((x) => x.value > 0);
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9.]/g, "")) || 0));
  /* The shared 40px box (Anir, Oct 1: "It should all be the same"). It was
     34px beside 40px dropdowns. The label above is uppercase and bold, so the
     box sets its own case, weight and spacing back to normal. */
  const inp =
    "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] font-normal normal-case tracking-normal text-text-primary outline-none transition focus:border-blue-primary focus:shadow-input-focus";

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
    <div className="mt-5 rounded-xl border border-border-light bg-surface/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary">
          <DollarSign size={13} strokeWidth={2} className="text-success" />
          Revenue
          {total > 0 && <span className="ml-1 font-semibold normal-case tracking-normal text-text-primary tnum">{formatMoney(total)} on file</span>}
        </p>
        <div className="flex items-center gap-2">
          {byType.length > 1 && (
            <ExpandedChartModal
              title="Revenue on this offering"
              subtitle="Revenue split by commercial model."
              chart={{
                kind: "donut",
                segments: allRevenueTypes.map((b) => ({
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
      {total > 0 && byType.length > 1 && (
        // Neutral card, not a green wash. Tinting the whole panel green made the
        // revenue block read as an alert rather than a figure (Anir, Jul 26: "I
        // don't know why you're doing the green background on the revenue card.
        // It looks weird"). Colour now lives only in the donut and its legend.
        <div className="mb-3 grid items-center gap-4 rounded-xl border border-border-light bg-white px-4 py-3 sm:grid-cols-[124px_minmax(0,1fr)]">
          <div className="flex justify-center">
            <DonutChart
              size={112}
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
                className="grid min-w-0 grid-cols-[minmax(80px,auto)_minmax(24px,1fr)_auto] items-center gap-2 text-[12px]"
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

      {lines.length > 0 ? (
        <ul className="space-y-1.5">
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
                  style={{ color: typeColor, background: tint(typeColor, 8) }}
                >
                  {REVENUE_TYPE_META[l.revenue_type].short}
                </span>
                {l.revenue_type === "license" && l.num_licenses ? (
                  <span className="text-text-secondary"> · {l.num_licenses} licenses</span>
                ) : null}
                {(l.start_date || l.end_date) && (
                  <span className="text-text-tertiary tnum">
                    {" "}
                    · <DateText value={l.start_date} /> → <DateText value={l.end_date} />
                  </span>
                )}
                {l.description && (
                  <span className="block text-[12px] text-text-secondary mt-0.5">
                    {l.description}
                  </span>
                )}
              </span>
              {/* House red with the red wash on hover, not a second red: the
                  negative margins keep the icon exactly where it sat. */}
              <button
                type="button"
                onClick={() => setConfirmLine({ id: l.id, label: l.description || "this line" })}
                aria-label="Remove revenue line"
                className="-mx-1 -mb-1 -mt-0.5 shrink-0 cursor-pointer rounded-md p-1 text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12.5px] text-text-secondary">No revenue recorded yet.</p>
      )}
      {/* SAY EXACTLY WHICH LINE, ON WHICH OFFERING, AT WHICH CUSTOMER (Anir,
          Oct 1: "u have to say what customer what offering so there is
          absolutely no confusion"). Two lines on one offering can share a
          note, so the amount, type and dates are what tell them apart. */}
      {(() => {
        const line = confirmLine ? lines.find((x) => x.id === confirmLine.id) : undefined;
        const offering = offeringName || "this offering";
        const owner = customerName ? `${customerName}'s ${offering}` : offering;
        const note = (line?.description || "").trim().replace(/[.\s]+$/, "");
        const typeLabel = line ? REVENUE_TYPE_META[line.revenue_type].label.toLowerCase() : "revenue";
        const money = line ? formatMoney(line.amount) : "";
        const others = line ? lines.length - 1 : 0;
        return (
          <ConfirmDialog
            open={confirmLine !== null}
            onClose={() => setConfirmLine(null)}
            onConfirm={() => {
              if (confirmLine) onSave(lines.filter((x) => x.id !== confirmLine.id));
              setConfirmLine(null);
            }}
            title={
              note
                ? `Remove the ${note} line from ${owner}?`
                : `Remove the ${money} ${typeLabel} line from ${owner}?`
            }
            body={
              line ? (
                <>
                  The <b>{money}</b> {typeLabel} line
                  {line.revenue_type === "license" && line.num_licenses
                    ? ` for ${line.num_licenses} licenses`
                    : ""}
                  {line.start_date && line.end_date ? (
                    <>
                      {" "}running <b>{formatDate(line.start_date)}</b> to{" "}
                      <b>{formatDate(line.end_date)}</b>
                    </>
                  ) : line.start_date ? (
                    <>
                      {" "}from <b>{formatDate(line.start_date)}</b>
                    </>
                  ) : line.end_date ? (
                    <>
                      {" "}until <b>{formatDate(line.end_date)}</b>
                    </>
                  ) : null}{" "}
                  comes off <b>{offering}</b>
                  {customerName ? (
                    <>
                      {" "}at <b>{customerName}</b>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                ""
              )
            }
            detail={
              line
                ? others > 0
                  ? `${customerName || "The account"} still uses ${offering}, and its other ${others} revenue ${others === 1 ? "line stays" : "lines stay"}.`
                  : `${customerName || "The account"} still uses ${offering}. This is its only revenue line, so no revenue stays on file for it.`
                : undefined
            }
            confirmLabel="Remove line"
          />
        );
      })()}

      {/* Add revenue opens a dialog, not an inline form that shoves the card's
          own content down the page (Anir, Jul 26: "when I press Add Revenue,
          that should be a pop-up… anything that has an Add button should be a
          pop-up"). Same fields, same save handler. */}
      <Modal open={adding} onClose={reset} title="Add revenue">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Revenue type
              <RequiredMark />
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
              {rType === "project" ? "Project revenue" : "Revenue"}
              {rType !== "license" || !licenses.trim() ? <RequiredMark /> : <OptionalMark />}
              <MoneyInput
                value={amount}
                onChange={setAmount}
                ariaLabel="Revenue amount"
                placeholder="250,000"
                className="h-10 font-medium normal-case tracking-normal"
              />
            </label>
          </div>
          {rType === "license" && (
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Number of licenses
              {!amount.trim() ? <RequiredMark /> : <OptionalMark />}
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
              <OptionalMark />
              <DateField
                ariaLabel="Start date"
                value={start}
                onChange={(e) => setStart(e)}
                className={inp}
              />
              <DateEcho value={start} className="font-normal normal-case tracking-normal" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              End date
              <OptionalMark />
              <DateField
                ariaLabel="End date"
                value={end}
                onChange={(e) => setEnd(e)}
                className={inp}
              />
              <DateEcho value={end} className="font-normal normal-case tracking-normal" />
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
            <Button onClick={add} disabled={num(amount) === 0 && (rType !== "license" || num(licenses) === 0)} className="px-3 py-1.5 text-[12px]">
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
  customerName = "",
  customerType,
  typeOptions,
  applicable,
  inUse,
  usage = [],
  canEdit = false,
}: {
  customerId: string;
  customerName?: string;
  customerType: string | null;
  typeOptions: string[];
  applicable: TabOffering[];
  inUse: TabOffering[];
  // Commercial detail per in-use offering (Suren, Jul 5).
  usage?: OfferingUsage[];
  /** May this person change this account (the PATCH route's own answer).
   *  Gates the hover X that takes an offering off without opening its card. */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [savingType, setSavingType] = useState(false);
  const [selectedType, setSelectedType] = useState(customerType || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The in-use offering waiting on "Mark as no longer in use" to be confirmed. */
  const [confirmUnuse, setConfirmUnuse] = useState<TabOffering | null>(null);
  // Local copy of the revenue lines so add/remove feels instant.
  const [usageState, setUsageState] = useState<OfferingUsage[]>(usage);
  /**
   * THE ACTIVITY → GOAL BRIDGE (Suren, Aug 17: "whatever goal is connected to
   * that particular activity, that goal automatically gets connected"). The
   * master, the goals it can point at and who is signed in, fetched once —
   * and if the fetch fails, activities save exactly as before and the prompt
   * simply never appears. A convenience, never a gate.
   */
  const [goalBridge, setGoalBridge] = useState<{
    master: ActivityMasterState;
    goals: PromptGoal[];
    meName: string;
    /** Who this person may log credit for — themself, or more with privilege. */
    people: string[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/activity-master", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.state) {
          setGoalBridge({
            master: d.state,
            goals: d.goals ?? [],
            meName: d.me?.name ?? "",
            people: Array.isArray(d.people) ? d.people : [],
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [goalPrompt, setGoalPrompt] = useState<{
    activity: string;
    dollarValue?: number;
  } | null>(null);
  // Collapsed by default. Expanding every in-use offering on mount buried the
  // "Opportunities to pitch" list under a stack of revenue panels, so the tab
  // opened on detail nobody had asked for (Anir, Jul 25: "the individual
  // offerings should not be open by default — if i want to see i can open it").
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  // SALES MATERIALS FOLD (Anir, Oct 1: "sales materials should be
  // collapsible"). Open by default, the view he likes; closing one offering's
  // list leaves the others as they are.
  const [materialsClosed, setMaterialsClosed] = useState<Set<string>>(
    () => new Set<string>()
  );
  const pathname = usePathname() || "";
  const inMock = isMockModePath(pathname);
  const [offeringQuery, setOfferingQuery] = useState("");

  const inUseIds = useMemo(() => new Set(inUse.map((o) => o.id)), [inUse]);
  const toPitch = useMemo(
    () => applicable.filter((o) => !inUseIds.has(o.id)),
    [applicable, inUseIds]
  );
  const normalizedOfferingQuery = offeringQuery.trim().toLowerCase();
  const matchesOfferingQuery = (offering: TabOffering) =>
    !normalizedOfferingQuery ||
    [
      offering.name,
      offering.category,
      offering.type,
      offering.availability,
      offering.description,
      ...offering.materials.flatMap((material) => [material.label, material.kind]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedOfferingQuery);
  const visibleInUse = inUse.filter(matchesOfferingQuery);
  const visibleToPitch = toPitch.filter(matchesOfferingQuery);

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
    versions: CustomerOfferingEngagementVersion[],
    touched?: CustomerOfferingEngagementVersion,
    prevStatus?: string | null,
    done?: string
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
        toast(done ?? "Activity saved.");
        router.refresh();
        // THE MASTER'S THRESHOLD WAS JUST CROSSED → offer to count it. Each
        // activity says which status starts counting (Suren: "a contract
        // value is completed and then you do that, but a pilot in progress
        // should count as one"), and only a FRESH crossing prompts — saving
        // an already-counting record again offers nothing twice.
        if (touched && goalBridge) {
          const entry = masterFor(goalBridge.master, touched.activity);
          if (
            entry &&
            entry.contribution !== "none" &&
            statusCounts(touched.status, entry.countsFrom) &&
            !(prevStatus && statusCounts(prevStatus, entry.countsFrom)) &&
            entry.goalIds.some((id) => goalBridge.goals.some((g) => g.id === id))
          ) {
            setGoalPrompt({
              activity: touched.activity,
              dollarValue: touched.dollar_value || undefined,
            });
          }
        }
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
        toast(`Customer type changed to ${type}.`);
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
        const takenOff = nowUsing ? null : inUse.find((o) => o.id === id)?.name;
        toast(
          nowUsing
            ? "Marked as already using: moved out of the pitch list."
            : takenOff
              ? `${takenOff} is no longer in use${customerName ? ` at ${customerName}` : ""}. It is back on the pitch list.`
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

  function toggleMaterials(id: string) {
    setMaterialsClosed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const renderOfferingCard = (o: TabOffering, using: boolean) => {
    const expanded = expandedIds.has(o.id);
    const revenueTotal = linesForOffering(o.id).reduce((sum, line) => sum + (line.amount || 0), 0);
    const activityCount = activitiesForOffering(o.id).length;
    return (
      <Card
        key={o.id}
        className="relative overflow-hidden border border-border-light bg-white p-0 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-success"
        data-testid={`cust-offering-${o.id}`}
      >
        <div className="group group/unlinkrow relative grid gap-4 px-5 py-4 transition-colors hover:bg-blue-light/40 lg:grid-cols-[minmax(0,1fr)_minmax(245px,360px)_auto] lg:items-center">
          <button
            type="button"
            onClick={() => toggleExpanded(o.id)}
            aria-expanded={expanded}
            aria-controls={`offering-detail-${o.id}`}
            aria-label={expanded ? `Collapse ${o.name}` : `Expand ${o.name}`}
            className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-primary"
          />
          <div className="pointer-events-none relative z-10 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/offerings/${o.id}`}
                className="pointer-events-auto relative z-20 text-[15px] font-semibold text-text-primary hover:text-blue-primary hover:underline"
              >
                {o.name}
              </Link>
              {o.availability && <AvailabilityPill value={o.availability} size="sm" />}
            </div>
            {(o.category || o.type) && (
              <p className="mt-1 text-[12px] text-text-tertiary">
                {[o.category, o.type].filter(Boolean).join(" · ")}
              </p>
            )}
            {o.description && !expanded && (
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
                {o.description}
              </p>
            )}
          </div>
          <div className="pointer-events-none relative z-10 grid grid-cols-3 gap-3 border-y border-border-light py-2 lg:border-y-0 lg:border-l lg:py-0 lg:pl-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Revenue</p>
              <p className="mt-1 whitespace-nowrap text-[13px] font-semibold text-text-primary tnum">{revenueTotal > 0 ? compactMoney(revenueTotal) : "—"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Activities</p>
              <p className="mt-1 text-[13px] font-semibold text-text-primary tnum">{activityCount}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Materials</p>
              <p className="mt-1 text-[13px] font-semibold text-text-primary tnum">{o.materials.length}</p>
            </div>
          </div>
          {/* Off the account from the card itself (Anir, Oct 1: "when i
              hover i should have a delete button"), without unfolding it
              to reach the button at the bottom. Same confirm as that one. */}
          <span className="pointer-events-none relative z-10 flex items-center gap-1 justify-self-end">
            {canEdit && (
              <UnlinkX
                within="row"
                label={`Mark ${o.name} as no longer in use${customerName ? ` at ${customerName}` : ""}`}
                disabled={busyId === o.id}
                onClick={() => setConfirmUnuse(o)}
                className="pointer-events-auto"
              />
            )}
            <ChevronDown size={17} strokeWidth={2.2} aria-hidden="true" className={`text-text-tertiary transition-transform duration-200 group-hover:text-blue-primary ${expanded ? "rotate-180" : ""}`} />
          </span>
        </div>

        <div id={`offering-detail-${o.id}`} className="freyr-fold" data-open={expanded} aria-hidden={!expanded} inert={!expanded}>
          <div>
          <div className="border-t border-border-light bg-white px-5 pb-5 pt-1">
            {o.description && (
              <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
                {o.description}
              </p>
            )}

            {/* Revenue on this offering — only for the ones they're actually using
                (Suren, Jul 5: revenue type / amount / licenses / dates / notes). */}
            {using && (
              <RevenueSection
                lines={linesForOffering(o.id)}
                onSave={(lines) => saveLines(o.id, lines)}
                customerName={customerName}
                offeringName={o.name}
              />
            )}

            {/* Activities remain inside their offering instead of blending into the
                next card. The header chevron and the page-level expand controls make
                the collapsed detail explicit. */}
            {using && (
              <OfferingActivities
                customerId={customerId}
                versions={activitiesForOffering(o.id)}
                onSave={(versions, touched, prevStatus, done) =>
                  void saveActivities(o.id, versions, touched, prevStatus, done)
                }
                canEdit={canEdit}
                customerName={customerName}
                offeringName={o.name}
              />
            )}

            {(using || o.materials.length > 0) && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-light pt-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleMaterials(o.id)}
                    aria-expanded={!materialsClosed.has(o.id)}
                    aria-controls={`offering-materials-${o.id}`}
                    className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <ChevronDown
                      size={13}
                      strokeWidth={2.4}
                      className={`transition-transform ${materialsClosed.has(o.id) ? "-rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                    Sales Materials ({o.materials.length})
                  </button>
                  {materialsClosed.has(o.id) ? null : o.materials.length === 0 ? (
                    <p className="text-[12px] text-text-tertiary">
                      None yet. Add them on the offering page and they show up here.
                    </p>
                  ) : (
                    /* One material per row. Two-up packed the titles, the format and
                       the CR-3 pills into half a card each and read as clutter (Anir,
                       Jul 26: "the sales material just looks horrible… it shouldn't be
                       a row with two; it should just be one row with one"). A full-width
                       row gives the title room, puts the format glyph up front, and
                       parks the tags on the right edge where they line up down the list. */
                    <div id={`offering-materials-${o.id}`} className="flex flex-col gap-1.5">
                      {o.materials.map((m) => {
                        const kind = asMaterialKind(m.kindKey);
                        /* HOVER THE NAME TO SEE IT (Anir, Oct 1: "when i hover
                           it should definitely do the popup where i dont have
                           to actually click on it to se it... look at sales
                           materials in offerings it should be like that").
                           The same card the offering page shows: an uploaded
                           file renders, a pasted link says where it goes. */
                        const peekMaterial = {
                          id: m.id,
                          kind: kind ?? "document",
                          label: m.label,
                          url: m.url,
                          docsPath: m.docsPath,
                          description: m.description,
                          // The card's Buyer stage and Access rows read these;
                          // without them it said "Not recorded" beside a row
                          // showing both pills.
                          journeyStage: asJourneyStage(m.journeyStage),
                          accessLevel: asAccessLevel(m.accessLevel),
                        } as OfferingMaterial;
                        const previewPath = `/offerings/${encodeURIComponent(o.id)}/materials/${encodeURIComponent(m.id)}`;
                        const previewUrl = m.docsPath
                          ? `${inMock ? addMockModePrefix(previewPath) : previewPath}?embed=1`
                          : null;
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
                              <MaterialPeek material={peekMaterial} previewUrl={previewUrl}>
                                <span className="block text-[12.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">
                                  {m.label}
                                </span>
                              </MaterialPeek>
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
                </div>
              </div>
            )}
            <div className="mt-5 border-t border-border-light pt-4">
              {/* House red, and it asks first like every other remove. It
                  used to take the offering off the account on one click. */}
              <button
                type="button"
                onClick={() => setConfirmUnuse(o)}
                disabled={busyId === o.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-50"
              >
                <X size={13} strokeWidth={2.2} />
                {busyId === o.id ? "Updating…" : "Mark as no longer in use"}
              </button>
            </div>
          </div>
          </div>
        </div>
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
              <AvailabilityPill value={o.availability} size="sm" />
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
          Pick the customer type. We use it to show the catalogue items that
          fit this company, alongside anything the customer already uses.
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
                aria-label={`${parts.family} - ${parts.size}`}
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
  const allVisibleOpen =
    visibleInUse.length > 0 &&
    visibleInUse.every((offering) => expandedIds.has(offering.id));
  const totalRevenueOnFile = usageState
    .filter((entry) => inUseIds.has(entry.offering_id))
    .flatMap((entry) => entry.revenue_lines || [])
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  return (
    <div className="space-y-7">
      <div className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-text-primary">Offerings at {customerName}</h2>
            <p className="mt-1 text-[13px] text-text-secondary">What this account uses, and what else fits its profile.</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-baseline gap-1.5 text-[12px] text-text-secondary"><b className="text-[18px] font-semibold text-text-primary tnum">{inUse.length}</b> in use</span>
              <span className="inline-flex items-baseline gap-1.5 text-[12px] text-text-secondary"><b className="text-[18px] font-semibold text-text-primary tnum">{compactMoney(totalRevenueOnFile)}</b> revenue on file</span>
              <span className="inline-flex items-baseline gap-1.5 text-[12px] text-text-secondary"><b className="text-[18px] font-semibold text-text-primary tnum">{toPitch.length}</b> available to add</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 text-[12px] text-text-secondary xl:items-end">
            <span className="inline-flex items-center gap-1 font-semibold">
              Customer type
              <InfoHint text="The company's industry and size. We use it to show relevant offerings from the catalogue. Change it here if the customer was classified incorrectly." />
            </span>
            <ColorSelect
              ariaLabel="Change customer type"
              value={selectedType}
              onChange={saveType}
              options={segmentOptions}
              minWidth={250}
              className={savingType ? "pointer-events-none opacity-60" : undefined}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border-light bg-surface/35 px-5 py-3 sm:flex-row sm:items-center">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-white px-3 focus-within:border-blue-primary focus-within:shadow-input-focus">
            <Search size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            <input
              value={offeringQuery}
              onChange={(event) => setOfferingQuery(event.target.value)}
              placeholder="Search offerings, categories, or materials…"
              aria-label="Search customer offerings"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setExpandedIds((current) => {
                const next = new Set(current);
                visibleInUse.forEach((offering) => {
                  if (allVisibleOpen) next.delete(offering.id);
                  else next.add(offering.id);
                });
                return next;
              })
            }
            disabled={visibleInUse.length === 0}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border-light bg-white px-3 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:cursor-default disabled:opacity-40"
          >
            {allVisibleOpen ? (
              <ChevronUp size={14} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={14} strokeWidth={2.2} />
            )}
            {allVisibleOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      {normalizedOfferingQuery &&
        visibleInUse.length === 0 &&
        visibleToPitch.length === 0 && (
          <EmptyState
            icon={Search}
            title={`No offerings match “${offeringQuery.trim()}”`}
            description="Try an offering name, category, type, or sales material."
          />
        )}

      {visibleInUse.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              <CheckCircle2 size={16} strokeWidth={2} className="text-success" />
              In use
              <span className="text-[12px] font-medium text-text-tertiary tnum">
                {visibleInUse.length}{normalizedOfferingQuery ? ` of ${inUse.length}` : ""}
              </span>
            </h3>
            <p className="hidden text-[12px] text-text-tertiary sm:block">Select an offering to review its revenue, activity, and materials.</p>
          </div>
          <div className="space-y-2.5">
            {visibleInUse.map((o) => renderOfferingCard(o, true))}
          </div>
        </section>
      )}

      {(!normalizedOfferingQuery || visibleToPitch.length > 0) &&
        (toPitch.length > 0 || applicable.length === 0) && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Sparkles size={16} strokeWidth={2} className="text-blue-primary" />
            Available to add
            <span className="text-[12px] font-medium text-text-tertiary tnum">
              {visibleToPitch.length}{normalizedOfferingQuery ? ` of ${toPitch.length}` : ""}
            </span>
          </h3>
          {applicable.length === 0 ? (
            <EmptyState
              icon={Package}
              title={`No catalogue offerings match ${customerType} yet`}
              description="Add this customer type to an offering to make it available here."
            />
          ) : visibleToPitch.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              {normalizedOfferingQuery
                ? "No available offerings match this search."
                : "This customer already uses every offering available for its customer type."}
            </p>
          ) : (
            <div className="stagger grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
              {visibleToPitch.map((o) => (
                <PitchCard key={o.id} o={o} />
              ))}
            </div>
          )}
        </section>
      )}
      {goalPrompt && goalBridge && (() => {
        const entry = masterFor(goalBridge.master, goalPrompt.activity);
        if (!entry) return null;
        return (
          <ActivityGoalPrompt
            open
            activity={goalPrompt.activity}
            master={entry}
            goals={goalBridge.goals.filter((g) => entry.goalIds.includes(g.id))}
            meName={goalBridge.meName}
            people={goalBridge.people}
            customerName={customerName}
            dollarValue={goalPrompt.dollarValue}
            onClose={() => setGoalPrompt(null)}
          />
        );
      })()}
      {/* Only the in-use mark changes. The revenue lines and activities stay
          filed against the offering, so nothing typed is thrown away. */}
      <ConfirmDialog
        open={confirmUnuse !== null}
        onClose={() => setConfirmUnuse(null)}
        onConfirm={() => {
          const offering = confirmUnuse;
          setConfirmUnuse(null);
          if (offering) void toggleInUse(offering.id, false);
        }}
        title={
          confirmUnuse
            ? `Mark ${confirmUnuse.name} as no longer in use${customerName ? ` at ${customerName}` : ""}?`
            : "Mark as no longer in use?"
        }
        body={
          <>
            <b>{confirmUnuse?.name}</b> comes off what{" "}
            <b>{customerName || "this account"}</b> uses and moves back to the
            offerings to pitch.
          </>
        }
        detail={(() => {
          if (!confirmUnuse) return undefined;
          const lineList = linesForOffering(confirmUnuse.id);
          const lineCount = lineList.length;
          const lineTotal = lineList.reduce((sum, line) => sum + (line.amount || 0), 0);
          const activityCount = activitiesForOffering(confirmUnuse.id).length;
          if (!lineCount && !activityCount) return "Nothing is deleted.";
          return `Nothing is deleted. Its ${lineCount} revenue ${lineCount === 1 ? "line" : "lines"}${
            lineCount ? ` (${formatMoney(lineTotal)})` : ""
          } and ${activityCount} logged ${activityCount === 1 ? "activity" : "activities"} stay on file.`;
        })()}
        confirmLabel="Mark as no longer in use"
      />
    </div>
  );
}
