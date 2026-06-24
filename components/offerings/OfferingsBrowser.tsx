"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Video,
  Presentation,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles,
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
  const [q, setQ] = useState("");
  const [ctId, setCtId] = useState("");
  const [mktId, setMktId] = useState("");

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

  const selectCls =
    "h-9 rounded-md border border-border bg-white px-3 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
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
            className="w-full h-9 rounded-md border border-border bg-white pl-9 pr-3 text-[13px] focus:outline-none focus:shadow-input-focus"
          />
        </div>
        <select
          value={ctId}
          onChange={(e) => setCtId(e.target.value)}
          aria-label="Filter by customer type"
          className={selectCls}
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
          className={selectCls}
        >
          <option value="">All markets</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-text-tertiary mb-3 tnum">
        Showing {filtered.length} of {offerings.length} offerings
      </p>

      {filtered.length === 0 ? (
        <Card className="text-center text-[13px] text-text-secondary py-12">
          No offerings match these filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((o) => {
            const matKinds = Array.from(new Set(o.materials.map((m) => m.kind)));
            return (
              <Link key={o.id} href={`/offerings/${o.id}`} className="group">
                <Card className="h-full p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card hover:border-blue-subtle">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-blue-primary bg-blue-light rounded px-1.5 py-0.5">
                      <Sparkles size={11} strokeWidth={2} />
                      {o.offering_type || "Offering"}
                    </span>
                    <ChevronRight
                      size={16}
                      strokeWidth={1.6}
                      className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                    />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-text-primary leading-snug">
                      {o.offering_name}
                    </h3>
                    {o.offering_description && (
                      <p className="text-[12.5px] text-text-secondary mt-1 line-clamp-2">
                        {o.offering_description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {o.current_availability && (
                      <span className="text-[11px] font-medium text-success bg-success/10 rounded px-1.5 py-0.5">
                        {o.current_availability}
                      </span>
                    )}
                    {o.future_availability && (
                      <span className="text-[11px] font-medium text-warning bg-warning/10 rounded px-1.5 py-0.5">
                        {o.future_availability}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border-light">
                    <div className="flex flex-wrap gap-1">
                      {o.markets.slice(0, 4).map((m) => (
                        <span
                          key={m.id}
                          className="text-[10.5px] font-medium text-text-secondary bg-surface rounded px-1.5 py-0.5"
                        >
                          {m.name}
                        </span>
                      ))}
                    </div>
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

                  <p className="text-[11px] text-text-tertiary">
                    {o.customerTypes.length} customer type
                    {o.customerTypes.length === 1 ? "" : "s"} ·{" "}
                    {o.materials.length} sales material
                    {o.materials.length === 1 ? "" : "s"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
