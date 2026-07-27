"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Video,
  Presentation,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles,
  X,
  Download,
  Package,
  Users,
  Swords,
  BookOpen,
  Quote,
  Layers,
  LayoutGrid,
  Table2,
  Globe,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { formatMoney } from "@/lib/pipeline";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Store, Building, Building2 as BuildingLarge, Sparkles as SortSpark, ArrowDownAZ, Layers as SortLayers, Package as SortPackage, CheckCircle2 as SortComplete } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { EmptyState } from "@/components/ui/EmptyState";

// Distinct palette so each category / type gets its own colour dot in the
// dropdowns (Suren: "color code all the dropdowns"). Shared with the
// master-list managers so colours match everywhere.
import { FILTER_PALETTE } from "./filterPalette";
const familyColor = (fam: string): string => {
  const f = (fam || "").toLowerCase();
  if (f.includes("bio pharma") || f.includes("biopharma")) return "#7C3AED";
  if (f.includes("biologic")) return "#E11D48";
  if (f.includes("pharma")) return "#0071E3";
  return "#8E98A8";
};
import type {
  CustomerType,
  Market,
  OfferingType,
  OfferingCategory,
} from "@/lib/offerings";

// Canonical family order so the "who it's for" chips read consistently.
// Offering descriptions arrive from Suren's Excel as bullet LISTS ("• item\n•
// item"). The detail page renders them as real lines (whitespace-pre-line), but
// on a two-line card the newlines collapse and the bullet glyphs run together
// into "• RIMS Data Entry… • RIMS Data QC…" — which reads as noise (Anir, Jul
// 27: "why is it just a shit ton of text? It should never look like that").
// On cards, drop the glyphs and separate the capabilities with a middot.
function cardSummary(description: string): string {
  const lines = description
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? lines.join(" · ") : description.replace(/^\s*[•\-*]\s*/, "").trim();
}

// One metadata chip on an offering card: colour-tinted background, matching
// icon, never gray. Wraps rather than truncates — labels stay whole.
function MetaChip({
  icon: Icon,
  label,
  color,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight"
      style={{ background: `${color}14`, color }}
    >
      <Icon size={10} strokeWidth={2.2} className="shrink-0" />
      {label}
    </span>
  );
}

const FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];

// "Pharmaceutical · Biologics · Bio Pharmaceutical" for an offering that covers
// every customer type is just noise — when it applies to all of them, say so
// plainly so a rep reads "this is for everyone" at a glance (Suren's cleaner-
// cards ask).
function whoForLabel(
  famList: string[],
  coveredCount: number,
  totalCount: number
): string {
  if (totalCount > 0 && coveredCount === totalCount) return "All customer types";
  return famList.join(" · ");
}

// CSV-safe a cell (quote if it has commas/quotes/newlines).
function csv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Sort options — also valid ?sort= deep-link values, kept in sync with the
// rest of the filter bar so a sorted view can be shared/bookmarked.
const SORTS = ["default", "name", "type", "category", "mapped"];

export interface HydratedOffering {
  id: string;
  offering_type: string;
  offering_category: string;
  offering_name: string;
  offering_description: string;
  current_availability: string;
  future_availability: string;
  poc: string;
  customerTypes: CustomerType[];
  markets: Market[];
  materials: { id: string; kind: string; label: string; url: string }[];
}

const MATERIAL_ICON: Record<string, typeof Video> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
  competition: Swords,
  case_study: BookOpen,
  reference: Quote,
};

export type OfferingCommerce = {
  totalRevenue: number;
  totalLicenses: number;
  customerCount: number;
  customers: { id: string; name: string; revenue: number }[];
};

export function OfferingsBrowser({
  offerings,
  customerTypes,
  markets,
  offeringTypes,
  offeringCategories,
  commerce,
}: {
  offerings: HydratedOffering[];
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
  offeringCategories: OfferingCategory[];
  /** Per-offering revenue/usage rollup (server-computed) powering the hover
   *  mini-dashboard. */
  commerce?: Record<string, OfferingCommerce>;
}) {
  // Seed filters from the URL so chips elsewhere can deep-link into a filtered
  // view (e.g. /offerings?market=mkt-europe from a market chip on an offering).
  const params = useSearchParams();
  const initType = customerTypes.some((c) => c.id === params.get("type"))
    ? params.get("type")!
    : "";
  const initMkt = markets.some((m) => m.id === params.get("market"))
    ? params.get("market")!
    : "";
  const initOt = offeringTypes.some((t) => t.id === params.get("otype"))
    ? params.get("otype")!
    : "";
  const initCat = offeringCategories.some((c) => c.id === params.get("cat"))
    ? params.get("cat")!
    : "";
  const initStatus = ["mapped", "unmapped"].includes(params.get("status") || "")
    ? params.get("status")!
    : "";
  const initSort = SORTS.includes(params.get("sort") || "")
    ? params.get("sort")!
    : "default";
  const initView = params.get("view") === "grid" ? "grid" : "tile";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [ctId, setCtId] = useState(initType);
  const [mktId, setMktId] = useState(initMkt);
  const [otId, setOtId] = useState(initOt);
  const [catId, setCatId] = useState(initCat);
  const [status, setStatus] = useState(initStatus);
  const [sort, setSort] = useState(initSort);
  // Tile (cards) vs Grid (compact table) — Suren's live-meeting ask.
  const [view, setView] = useState<"tile" | "grid">(initView);

  // Keep filters in sync when the URL changes via in-app navigation (chips, the
  // "still to map" stat link, etc.) — useState only seeds on first mount, so
  // without this a client-side nav to ?status=unmapped wouldn't apply.
  useEffect(() => {
    const t = params.get("type");
    const m = params.get("market");
    const ot = params.get("otype");
    const cat = params.get("cat");
    const s = params.get("status") || "";
    const so = params.get("sort") || "";
    setQ(params.get("q") ?? "");
    const keep = (raw: string | null, ok: (id: string) => boolean) =>
      (raw ?? "").split(",").filter((id) => id && ok(id)).join(",");
    setCtId(keep(t, (id) => customerTypes.some((c) => c.id === id)));
    setMktId(markets.some((mm) => mm.id === m) ? m! : "");
    setOtId(keep(ot, (id) => offeringTypes.some((tt) => tt.id === id)));
    setCatId(keep(cat, (id) => offeringCategories.some((cc) => cc.id === id)));
    setStatus(["mapped", "unmapped"].includes(s) ? s : "");
    setSort(SORTS.includes(so) ? so : "default");
    setView(params.get("view") === "grid" ? "grid" : "tile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const isMapped = (o: HydratedOffering) =>
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;

  // Category → colour, keyed the SAME way as the category dropdown (palette
  // indexed by position) so a category reads the same colour on its filter chip
  // and on every card icon (Suren's chip rule: category = colour + icon).
  const categoryColorByName: Record<string, string> = {};
  offeringCategories.forEach((c, i) => {
    categoryColorByName[c.name] = FILTER_PALETTE[i % FILTER_PALETTE.length];
  });
  // Same idea for offering types, offset so a type never wears its category's
  // colour on the same card.
  const typeColorByName: Record<string, string> = {};
  offeringTypes.forEach((t, i) => {
    typeColorByName[t.name] = FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length];
  });

  // Offering type / category are strings on each offering; map the selected id
  // → its name.
  // Filter states hold comma-separated ids so URL params, deep-link chips and
  // single-value tests keep working unchanged — the UI reads/writes them as
  // arrays (change-log row 5: any combination, OR within a filter).
  const ctIds = ctId ? ctId.split(",") : [];
  const otNames = otId
    ? otId.split(",").map((id) => offeringTypes.find((t) => t.id === id)?.name ?? "")
    : [];
  const catNames = catId
    ? catId.split(",").map((id) => offeringCategories.find((c) => c.id === id)?.name ?? "")
    : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offerings.filter((o) => {
      if (ctIds.length && !o.customerTypes.some((c) => ctIds.includes(c.id))) return false;
      if (mktId && !o.markets.some((m) => m.id === mktId)) return false;
      if (otNames.length && !otNames.includes(o.offering_type)) return false;
      if (catNames.length && !catNames.includes(o.offering_category)) return false;
      if (status === "mapped" && !isMapped(o)) return false;
      if (status === "unmapped" && isMapped(o)) return false;
      // Search across what's actually on the card — name, type, category,
      // description, AND the markets / customer types it's mapped to — so typing
      // "Europe", "intelligence" or "pharmaceutical" finds matches.
      if (
        needle &&
        !`${o.offering_name} ${o.offering_type} ${o.offering_category} ${
          o.offering_description
        } ${o.markets.map((m) => m.name).join(" ")} ${o.customerTypes
          .map((c) => c.name)
          .join(" ")}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, q, ctId, mktId, otId, catId, status]);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "name")
      arr.sort((a, b) => a.offering_name.localeCompare(b.offering_name));
    else if (sort === "type")
      arr.sort(
        (a, b) =>
          a.offering_type.localeCompare(b.offering_type) ||
          a.offering_name.localeCompare(b.offering_name)
      );
    else if (sort === "category")
      arr.sort(
        (a, b) =>
          a.offering_category.localeCompare(b.offering_category) ||
          a.offering_name.localeCompare(b.offering_name)
      );
    else if (sort === "mapped")
      arr.sort(
        (a, b) =>
          Number(isMapped(b)) - Number(isMapped(a)) ||
          a.offering_name.localeCompare(b.offering_name)
      );
    else
      // "default" — keep the catalog (sheet) order, but lead with the
      // fully-detailed offerings so the page opens looking like a live catalog
      // instead of a wall of blank cards. Array sort is stable, so the original
      // catalog order is preserved within each group.
      arr.sort((a, b) => Number(isMapped(b)) - Number(isMapped(a)));
    return arr;
  }, [filtered, sort]);

  const activeFilters = !!(q || ctId || mktId || otId || catId || status);
  const clearAll = () => {
    setQ("");
    setCtId("");
    setMktId("");
    setOtId("");
    setCatId("");
    setStatus("");
  };

  // Name the export by its active filter so repeated exports (Europe, then
  // Pharma-Large) don't all land as "freyr-offerings (1).csv" in Suren's
  // Downloads. Unfiltered stays "freyr-offerings.csv".
  const exportFilename = () => {
    const slug = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const parts = ["freyr-offerings"];
    const mkt = markets.find((m) => m.id === mktId);
    const ct = customerTypes.find((c) => ctIds.includes(c.id));
    if (mkt) parts.push(slug(mkt.name));
    if (ct) parts.push(slug(ct.name));
    if (status) parts.push(status);
    if (parts.length === 1 && q.trim()) parts.push("filtered");
    return `${parts.join("-")}.csv`;
  };

  // Export the current (filtered) view to CSV — Suren built this from Excel, so
  // round-tripping back out is natural.
  function exportCsv() {
    const header = [
      "Offering Type",
      "Offering",
      "Offering Category",
      "Description",
      "Current Availability",
      "Availability Comments",
      "Service Delivery POC",
      "Customer Types",
      "Markets",
      "Sales Materials",
    ];
    const rows = sorted.map((o) =>
      [
        o.offering_type,
        o.offering_name,
        o.offering_category,
        // Fall back to the offering type's description when the offering's own
        // isn't written yet — same as the detail page — so the Excel export
        // isn't a column of blanks for the not-yet-detailed offerings.
        o.offering_description ||
          offeringTypes.find((t) => t.name === o.offering_type)?.description ||
          "",
        o.current_availability,
        o.future_availability,
        o.poc,
        o.customerTypes.map((c) => c.name).join("; "),
        o.markets.map((m) => m.name).join("; "),
        o.materials.map((m) => `${m.label} (${m.url})`).join(" | "),
      ]
        .map((x) => csv(String(x || "")))
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const renderCard = (o: HydratedOffering, i: number) => {
    const matKinds = Array.from(new Set(o.materials.map((m) => m.kind)));
    const mapped =
      o.customerTypes.length > 0 ||
      o.markets.length > 0 ||
      o.materials.length > 0;
    // Suren's change #3: customer type is the primary qualifier. Lead the card
    // with the customer-type families it's for; the offering type moves below.
    const fams = Array.from(
      new Set(o.customerTypes.map((c) => c.family as string))
    );
    const families = [
      ...FAMILY_ORDER.filter((f) => fams.includes(f)),
      ...fams.filter((f) => !FAMILY_ORDER.includes(f)),
    ];
    const hasCt = o.customerTypes.length > 0;
    const com = commerce?.[o.id];
    // The hover is the Customers-card pattern (HoverExpandCard): the card pops
    // out over its neighbours and opens a mini-dashboard — revenue, who's
    // using it, seats, materials — not just a pop-out animation (Anir: "I
    // don't care about a pop-up. I care about all the information. Look at
    // the customers page.").
    return (
      <div
        key={o.id}
        // rise-in's retained transform makes every cell its own stacking
        // context, so the pop-out would paint UNDER later siblings. Lifting
        // the hovered CELL (not just the inner card) puts the expansion above
        // every neighbour.
        className="rise-in h-full relative hover:z-30"
        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
      >
        <HoverExpandCard
          href={`/offerings/${o.id}`}
          className="h-full"
          summary={
            <div className="flex flex-col gap-3">
          {/* Offering name is the primary element (Suren's live-meeting ask —
              the customer-type families move down so they don't compete). */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <OfferingIcon name={o.offering_name} className="w-9 h-9 shrink-0" />
              <h3 className="text-[16px] font-semibold text-text-primary leading-snug tracking-[-0.01em]">
                {o.offering_name}
              </h3>
            </div>
            <ChevronRight
              size={16}
              strokeWidth={1.6}
              className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 group-focus-visible:text-blue-primary group-focus-visible:translate-x-0.5 transition-transform shrink-0"
            />
          </div>
          {o.offering_description && (
            <p className="no-auto-tip text-[12.5px] text-text-secondary line-clamp-2 leading-relaxed">
              {cardSummary(o.offering_description)}
            </p>
          )}

          {o.current_availability && (
            <div className="flex flex-wrap gap-1.5">
              {/* The clean timing status only — market-coverage / version notes
                  (future_availability) are free-form and live on the detail page. */}
              <AvailabilityPill value={o.current_availability} size="sm" />
            </div>
          )}

          <div className="mt-auto pt-3 border-t border-border-light space-y-2">
            {/* Offering category — Suren's Jun 27 grouping (replaces markets on
                the tile). The primary qualifier above the offering type. */}
            {/* Every data point is a colour + icon chip, never flat gray text
                (standing chip rule; Anir, Jul 27: "for the data points on each
                of these, definitely need tags, icons, and colors — the all
                customer types or the Freyr service thing"). Category, offering
                type and audience each carry their own hue so a card is
                scannable without reading a word. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {o.offering_category && (
                <MetaChip
                  icon={Layers}
                  label={o.offering_category}
                  color={categoryColorByName[o.offering_category] || "#2563EB"}
                />
              )}
              {o.offering_type && (
                <MetaChip
                  icon={Sparkles}
                  label={o.offering_type}
                  color={typeColorByName[o.offering_type] || "#7C3AED"}
                />
              )}
              {hasCt && (
                <MetaChip
                  icon={Users}
                  label={whoForLabel(
                    families,
                    o.customerTypes.length,
                    customerTypes.length
                  )}
                  color="#0F766E"
                />
              )}
            </div>
            {/* Service-delivery POC */}
            {o.poc && (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
                <Avatar name={o.poc} className="h-5 w-5 text-[7px]" />
                POC: {o.poc}
              </p>
            )}
            {/* Materials count + type icons */}
            {o.materials.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-text-tertiary">
                  {o.materials.length} material
                  {o.materials.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {matKinds.map((k) => {
                    const Icon = MATERIAL_ICON[k] || FileText;
                    return (
                      <Icon
                        key={k}
                        size={14}
                        strokeWidth={1.7}
                        className="text-text-tertiary"
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {/* Nothing filled in yet */}
            {!mapped && (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
                <span className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
                Awaiting details — add who it&apos;s for, its markets &amp; sales
                materials
              </p>
            )}
          </div>
            </div>
          }
          extra={
            <>
              {/* The commercial mini-dashboard — the numbers a rep would
                  otherwise open the offering to see. Every tile is icon +
                  colour, never flat gray (standing chip rule). */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Annual revenue",
                    value: formatMoney(com?.totalRevenue ?? 0),
                    icon: DollarSign,
                    color: "#16A34A",
                  },
                  {
                    label: "Customers using it",
                    value: String(com?.customerCount ?? 0),
                    icon: Building,
                    color: "#0071E3",
                  },
                  {
                    label: "Licensed seats",
                    value: String(com?.totalLicenses ?? 0),
                    icon: KeyRound,
                    color: "#7C3AED",
                  },
                  {
                    label: "Sales materials",
                    value: String(o.materials.length),
                    icon: FileText,
                    color: "#0F766E",
                  },
                ].map((f) => (
                  <div key={f.label} className="rounded-lg bg-surface px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      <f.icon size={11} strokeWidth={2.2} style={{ color: f.color }} />
                      {f.label}
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold text-text-primary tnum">
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* WHO is paying for it — the Customers-page substance. */}
              {com && com.customers.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    Who&apos;s using it
                  </p>
                  <div className="space-y-1.5">
                    {com.customers.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-[12px]">
                        <CompanyLogo name={c.name} className="w-[18px] h-[18px] text-[7px] shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                          {c.name}
                        </span>
                        <span className="tnum text-text-secondary shrink-0">
                          {formatMoney(c.revenue)}
                        </span>
                      </div>
                    ))}
                    {com.customerCount > com.customers.length && (
                      <p className="text-[10.5px] text-text-tertiary">
                        +{com.customerCount - com.customers.length} more{" "}
                        {com.customerCount - com.customers.length === 1
                          ? "account"
                          : "accounts"}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-snug text-text-tertiary">
                  No revenue recorded yet — accounts appear here as they start
                  using this offering.
                </p>
              )}

              {/* Where it sells + any availability caveat. */}
              {(o.markets.length > 0 || o.future_availability) && (
                <div className="mt-3 space-y-1.5">
                  {o.markets.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-[10.5px] text-text-tertiary">
                      <Globe size={10} strokeWidth={2} className="shrink-0" />
                      {o.markets.map((m) => m.name).join(" · ")}
                    </p>
                  )}
                  {o.future_availability && (
                    <p className="text-[10.5px] leading-snug text-text-tertiary">
                      {o.future_availability}
                    </p>
                  )}
                </div>
              )}
            </>
          }
        />
      </div>
    );
  };

  // When sorted "By type", render the cards in labelled type groups (mirrors how
  // Suren's sheet is organised). sorted is already type→name ordered.
  const typeGroups: { type: string; items: HydratedOffering[] }[] = [];
  if (sort === "type") {
    for (const o of sorted) {
      const t = o.offering_type || "Other";
      const g = typeGroups.find((x) => x.type === t);
      if (g) g.items.push(o);
      else typeGroups.push({ type: t, items: [o] });
    }
  }

  // When sorted "By category", group under each offering category — Suren's
  // primary grouping ("if I pick Global Regulatory Intelligence I see these
  // offerings"). sorted is already category→name ordered.
  const catGroups: { cat: string; items: HydratedOffering[] }[] = [];
  if (sort === "category") {
    for (const o of sorted) {
      const c = o.offering_category || "Uncategorized";
      const g = catGroups.find((x) => x.cat === c);
      if (g) g.items.push(o);
      else catGroups.push({ cat: c, items: [o] });
    }
  }

  const inputCls =
    "h-10 rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary transition-shadow focus:outline-none focus:border-blue-subtle focus:shadow-input-focus";

  return (
    <div>
      {/* Filter bar */}
      <div className="rounded-xl border border-border-light bg-surface/50 p-2.5 mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[190px]">
          <Search
            size={16}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search offerings…"
            aria-label="Search offerings"
            className={`${inputCls} w-full pl-9 pr-3`}
          />
        </div>
        <MultiColorSelect
          values={ctIds}
          onChange={(next) => setCtId(next.join(","))}
          minWidth={150}
          allLabel="All customer types"
          ariaLabel="Filter by customer type"
          options={[
            // Colour says the FAMILY, the icon says the SIZE — the list used
            // to encode only family, so Small/Mid/Large read identically
            // (Anir, Jul 25: "you only have it color-coded by the category…
            // not by the size").
            ...customerTypes.map((c) => {
              const size = String((c as { size?: string }).size || "");
              return {
                value: c.id,
                label: c.name,
                color: familyColor((c as { family?: string }).family || c.name),
                icon: size.includes("Small")
                  ? Store
                  : size.includes("Mid")
                    ? Building
                    : BuildingLarge,
              };
            }),
          ]}
        />
        <MultiColorSelect
          values={catId ? catId.split(",") : []}
          onChange={(next) => setCatId(next.join(","))}
          minWidth={150}
          allLabel="All categories"
          ariaLabel="Filter by offering category"
          options={[
            ...offeringCategories.map((c, i) => ({
              value: c.id,
              label: c.name,
              color: FILTER_PALETTE[i % FILTER_PALETTE.length],
            })),
          ]}
        />
        <MultiColorSelect
          values={otId ? otId.split(",") : []}
          onChange={(next) => setOtId(next.join(","))}
          minWidth={150}
          allLabel="All offering types"
          ariaLabel="Filter by offering type"
          options={[
            ...offeringTypes.map((t, i) => ({
              value: t.id,
              label: t.name,
              color: FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length],
            })),
          ]}
        />
        {status && (
          <span className="h-10 inline-flex items-center gap-1.5 px-3 rounded-lg bg-blue-light text-[12.5px] font-semibold text-blue-primary">
            {status === "unmapped" ? "Awaiting details" : "Fully detailed"}
            <button
              onClick={() => setStatus("")}
              aria-label="Clear status filter"
              className="hover:opacity-70"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </span>
        )}
        {activeFilters && (
          <button
            onClick={clearAll}
            className="h-10 px-3 rounded-lg text-[13px] font-semibold text-text-secondary hover:text-blue-primary hover:bg-blue-light transition-colors inline-flex items-center gap-1"
          >
            <X size={14} strokeWidth={2} /> Clear
          </button>
        )}
        {/* Sort, view and export live IN the filter bar — two stacked control
            rows read as clutter (Anir, Jul 25: "everything should be on one
            row, and it should look beautiful"). ml-auto keeps this display
            cluster docked right; the bar wraps gracefully when narrow. */}
        <div className="ml-auto flex items-center gap-2">

          {/* Sort — a display control, so it lives here with view + export rather
              than wrapping onto a lonely second line under the filters. */}
          <ColorSelect
            value={sort}
            onChange={setSort}
            ariaLabel="Sort offerings"
            minWidth={170}
            options={[
              { value: "default", label: "Recommended", color: "#0071E3", icon: SortSpark },
              { value: "name", label: "Name (A–Z)", color: "#7C3AED", icon: ArrowDownAZ },
              { value: "category", label: "By category", color: "#0F6E56", icon: SortLayers },
              { value: "type", label: "By type", color: "#F97316", icon: SortPackage },
              { value: "mapped", label: "Most complete first", color: "#059669", icon: SortComplete },
            ]}
          />
          {/* Tile vs Grid view toggle (Suren's live-meeting ask) */}
          <div
            role="group"
            aria-label="View"
            className="inline-flex items-center rounded-lg border border-border-light bg-surface/60 p-0.5"
          >
            <button
              type="button"
              onClick={() => setView("tile")}
              aria-label="Tile view"
              aria-pressed={view === "tile"}
              title="Tile view"
              className={`inline-flex items-center gap-1 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-colors ${
                view === "tile"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <LayoutGrid size={14} strokeWidth={2} /> Tiles
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              title="Grid view"
              className={`inline-flex items-center gap-1 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-colors ${
                view === "grid"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Table2 size={14} strokeWidth={2} /> Grid
            </button>
          </div>
          {sorted.length > 0 && (
            <button
              onClick={exportCsv}
              aria-label="Export CSV"
              title="Export CSV"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-light text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors"
            >
              <Download size={15} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-[12px] text-text-tertiary tnum">
        Showing {filtered.length} of {offerings.length} offerings
      </p>


      {offerings.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Package}
            title="No offerings yet."
            description="Build the repository by adding your first offering — its type, who it's for, the markets it covers, and the sales materials behind it."
            action={
              <Link
                href="/offerings/new"
                className="inline-flex items-center justify-center text-[13px] font-semibold rounded-md px-4 py-2 bg-blue-primary text-white hover:bg-blue-hover transition-colors"
              >
                + New offering
              </Link>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Search}
            title={
              q.trim()
                ? `No offerings match “${q.trim()}”.`
                : "No offerings match these filters."
            }
            description="Try a different market, customer type, or search term."
            action={
              <button
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
              >
                <X size={14} strokeWidth={2} /> Clear filters
              </button>
            }
          />
        </Card>
      ) : view === "grid" ? (
        // Grid (compact table) view — Suren's live-meeting ask; mirrors his
        // Excel so the whole catalog is scannable in rows. Keyed so switching
        // views re-mounts with the shared fade/lift.
        <Card key="grid-view" className="tab-panel p-0 overflow-hidden">
          <div className="overflow-x-auto">
            {/* table-fixed + explicit widths so all six columns fit the card —
                auto layout let "Availability" grab all the slack and shoved the
                last two columns off-screen behind a horizontal scroll. */}
            <table className="w-full min-w-[1080px] table-fixed text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="px-4 py-2.5 w-[26%]">Offering</th>
                  <th className="px-4 py-2.5 w-[21%]">Category</th>
                  <th className="px-4 py-2.5 w-[15%]">Type</th>
                  <th className="px-4 py-2.5 w-[12%]">Availability</th>
                  <th className="px-4 py-2.5 w-[18%]">Who it&apos;s for</th>
                  <th className="px-4 py-2.5 w-[8%]">Materials</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  // Grid rows were bare gray text while the tiles were fully
                  // colour-coded — same data, two moods (Anir, Jul 25: "the
                  // grid view doesn't have any colors, and it's really dry").
                  // Colours derive from list order, matching the dropdowns.
                  const catIndex = offeringCategories.findIndex(
                    (c) => c.name === o.offering_category
                  );
                  const catColor =
                    catIndex >= 0 ? FILTER_PALETTE[catIndex % FILTER_PALETTE.length] : null;
                  const typeIndex = offeringTypes.findIndex(
                    (t) => t.name === o.offering_type
                  );
                  const typeColor =
                    typeIndex >= 0
                      ? FILTER_PALETTE[(typeIndex + 3) % FILTER_PALETTE.length]
                      : null;
                  const fams = Array.from(
                    new Set(o.customerTypes.map((c) => c.family as string))
                  );
                  const famList = [
                    ...FAMILY_ORDER.filter((f) => fams.includes(f)),
                    ...fams.filter((f) => !FAMILY_ORDER.includes(f)),
                  ];
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-border-light last:border-0 align-middle hover:bg-surface/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/offerings/${o.id}`}
                          className="group/name flex items-center gap-2.5"
                        >
                          <OfferingIcon
                            name={o.offering_name}
                            className="h-8 w-8 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-text-primary group-hover/name:text-blue-primary">
                              {o.offering_name}
                            </span>
                            {o.poc && (
                              <span className="block text-[11px] text-text-tertiary mt-0.5">
                                POC: {o.poc}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {o.offering_category && catColor ? (
                          <span
                            className="inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-0.5 text-[11.5px] font-semibold leading-snug"
                            style={{ color: catColor, background: `${catColor}14` }}
                          >
                            <span
                              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: catColor }}
                            />
                            <span className="min-w-0">{o.offering_category}</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{o.offering_category || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {o.offering_type && typeColor ? (
                          <span
                            className="inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-0.5 text-[11.5px] font-semibold leading-snug"
                            style={{ color: typeColor, background: `${typeColor}14` }}
                          >
                            <span
                              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: typeColor }}
                            />
                            <span className="min-w-0">{o.offering_type}</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{o.offering_type || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {o.current_availability ? (
                          <AvailabilityPill value={o.current_availability} size="sm" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {famList.length ? (
                          o.customerTypes.length === customerTypes.length ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ color: "#0F6E56", background: "#0F6E5614" }}
                            >
                              All customer types
                            </span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {famList.map((f) => (
                                <span
                                  key={f}
                                  className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  style={{
                                    color: familyColor(f),
                                    background: `${familyColor(f)}14`,
                                  }}
                                >
                                  {f}
                                </span>
                              ))}
                            </span>
                          )
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tnum">
                        {o.materials.length ? (
                          <span className="inline-flex items-center rounded-full bg-blue-light px-2 py-0.5 text-[11.5px] font-semibold text-blue-primary">
                            {o.materials.length}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : sort === "category" ? (
        <div className="space-y-6">
          {catGroups.map((g) => (
            <div key={g.cat}>
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                <Layers size={12} strokeWidth={2} className="text-text-tertiary" />
                {g.cat || "Uncategorized"}
                <span className="text-text-tertiary/70 tnum">
                  ({g.items.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                {g.items.map((o, i) => renderCard(o, i))}
              </div>
            </div>
          ))}
        </div>
      ) : sort === "type" ? (
        <div className="space-y-6">
          {typeGroups.map((g) => (
            <div key={g.type}>
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                {g.type || "Other"}
                <span className="text-text-tertiary/70 tnum">
                  ({g.items.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                {g.items.map((o, i) => renderCard(o, i))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          key="tile-view"
          className="tab-panel grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch"
        >
          {sorted.map((o, i) => renderCard(o, i))}
        </div>
      )}
    </div>
  );
}
