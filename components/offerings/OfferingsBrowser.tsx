"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  DollarSign,
  FileText,
  KeyRound,
  ChevronRight,
  Sparkles,
  X,
  Package,
  Layers,
  Rocket,
  Crown,
  CircleDashed,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PinnableTable, PinTableButton } from "@/components/ui/PinnableTable";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { PersonFan } from "@/components/ui/PersonFan";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { PersonHoverCard } from "@/components/ui/PersonHoverCard";
import { Avatar } from "@/components/ui/Avatar";
import {
  AreaChart,
  DonutChart,
  DonutLegend,
} from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { formatMoney } from "@/lib/pipeline";
import { flagForGeography } from "@/lib/countryFlags";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { ColumnHeaderMenu } from "@/components/offerings/ColumnHeaderMenu";
import { shortPersonName } from "@/lib/personName";
import { Building, Sparkles as SortSpark, ArrowDownAZ, Layers as SortLayers, Package as SortPackage, CheckCircle2 as SortComplete, Globe, Clock3 } from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { servesMarket } from "@/lib/offeringCatalogue";
import {
  SearchPriority,
  PrioritySearchInput,
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { EmptyState } from "@/components/ui/EmptyState";

// Distinct palette so each category / type gets its own colour dot in the
// dropdowns (Suren: "color code all the dropdowns"). Shared with the
// master-list managers so colours match everywhere.
import { FILTER_PALETTE, listAccent } from "./filterPalette";
import { FolderPeek } from "@/components/offerings/FolderPeek";
import { allFolders, type OfferingMaterial } from "@/lib/offeringMaterials";
import { customerFamilyColor } from "@/lib/customerFamilies";
// ONE PALETTE FOR CUSTOMER FAMILIES, AND IT LIVES IN lib/customerFamilies.
//
// This file used to carry its own copy, matched by substring. It drifted the
// moment the shared table changed: Consumer Products moved off rust and this
// copy did not, so the same family was rust on the offerings list and cyan
// everywhere else (Anir, Aug 14, with screenshots). The old copy also fell
// back to slate #475569, a gray, which the chip rule forbids outright.
//
// A customer family is an IDENTITY, so it never borrows a status colour: red
// means a problem, green means healthy, amber means caution (Anir, Jul 28:
// "red means horrible, red means negative... red, green and yellow are
// reserved"). That reasoning now lives beside the palette itself.
const familyColor = customerFamilyColor;

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

// One metadata chip on an offering card: colour-tinted background, matching
// icon, never gray. Wraps rather than truncates — labels stay whole.

const FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical", "Medical Devices", "Consumer Products"];

type GoToMarketStatus = "available" | "coming" | "tbd";
function goToMarketStatus(offering: HydratedOffering): GoToMarketStatus {
  const value = (offering.current_availability || "").trim().toLowerCase();
  if (!value || /to be decided|\btbd\b|not set/.test(value)) return "tbd";
  if (/currently available|available now|\bcurrent\b/.test(value)) return "available";
  return "coming";
}

// ALWAYS NAME THE CUSTOMER TYPES, even when an offering covers all of them.
//
// Both views used to collapse full coverage into "All customer types" to keep
// things clean. In front of real users that backfired: Freya.Register listed
// five families on its row while Freya.Intelligence, which happens to cover
// every one, said "All customer types" — so the two looked like they were
// describing different KINDS of thing rather than the same field (Saras and
// Ritika, Aug 14: "confused some end users"). Reading the same five names on
// every row costs a little width and removes the question entirely.
//
// Both views now render the families themselves, each in its own colour from
// familyColor above, so the card and the table agree. The Customer Type FILTER
// keeps its own "All customer types" option: there the phrase means "do not
// filter", which is a different statement.

// Sort options: also valid ?sort= deep-link values, kept in sync with the
// rest of the filter bar so a sorted view can be shared/bookmarked.
/* "mapped" retired with the Most-complete option; owner / materials / gtm are
   the columns the list view's own headings can sort by (Saras, Aug 21). */
const SORTS = ["default", "name", "type", "category", "gtm", "owner", "materials"];

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
  /** The peek needs folder + docsPath, which the payload already carries. */
  materials: OfferingMaterial[];
  /** Who may edit this offering. Empty until someone is granted it. */
  owners?: {
    memberId: string;
    name: string;
    status: "requested" | "owner";
    role?: string | null;
  }[];
}

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


// WHO OWNS THIS, shown as PEOPLE — the same shape as the POC row directly
// underneath it: a label, then faces you can hover for the whole person (Anir,
// Jul 28: "where the fuck can I see the owner... where it should show the
// owner, just like it shows the point of contact"). A text chip that said "You
// own this" named nobody and showed nothing. Your own row still marks itself,
// because "can I edit this?" is the question the card is answering.
function OwnerRows({
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
  const shown = granted.slice(0, 2);
  const rest = granted.slice(2);
  return (
    <>
      {/* FACE AND NAME, NOT ONE OR THE OTHER (Saras, Aug 24: "can we replace
          these icons with just the names of the offering owners? ... you can
          maybe keep commas or dots between them" — then Anir, immediately
          after, on the result: "you're not showing the profile pictures, why
          would you remove that").

          What was actually wrong was a HUDDLE OF FACES WITH NO NAMES: a row of
          overlapping initials that nobody can decode without hovering each
          one, next to a single-owner card that read "Priyanka M." in plain
          text. Reading it as "drop the photos" was the wrong half — a person
          in this app always arrives with their headshot
          ([[logos-photos-system]]), and the list view has always shown both.

          So both: photo + name, dot-separated. The ten-owner problem the fan
          existed to solve is handled by TRUNCATING instead — two people, then
          "+N" that names the rest on hover — so the row is exactly one line
          whether an offering has one owner or twenty. */}
      {/* NEUTRAL, LIKE THE TWO LABELS ABOVE IT (Saras, Aug 21: "the font
          colour of the owner, let's just keep that simply black... there is
          no need for the crown icon either... let's just keep it neutral"). */}
      <dt className="flex h-[26px] items-center self-start text-[9.5px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
        Owner
      </dt>
      <dd className="flex min-h-[26px] min-w-0 items-center self-start">
        <span className="hover-yield inline-flex min-w-0 flex-wrap items-center text-[11.5px] font-semibold leading-snug text-text-primary">
          {shown.map((owner, index) => (
            <span key={owner.memberId} className="inline-flex min-w-0 items-center">
              {index > 0 && (
                <span aria-hidden className="px-1 text-text-tertiary">
                  ·
                </span>
              )}
              <PersonHoverCard
                name={owner.name}
                role={owner.role || "Owns this offering"}
                context={offeringName}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg py-0.5 pr-1 transition-colors hover:bg-surface">
                  <Avatar
                    name={owner.name}
                    className="h-[20px] w-[20px] shrink-0 text-[7px]"
                  />
                  <span className="min-w-0 break-words">
                    {shortPersonName(owner.name)}
                  </span>
                </span>
              </PersonHoverCard>
            </span>
          ))}
          {rest.length > 0 && (
            <PriorityTooltip
              label={rest.map((owner) => owner.name).join(", ")}
            >
              <span className="ml-1 cursor-default rounded-md bg-surface px-1.5 py-[1px] text-[10.5px] font-bold text-text-secondary">
                +{rest.length}
              </span>
            </PriorityTooltip>
          )}
        </span>
      </dd>
    </>
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
  realMode = false,
  meMemberId,
}: {
  offerings: HydratedOffering[];
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
  offeringCategories: OfferingCategory[];
  /** Per-offering revenue/usage rollup (server-computed) powering the hover
   *  mini-dashboard. */
  commerce?: Record<string, OfferingCommerce>;
  /** Live workspace. The commercial rollups have no contracts behind them
   *  there yet, so the hover dashboard stays in Mock until they do. */
  realMode?: boolean;
  /** Who is reading, so the list can say which of these you own. */
  meMemberId?: string | null;
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
  const ownerOptions = Array.from(
    new Map(
      offerings.flatMap((offering) =>
        (offering.owners || [])
          .filter((owner) => owner.status === "owner")
          .map((owner) => [owner.memberId, owner] as const)
      )
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const initOwner = keepIds(params.get("owner"), (id) =>
    id === "unassigned" || ownerOptions.some((owner) => owner.memberId === id)
  );
  const initGtm = keepIds(params.get("gtm"), (id) =>
    ["available", "coming", "tbd"].includes(id)
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
  const [ownerId, setOwnerId] = useState(initOwner);
  const [gtm, setGtm] = useState(initGtm);
  const [sort, setSort] = useState(initSort);
  /* Direction belongs to the COLUMN HEADINGS, not to the toolbar's Sort
     select, which offers one direction per option and always did. */
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Tile (cards) vs Grid (compact table). Suren's live-meeting ask.
  const [view, setView] = useState<"tile" | "grid">(initView);
  const [viewPreferenceReady, setViewPreferenceReady] = useState(false);

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
    const owner = params.get("owner") || "";
    const gtmValue = params.get("gtm") || "";
    setQ(params.get("q") ?? "");
    const keep = keepIds;
    setCtId(keep(t, (id) => customerTypes.some((c) => c.id === id)));
    setMktId(keep(m, (id) => markets.some((mm) => mm.id === id)));
    setOtId(keep(ot, (id) => offeringTypes.some((tt) => tt.id === id)));
    setCatId(keep(cat, (id) => offeringCategories.some((cc) => cc.id === id)));
    setStatus(keep(s, (id) => ["mapped", "unmapped"].includes(id)));
    setOwnerId(keep(owner, (id) => id === "unassigned" || ownerOptions.some((item) => item.memberId === id)));
    setGtm(keep(gtmValue, (id) => ["available", "coming", "tbd"].includes(id)));
    setSort(SORTS.includes(so) ? so : "default");
    const viewFromUrl = params.get("view");
    if (viewFromUrl === "grid" || viewFromUrl === "tile") {
      setView(viewFromUrl);
    } else {
      try {
        const savedView = localStorage.getItem("freyr.offerings.layout.v1");
        setView(savedView === "grid" ? "grid" : "tile");
      } catch {
        setView("tile");
      }
    }
    setViewPreferenceReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // A display preference is personal UI state, so it saves immediately and
  // never asks the user to hunt for a separate Save button. An explicit view
  // in a shared URL still wins for that visit.
  useEffect(() => {
    if (!viewPreferenceReady) return;
    try {
      localStorage.setItem("freyr.offerings.layout.v1", view);
    } catch {}
  }, [view, viewPreferenceReady]);

  /** Somebody actually owns it — a granted owner, not a pending request. */
  /**
   * YOURS, SAID OUT LOUD (Anir, Aug 21: "I just added myself as an owner to
   * Freya.Submit... it's not giving me any indication that I own this, so
   * that's a problem. It has to visibly show something — maybe have the purple
   * crown"). Purple is the colour ownership already wears everywhere in this
   * app, so it is the crown, not a new invention.
   */
  const ownedByMe = (o: HydratedOffering) =>
    Boolean(
      meMemberId &&
        (o.owners || []).some(
          (owner) => owner.status === "owner" && owner.memberId === meMemberId
        )
    );

  const hasOwner = (o: HydratedOffering) =>
    (o.owners || []).some((owner) => owner.status === "owner");
  /** The tile view's default split: owned offerings first, unowned last.
   *  Deliberately NOT a sort option — it is how the tile view always reads. */
  const ownerGroupsOf = (items: HydratedOffering[]) => {
    const assigned = items.filter(hasOwner);
    const unassigned = items.filter((o) => !hasOwner(o));
    return [
      { key: "assigned" as const, label: "Assigned Offering Owners", items: assigned },
      { key: "unassigned" as const, label: "Unassigned", items: unassigned },
    ].filter((g) => g.items.length > 0);
  };
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
  const ownerIds = ownerId ? ownerId.split(",") : [];
  const gtmStatuses = gtm ? gtm.split(",") : [];
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
        ownerIds.length &&
        !ownerIds.some((id) =>
          id === "unassigned"
            ? !(o.owners || []).some((owner) => owner.status === "owner")
            : (o.owners || []).some((owner) => owner.status === "owner" && owner.memberId === id)
        )
      ) return false;
      if (gtmStatuses.length && !gtmStatuses.includes(goToMarketStatus(o))) return false;
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
  }, [offerings, q, ctId, mktId, otId, catId, status, ownerId, gtm]);
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
    else if (sort === "owner")
      arr.sort((a, b) => {
        const name = (o: HydratedOffering) =>
          (o.owners || []).find((owner) => owner.status === "owner")?.name ?? "";
        // Unowned last in ascending order: an empty string would otherwise
        // sort to the top and bury the rows a rep can act on.
        const an = name(a);
        const bn = name(b);
        if (!an !== !bn) return an ? -1 : 1;
        return an.localeCompare(bn) || a.offering_name.localeCompare(b.offering_name);
      });
    else if (sort === "materials")
      arr.sort(
        (a, b) =>
          b.materials.length - a.materials.length ||
          a.offering_name.localeCompare(b.offering_name)
      );
    else if (sort === "gtm") {
      /* Sellable first, then what is coming, then what nobody has decided —
         the order a rep reads a catalogue in, not alphabetical order of the
         status words. */
      const RANK: Record<string, number> = { available: 0, coming: 1, tbd: 2 };
      arr.sort(
        (a, b) =>
          (RANK[goToMarketStatus(a)] ?? 3) - (RANK[goToMarketStatus(b)] ?? 3) ||
          a.offering_name.localeCompare(b.offering_name)
      );
    }
    else
      /* "default": OWNED FIRST, UNOWNED LAST (Saras, Aug 21: "the top group
         would be offerings with assigned owners... the second group will be
         offerings with unassigned owners, and all of them will show at the
         bottom. That's just one default grouping that will show for now").
         
         An offering with an owner is one a rep can act on: there is somebody
         to ask. It used to lead with the fully-detailed ones instead, which
         answered a different question — how complete is the catalogue —
         nobody opens this page to ask. Detail is the tiebreak inside each
         group, and array sort is stable, so the sheet's own order survives
         underneath both. */
      arr.sort(
        (a, b) =>
          Number(hasOwner(b)) - Number(hasOwner(a)) ||
          Number(isMapped(b)) - Number(isMapped(a))
      );
    /* The comparators above are written ascending; a heading asking for Z-A
       reverses the finished list rather than doubling every comparator. The
       toolbar select never sets desc, so its behaviour is untouched. */
    return sortDir === "desc" && sort !== "default" ? arr.reverse() : arr;
  }, [filtered, sort, sortDir]);

  /** A column heading asked to sort. Same state the toolbar's select drives. */
  const applyColumnSort = (key: string, dir: "asc" | "desc") => {
    setSort(key);
    setSortDir(dir);
  };

  const activeFilters = !!(q || ctId || mktId || otId || catId || status || ownerId || gtm);
  // Market and completeness arrive as self-clearing chips (see the filter bar).
  // When they are the ONLY thing filtering, a separate Clear button is a second
  // control for the same job, and its 85px is what pushed the sort / view /
  // export cluster onto a second line (Anir, Jul 28: "this should just be one
  // row"). Everything else still gets the Clear button.
  const chipFiltersOnly = !q && !ctId && !otId && !catId && !ownerId && !gtm && !!(mktId || status);
  const clearAll = () => {
    setQ("");
    setCtId("");
    setMktId("");
    setOtId("");
    setCatId("");
    setStatus("");
    setOwnerId("");
    setGtm("");
  };

  // Name the export by its active filter so repeated exports (Europe, then
  // Pharma-Large) don't all land as "freyr-offerings (1).csv" in Suren's
  // Downloads. Unfiltered stays "freyr-offerings.csv".
  // The CSV export went with the toolbar's download button (Anir, Aug 7:
  // "we don't need an export download button at all"). Reports still exports.

  const renderCard = (o: HydratedOffering, i: number) => {
    /**
     * THE CATEGORY'S COLOUR, ON THREE THINGS (Saras, Aug 24: "maybe a midway
     * between what it was earlier and what it is currently — the category
     * names in different font colours based on the categories, and the
     * borders of the box and this line the same colour as the font").
     *
     * The tile went fully neutral on Aug 21 because it was over-coloured, and
     * that traded one problem for another: a wall of identical grey cards
     * with no way to tell one family from another at a glance. This is the
     * middle: colour carries exactly one meaning — which category this is —
     * and it says it three times quietly (the eyebrow, the card's edge, the
     * rule under the name) rather than once loudly in a pastel blob.
     */
    const catColor = o.offering_category
      ? categoryColorByName[o.offering_category] || "#2563EB"
      : null;
    /** The edge and the rule are TINTS of the eyebrow's colour, not the colour
     *  itself: at full strength a 1px box around every card turns a grid of 31
     *  into a highlighter set. The eyebrow stays solid so the hue is stated
     *  once, clearly, and echoed twice quietly. */
    const catEdge = catColor ? `${catColor}59` : undefined; // 35%
    const catRule = catColor ? `${catColor}7A` : undefined; // 48%
    const mapped =
      o.customerTypes.length > 0 ||
      o.markets.length > 0 ||
      o.materials.length > 0;
    // Suren's change #3: customer type is the primary qualifier. Lead the card
    // with the customer-type families it's for; the offering type moves below.
    const com = commerce?.[o.id];
    const mixSyncId = `offering-mix-${o.id}`;
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
          accent={catEdge}
          summary={
            /* SMALLER TILES (Saras, Aug 21: "reducing the size of the tile
               and keeping them slightly smaller"). With the icon and the
               description gone there was nothing left holding the old height,
               so the card was mostly padding. Tighter rhythm, one more column
               on a wide screen, more of the catalogue on one screen. */
            <div className="flex flex-col gap-2.5">
          {/* Offering name is the primary element (Suren's live-meeting ask,
              the customer-type families move down so they don't compete). */}
          {/* THE TILE IS TEXT NOW (Saras, Aug 21, relaying four or five reps:
              the page is busy and over-coloured, they want minimal). "Within
              the tiles themselves, let's remove these icons. We can also
              remove the partial description." What stays is exactly her list:
              the category heading, the name, the availability, the type, the
              customers, the owner, and the material count. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="min-w-0">
                {/* CATEGORY IS AN EYEBROW, not a chip. It is the top-level
                    grouping and it already colours the tile's icon, so saying
                    it again as a pastel blob below was the loudest of three
                    competing pills. Up here it names the group before you read
                    the product, in the group's own colour. */}
                {o.offering_category && (
                  <p
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.07em]"
                    style={{ color: catColor ?? undefined }}
                  >
                    <span className="min-w-0 break-words">{o.offering_category}</span>
                  </p>
                )}
                <h3 className="flex items-start gap-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-text-primary">
                  <span className="min-w-0">{o.offering_name}</span>
                  {/* YOURS, SAID OUT LOUD (Anir, Aug 21: "I just added myself
                      as an owner to Freya.Submit... it's not giving me any
                      indication that I own this, so that's a problem. It has
                      to visibly show something — maybe have the purple
                      crown"). Purple is the colour ownership already wears in
                      this app, so it is the crown, not a new invention. */}
                  {ownedByMe(o) && (
                    <PriorityTooltip label="You own this offering">
                      <Crown
                        size={13}
                        strokeWidth={2.5}
                        aria-label="You own this offering"
                        className="mt-[3px] shrink-0 text-[color:#7C3AED]"
                      />
                    </PriorityTooltip>
                  )}
                </h3>
              </div>
            </div>
            {/* The arrow joins the colour scheme rather than staying the one
                grey thing left on the card (Saras, Aug 24: "maybe the arrows
                can have the colours same as the category colours"). Dimmed at
                rest so it never competes with the name, full strength under
                the cursor, which also makes the whole card feel clickable. */}
            <ChevronRight
              size={16}
              strokeWidth={1.6}
              style={{ color: catColor ?? undefined }}
              className="shrink-0 text-text-tertiary opacity-55 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100"
            />
          </div>
          {/* THE LINE COMES STRAIGHT UNDER THE NAME (Saras, Aug 24: "can we
              shift this below? This line should move up — directly under the
              name of the offering"). It used to sit below the availability
              pill and above the owner, which put the card's one rule in the
              middle of the facts rather than under its title. The pill moves
              into the fact list as its own row, so everything below the rule
              is a labelled row and nothing floats. */}
          <div
            className="-mt-0.5 h-px w-full"
            style={{ background: catRule ?? "var(--border-light)" }}
          />

          <div className="mt-auto space-y-2">
            {/* TWO ROWS, ALWAYS THE SAME TWO ROWS. These used to be a
                flex-wrap row of chips, so where a card broke depended on how
                long its labels happened to be — no two cards in the grid
                lined up (Anir, Aug 7: "it looks atrocious when they're all
                disorganized, sometimes stacked and sometimes not"). A fixed
                label column removes the variance entirely: every card has the
                same skeleton whatever the text length, and the colour + icon
                rule survives on the value. */}
            {/* 54px, not 34: "Owner" with its crown is the widest label of the three,
                and at 34 the first avatar overlapped the word (Anir, Aug 9: "the
                profile picture is literally intersecting"). One column width for
                all three rows is the whole point of the grid. */}
            {/* TYPE AND FOR ARE OFF THE TILE (Saras, Aug 21: "in the tile
                view you had to remove the type and For entirely"). Both are
                columns in the list view for anybody comparing on them; on a
                card they were four lines of tagging above the one fact a rep
                opens a tile for, which is who owns it. */}
            <dl className="grid grid-cols-[54px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5">
              {/* OWNER IS A THIRD ROW OF THE SAME GRID, not a strip below it.
                  Standing outside the label column, one owner sat inline and
                  two long names wrapped, so no two cards agreed (Anir, Aug 9:
                  "sometimes it's on the next line, sometimes it's on the first
                  line — there has to be a set way, just like you did for the
                  type and the for"). Now the label column is fixed and the
                  names stack under one another however long they are. */}
              <OwnerRows owners={o.owners} offeringName={o.offering_name} />
              {/* GTM STATUS IS A LABELLED ROW (Saras, Aug 24: "below Owner
                  you can just add another title called GTM Status, and there
                  just show this Available now"). It was a loose pill floating
                  above the fact grid, so the one thing every card has in
                  common was the one thing that did not line up between
                  cards. */}
              {o.current_availability && (
                <>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                    GTM
                  </dt>
                  <dd className="min-w-0">
                    <AvailabilityPill value={o.current_availability} size="sm" />
                  </dd>
                </>
              )}
            </dl>
            {/* POC is off the card (Anir, Aug 7: "you can remove the POC
                aspect"). Owner is the person a rep needs from a tile; the
                delivery contact belongs on the offering itself. */}
            {/* Just the count. The little format icons said "there is a video
                and some documents in here" without saying how many of what,
                so they read as decoration next to a number that already tells
                the story (Anir, Aug 7: "you can remove those icons, just have
                sales material number"). */}
            {o.materials.length > 0 && (
              <p className="text-[11px] text-text-tertiary">
                {o.materials.length} material
                {o.materials.length === 1 ? "" : "s"}
              </p>
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
              {/* THE COMMERCIAL HALF IS MOCK-ONLY. On the live workspace
                  every one of these reads 0 — no contracts are recorded yet —
                  so the panel was four zeros where a rep expects substance
                  (Anir, Aug 7: "what does the licensed seats part mean? that's
                  all old… remove the bottom half"). It stays in Mock because
                  it is where the product is going, not something we dropped
                  ("if she says we're going to need it later, keep it on mock
                  mode, just remove it from real"). */}
              {!realMode && (
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

                </>
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

  const ownerGroups = ownerGroupsOf(sorted);

  const inputCls =
    "h-10 rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary transition-shadow focus:outline-none focus:border-blue-subtle focus:shadow-input-focus";

  return (
    <div>
      {/* Filter bar, search priority (Suren, Jul 27): pressing the search
          compresses every control to its right, and this box is already
          `flex-1`, so it simply absorbs the width they release. */}
      <SearchPriority
        query={q}
        className="rise-in rounded-xl border border-border-light bg-[var(--surface)] p-2.5 mb-4 flex flex-nowrap items-center gap-2.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* IDENTICAL TO PageToolbar's SEARCH, DOWN TO THE CLASS STRING (Anir,
            Aug 24: "keep the search bar consistent everywhere — whatever you
            have in FDL Components is good, put that on Offerings and everywhere
            else where that search bar with the filter is there").

            It was briefly capped at 380px to stop it stretching across a wide
            row (Saras, earlier the same call), and that made this the one page
            whose search was a different width from every other page's. Between
            "shorter" and "the same as everywhere else", he picked the same:
            consistency is the thing a rep notices moving between pages. Back to
            `min-w-[200px] flex-1`, which is what PageToolbar gives FDL
            Components, Opportunities, Customers and Team. */}
        <PrioritySearchInput
          grow
          value={q}
          onChange={setQ}
          placeholder="Search offerings…"
          ariaLabel="Search offerings"
          iconSize={16}
          className="min-w-[200px] flex-1"
          iconClassName="left-3"
          inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary transition-shadow focus:border-blue-subtle focus:shadow-input-focus focus:outline-none"
        />
        {/* Three dropdowns, one row. Five of them pushed the display cluster
            (sort / view / export) onto a lonely second line (Anir, Jul 28:
            "this should just be one row… you don't need all these
            selectors"). Markets and completeness were the two that went: both
            already have one-click entry points elsewhere (the market chips on
            each card, the "awaiting details" stat card), and both still filter
            from the URL, they just name themselves as a clearable chip below
            instead of owning a permanent control. */}
        {/* ONE BUTTON, TWO LAYERS (Saras, Aug 21, carrying rep feedback that
            named this twice: "what these e-commerce websites do — they keep
            the filters in two layers. First they just show a button called
            Filter, and only when you click on that they show you filter by
            category, by type, by GTM status"). Five permanently-open coloured
            selects were the single biggest source of the "busy and
            over-coloured" complaint, and they were on screen whether or not
            anybody was filtering. */}
        <FilterMenu
          onClearAll={clearAll}
          groups={[
            {
              key: "category",
              label: "Category",
              values: catId ? catId.split(",") : [],
              onChange: (next) => setCatId(next.join(",")),
              options: offeringCategories.map((c, i) => ({
                value: c.id,
                label: c.name,
                color: FILTER_PALETTE[i % FILTER_PALETTE.length],
              })),
            },
            {
              key: "type",
              label: "Type",
              values: otId ? otId.split(",") : [],
              onChange: (next) => setOtId(next.join(",")),
              options: offeringTypes.map((t, i) => ({
                value: t.id,
                label: t.name,
                color: FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length],
              })),
            },
            {
              key: "gtm",
              label: "GTM status",
              values: gtmStatuses,
              onChange: (next) => setGtm(next.join(",")),
              options: [
                { value: "available", label: "Available Now", color: "#059669" },
                { value: "coming", label: "Coming Soon", color: "#C2410C" },
                { value: "tbd", label: "To Be Decided", color: "#4338CA" },
              ],
            },
            {
              key: "owner",
              label: "Owner",
              values: ownerIds,
              onChange: (next) => setOwnerId(next.join(",")),
              options: [
                ...ownerOptions.map((owner) => ({
                  value: owner.memberId,
                  label: owner.name,
                  avatarName: owner.name,
                })),
                { value: "unassigned", label: "Not assigned", color: "#64748B" },
              ],
            },
            {
              key: "customer",
              label: "Customer",
              values: ctIds,
              onChange: (next) => setCtId(next.join(",")),
              options: customerTypes.map((c) => ({
                value: c.id,
                label: c.name,
                color: familyColor((c as { family?: string }).family || c.name),
              })),
            },
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
        {activeFilters && !chipFiltersOnly && (
          <PriorityTooltip label="Clear filters">
            <button
              onClick={clearAll}
              aria-label="Clear filters"
              className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </PriorityTooltip>
        )}
        </div>
        {/* Sort, view and export live IN the filter bar, two stacked control
            rows read as clutter (Anir, Jul 25: "everything should be on one
            row, and it should look beautiful"). ml-auto keeps this display
            cluster docked right; the bar wraps gracefully when narrow. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-border-light pl-2.5">

          {/* Sort, a display control, so it lives here with view + export rather
              than wrapping onto a lonely second line under the filters. */}
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
            Sort
          </span>
          <ColorSelect
            value={sort}
            onChange={setSort}
            ariaLabel="Sort offerings"
            minWidth={150}
            dense
            collapsible={false}
            className="w-[150px] shrink-0"
            options={[
              /* EVERY OPTION READS AS "SORT BY ..." (Saras, Aug 24: "can we
                 just have 'Sort by recommended' — adding the word by before
                 recommended, also before name, and in the brackets just say
                 A to Z"). Three of the five already began with "By"; the two
                 that did not read as labels rather than as an instruction the
                 word SORT beside them completes. And "(A, Z)" was shorthand
                 for a phrase nobody shortens out loud. */
              { value: "default", label: "By recommended", color: "#0071E3", icon: SortSpark },
              { value: "name", label: "By name (A to Z)", color: "#7C3AED", icon: ArrowDownAZ },
              { value: "category", label: "By category", color: "#0F6E56", icon: SortLayers },
              { value: "type", label: "By type", color: "#F97316", icon: SortPackage },
              /* "Most complete" is gone (Saras, Aug 21: "this isn't really the
                 most complete offering currently — Freya.Register is, and that
                 isn't showing up at the top... we can also actually remove
                 this sort option"). It ranked on whether three fields were
                 non-empty, which is not what a reader means by complete, and a
                 sort nobody can predict is worse than no sort. GTM status
                 takes its place: what a rep can sell now, next, and later. */
              { value: "gtm", label: "By GTM status", color: "#059669", icon: Rocket },
            ]}
          />
          {/* ONE BUTTON, NOT TWO. A two-button segmented control spent twice
              the width to say the same thing, and the row needed that width
              for "GTM status" to spell itself out (Anir, Aug 7: "make the
              tiles or the list view one thing so it saves some space, so the
              go-to-market status shows up entirely"). The icon shows where
              the click takes you, and the label says it out loud. */}
          <ViewSelect
            value={view}
            onChange={setView}
            tileValue="tile"
            tableValue="grid"
          />
          {/* Export is off the toolbar until there is a catalogue worth
              exporting (Anir, Aug 7: "remove the download button for now,
              we only have one offering that's ready"). exportCsv still
              exists, so putting it back is one line. */}
        </div>
      </SearchPriority>

      {/* HOW MANY AM I LOOKING AT. Always on, not only while a filter is set,
          so the number never appears and disappears (Anir, Aug 7: "show how
          many offerings are showing up when you click that… always show the
          number of offerings, even when no filter"). */}
      {offerings.length > 0 && (
        /* Same size and rhythm as the Customers count line, which is the one
           he holds up as right. The -mt-1 pulled it against the toolbar and
           mb-3 left less air below than above, which is the "odd amount of
           space below the search bar".

           The pin rides on the right of this line in table view. In the corner
           of the table it permanently covered the last column header, and this
           line is already here, already the table's width, and already right
           above the header it controls (Anir, Aug 14). */
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-secondary">
            Showing{" "}
            <span className="font-semibold text-text-primary tnum">
              {sorted.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-text-primary tnum">
              {offerings.length}
            </span>{" "}
            offering{offerings.length === 1 ? "" : "s"}
            {sorted.length !== offerings.length ? " · filters applied" : ""}
          </p>
          {view === "grid" && (
            <PinTableButton id="offerings-grid" label="column headers" compact />
          )}
        </div>
      )}

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
          <PinnableTable id="offerings-grid" showCornerPin={false}>
            {/* table-fixed + explicit widths. The min-width was 1280px, wider
                than the card on a 1512 screen, so the table always scrolled and
                the last column sat half off the edge (Anir, Jul 28: "it's not
                really properly aligned, especially in the last column"). It now
                fits, and Category is wide enough to hold its longest name,
                "Submissions and Document Operations", on ONE line. */}
            {/* 1120, DOWN FROM 1280 (Anir, Aug 24, at 100% zoom: "there's a
                lot of white space in between columns — can we make them more
                compact, maybe try to have all the columns show up at 100%
                zoom, or if not all, at least one more?").

                The 1280 was bought to keep Category and Type on two lines
                instead of three. What paid the 160px back is the offering NAME
                column, which he then released: "for the offering name I think
                it's big — is that why it's doing that? It's fine if that wraps
                around... the row height is high anyway, so they can use that
                space to make the columns compact." Name drops 19% → 15% and
                spends the slack on the two columns that were wrapping, and the
                cell padding tightens from px-4 to px-3 — another ~56px of pure
                gutter across seven columns. */}
            <table className="w-full min-w-[1120px] table-fixed text-[13px] border-collapse [&_td]:px-3 [&_th]:px-3">
              <thead>
                {/* WIDTHS SIZED TO THE HEADINGS, NOT JUST THE CELLS (Anir,
                    Aug 9: MATERIALS was printing straight through REVENUE).
                    "Materials" held 5% while its own uppercase, letter-spaced
                    heading needs roughly twice that, so the word overflowed
                    into the next column. whitespace-nowrap makes any future
                    mistake here show up as a scroll rather than as two words
                    on top of each other. */}
                {/* 12.5px, UP FROM 11 (Saras, Aug 24: "can we also increase
                    the font size of these column headers?"). At 11px with
                    letter-spacing they read as a caption above the table
                    rather than as the names of its columns. */}
                <tr className="border-b border-border-light text-left text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary [&>th]:whitespace-nowrap">
                  {/* px-4 like every other column: the header text must start
                      exactly where the cell text below it starts. */}
                  {/* EXCEL'S OWN AFFORDANCE (Saras, Aug 21: "in the list
                      view, can we just put the filters and sorting in the
                      title of each column — like how we do it in Excel, where
                      the header row itself lets you filter or sort. That would
                      be more familiar for any rep. Only for the list view, for
                      tile view we can retain it as it is").

                      Same state as the toolbar's Filter button, so a filter
                      set in one place shows in the other and the two can never
                      disagree with what is on screen. */}
                  <th className="px-4 py-2.5 w-[15%]">
                    <ColumnHeaderMenu
                      label="Offering"
                      sortKey="name"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[13%]">
                    <ColumnHeaderMenu
                      label="Owner"
                      sortKey="owner"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                      values={ownerIds}
                      onValues={(next) => setOwnerId(next.join(","))}
                      options={[
                        ...ownerOptions.map((owner) => ({
                          value: owner.memberId,
                          label: owner.name,
                          avatarName: owner.name,
                        })),
                        { value: "unassigned", label: "Not assigned", color: "#64748B" },
                      ]}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[19%]">
                    <ColumnHeaderMenu
                      label="Category"
                      sortKey="category"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                      values={catId ? catId.split(",") : []}
                      onValues={(next) => setCatId(next.join(","))}
                      options={offeringCategories.map((c, i) => ({
                        value: c.id,
                        label: c.name,
                        color: FILTER_PALETTE[i % FILTER_PALETTE.length],
                      }))}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[15%]">
                    <ColumnHeaderMenu
                      label="Type"
                      sortKey="type"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                      values={otId ? otId.split(",") : []}
                      onValues={(next) => setOtId(next.join(","))}
                      options={offeringTypes.map((t, i) => ({
                        value: t.id,
                        label: t.name,
                        color: FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length],
                      }))}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[12%]">
                    <ColumnHeaderMenu
                      label="Availability"
                      sortKey="gtm"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                      ascLabel="Sellable first"
                      descLabel="Undecided first"
                      values={gtmStatuses}
                      onValues={(next) => setGtm(next.join(","))}
                      options={[
                        { value: "available", label: "Available Now", color: "#059669" },
                        { value: "coming", label: "Coming Soon", color: "#C2410C" },
                        { value: "tbd", label: "To Be Decided", color: "#4338CA" },
                      ]}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[16%]">
                    <ColumnHeaderMenu
                      label="Who it's for"
                      values={ctIds}
                      onValues={(next) => setCtId(next.join(","))}
                      options={customerTypes.map((c) => ({
                        value: c.id,
                        label: c.name,
                        color: familyColor((c as { family?: string }).family || c.name),
                      }))}
                    />
                  </th>
                  <th className="px-4 py-2.5 w-[10%]">
                    <ColumnHeaderMenu
                      label="Materials"
                      sortKey="materials"
                      activeSortKey={sort}
                      sortDir={sortDir}
                      onSort={applyColumnSort}
                      ascLabel="Most first"
                      descLabel="Fewest first"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  /* A POP OF COLOUR ON THE LEFT EDGE (Saras, Aug 24: "if you
                     choose pink for GRI, maybe we can have this much of the
                     border just be pink — just some distinction here, very
                     subtle, but it still brings a pop of colour and some
                     visual aid to 'okay, this belongs to this category'").
                     A GRADIENT, NOT A BORDER OR AN INSET SHADOW. Two reasons.
                     A real border-left shifts every column by 3px and breaks
                     the sticky header strip's cloned widths. And a full-height
                     stripe butts against its neighbours' stripes, so a run of
                     same-category rows fused into one unbroken bar down the
                     page (Anir, Aug 24: "I don't like this — can you give a
                     little bit of a gap so it doesn't look like that? It's
                     just one big rectangle"). The gradient insets the stripe
                     8px top and bottom, so each row's mark is its own. */
                  const rowAccent = o.offering_category
                    ? categoryColorByName[o.offering_category] || null
                    : null;
                  const fams = Array.from(
                    new Set(o.customerTypes.map((c) => c.family as string))
                  );
                  const famList = [
                    ...FAMILY_ORDER.filter((f) => fams.includes(f)),
                    ...fams.filter((f) => !FAMILY_ORDER.includes(f)),
                  ];
                  const grantedOwners = (o.owners || []).filter(
                    (owner) => owner.status === "owner"
                  );
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-border-light last:border-0 align-middle hover:bg-[var(--surface)] transition-colors"
                    >
                      <td
                        className="px-4 py-3.5"
                        style={
                          rowAccent
                            ? {
                                backgroundImage: `linear-gradient(to bottom, transparent 0 8px, ${rowAccent} 8px calc(100% - 8px), transparent calc(100% - 8px) 100%)`,
                                backgroundSize: "3px 100%",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "left center",
                              }
                            : undefined
                        }
                      >
                        {/* Just the name. The tile icon went with the rest of
                            them (Saras, Aug 21: "same thing — if we can, just
                            remove all the icons"). */}
                        <span className="flex min-w-0 items-start gap-1.5">
                          <Link
                            href={`/offerings/${o.id}`}
                            className="group/name -m-1.5 block min-w-0 rounded-xl p-1.5 text-[13.5px] font-semibold leading-[1.35] text-text-primary transition-colors hover:bg-blue-light/60 group-hover/name:text-blue-primary"
                          >
                            {o.offering_name}
                          </Link>
                          {ownedByMe(o) && (
                            <PriorityTooltip label="You own this offering">
                              <Crown
                                size={13}
                                strokeWidth={2.5}
                                aria-label="You own this offering"
                                className="mt-[3px] shrink-0 text-[color:#7C3AED]"
                              />
                            </PriorityTooltip>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {/* NAMES, NOT A HUDDLE OF FACES (Saras, Aug 21:
                            "instead of the icons, let's just keep their names
                            showing up"). Overlapping avatars answered "how
                            many" when the column exists to answer "who" — you
                            had to hover each one to read a name. The face
                            stays beside the name, because a name in this app
                            comes with a face (Anir, overruling the ask to drop
                            them). */}
                        {grantedOwners.length > 0 ? (
                          <span className="flex min-w-0 flex-col gap-1">
                            {grantedOwners.map((owner) => (
                              <PersonHoverCard
                                key={owner.memberId || owner.name}
                                name={owner.name}
                                role={owner.role || "Owns this offering"}
                                context={o.offering_name}
                              >
                                <span className="hover-yield inline-flex min-w-0 items-center gap-1.5">
                                  <Avatar
                                    name={owner.name}
                                    className="h-5 w-5 shrink-0 text-[7px]"
                                  />
                                  <span className="min-w-0 break-words text-[12.5px] text-text-primary">
                                    {shortPersonName(owner.name)}
                                  </span>
                                </span>
                              </PersonHoverCard>
                            ))}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* PLAIN BLACK (Saras, Aug 21, second pass: "no
                            colours, no background colours in the category
                            column and type column — no font colours also,
                            just black, plain black text"). The first pass kept
                            the tinted chips; with everything else stripped
                            they were the only colour left and became the
                            loudest thing on the row. */}
                        {o.offering_category ? (
                          <span className="inline-flex max-w-full items-start text-[12px] leading-snug text-text-primary">
                            {/* COLOUR STAYS, THE GLYPH GOES (Saras, Aug 21:
                                "remove all the colours here, except the
                                background colour and the text of the category
                                column options — same for the type options").
                                The chip rule that put an icon here in August
                                was written for a page that no longer has forty
                                other icons competing with it. */}
                            <span
                              title={o.offering_category}
                              className="line-clamp-2 min-w-0 whitespace-normal break-words"
                            >
                              {o.offering_category}
                            </span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{o.offering_category || "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {o.offering_type ? (
                          <span className="inline-flex max-w-full items-start text-[12px] leading-snug text-text-primary">
                            <span
                              title={o.offering_type}
                              className="line-clamp-2 min-w-0 whitespace-normal break-words"
                            >
                              {o.offering_type}
                            </span>
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
                        {/* PLAIN TEXT (Saras, Aug 21: "let's also remove the
                            background colours of the Who it's for column,
                            we'll just keep them simple — black text, no
                            background colour"). Five tinted pills per row, on
                            every row, was the loudest block on the page. */}
                        {/* ONE PER LINE (Anir, Aug 21: "put each on one
                            line"). Joined with separators the five families
                            wrapped mid-name — "Bio / Pharmaceutical" split
                            across two rows — so the column read as a
                            paragraph instead of a list. */}
                        {famList.length ? (
                          <span className="flex flex-col gap-0.5 text-[12px] leading-snug text-text-primary">
                            {famList.map((f) => (
                              <span key={f} className="break-words">
                                {f}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tnum">
                        {/* HOVER THE COUNT, SEE WHAT IS IN IT (Anir, Aug 15:
                            "when I hover over this number on the Offerings
                            page, I would like to see, similar to the Sales
                            Material page... all the materials in a row"). The
                            same FolderPeek the Sales Materials tab uses, so
                            the folders, their counts and the drill-down all
                            behave identically. Clicking still opens the
                            offering's own materials tab. */}
                        {o.materials.length ? (
                          <FolderPeek
                            path=""
                            materials={o.materials}
                            folderPaths={allFolders(o.materials)}
                            onOpenFolder={() => {
                              window.location.href = `/offerings/${o.id}#materials`;
                            }}
                            onOpenMaterial={(material: OfferingMaterial) => {
                              // An UPLOADED file opens on its own viewer page
                              // in a new tab — the same in-app viewer the
                              // Sales Materials page uses, which renders Word
                              // and PowerPoint as HTML instead of dropping a
                              // file in Downloads (Anir, Aug 18: "why the fuck
                              // is it downloading"). A pasted link opens where
                              // it points; only a row with neither falls back
                              // to the offering's materials tab.
                              if (material.docsPath) {
                                window.open(
                                  `/offerings/${o.id}/materials/${encodeURIComponent(material.id)}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              } else if (material.url) {
                                window.open(
                                  material.url,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              } else {
                                window.location.href = `/offerings/${o.id}#materials`;
                              }
                            }}
                          >
                            <Link
                              href={`/offerings/${o.id}#materials`}
                              className="inline-flex cursor-pointer items-center rounded-full bg-blue-light px-2 py-0.5 text-[11.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-subtle/40"
                            >
                              {o.materials.length}
                            </Link>
                          </FolderPeek>
                        ) : (
                          <span className="text-text-tertiary">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PinnableTable>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 items-stretch">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 items-stretch">
                {g.items.map((o, i) => renderCard(o, i))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* OWNED FIRST, UNOWNED AFTER — BY DEFAULT, NOT BY CHOICE (Anir, Aug 24:
           "in the tile view, at the top, all the offerings which have assigned
           offering owners will be visible under the heading 'Assigned Offering
           Owners'. Those which don't have any offering owners assigned will be
           displayed at the bottom under the group 'Unassigned'... just a
           default grouping, so nothing else. It doesn't need to be part of any
           filter or any sorting. If anybody is at the tile view, those are the
           two groups that they should see.")

           An unowned offering is a gap in the catalogue, not a category of
           product, and it was scattered through the grid where only a person
           reading every card would notice it. Two headings turn the whole
           backlog into one block you can see the size of. The heading only
           appears when there is something on both sides: on a fully owned
           catalogue, a lone "Assigned Offering Owners" heading over everything
           says nothing. */
        <div key="tile-view" className="tab-panel space-y-6">
          {ownerGroups.map((g) => (
            <div key={g.key}>
              {ownerGroups.length > 1 && (
                <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2.5">
                  {g.key === "assigned" ? (
                    <Crown size={12} strokeWidth={2.2} className="text-[color:#7C3AED]" />
                  ) : (
                    <CircleDashed size={12} strokeWidth={2.2} className="text-text-tertiary" />
                  )}
                  {g.label}
                  <span className="text-text-tertiary/70 tnum">({g.items.length})</span>
                </h2>
              )}
              {/* THREE ACROSS ON A LAPTOP (Saras, on the Aug 24 call with Anir:
                  "when they keep the zoom level at 100%, they should see at
                  least three offerings in a row in the tile view — that's
                  happening in Chrome, but in Edge it's only showing two").

                  Nothing to do with the browser: the third column started at
                  xl (1280px), and Edge's window furniture plus this app's 260px
                  sidebar left her viewport just under it while Chrome's cleared
                  it. A 30px difference in chrome decided how many offerings a
                  rep could see. It starts at lg (1024px) now, which every
                  laptop clears at 100% zoom, and a fourth still arrives at
                  2xl. */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 items-stretch">
                {g.items.map((o, i) => renderCard(o, i))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
