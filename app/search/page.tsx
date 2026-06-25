"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Building2, Contact as ContactIcon, Clock, ArrowRight, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getRecent, type RecentItem } from "@/lib/recent";

type Result = { type: string; label: string; sublabel: string; href: string };

function Row({ item }: { item: { type: string; label: string; sublabel?: string; href: string } }) {
  const Icon =
    item.type === "Customer"
      ? Building2
      : item.type === "Contact"
      ? ContactIcon
      : item.type === "Offering"
      ? Package
      : Clock;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group border-b border-border-light last:border-0"
    >
      <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
        <Icon size={16} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-text-primary truncate">
          {item.label}
        </span>
        {item.sublabel && (
          <span className="block text-[12px] text-text-secondary truncate">
            {item.sublabel}
          </span>
        )}
      </span>
      <span className="text-[11px] text-text-tertiary">{item.type}</span>
      <ArrowRight size={15} strokeWidth={1.5} className="text-text-tertiary group-hover:text-blue-primary shrink-0" />
    </Link>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageHeader title="Search" subtitle="Find any customer, contact, offering, or record." />}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => setRecent(getRecent()), []);

  useEffect(() => {
    const term = q.trim();
    // keep the URL shareable
    router.replace(term ? `/search?q=${encodeURIComponent(term)}` : "/search", {
      scroll: false,
    });
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await r.json();
        if (!cancelled) setResults(data.results || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, router]);

  const grouped = useMemo(() => {
    const g: Record<string, Result[]> = {};
    for (const r of results) (g[r.type] ||= []).push(r);
    return g;
  }, [results]);

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Search" subtitle="Find any customer, contact, offering, or record." />

      <div className="relative mb-6">
        <Search size={18} strokeWidth={1.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies, contacts, offerings…"
          className="w-full bg-surface border border-border rounded-lg pl-11 pr-4 py-3 text-[15px] outline-none focus:border-blue-primary"
        />
      </div>

      {q.trim() ? (
        results.length === 0 ? (
          <EmptyState
            icon={Search}
            title={loading ? "Searching…" : `No results for "${q.trim()}"`}
            description="Try a company name, a contact, or an industry."
          />
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([type, rows]) => (
              <div key={type}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2">
                  {type}s
                </p>
                <Card className="p-0 overflow-hidden">
                  {rows.map((r) => (
                    <Row key={r.href} item={r} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )
      ) : recent.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-2 flex items-center gap-1.5">
            <Clock size={13} strokeWidth={1.7} /> Recently viewed
          </p>
          <Card className="p-0 overflow-hidden">
            {recent.map((r) => (
              <Row key={r.href} item={r} />
            ))}
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="Start typing to search"
          description="Records you open will also show up here as recently viewed."
        />
      )}
    </div>
  );
}
