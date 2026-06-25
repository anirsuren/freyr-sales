"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { CustomerType, Market } from "@/lib/offerings";

export interface HydratedOffering {
  id: string;
  offering_type: string;
  offering_name: string;
  offering_description: string;
  current_availability: string;
  future_availability: string;
  customerTypes: CustomerType[];
  markets: Market[];
  materials: { id: string; kind: string; label: string; url: string }[];
}

const MATERIAL_ICON: Record<string, typeof Video> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
};

export function OfferingsBrowser({
  offerings,
  customerTypes,
  markets,
}: {
  offerings: HydratedOffering[];
  customerTypes: CustomerType[];
  markets: Market[];
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
  const [q, setQ] = useState(params.get("q") ?? "");
  const [ctId, setCtId] = useState(initType);
  const [mktId, setMktId] = useState(initMkt);
  const [sort, setSort] = useState("default");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offerings.filter((o) => {
      if (ctId && !o.customerTypes.some((c) => c.id === ctId)) return false;
      if (mktId && !o.markets.some((m) => m.id === mktId)) return false;
      if (
        needle &&
        !`${o.offering_name} ${o.offering_type} ${o.offering_description}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
  }, [offerings, q, ctId, mktId]);

  const isMapped = (o: HydratedOffering) =>
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;
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
    return arr; // "default" keeps catalog (sheet) order
  }, [filtered, sort]);

  const activeFilters = !!(q || ctId || mktId);
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
          <option value="default">Catalog order</option>
          <option value="name">Name (A–Z)</option>
          <option value="type">By type</option>
          <option value="mapped">Mapped first</option>
        </select>
        {activeFilters && (
          <button
            onClick={() => {
              setQ("");
              setCtId("");
              setMktId("");
            }}
            className="h-10 px-3 rounded-lg text-[13px] font-semibold text-text-secondary hover:text-blue-primary hover:bg-blue-light transition-colors inline-flex items-center gap-1"
          >
            <X size={14} strokeWidth={2} /> Clear
          </button>
        )}
      </div>

      <p className="text-[12px] text-text-tertiary mb-4 tnum">
        Showing {filtered.length} of {offerings.length} offerings
      </p>

      {filtered.length === 0 ? (
        <Card className="text-center py-16">
          <p className="text-[14px] font-medium text-text-primary">
            No offerings match these filters.
          </p>
          <p className="text-[13px] text-text-secondary mt-1">
            Try clearing a filter or widening your search.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {sorted.map((o, i) => {
            const matKinds = Array.from(new Set(o.materials.map((m) => m.kind)));
            const mapped =
              o.customerTypes.length > 0 ||
              o.markets.length > 0 ||
              o.materials.length > 0;
            return (
              <Link
                key={o.id}
                href={`/offerings/${o.id}`}
                className="group rise-in"
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                <Card
                  className={`p-5 flex flex-col gap-3 transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] group-hover:border-blue-subtle ${
                    mapped ? "" : "bg-surface/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-primary bg-blue-light rounded-md px-2 py-1">
                      <Sparkles size={11} strokeWidth={2} />
                      {o.offering_type || "Offering"}
                    </span>
                    <ChevronRight
                      size={16}
                      strokeWidth={1.6}
                      className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5"
                    />
                  </div>
                  <div>
                    <h3 className="text-[15.5px] font-semibold text-text-primary leading-snug tracking-[-0.01em]">
                      {o.offering_name}
                    </h3>
                    {o.offering_description && (
                      <p className="text-[12.5px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                        {o.offering_description}
                      </p>
                    )}
                  </div>

                  {(o.current_availability || o.future_availability) && (
                    <div className="flex flex-wrap gap-1.5">
                      {o.current_availability && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success/10 rounded-md px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          {o.current_availability}
                        </span>
                      )}
                      {o.future_availability && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning bg-warning/10 rounded-md px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                          {o.future_availability}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-border-light">
                    {mapped ? (
                      <>
                        {o.markets.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
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
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-text-tertiary">
                            {o.customerTypes.length} customer type
                            {o.customerTypes.length === 1 ? "" : "s"}
                            {o.materials.length > 0 && (
                              <>
                                {" · "}
                                {o.materials.length} material
                                {o.materials.length === 1 ? "" : "s"}
                              </>
                            )}
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
                      </>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
                        <span className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
                        Not yet mapped — open to add types, markets &amp; materials
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
