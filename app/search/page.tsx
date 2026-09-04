"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Building2,
  Contact as ContactIcon,
  Clock,
  ArrowRight,
  Package,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { getRecent, type RecentItem } from "@/lib/recent";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";

type Result = { type: string; label: string; sublabel: string; href: string };

// The record TYPE is a category, so it reads as a colour + icon chip rather
// than gray type in the corner (standing chip rule).
const TYPE_META: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  Customer: { icon: Building2, color: "var(--ink-blue)", bg: "rgba(0,113,227,0.10)" },
  Contact: { icon: ContactIcon, color: "var(--ink-violet)", bg: "rgba(124,58,237,0.10)" },
  Offering: { icon: Package, color: "var(--ink-teal-deep)", bg: "rgba(15,118,110,0.12)" },
  Session: { icon: CalendarClock, color: "#0891B2", bg: "rgba(8,145,178,0.12)" },
};
const TYPE_FALLBACK = { icon: Clock, color: "#0369A1", bg: "rgba(2,132,199,0.12)" };

function typeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_FALLBACK;
}

// A company shows its logo and a person their headshot. An offering used to
// show its own branded gradient tile; it now falls through to the plain type
// mark every other kind of record wears (Anir, Sep 2: "can you just remove
// these icons from all the offering names? They're not really needed"). Same
// 32px footprint either way, so rows stay in line.
function RecordMark({ type, label }: { type: string; label: string }) {
  if (type === "Customer")
    return <CompanyLogo name={label} className="w-8 h-8 text-[11px]" />;
  if (type === "Contact")
    return <Avatar name={label} className="w-8 h-8 text-[11px]" />;
  const { icon: Icon, color, bg } = typeMeta(type);
  return (
    <span
      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: bg, color }}
    >
      <Icon size={16} strokeWidth={1.8} />
    </span>
  );
}

function Row({ item }: { item: { type: string; label: string; sublabel?: string; href: string } }) {
  const { icon: TypeIcon, color, bg } = typeMeta(item.type);
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group border-b border-border-light last:border-0"
    >
      <RecordMark type={item.type} label={item.label} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-text-primary whitespace-nowrap">
          {item.label}
        </span>
        {item.sublabel && (
          <span className="block text-[12px] text-text-secondary">
            {item.sublabel}
          </span>
        )}
      </span>
      <span
        className="inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
        style={{ background: bg, color }}
      >
        <TypeIcon size={11} strokeWidth={2.2} />
        {item.type}
      </span>
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
  const currentUser = useCurrentUser();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => setRecent(getRecent(currentUser.id)), [currentUser.id]);

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
                <Card className="p-0 overflow-hidden stagger">
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
          <Card className="p-0 overflow-hidden stagger">
            {recent.map((r) => (
              <Row key={r.href} item={r} />
            ))}
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="Start typing to search"
          description="Anything you open shows up here too, so you can get back to it quickly."
        />
      )}
    </div>
  );
}
