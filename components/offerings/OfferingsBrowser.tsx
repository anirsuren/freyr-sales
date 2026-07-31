"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { PersonFan } from "@/components/ui/PersonFan";
import {
  AreaChart,
  DonutChart,
  DonutLegend,
  Sparkline,
} from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { formatMoney } from "@/lib/pipeline";
import { flagForGeography } from "@/lib/countryFlags";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Store, Building, Building2 as BuildingLarge, Sparkles as SortSpark, ArrowDownAZ, Layers as SortLayers, Package as SortPackage, CheckCircle2 as SortComplete, Globe, Clock3 } from "lucide-react";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import { servesMarket } from "@/lib/offeringCatalogue";
import {
  SearchPriority,
  PrioritySearchInput,
  PriorityLabel,
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { EmptyState } from "@/components/ui/EmptyState";

// Distinct palette so each category / type gets its own colour dot in the
// dropdowns (Suren: "color code all the dropdowns"). Shared with the
// master-list managers so colours match everywhere.
import { FILTER_PALETTE, listAccent } from "./filterPalette";
import { pocNames as parsePocs } from "@/lib/pocNames";
// A customer family is an IDENTITY, so it never borrows a status colour: red
// means a problem, green means healthy, #C2410C means caution (Anir, Jul 28:
// "red means horrible, red means negative... red, green and yellow are
// reserved"). Biologics used to be rose #E11D48 and read as an error chip.
const familyColor = (fam: string): string => {
  const f = (fam || "").toLowerCase();
  if (f.includes("bio pharma") || f.includes("biopharma")) return "#7C3AED"; // violet
  if (f.includes("biologic")) return "#DB2777"; // pink
  if (f.includes("pharma")) return "#0071E3"; // blue
  return "#475569"; // slate
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
      className="semantic-color-pill inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight"
      style={
        {
          "--semantic-color": color,
          "--semantic-bg": `${color}14`,
        } as CSSProperties
      }
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

// Sort options: also valid ?sort= deep-link values, kept in sync with the
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
  /** Who may edit this offering. Empty until someone is granted it. */
  owners?: { memberId: string; name: string; status: "requested" | "owner" }[];
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

// One row of a trend-point breakdown, the SAME shape as the charts' TipItem
// so it feeds Sparkline's pointTips directly, while staying a plain
// serializable object the server page can build.
export type OfferingTrendTip = {
  name: string;
  value?: string;
  sub?: string;
  logo?: string;
};

// One slice / bar in the hover panel's commerce charts. Plain data only, the
// server page builds these arrays, so nothing here may be a function.
type MixDatum = {
  label: string;
  value: number;
  color: string;
  /** TIP_ICONS key ("company", "money"), a string, not a component. */
  icon?: string;
  tip?: { name: string; logo?: string; value?: string; sub?: string }[];
};

export type OfferingCommerce = {
  totalRevenue: number;
  totalLicenses: number;
  customerCount: number;
  customers: {
    id: string;
    name: string;
    revenue: number;
    /** Seats this account licenses, the bar chart beside the revenue pie. */
    licenses: number;
  }[];
  /** Revenue split by contract type (Annual / Project / Service / License),
   *  the bar chart's honest fallback when no account licenses seats. */
  revenueByType: { label: string; value: number }[];
  /** Cumulative revenue build for the hover chart, honest numbers only:
   *  derived from real revenue-line start dates when every line carries one,
   *  else cumulative by account ("how the book built"). Server-computed. */
  trend: {
    points: number[];
    labels: string[];
    hint: string;
    tips: OfferingTrendTip[][];
  };
};


// The tile's POC row: label + overlapping avatar stack, exactly the campaigns
// "Going to" pattern, each face hoverable for the full identity + Teams link.
// FACES ONLY, at every count. It used to print the name inline whenever there
// was one POC, which put an initials bubble next to a comma-separated name and
// read as two people crushed into one photo (Anir, Jul 28: "the POC should show
// kinda similar to the campaign's page... you can't merge both people in one
// pfp... and when I hover over I see the name"). The name lives in the hover.
function PocStrip({
  poc,
  offeringName,
}: {
  poc: string;
  offeringName: string;
}) {
  const pocs = parsePocs(poc);
  if (pocs.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`POC: ${poc}`}
      className="relative z-10 flex items-center gap-2 min-w-0"
    >
      <span className="person-row-label person-row-label--poc shrink-0">
        POC
      </span>
      <PersonFan
        people={pocs.map((name) => ({
          name,
          role: "Service delivery POC",
          context: offeringName,
        }))}
      />
    </div>
  );
}

// WHO OWNS THIS, shown as PEOPLE — the same shape as the POC row directly
// underneath it: a label, then faces you can hover for the whole person (Anir,
// Jul 28: "where the fuck can I see the owner... where it should show the
// owner, just like it shows the point of contact"). A text chip that said "You
// own this" named nobody and showed nothing. Your own row still marks itself,
// because "can I edit this?" is the question the card is answering.
function OwnerStrip({
  owners,
  offeringName,
}: {
  owners?: {
    memberId: string;
    name: string;
    status: "requested" | "owner";
    /** Their workspace role (Admin / Manager / Rep), shown under the name. */
    role?: string | null;
  }[];
  offeringName: string;
}) {
  const granted = (owners || []).filter((o) => o.status === "owner");
  if (granted.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`Owner: ${granted.map((o) => o.name).join(", ")}`}
      className="relative z-10 flex min-w-0 items-center gap-2"
    >
      <span className="person-row-label person-row-label--owner shrink-0">
        Owner
      </span>
      <PersonFan
        people={granted.map((o) => ({
          name: o.name,
          // Their actual role, not a restatement of the row they are sitting
          // in: "Owns this offering" was already obvious from the OWNER label.
          role: o.role || "Owns this offering",
          context: offeringName,
        }))}
      />
    </div>
  );
}

export function OfferingsBrowser({
  offerings,
  customerTypes,
  markets,
  offeringTypes,
  offeringCategories,
  commerce,
  newOfferingAction,
}: {
  offerings: HydratedOffering[];
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
  offeringCategories: OfferingCategory[];
  /** Per-offering revenue/usage rollup (server-computed) powering the hover
   *  mini-dashboard. */
  commerce?: Record<string, OfferingCommerce>;
  /**
   * The "New offering" pop-up trigger, handed down from the server page (it
   * needs server-only lists for its pickers, and this is a client component).
   * The empty state used to link to a standalone /offerings/new PAGE, so the
   * same action opened as a modal from the header and as a full page from the
   * empty state (Anir, Jul 30: "new offering has to be a popup which u already
   * have, but from the search bar it takes me here which is weird").
   */
  newOfferingAction?: React.ReactNode;
}) {
  // Seed filters from the URL so chips elsewhere can deep-link into a filtered
  // view (e.g. /offerings?market=mkt-europe from a market chip on an offering).
  const params = useSearchParams();
  // Every filter reads a comma-separated list, so `?market=mkt-europe` and
  // `?market=mkt-europe,mkt-japan` are both valid and a chip deep-link keeps
  // working unchanged (change-log row 5, Saras: "any combination").
  const keepIds = (raw: string | null, ok: (id: string) => boolean) =>
    (raw ?? "")
      .split(",")
      .filter((id) => id && ok(id))
      .join(",");
  const initType = keepIds(params.get("type"), (id) =>
    customerTypes.some((c) => c.id === id)
  );
  const initMkt = keepIds(params.get("market"), (id) =>
    markets.some((m) => m.id === id)
  );
  const initOt = keepIds(params.get("otype"), (id) =>
    offeringTypes.some((t) => t.id === id)
  );
  const initCat = keepIds(params.get("cat"), (id) =>
    offeringCategories.some((c) => c.id === id)
  );
  const initStatus = keepIds(params.get("status"), (id) =>
    ["mapped", "unmapped"].includes(id)
  );
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
  // Tile (cards) vs Grid (compact table). Suren's live-meeting ask.
  const [view, setView] = useState<"tile" | "grid">(initView);

  // Keep filters in sync when the URL changes via in-app navigation (chips, the
  // "still to map" stat link, etc.), useState only seeds on first mount, so
  // without this a client-side nav to ?status=unmapped wouldn't apply.
  useEffect(() => {
    const t = params.get("type");
    const m = params.get("market");
    const ot = params.get("otype");
    const cat = params.get("cat");
    const s = params.get("status") || "";
    const so = params.get("sort") || "";
    setQ(params.get("q") ?? "");
    const keep = keepIds;
    setCtId(keep(t, (id) => customerTypes.some((c) => c.id === id)));
    setMktId(keep(m, (id) => markets.some((mm) => mm.id === id)));
    setOtId(keep(ot, (id) => offeringTypes.some((tt) => tt.id === id)));
    setCatId(keep(cat, (id) => offeringCategories.some((cc) => cc.id === id)));
    setStatus(keep(s, (id) => ["mapped", "unmapped"].includes(id)));
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
  // single-value tests keep working unchanged, the UI reads/writes them as
  // arrays (change-log row 5: any combination, OR within a filter).
  const ctIds = ctId ? ctId.split(",") : [];
  const mktIds = mktId ? mktId.split(",") : [];
  const statuses = status ? status.split(",") : [];
  const otNames = otId
    ? otId.split(",").map((id) => offeringTypes.find((t) => t.id === id)?.name ?? "")
    : [];
  const catNames = catId
    ? catId.split(",").map((id) => offeringCategories.find((c) => c.id === id)?.name ?? "")
    : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offerings.filter((o) => {
      // OR inside a filter, AND across them (Saras, change-log row 5).
      if (ctIds.length && !o.customerTypes.some((c) => ctIds.includes(c.id))) return false;
      // A Global offering answers every market filter (see servesMarket).
      if (
        mktIds.length &&
        !mktIds.some((id) =>
          servesMarket(
            o.markets.map((m) => m.id),
            id
          )
        )
      )
        return false;
      if (otNames.length && !otNames.includes(o.offering_type)) return false;
      if (catNames.length && !catNames.includes(o.offering_category)) return false;
      if (
        statuses.length &&
        !statuses.includes(isMapped(o) ? "mapped" : "unmapped")
      )
        return false;
      // Search across what's actually on the card, name, type, category,
      // description, AND the markets / customer types it's mapped to, so typing
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
      // "default": keep the catalog (sheet) order, but lead with the
      // fully-detailed offerings so the page opens looking like a live catalog
      // instead of a wall of blank cards. Array sort is stable, so the original
      // catalog order is preserved within each group.
      arr.sort((a, b) => Number(isMapped(b)) - Number(isMapped(a)));
    return arr;
  }, [filtered, sort]);

  const activeFilters = !!(q || ctId || mktId || otId || catId || status);
  // Market and completeness arrive as self-clearing chips (see the filter bar).
  // When they are the ONLY thing filtering, a separate Clear button is a second
  // control for the same job, and its 85px is what pushed the sort / view /
  // export cluster onto a second line (Anir, Jul 28: "this should just be one
  // row"). Everything else still gets the Clear button.
  const chipFiltersOnly = !q && !ctId && !otId && !catId && !!(mktId || status);
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
    // One pick names itself ("…-europe.csv"); a combination is counted, because
    // a filename listing five markets helps nobody.
    const pickedMarkets = markets.filter((m) => mktIds.includes(m.id));
    const pickedTypes = customerTypes.filter((c) => ctIds.includes(c.id));
    if (pickedMarkets.length === 1) parts.push(slug(pickedMarkets[0].name));
    else if (pickedMarkets.length > 1) parts.push(`${pickedMarkets.length}-markets`);
    if (pickedTypes.length === 1) parts.push(slug(pickedTypes[0].name));
    else if (pickedTypes.length > 1) parts.push(`${pickedTypes.length}-customer-types`);
    if (statuses.length === 1) parts.push(statuses[0]);
    if (parts.length === 1 && q.trim()) parts.push("filtered");
    return `${parts.join("-")}.csv`;
  };

  // Export the current (filtered) view to CSV. Suren built this from Excel, so
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
        // isn't written yet, same as the detail page, so the Excel export
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
    // The commercial mix behind the hover panel. Suren: "for the 'who is using
    // it' part, you can definitely make that a pie chart… I think you can have
    // a pie chart on the left and, on the right, maybe a vertical bar chart."
    // So: LEFT = revenue share per account, RIGHT = how many seats each of
    // those same accounts licenses. Same accounts, same order, same colour on
    // both sides, so a colour means one customer wherever you look.
    const payingCustomers = (com?.customers ?? []).filter((c) => c.revenue > 0);
    const shownRevenue = payingCustomers.reduce((s, c) => s + c.revenue, 0);
    // The rollup ships the top accounts only: the tail still has to occupy its
    // share of the ring, or every percentage on it would be a lie.
    const tailRevenue = Math.max((com?.totalRevenue ?? 0) - shownRevenue, 0);
    const tailAccounts = Math.max(
      (com?.customerCount ?? 0) - payingCustomers.length,
      0
    );
    // One id links the donut and its legend: hover a legend row and the slice
    // lights up, and vice versa.
    const mixSyncId = `offering-mix-${o.id}`;
    const revenueSegments: MixDatum[] = payingCustomers.map((c, ci) => ({
      label: c.name,
      value: c.revenue,
      color: FILTER_PALETTE[ci % FILTER_PALETTE.length],
      icon: "company",
      tip: [
        {
          name: c.name,
          logo: c.name,
          value: formatMoney(c.revenue),
          sub:
            c.licenses > 0
              ? `${c.licenses} licensed seat${c.licenses === 1 ? "" : "s"}`
              : undefined,
        },
      ],
    }));
    if (tailRevenue > 0) {
      revenueSegments.push({
        label: `${tailAccounts} more account${tailAccounts === 1 ? "" : "s"}`,
        value: tailRevenue,
        color: "#8E98A8",
        icon: "company",
      });
    }
    // The hover is the Customers-card pattern (HoverExpandCard): the card pops
    // out over its neighbours and opens a mini-dashboard: revenue, who's
    // using it, seats, materials, not just a pop-out animation (Anir: "I
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
          {/* Offering name is the primary element (Suren's live-meeting ask,
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

          <div className="flex flex-wrap items-center gap-1.5">
            {/* The clean timing status only: market-coverage / version notes
                (future_availability) are free-form and live on the detail page. */}
            {o.current_availability && (
              <AvailabilityPill value={o.current_availability} size="sm" />
            )}
          </div>

          <div className="mt-auto pt-3 border-t border-border-light space-y-2">
            {/* Offering category, Suren's Jun 27 grouping (replaces markets on
                the tile). The primary qualifier above the offering type. */}
            {/* Every data point is a colour + icon chip, never flat gray text
                (standing chip rule; Anir, Jul 27: "for the data points on each
                of these, definitely need tags, icons, and colors, the all
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
            {/* Service-delivery POC(s), hover a face for who's there + a
                Teams line to them (Suren: "if there's multiple, make it look
                like the campaigns page so when I hover over it I can see
                who's there"). */}
            <OwnerStrip owners={o.owners} offeringName={o.offering_name} />
            {o.poc && <PocStrip poc={o.poc} offeringName={o.offering_name} />}
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
                Awaiting details, add who it&apos;s for, its markets &amp; sales
                materials
              </p>
            )}
          </div>
            </div>
          }
          extra={
            <>
              {/* The commercial mini-dashboard, the numbers a rep would
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
                  <div key={f.label} className="rounded-lg bg-surface px-2.5 py-1.5">
                    <p className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      <f.icon size={11} strokeWidth={2.2} style={{ color: f.color }} />
                      {f.label}
                    </p>
                    <p className="text-[13.5px] font-semibold text-text-primary tnum">
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* How the revenue built, a real line, like the customer cards
                  (Suren: "need graph like line chart for revenue like the
                  customers"). Points are cumulative annual revenue keyed off
                  the revenue lines' real start dates (or account-by-account
                  when lines carry no dates), never an invented curve.
                  It used to be a bare Sparkline: a curve with no scale and no
                  dates on it (Suren: "for the line chart, there are no units or
                  anything, it looks kind of weird"). AreaChart is the same
                  series with the axes /forecast draws, the money value at the
                  top, $0 on the baseline, and the first/last period underneath.
                  `yMax` pins the ceiling to the real total so the top label is
                  the actual book, not a 10%-headroom number nobody booked; the
                  old duplicate value beside the heading is gone with it. */}
              {com &&
                com.totalRevenue > 0 &&
                com.trend &&
                com.trend.points.length >= 2 && (
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        Revenue{com.trend.hint ? ` · ${com.trend.hint}` : ""}
                      </p>
                      <ExpandedChartModal
                        title={`${o.offering_name} revenue`}
                        subtitle="Cumulative annual revenue from the offering’s recorded customer contracts."
                        chart={{
                          kind: "area",
                          label: "Revenue",
                          color: "#16A34A",
                          data: com.trend.points,
                          format: "money",
                          unit: "USD",
                          yMax: Math.max(...com.trend.points),
                          xLabels: com.trend.labels,
                          pointTips: com.trend.tips,
                        }}
                        className="h-8 px-2.5 text-[11px]"
                      />
                    </div>
                    {/* AreaChart hangs its x-axis labels just below its own box,
                        so the wrapper reserves that strip.

                        HEIGHT IS NOT COSMETIC HERE: AreaChart only draws its
                        axis numbers, its unit and its date labels at 140px or
                        taller. At 84 this was a bare green line with nothing on
                        it (Anir, Jul 28: "the line graph, it's not showing me
                        anything, no numbers... it just showed me a green line"). */}
                    <div className="pb-4">
                      <AreaChart
                        id={`offering-revenue-${o.id}`}
                        data={com.trend.points}
                        color="#16A34A"
                        height={140}
                        format="money"
                        unit="USD"
                        yMax={Math.max(...com.trend.points)}
                        xLabels={com.trend.labels}
                        pointTips={com.trend.tips}
                      />
                    </div>
                  </div>
                )}

              {/* WHO is paying for it: the Customers-page substance, now read
                  as charts instead of a text list (Suren: "for the 'who is
                  using it' part, you can definitely make that a pie chart, it'll
                  look better… a pie chart on the left and, on the right, maybe
                  a vertical bar chart"). The legend under both names every
                  account with its money, so the old list said nothing the
                  legend doesn't. */}
              {com && payingCustomers.length > 0 ? (
                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11.5px] font-semibold text-text-primary">
                      Who&apos;s using it
                    </p>
                    {/* Every company wears its own mark (standing rule: a
                        company on screen always brings its logo). */}
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="flex items-center -space-x-1.5">
                        {payingCustomers.map((c) => (
                          <CompanyLogo
                            key={c.id}
                            name={c.name}
                            className="w-5 h-5 text-[7px] ring-2 ring-[color:var(--white)]"
                          />
                        ))}
                        {tailAccounts > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-xl bg-blue-light text-[8px] font-semibold text-blue-primary ring-2 ring-[color:var(--white)] tnum">
                            +{tailAccounts}
                          </span>
                        )}
                      </span>
                      <ExpandedChartModal
                        title={`${o.offering_name} customers`}
                        subtitle="Revenue split across the customer accounts currently paying for this offering."
                        chart={{
                          kind: "donut",
                          segments: revenueSegments,
                          centerLabel: String(com.customerCount),
                          centerSub:
                            com.customerCount === 1 ? "customer" : "customers",
                          format: "money",
                        }}
                        className="h-8 px-2.5 text-[11px]"
                      />
                    </div>
                  </div>
                  {/* ONE row: the ring, and its key beside it. The licensed-seats
                      bar chart that used to sit here is gone, it charted two
                      numbers the legend already states, and squeezing it into
                      half the panel meant it needed its own sideways scroll to
                      show a company name (Anir, Jul 28: "why the fuck would I
                      want to scroll within that licensed seats bar chart? You
                      don't even need it, move the names and numbers to the
                      right of the pie"). Markets follow directly underneath. */}
                  <div className="flex items-center gap-3">
                    <DonutChart
                      syncId={mixSyncId}
                      segments={revenueSegments}
                      size={106}
                      thickness={8}
                      format="money"
                      centerLabel={String(com.customerCount)}
                      centerSub={
                        com.customerCount === 1 ? "customer" : "customers"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      {/* No share bar in this panel. Five columns in a
                          ~200px column squeezed the percentage until only its
                          last digit showed — "$803K 3" instead of "$803K 35%"
                          (Anir, Jul 28: "the numbers on the right side next to
                          the dollar amount are not showing up properly"). The
                          donut beside it already draws the share. */}
                      <DonutLegend
                        items={revenueSegments}
                        format="money"
                        syncId={mixSyncId}
                        bars={false}
                      />
                    </div>
                  </div>
                </div>
              ) : com && com.customers.length > 0 ? (
                // Marked in use, but no money against it yet, still say WHO,
                // with their logos, rather than dropping to "no revenue".
                <div className="mt-3">
                  <p className="text-[11.5px] font-semibold text-text-primary">
                    Who&apos;s using it
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {com.customers.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-light/60 px-1.5 py-0.5 text-[11px] font-medium text-text-primary"
                      >
                        <CompanyLogo name={c.name} className="w-4 h-4 text-[6px]" />
                        {c.name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-snug text-text-tertiary">
                    In use today, no revenue recorded against it yet.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-snug text-text-tertiary">
                  No revenue recorded yet, accounts appear here as they start
                  using this offering.
                </p>
              )}

              {/* Where it sells + any availability caveat. */}
              {(o.markets.length > 0 || o.future_availability) && (
                <div className="mt-2.5 space-y-1.5">
                  {/* A flag belongs next to its OWN place (Suren's standing
                      rule), so each market is its own chip carrying its own
                      flag, not one globe in front of a middot list. Flag and
                      name never separate (whitespace-nowrap); a market with no
                      flag match shows its name alone rather than a placeholder.
                      The chip colour is the market's colour in the markets
                      manager, so a market reads the same everywhere. */}
                  {o.markets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {o.markets.map((m) => {
                        const flag = flagForGeography(m.name);
                        const accent = listAccent(
                          Math.max(
                            markets.findIndex((mm) => mm.id === m.id),
                            0
                          )
                        );
                        return (
                          <span
                            key={m.id}
                            className="semantic-color-pill inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight"
                            style={
                              {
                                "--semantic-color": accent,
                                "--semantic-bg": `${accent}14`,
                              } as CSSProperties
                            }
                          >
                            {flag && <span aria-hidden="true">{flag}</span>}
                            {m.name}
                          </span>
                        );
                      })}
                    </div>
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

  // When sorted "By category", group under each offering category. Suren's
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
      {/* Filter bar, search priority (Suren, Jul 27): pressing the search
          compresses every control to its right, and this box is already
          `flex-1`, so it simply absorbs the width they release. */}
      <SearchPriority
        query={q}
        className="rounded-xl border border-border-light bg-[var(--surface)] p-2.5 mb-4 flex flex-wrap items-center gap-2.5"
      >
        <PrioritySearchInput
          grow
          value={q}
          onChange={setQ}
          placeholder="Search offerings…"
          ariaLabel="Search offerings"
          iconSize={16}
          className="flex-1 min-w-[120px]"
          iconClassName="left-3"
          inputClassName={`${inputCls} w-full pl-9 pr-3`}
        />
        {/* Three dropdowns, one row. Five of them pushed the display cluster
            (sort / view / export) onto a lonely second line (Anir, Jul 28:
            "this should just be one row… you don't need all these
            selectors"). Markets and completeness were the two that went: both
            already have one-click entry points elsewhere (the market chips on
            each card, the "awaiting details" stat card), and both still filter
            from the URL, they just name themselves as a clearable chip below
            instead of owning a permanent control. */}
        <MultiColorSelect
          values={ctIds}
          onChange={(next) => setCtId(next.join(","))}
          minWidth={150}
          allLabel="All customer types"
          ariaLabel="Filter by customer type"
          allIcon={Users}
          allColor="#0071E3"
          options={[
            // Colour says the FAMILY, the icon says the SIZE, the list used
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
          allIcon={SortLayers}
          allColor="#0F6E56"
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
          allLabel="All types"
          ariaLabel="Filter by offering type"
          allIcon={SortPackage}
          allColor="#C2410C"
          options={[
            ...offeringTypes.map((t, i) => ({
              value: t.id,
              label: t.name,
              color: FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length],
            })),
          ]}
        />
        {/* Market and completeness arrive by LINK, not by dropdown: the market
            chips on every card link to `?market=`, and the "awaiting details"
            stat card links to `?status=unmapped`. The filtering is unchanged;
            what an arriving rep gets instead of a select is this chip, which
            names the filter that is narrowing the list and clears it on click.
            Nothing renders when no param is set, so the row stays one line. */}
        {mktIds.map((id) => {
          const i = markets.findIndex((m) => m.id === id);
          const m = markets[i];
          if (!m) return null;
          const color = listAccent(i);
          return (
            <button
              key={`mkt-chip-${id}`}
              type="button"
              onClick={() => setMktId(mktIds.filter((x) => x !== id).join(","))}
              aria-label={`Clear market filter: ${m.name}`}
              title={`Clear market filter: ${m.name}`}
              className="semantic-color-pill inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-opacity hover:opacity-75"
              style={
                {
                  "--semantic-color": color,
                  "--semantic-bg": `${color}1A`,
                } as CSSProperties
              }
            >
              <Globe size={13} strokeWidth={2.1} className="shrink-0" />
              {m.name}
              <X size={13} strokeWidth={2.4} className="shrink-0" />
            </button>
          );
        })}
        {statuses.map((s) => {
          const meta =
            s === "mapped"
              ? { label: "Fully detailed", color: "#059669", Icon: SortComplete }
              : { label: "Awaiting details", color: "#C2410C", Icon: Clock3 };
          const StatusIcon = meta.Icon;
          return (
            <button
              key={`status-chip-${s}`}
              type="button"
              onClick={() => setStatus(statuses.filter((x) => x !== s).join(","))}
              aria-label={`Clear completeness filter: ${meta.label}`}
              title={`Clear completeness filter: ${meta.label}`}
              className="semantic-color-pill inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-opacity hover:opacity-75"
              style={
                {
                  "--semantic-color": meta.color,
                  "--semantic-bg": `${meta.color}1A`,
                } as CSSProperties
              }
            >
              <StatusIcon size={13} strokeWidth={2.1} className="shrink-0" />
              {meta.label}
              <X size={13} strokeWidth={2.4} className="shrink-0" />
            </button>
          );
        })}
        {/* Keep this control in the flex calculation even before a filter is
            active. Mounting it only after the first selection shifted every
            dropdown (and its open menu) sideways. Invisible means no visual
            clutter; disabled + aria-hidden means it is not interactive. */}
        <PriorityTooltip label="Clear filters">
          <button
            onClick={clearAll}
            aria-label="Clear filters"
            aria-hidden={!(activeFilters && !chipFiltersOnly)}
            disabled={!(activeFilters && !chipFiltersOnly)}
            tabIndex={activeFilters && !chipFiltersOnly ? 0 : -1}
            className={`h-10 px-3 rounded-lg text-[13px] font-semibold text-text-secondary hover:text-blue-primary hover:bg-blue-light transition-colors inline-flex items-center ${
              activeFilters && !chipFiltersOnly
                ? ""
                : "invisible pointer-events-none"
            }`}
          >
            <X size={14} strokeWidth={2} />
            <PriorityLabel gap="ml-1">Clear</PriorityLabel>
          </button>
        </PriorityTooltip>
        {/* Sort, view and export live IN the filter bar, two stacked control
            rows read as clutter (Anir, Jul 25: "everything should be on one
            row, and it should look beautiful"). ml-auto keeps this display
            cluster docked right; the bar wraps gracefully when narrow. */}
        <div className="ml-auto flex items-center gap-2">

          {/* Sort, a display control, so it lives here with view + export rather
              than wrapping onto a lonely second line under the filters. */}
          <ColorSelect
            value={sort}
            onChange={setSort}
            ariaLabel="Sort offerings"
            minWidth={148}
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
            className="inline-flex items-center rounded-lg border border-border-light bg-[var(--surface)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setView("tile")}
              aria-label="Tile view"
              aria-pressed={view === "tile"}
              title="Tile view"
              className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                view === "tile"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <LayoutGrid size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              title="Grid view"
              className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                view === "grid"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Table2 size={14} strokeWidth={2} />
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
      </SearchPriority>


      {offerings.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Package}
            title="No offerings yet."
            description="Build the repository by adding your first offering: its type, who it's for, the markets it covers, and the sales materials behind it."
            action={newOfferingAction}
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
        // Grid (compact table) view. Suren's live-meeting ask; mirrors his
        // Excel so the whole catalog is scannable in rows. Keyed so switching
        // views re-mounts with the shared fade/lift.
        <Card key="grid-view" className="tab-panel p-0 overflow-hidden">
          <div className="overflow-x-auto">
            {/* table-fixed + explicit widths. The min-width was 1280px, wider
                than the card on a 1512 screen, so the table always scrolled and
                the last column sat half off the edge (Anir, Jul 28: "it's not
                really properly aligned, especially in the last column"). It now
                fits, and Category is wide enough to hold its longest name,
                "Submissions and Document Operations", on ONE line. */}
            <table className="w-full min-w-[1040px] table-fixed text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="px-4 py-2.5 w-[19%]">Offering</th>
                  <th className="px-4 py-2.5 w-[21%]">Category</th>
                  <th className="px-4 py-2.5 w-[12%]">Type</th>
                  <th className="px-4 py-2.5 w-[11%]">Availability</th>
                  <th className="px-4 py-2.5 w-[14%]">Who it&apos;s for</th>
                  <th className="px-4 py-2.5 w-[12%]">Revenue</th>
                  <th className="px-4 py-2.5 w-[6%]">Trend</th>
                  <th className="px-4 py-2.5 w-[5%] text-right">Materials</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  // Grid rows were bare gray text while the tiles were fully
                  // colour-coded, same data, two moods (Anir, Jul 25: "the
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
                  // Commercial columns (Team-roster pattern: number + stacked
                  // share bar + trend spark), same server rollup as the tile
                  // hover, so both views tell one story.
                  const com = commerce?.[o.id];
                  const revCustomers = (com?.customers ?? []).filter(
                    (c) => c.revenue > 0
                  );
                  const shownRevenue = revCustomers.reduce(
                    (s, c) => s + c.revenue,
                    0
                  );
                  // The rollup ships the top accounts only, the tail still
                  // has to occupy its share of the bar to stay honest.
                  const restRevenue = Math.max(
                    (com?.totalRevenue ?? 0) - shownRevenue,
                    0
                  );
                  const restAccounts = Math.max(
                    (com?.customerCount ?? 0) - revCustomers.length,
                    0
                  );
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-border-light last:border-0 align-middle hover:bg-[var(--surface)] transition-colors"
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
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-text-primary group-hover/name:text-blue-primary">
                                {o.offering_name}
                              </span>
                              <OwnerStrip
                                owners={o.owners}
                                offeringName={o.offering_name}
                              />
                            </span>
                            {/* Same fan as the tiles: overlapped faces that
                                slide apart on hover, each one openable. */}
                            {o.poc && (
                              <span
                                className="mt-1 flex min-w-0 items-center gap-1.5"
                                aria-label={`POC: ${o.poc}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <PersonFan
                                  avatarClassName="h-[18px] w-[18px] text-[7px]"
                                  overlap={-6}
                                  people={parsePocs(o.poc).map((n) => ({
                                    name: n,
                                    role: "Service delivery POC",
                                    context: o.offering_name,
                                  }))}
                                />
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {o.offering_category && catColor ? (
                          <span
                            className="semantic-color-pill inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[11.5px] font-semibold leading-tight"
                            style={
                              {
                                "--semantic-color": catColor,
                                "--semantic-bg": `${catColor}14`,
                              } as CSSProperties
                            }
                          >
                            <span
                              className="semantic-color-dot h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ "--semantic-color": catColor } as CSSProperties}
                            />
                            <span className="min-w-0">{o.offering_category}</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{o.offering_category || "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {o.offering_type && typeColor ? (
                          <span
                            className="semantic-color-pill inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-0.5 text-[11.5px] font-semibold leading-snug"
                            style={
                              {
                                "--semantic-color": typeColor,
                                "--semantic-bg": `${typeColor}14`,
                              } as CSSProperties
                            }
                          >
                            <span
                              className="semantic-color-dot mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ "--semantic-color": typeColor } as CSSProperties}
                            />
                            <span className="min-w-0">{o.offering_type}</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{o.offering_type || "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {o.current_availability ? (
                          <AvailabilityPill value={o.current_availability} size="sm" />
                        ) : (
                          "-"
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
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {com && com.totalRevenue > 0 ? (
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-text-primary tnum">
                              {formatMoney(com.totalRevenue)}
                            </p>
                            {/* Who that money comes from: a slim stacked bar
                                (the Team table's pipeline-bar treatment), one
                                segment per account, hover a segment for the
                                name + amount. */}
                            <div className="mt-1.5 flex h-1.5 w-full max-w-[150px] overflow-hidden rounded-full bg-surface">
                              {revCustomers.map((c, ci) => (
                                <span
                                  key={c.id}
                                  title={`${c.name} · ${formatMoney(c.revenue)}`}
                                  className="h-full"
                                  style={{
                                    width: `${(c.revenue / com.totalRevenue) * 100}%`,
                                    background:
                                      FILTER_PALETTE[ci % FILTER_PALETTE.length],
                                  }}
                                />
                              ))}
                              {restRevenue > 0 && (
                                <span
                                  title={`${restAccounts} more account${
                                    restAccounts === 1 ? "" : "s"
                                  } · ${formatMoney(restRevenue)}`}
                                  className="h-full"
                                  style={{
                                    width: `${(restRevenue / com.totalRevenue) * 100}%`,
                                    background: "#8E98A8",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-tertiary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {com &&
                        com.totalRevenue > 0 &&
                        com.trend &&
                        com.trend.points.length >= 2 ? (
                          <div
                            className="w-[92px]"
                            aria-label={`${o.offering_name} revenue trend`}
                          >
                            <Sparkline
                              points={com.trend.points}
                              color="#16A34A"
                              height={30}
                              interactive={false}
                            />
                          </div>
                        ) : (
                          <span className="text-text-tertiary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tnum">
                        {o.materials.length ? (
                          <span className="inline-flex items-center rounded-full bg-blue-light px-2 py-0.5 text-[11.5px] font-semibold text-blue-primary">
                            {o.materials.length}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">-</span>
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
              {/* The group's icon wears its category's colour — the same hue the
                  category chip has on every card and in the filter dropdown, so
                  a section is identifiable before you read it (standing rule: a
                  category is never plain gray). */}
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                <Layers
                  size={12}
                  strokeWidth={2.2}
                  style={{ color: categoryColorByName[g.cat] || "#2563EB" }}
                />
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
              {/* An offering type is a SERVICE, so it never appears bare —
                  same icon + colour it wears as a chip on the cards. */}
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                <Sparkles
                  size={12}
                  strokeWidth={2.2}
                  style={{ color: typeColorByName[g.type] || "#7C3AED" }}
                />
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
