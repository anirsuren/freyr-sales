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
  UserRound,
  Swords,
  BookOpen,
  Quote,
  LayoutGrid,
  Table2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { CustomerType, Market, OfferingType } from "@/lib/offerings";

// Canonical family order so the "who it's for" chips read consistently.
const FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];

// CSV-safe a cell (quote if it has commas/quotes/newlines).
function csv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Sort options — also valid ?sort= deep-link values, kept in sync with the
// rest of the filter bar so a sorted view can be shared/bookmarked.
const SORTS = ["default", "name", "type", "mapped"];

export interface HydratedOffering {
  id: string;
  offering_type: string;
  offering_name: string;
  offering_description: string;
  current_availability: string;
  future_availability: string;
  poc: string;
  early_adopters: string[];
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

export function OfferingsBrowser({
  offerings,
  customerTypes,
  markets,
  offeringTypes,
}: {
  offerings: HydratedOffering[];
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
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
    const s = params.get("status") || "";
    const so = params.get("sort") || "";
    setQ(params.get("q") ?? "");
    setCtId(customerTypes.some((c) => c.id === t) ? t! : "");
    setMktId(markets.some((mm) => mm.id === m) ? m! : "");
    setOtId(offeringTypes.some((tt) => tt.id === ot) ? ot! : "");
    setStatus(["mapped", "unmapped"].includes(s) ? s : "");
    setSort(SORTS.includes(so) ? so : "default");
    setView(params.get("view") === "grid" ? "grid" : "tile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const isMapped = (o: HydratedOffering) =>
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;

  // Offering type is a string on each offering; map the selected id → its name.
  const otName = otId
    ? offeringTypes.find((t) => t.id === otId)?.name ?? ""
    : "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offerings.filter((o) => {
      if (ctId && !o.customerTypes.some((c) => c.id === ctId)) return false;
      if (mktId && !o.markets.some((m) => m.id === mktId)) return false;
      if (otName && o.offering_type !== otName) return false;
      if (status === "mapped" && !isMapped(o)) return false;
      if (status === "unmapped" && isMapped(o)) return false;
      // Search across what's actually on the card — name, type, description,
      // AND the markets / customer types it's mapped to — so typing "Europe" or
      // "pharmaceutical" finds matches instead of looking broken.
      if (
        needle &&
        !`${o.offering_name} ${o.offering_type} ${o.offering_description} ${o.markets
          .map((m) => m.name)
          .join(" ")} ${o.customerTypes.map((c) => c.name).join(" ")}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, q, ctId, mktId, otName, status]);
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

  const activeFilters = !!(q || ctId || mktId || otId || status);
  const clearAll = () => {
    setQ("");
    setCtId("");
    setMktId("");
    setOtId("");
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
    const ct = customerTypes.find((c) => c.id === ctId);
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
      "Description",
      "Current Availability",
      "Availability Comments",
      "Early Adopters",
      "Service Delivery POC",
      "Customer Types",
      "Markets",
      "Sales Materials",
    ];
    const rows = sorted.map((o) =>
      [
        o.offering_type,
        o.offering_name,
        o.offering_description,
        o.current_availability,
        o.future_availability,
        o.early_adopters.join("; "),
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
    return (
      <Link
        key={o.id}
        href={`/offerings/${o.id}`}
        className="group rise-in flex h-full rounded-lg"
        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
      >
        <Card
          className={`h-full w-full p-5 flex flex-col gap-3 transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] group-hover:border-blue-subtle group-focus-visible:-translate-y-1 group-focus-visible:shadow-[0_8px_24px_rgba(0,0,0,0.07)] group-focus-visible:border-blue-subtle ${
            mapped ? "" : "bg-surface/40"
          }`}
        >
          {/* Offering name is the primary element (Suren's live-meeting ask —
              the customer-type families move down so they don't compete). */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[16px] font-semibold text-text-primary leading-snug tracking-[-0.01em]">
              {o.offering_name}
            </h3>
            <ChevronRight
              size={16}
              strokeWidth={1.6}
              className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 group-focus-visible:text-blue-primary group-focus-visible:translate-x-0.5 transition-transform shrink-0 mt-0.5"
            />
          </div>
          {o.offering_description && (
            <p className="text-[12.5px] text-text-secondary line-clamp-2 leading-relaxed">
              {o.offering_description}
            </p>
          )}

          {(o.current_availability || o.future_availability) && (
            <div className="flex flex-wrap gap-1.5">
              {o.current_availability &&
                (/current|now|available/i.test(o.current_availability) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success/10 rounded-md px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    {o.current_availability}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning bg-warning/10 rounded-md px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    {o.current_availability}
                  </span>
                ))}
              {/* Availability comments — neutral, it's a note not a date */}
              {o.future_availability && (
                <span className="inline-flex items-center text-[11px] font-medium text-text-secondary bg-surface border border-border-light rounded-md px-2 py-0.5">
                  {o.future_availability}
                </span>
              )}
            </div>
          )}

          <div className="mt-auto pt-3 border-t border-border-light space-y-2">
            {/* Offering type */}
            {o.offering_type && (
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                <Sparkles
                  size={11}
                  strokeWidth={2}
                  className="text-text-tertiary"
                />
                {o.offering_type}
              </p>
            )}
            {/* Who it's for — de-emphasized so it doesn't take away from the name */}
            {hasCt && (
              <p className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
                <Users size={11} strokeWidth={1.8} className="mt-[1px] shrink-0" />
                <span>{families.join(" · ")}</span>
              </p>
            )}
            {/* Markets */}
            {o.markets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {o.markets.slice(0, 4).map((m) => (
                  <span
                    key={m.id}
                    className="text-[10.5px] font-medium text-text-secondary bg-surface rounded px-1.5 py-0.5"
                  >
                    {m.name}
                  </span>
                ))}
                {o.markets.length > 4 && (
                  <span className="text-[10.5px] text-text-tertiary self-center">
                    +{o.markets.length - 4}
                  </span>
                )}
              </div>
            )}
            {/* Early adopters — customers piloting/using it first */}
            {o.early_adopters.length > 0 && (
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-primary">
                <Sparkles size={11} strokeWidth={2} />
                Early adopter{o.early_adopters.length === 1 ? "" : "s"}:{" "}
                {o.early_adopters.join(", ")}
              </p>
            )}
            {/* Service-delivery POC */}
            {o.poc && (
              <p className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                <UserRound size={11} strokeWidth={1.8} />
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
        </Card>
      </Link>
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

  const inputCls =
    "h-10 rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary transition-shadow focus:outline-none focus:border-blue-subtle focus:shadow-input-focus";

  return (
    <div>
      {/* Filter bar */}
      <div className="rounded-xl border border-border-light bg-surface/50 p-2.5 mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
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
        <select
          value={ctId}
          onChange={(e) => setCtId(e.target.value)}
          aria-label="Filter by customer type"
          className={inputCls}
        >
          <option value="">All customer types</option>
          {customerTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={otId}
          onChange={(e) => setOtId(e.target.value)}
          aria-label="Filter by offering type"
          className={inputCls}
        >
          <option value="">All offering types</option>
          {offeringTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={mktId}
          onChange={(e) => setMktId(e.target.value)}
          aria-label="Filter by market"
          className={inputCls}
        >
          <option value="">All markets</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort offerings"
          className={inputCls}
        >
          <option value="default">Recommended</option>
          <option value="name">Name (A–Z)</option>
          <option value="type">By type</option>
          <option value="mapped">Most complete first</option>
        </select>
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
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[12px] text-text-tertiary tnum">
          Showing {filtered.length} of {offerings.length} offerings
        </p>
        <div className="flex items-center gap-3">
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
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary hover:text-blue-primary transition-colors"
            >
              <Download size={14} strokeWidth={1.9} /> Export CSV
            </button>
          )}
        </div>
      </div>

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
        // Excel so the whole catalog is scannable in rows.
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="px-4 py-2.5">Offering</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Availability</th>
                  <th className="px-4 py-2.5">Who it&apos;s for</th>
                  <th className="px-4 py-2.5">Markets</th>
                  <th className="px-4 py-2.5">Materials</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
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
                      className="border-b border-border-light last:border-0 align-top hover:bg-surface/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/offerings/${o.id}`}
                          className="font-semibold text-text-primary hover:text-blue-primary"
                        >
                          {o.offering_name}
                        </Link>
                        {o.early_adopters.length > 0 && (
                          <span className="block text-[11px] text-blue-primary mt-0.5">
                            Early adopter{o.early_adopters.length === 1 ? "" : "s"}:{" "}
                            {o.early_adopters.join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {o.offering_type || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                        {o.current_availability || "—"}
                        {o.future_availability && (
                          <span className="block text-[11px] text-text-tertiary">
                            {o.future_availability}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {famList.length ? famList.join(" · ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {o.markets.length
                          ? o.markets.map((m) => m.name).join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary tnum">
                        {o.materials.length || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {sorted.map((o, i) => renderCard(o, i))}
        </div>
      )}
    </div>
  );
}
