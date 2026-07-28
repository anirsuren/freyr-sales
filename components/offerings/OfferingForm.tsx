"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  Package,
  Layers,
  ListChecks,
  List,
  AlignLeft,
  Building2,
  FolderOpen,
  CalendarClock,
  ChevronDown,
  UserRound,
  Check,
  CircleCheck,
  CircleHelp,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { CustomerType, Market, OfferingCategory } from "@/lib/offerings";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { offeringMark } from "@/components/ui/OfferingIcon";
import { parseCapabilities } from "@/components/offerings/OfferingCapabilities";
import { cn } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_ICON,
  MATERIAL_META,
  type AccessLevel,
  type JourneyStage,
  type MaterialKind,
} from "@/lib/offeringMaterials";

interface MaterialRow {
  kind: MaterialKind;
  label: string;
  url: string;
  journeyStage?: JourneyStage;
  accessLevel?: AccessLevel;
}

// CR-3 tag dropdowns for each material row — colour-coded, matching the
// AddMaterialButton popup so tagging feels the same everywhere.
const STAGE_OPTIONS: ColorOption[] = JOURNEY_STAGES.map((s) => ({
  value: s,
  label: JOURNEY_STAGE_META[s].label,
  color: JOURNEY_STAGE_META[s].color,
  icon: JOURNEY_STAGE_META[s].icon,
}));
const ACCESS_OPTIONS: ColorOption[] = ACCESS_LEVELS.map((l) => ({
  value: l,
  label: ACCESS_LEVEL_META[l].label,
  color: ACCESS_LEVEL_META[l].color,
  icon: ACCESS_LEVEL_META[l].icon,
}));
const KIND_OPTIONS: ColorOption[] = (Object.keys(MATERIAL_META) as MaterialKind[]).map(
  (k) => ({
    value: k,
    label: MATERIAL_META[k].label,
    color: MATERIAL_COLOR[k],
    icon: MATERIAL_ICON[k],
  })
);

// A material link a rep pastes as a bare domain ("example.com/deck.pdf") would
// render as a relative href and 404 on click. Give it a scheme; leave full URLs
// and root-relative paths (/internal/...) alone.
function normalizeUrl(u: string) {
  const t = u.trim();
  if (!t || /^https?:\/\//i.test(t) || t.startsWith("/")) return t;
  return `https://${t}`;
}

const FIELD =
  "h-10 w-full min-w-0 rounded-lg border border-border-light bg-white px-3 text-[13.5px] text-text-primary placeholder:text-text-tertiary transition-[border-color] hover:border-blue-subtle focus:border-blue-primary focus:outline-none";
const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

// Current availability is a pick list (Suren's change #5): currently available,
// a date (month + year), or to be decided — nothing else.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
type AvailMode = "" | "current" | "date" | "tbd";

// Same colour language the read-only AvailabilityPill uses, so the picker and
// the pill it produces are obviously the same thing.
const AVAIL_META: Record<AvailMode, { color: string; icon: LucideIcon }> = {
  "": { color: "#8A8A8E", icon: CircleHelp },
  current: { color: "#1A7A35", icon: CircleCheck },
  // Orange-700 is the app-wide "caution / upcoming" token; the yellow band is
  // banned as text or a chip accent.
  date: { color: "#C2410C", icon: Clock },
  tbd: { color: "#4338CA", icon: CircleHelp },
};

// Family accents match the offering detail page exactly (violet / rose / blue).
const FAMILY_COLOR: Record<string, string> = {
  Pharmaceutical: "#0071E3",
  Biologics: "#E11D48",
  "Bio Pharmaceutical": "#7C3AED",
};

// Markets carry a flag + their own colour here for the same reason they do on
// the offering page: a chip is never plain gray.
const MARKET_STYLE: { match: RegExp; color: string; flag: string }[] = [
  { match: /usa|united states/i, color: "#0071E3", flag: "🇺🇸" },
  { match: /europe|^eu$/i, color: "#5E5CE6", flag: "🇪🇺" },
  { match: /japan/i, color: "#C81E67", flag: "🇯🇵" },
  { match: /china/i, color: "#C0362C", flag: "🇨🇳" },
  { match: /korea/i, color: "#0F9E8E", flag: "🇰🇷" },
];
function marketStyle(name: string) {
  return (
    MARKET_STYLE.find((m) => m.match.test(name)) || {
      color: "#4F46E5",
      flag: "🌐",
    }
  );
}

function sizeMeta(size: string) {
  const s = size.toLowerCase();
  if (s.startsWith("small")) return SIZE_TIER_META.small;
  if (s.startsWith("large")) return SIZE_TIER_META.large;
  return SIZE_TIER_META.mid;
}

// Parse a stored availability string back into the picker's state. Legacy
// free-text (e.g. "V1 is available now") maps to the closest option.
function parseAvailability(val?: string): {
  mode: AvailMode;
  month: string;
  year: string;
} {
  const v = (val || "").trim();
  if (!v) return { mode: "", month: "", year: "" };
  if (/^to be decided$/i.test(v)) return { mode: "tbd", month: "", year: "" };
  const m = v.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1]))
    return { mode: "date", month: m[1], year: m[2] };
  return { mode: "current", month: "", year: "" };
}

function buildAvailability(mode: AvailMode, month: string, year: string) {
  if (mode === "current") return "Currently available";
  if (mode === "tbd") return "To be decided";
  if (mode === "date") return month && year ? `${month} ${year}` : "";
  return "";
}

// ---------------------------------------------------------------------------
// The capability list editor
// ---------------------------------------------------------------------------
// Suren: "we just have them so I can add them. Don't just fucking put it
// hard-coded as a bullet point." The stored field is still ONE string — this
// just gives it a row-per-service editor instead of a free-text box, and
// serialises straight back to the same "• one per line" shape the catalog
// already holds. A paste box stays one click away for bulk entry from a sheet.

type CapRow = { kind: "item" | "section"; text: string };

function toRows(text: string): { intro: string; rows: CapRow[] } {
  const parsed = parseCapabilities(text);
  // Plain prose has no rows to show — keep it whole as the opening line so
  // nothing a previous author wrote can be lost by opening this form.
  if (parsed.kind !== "capabilities") return { intro: parsed.text, rows: [] };
  const rows: CapRow[] = [];
  for (const group of parsed.groups) {
    if (group.title) rows.push({ kind: "section", text: group.title });
    for (const item of group.items) rows.push({ kind: "item", text: item.raw });
  }
  return { intro: parsed.intro, rows };
}

function composeDescription(intro: string, rows: CapRow[]): string {
  const blocks: string[] = [];
  if (intro.trim()) blocks.push(intro.trim());
  let block: string[] = [];
  const flush = () => {
    if (block.length) blocks.push(block.join("\n"));
    block = [];
  };
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    if (row.kind === "section") {
      flush();
      block.push(text);
    } else {
      block.push(`• ${text}`);
    }
  }
  flush();
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Shared form furniture
// ---------------------------------------------------------------------------

function FormSection({
  icon: Icon,
  title,
  hint,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border-light bg-white shadow-card">
      <header className="flex items-start gap-3 border-b border-border-light bg-surface/60 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <Icon size={15} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-text-tertiary">{hint}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

/** A native <select> wearing the app's field styling — colour + icon tile on
 *  the left, chevron on the right. Keeps real keyboard and mobile behaviour. */
function SelectField({
  ariaLabel,
  value,
  onChange,
  accent,
  icon: Icon,
  children,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 transition-[border-color] hover:border-blue-subtle focus-within:border-blue-primary",
        className
      )}
    >
      <span
        className="pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}1F`, color: accent }}
      >
        <Icon size={13} strokeWidth={2.1} />
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-[13.5px] font-medium text-text-primary outline-none"
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2}
        className="pointer-events-none absolute right-2.5 text-text-tertiary"
      />
    </div>
  );
}

/** The same shell around a free-text input, for fields that must stay typeable. */
function FieldShell({
  accent,
  icon: Icon,
  children,
}: {
  accent: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 transition-[border-color] hover:border-blue-subtle focus-within:border-blue-primary">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}1F`, color: accent }}
      >
        <Icon size={13} strokeWidth={2.1} />
      </span>
      {children}
    </div>
  );
}

const BARE_INPUT =
  "h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-text-primary placeholder:text-text-tertiary outline-none focus:shadow-none";

export function OfferingForm({
  customerTypes,
  markets,
  existingTypes = [],
  offeringCategories = [],
  offeringId,
  initial,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  existingTypes?: string[];
  offeringCategories?: OfferingCategory[];
  offeringId?: string;
  initial?: {
    offering_type?: string;
    offering_category?: string;
    offering_name?: string;
    offering_description?: string;
    current_availability?: string;
    future_availability?: string;
    poc?: string;
    customer_type_ids?: string[];
    market_ids?: string[];
    materials?: MaterialRow[];
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!offeringId;
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast("Offering deleted.");
        router.push("/offerings");
        router.refresh();
      } else {
        toast(data.error || "Couldn't delete the offering.", "error");
        setDeleting(false);
      }
    } catch {
      toast("Couldn't delete the offering.", "error");
      setDeleting(false);
    }
  }

  const nameRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  // Arriving from a pre-filled copy (?focus=name) → land the cursor in the
  // name, text selected, so renaming is a single keystroke away.
  useEffect(() => {
    if (params.get("focus") === "name") {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [params]);
  const [offeringType, setOfferingType] = useState(initial?.offering_type ?? "");
  const [offeringCategory, setOfferingCategory] = useState(
    initial?.offering_category ?? ""
  );
  const [offeringName, setOfferingName] = useState(initial?.offering_name ?? "");

  // --- capability editor state ---------------------------------------------
  const seeded = useMemo(
    () => toRows(initial?.offering_description ?? ""),
    [initial?.offering_description]
  );
  const [intro, setIntro] = useState(seeded.intro);
  const [capRows, setCapRows] = useState<CapRow[]>(seeded.rows);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState(initial?.offering_description ?? "");
  const description = pasteMode ? pasted : composeDescription(intro, capRows);
  const capCount = capRows.filter((r) => r.kind === "item" && r.text.trim()).length;

  function openPaste() {
    setPasted(composeDescription(intro, capRows));
    setPasteMode(true);
  }
  function openList() {
    const next = toRows(pasted);
    setIntro(next.intro);
    setCapRows(next.rows);
    setPasteMode(false);
  }

  const initAvail = parseAvailability(initial?.current_availability);
  const [availMode, setAvailMode] = useState<AvailMode>(initAvail.mode);
  const [availMonth, setAvailMonth] = useState(initAvail.month);
  const [availYear, setAvailYear] = useState(initAvail.year);
  const current = buildAvailability(availMode, availMonth, availYear);
  const [future, setFuture] = useState(initial?.future_availability ?? "");
  const [poc, setPoc] = useState(initial?.poc ?? "");
  const [ctIds, setCtIds] = useState<string[]>(initial?.customer_type_ids ?? []);
  const [mktIds, setMktIds] = useState<string[]>(initial?.market_ids ?? []);
  const [materials, setMaterials] = useState<MaterialRow[]>(
    // Legacy rows without CR-3 tags get the default pairing here, visibly —
    // what the dropdowns show is exactly what saving will persist.
    (initial?.materials ?? []).map((m) => ({
      ...m,
      journeyStage: m.journeyStage ?? "awareness",
      accessLevel: m.accessLevel ?? "client_facing",
    }))
  );

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // Group the customer-type chips by family for scannable selection.
  const CT_FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];
  const ctGroups = CT_FAMILY_ORDER.map((fam) => ({
    fam,
    types: customerTypes.filter((c) => c.family === fam),
  })).filter((g) => g.types.length > 0);
  const ctOther = customerTypes.filter(
    (c) => !CT_FAMILY_ORDER.includes(c.family)
  );

  const categoryAccent = (() => {
    const i = offeringCategories.findIndex((c) => c.name === offeringCategory);
    return i >= 0 ? FILTER_PALETTE[i % FILTER_PALETTE.length] : "#0071E3";
  })();
  const typeAccent = (() => {
    const i = existingTypes.indexOf(offeringType);
    return i >= 0 ? FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length] : "#0071E3";
  })();
  const availAccent = AVAIL_META[availMode].color;

  async function submit() {
    if (!offeringName.trim()) {
      toast("Give the offering a name first.", "error");
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    // A material row with only a name or only a link is a half-filled mistake —
    // it would be silently dropped on save. Flag it so the user doesn't lose it.
    const partial = materials.find(
      (m) =>
        (m.label.trim() && !m.url.trim()) || (!m.label.trim() && m.url.trim())
    );
    if (partial) {
      toast(
        partial.label.trim()
          ? `Add a link for “${partial.label.trim()}” — or remove that material.`
          : "Add a name for that material — or remove the empty link.",
        "error"
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/offerings/${offeringId}` : "/api/offerings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offering_type: offeringType,
            offering_category: offeringCategory,
            offering_name: offeringName,
            offering_description: description,
            current_availability: current,
            future_availability: future,
            poc,
            customer_type_ids: ctIds,
            market_ids: mktIds,
            materials: materials
              .filter((m) => m.label.trim() && m.url.trim())
              .map((m) => ({ ...m, url: normalizeUrl(m.url) })),
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        toast(isEdit ? "Offering updated." : "Offering saved.");
        router.push(`/offerings/${isEdit ? offeringId : data.offering.id}`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the offering.", "error");
      }
    } catch {
      toast("Couldn't save the offering.", "error");
    } finally {
      setSaving(false);
    }
  }

  const modeButton = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
      on
        ? "bg-white text-blue-primary shadow-card"
        : "text-text-secondary hover:text-text-primary"
    );

  return (
    <div className="max-w-[880px] space-y-3">
      {/* ------------------------------------------------------ the basics */}
      <FormSection
        icon={Package}
        title="The basics"
        hint="What this offering is called, where it sits in the catalog, and who owns it."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Offering type</label>
            <FieldShell accent={typeAccent} icon={Package}>
              <input
                className={BARE_INPUT}
                value={offeringType}
                onChange={(e) => setOfferingType(e.target.value)}
                placeholder="e.g. Freya Fusion (Module), Freyr Services"
                list="offering-types"
                autoComplete="off"
              />
            </FieldShell>
            {existingTypes.length > 0 && (
              <datalist id="offering-types">
                {existingTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className={LABEL}>
              Offering name <span className="text-error">*</span>
            </label>
            <input
              ref={nameRef}
              className={FIELD}
              value={offeringName}
              onChange={(e) => setOfferingName(e.target.value)}
              placeholder="e.g. Freya.Register"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Offering category</label>
            <SelectField
              ariaLabel="Offering category"
              value={offeringCategory}
              onChange={setOfferingCategory}
              accent={categoryAccent}
              icon={Layers}
            >
              <option value="">No category</option>
              {/* The offering's current category, if it's not in the master list */}
              {offeringCategory &&
                !offeringCategories.some((c) => c.name === offeringCategory) && (
                  <option value={offeringCategory}>{offeringCategory}</option>
                )}
              {offeringCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <p className="mt-1 text-[11.5px] text-text-tertiary">
              Manage the list under{" "}
              <span className="font-medium">Offering categories</span>.
            </p>
          </div>
          <div>
            <label className={LABEL}>Service delivery POC</label>
            <FieldShell accent="#0891B2" icon={UserRound}>
              <input
                className={BARE_INPUT}
                value={poc}
                onChange={(e) => setPoc(e.target.value)}
                placeholder="Who owns this offering's data — e.g. Ragav"
              />
            </FieldShell>
          </div>
        </div>
      </FormSection>

      {/* ------------------------------------------------- what's included */}
      <FormSection
        icon={ListChecks}
        title="What's included"
        hint="The services inside this offering. Each one shows up as its own card on the offering page."
        action={
          <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
            <button
              type="button"
              onClick={openList}
              className={modeButton(!pasteMode)}
            >
              <List size={12} strokeWidth={2.2} /> One by one
            </button>
            <button
              type="button"
              onClick={openPaste}
              className={modeButton(pasteMode)}
            >
              <AlignLeft size={12} strokeWidth={2.2} /> Paste a list
            </button>
          </div>
        }
      >
        {!pasteMode && (
          <div>
            <label className={LABEL}>Opening line (optional)</label>
            <textarea
              className={`${FIELD} h-auto min-h-[64px] resize-y py-2 leading-relaxed`}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="One or two sentences of context before the list."
              aria-label="Opening line"
            />
          </div>
        )}

        {pasteMode ? (
          <div>
            <label className={LABEL}>Paste the list</label>
            <textarea
              className={`${FIELD} h-auto min-h-[220px] resize-y py-2 font-mono text-[12.5px] leading-relaxed`}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"• GLP Audits of Test Facilities\n• Regulatory Toxicology (1. ADE/PDE Report Services 2. F-Value Reports)"}
              aria-label="Paste the list"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              One service per line — paste straight from a spreadsheet. Switch back
              to <span className="font-medium">One by one</span> to tidy it up row by row.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {capRows.length === 0 && (
              <p className="rounded-lg border border-dashed border-border-light px-3 py-4 text-center text-[12.5px] text-text-secondary">
                Nothing listed yet. Add the services that make up this offering —
                one per row.
              </p>
            )}
            {capRows.map((row, i) => {
              const mark = offeringMark(row.text || offeringName || "offering");
              const isSection = row.kind === "section";
              const accent = isSection ? "#0071E3" : mark.color;
              const RowIcon = isSection ? Layers : mark.icon;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={
                      isSection
                        ? { background: `${accent}1F`, color: accent }
                        : {
                            backgroundImage: `linear-gradient(135deg, ${mark.color}, ${mark.light})`,
                            color: "#fff",
                          }
                    }
                  >
                    <RowIcon size={14} strokeWidth={2} />
                  </span>
                  <input
                    className={cn(FIELD, isSection && "font-semibold")}
                    value={row.text}
                    onChange={(e) =>
                      setCapRows((l) =>
                        l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                      )
                    }
                    placeholder={
                      isSection
                        ? "Group heading — e.g. Product & Portfolio Strategy"
                        : "A service inside this offering — e.g. GLP Audits of Test Facilities"
                    }
                    aria-label={isSection ? "Group heading" : "Capability"}
                  />
                  <button
                    type="button"
                    onClick={() => setCapRows((l) => l.filter((_, j) => j !== i))}
                    aria-label={isSection ? "Remove group heading" : "Remove capability"}
                    className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-error"
                  >
                    <Trash2 size={15} strokeWidth={1.7} />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setCapRows((l) => [...l, { kind: "item", text: "" }])}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-light px-2.5 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-subtle/60"
              >
                <Plus size={14} strokeWidth={2.2} /> Add capability
              </button>
              <button
                type="button"
                onClick={() => setCapRows((l) => [...l, { kind: "section", text: "" }])}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-light bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
              >
                <Layers size={14} strokeWidth={2} /> Add a group heading
              </button>
              {capCount > 0 && (
                <span className="ml-auto rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary">
                  {capCount} {capCount === 1 ? "capability" : "capabilities"}
                </span>
              )}
            </div>
          </div>
        )}
      </FormSection>

      {/* ------------------------------------------------------- who it's for */}
      <FormSection
        icon={Building2}
        title="Who it's for"
        hint="The customer types this offering applies to — by family and company size."
      >
        {ctGroups.map(({ fam, types }) => {
          const ids = types.map((t) => t.id);
          const allOn = ids.every((id) => ctIds.includes(id));
          const famColor = FAMILY_COLOR[fam] || "#0071E3";
          return (
            <div
              key={fam}
              className="rounded-xl border border-border-light bg-surface/30 p-3"
              style={{ borderLeft: `3px solid ${famColor}` }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: famColor }}
                >
                  {fam}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCtIds((l) =>
                      allOn
                        ? l.filter((id) => !ids.includes(id))
                        : Array.from(new Set([...l, ...ids]))
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-[10.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {types.map((c) => {
                  const on = ctIds.includes(c.id);
                  const meta = sizeMeta(c.size);
                  const TierIcon = meta.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCtIds((l) => toggle(l, c.id))}
                      aria-pressed={on}
                      aria-label={c.name}
                      title={c.name}
                      style={
                        on
                          ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                          : undefined
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                        !on &&
                          "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                      )}
                    >
                      <TierIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                      {c.size}
                      {on && <Check size={12} strokeWidth={2.8} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {ctOther.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ctOther.map((c) => {
              const on = ctIds.includes(c.id);
              const meta = sizeMeta(c.size);
              const TierIcon = meta.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCtIds((l) => toggle(l, c.id))}
                  aria-pressed={on}
                  style={
                    on
                      ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    !on &&
                      "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                  )}
                >
                  <TierIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </FormSection>

      {/* ------------------------------------------------ where + when */}
      <FormSection
        icon={CalendarClock}
        title="Where it's available"
        hint="When customers can buy it, and the markets it's cleared for."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Current availability</label>
            <SelectField
              ariaLabel="Current availability"
              value={availMode}
              onChange={(v) => setAvailMode(v as AvailMode)}
              accent={availAccent}
              icon={AVAIL_META[availMode].icon}
            >
              <option value="">Not set</option>
              <option value="current">Currently available</option>
              <option value="date">Available from a date</option>
              <option value="tbd">To be decided</option>
            </SelectField>
            {availMode === "date" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SelectField
                  ariaLabel="Availability month"
                  value={availMonth}
                  onChange={setAvailMonth}
                  accent={availAccent}
                  icon={CalendarClock}
                >
                  <option value="">Month</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  ariaLabel="Availability year"
                  value={availYear}
                  onChange={setAvailYear}
                  accent={availAccent}
                  icon={CalendarClock}
                >
                  <option value="">Year</option>
                  {Array.from({ length: 8 }, (_, k) =>
                    String(new Date().getFullYear() - 1 + k)
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>Availability comments</label>
            <FieldShell accent="#4F46E5" icon={Clock}>
              <input
                className={BARE_INPUT}
                value={future}
                onChange={(e) => setFuture(e.target.value)}
                placeholder="e.g. Version 1 · pilot now · end of this year"
                aria-label="Availability comments"
              />
            </FieldShell>
          </div>
        </div>

        <div>
          <label className={LABEL}>Applicable markets</label>
          <div className="flex flex-wrap gap-2">
            {markets.map((m) => {
              const on = mktIds.includes(m.id);
              const st = marketStyle(m.name);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMktIds((l) => toggle(l, m.id))}
                  aria-pressed={on}
                  style={
                    on
                      ? {
                          background: `${st.color}14`,
                          color: st.color,
                          borderColor: st.color,
                        }
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    !on &&
                      "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                  )}
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    {st.flag}
                  </span>
                  {m.name}
                  {on && <Check size={12} strokeWidth={2.8} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </FormSection>

      {/* ---------------------------------------------------- sales materials */}
      <FormSection
        icon={FolderOpen}
        title="Sales materials"
        hint="Videos, decks, pricing, case studies — anything a rep hands a customer."
        action={
          <button
            type="button"
            onClick={() =>
              setMaterials((l) => [
                ...l,
                {
                  kind: "video",
                  label: "",
                  url: "",
                  journeyStage: "awareness",
                  accessLevel: "client_facing",
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-light px-2.5 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-subtle/60"
          >
            <Plus size={14} strokeWidth={2.2} /> Add material
          </button>
        }
      >
        {materials.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-light px-3 py-4 text-center text-[12.5px] text-text-secondary">
            Nothing attached yet. Add the materials behind this offering — videos,
            sales presentations, white papers, pricing, competition, case studies,
            and customer references.
          </p>
        )}
        {materials.map((m, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-surface/30 p-2.5"
          >
            <ColorSelect
              value={m.kind}
              options={KIND_OPTIONS}
              onChange={(v) =>
                setMaterials((l) =>
                  l.map((x, j) => (j === i ? { ...x, kind: v as MaterialKind } : x))
                )
              }
              ariaLabel="Material type"
              minWidth={196}
            />
            <input
              value={m.label}
              onChange={(e) =>
                setMaterials((l) =>
                  l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                )
              }
              placeholder="Label"
              className={cn(FIELD, "w-auto flex-1 basis-[150px]")}
            />
            <input
              value={m.url}
              onChange={(e) =>
                setMaterials((l) =>
                  l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x))
                )
              }
              placeholder="https://…"
              className={cn(FIELD, "w-auto flex-1 basis-[190px]")}
            />
            <ColorSelect
              value={m.journeyStage ?? "awareness"}
              options={STAGE_OPTIONS}
              onChange={(v) =>
                setMaterials((l) =>
                  l.map((x, j) =>
                    j === i ? { ...x, journeyStage: v as JourneyStage } : x
                  )
                )
              }
              ariaLabel="Buyer's journey stage"
              minWidth={168}
            />
            <ColorSelect
              value={m.accessLevel ?? "client_facing"}
              options={ACCESS_OPTIONS}
              onChange={(v) =>
                setMaterials((l) =>
                  l.map((x, j) =>
                    j === i ? { ...x, accessLevel: v as AccessLevel } : x
                  )
                )
              }
              ariaLabel="Access level"
              minWidth={148}
            />
            <button
              type="button"
              onClick={() => setMaterials((l) => l.filter((_, j) => j !== i))}
              aria-label="Remove material"
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-error"
            >
              <Trash2 size={15} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </FormSection>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={submit} loading={saving}>
          {isEdit ? "Save changes" : "Save offering"}
        </Button>
        <button
          type="button"
          onClick={() =>
            router.push(isEdit ? `/offerings/${offeringId}` : "/offerings")
          }
          className="text-[14px] font-semibold text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      {isEdit && (
        <div className="mt-2 border-t border-border-light pt-4">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-error hover:underline"
            >
              <Trash2 size={14} strokeWidth={1.8} /> Delete offering
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-text-secondary">
                Delete this offering? This can&apos;t be undone.
              </span>
              <Button variant="destructive" onClick={remove} loading={deleting}>
                Delete
              </Button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[13px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Keep
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
