"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { MiLogo } from "./MiLogo";
import { useToast } from "@/components/ui/Toast";
import { safeHref } from "@/lib/safeUrl";

type SavedItem = {
  companyId: string;
  companyName?: string;
  url: string;
  title: string;
  kind: "company" | "people" | "news" | "authority" | "site";
  sourceLabel: string;
  body: string | null;
  date: string | null;
};

const kindName: Record<SavedItem["kind"], string> = {
  company: "Company post",
  people: "People post",
  news: "News article",
  authority: "Health authority notice",
  site: "Company website",
};

function displayCompanyName(item: SavedItem, companies: Record<string, { name: string }>): string {
  if (item.companyName?.trim()) return item.companyName.trim();
  if (companies[item.companyId]?.name) return companies[item.companyId].name;
  // Older bookmarks predate companyName. Keep the cross-company view readable
  // even if that company is no longer in the viewer's tracking catalogue.
  return item.companyId.replace(/^mockgen-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function BookmarkedItems({
  query,
  companies,
}: {
  query: string;
  companies: Record<string, { name: string; logoUrl?: string | null }>;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market-intel/saved-articles", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setItems((Array.isArray(data.articles) ? data.articles : []).filter((item: SavedItem) =>
          typeof item?.companyId === "string" && typeof item?.url === "string" && typeof item?.title === "string"
        ));
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) { setError(true); setLoading(false); }
      });
    return () => controller.abort();
  }, [reload]);

  const search = query.trim().toLowerCase();
  const shown = items
    .filter(item => !search || [item.title, item.body, displayCompanyName(item, companies), item.sourceLabel]
      .some(value => value?.toLowerCase().includes(search)))
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0) || a.title.localeCompare(b.title));

  const remove = async (item: SavedItem) => {
    setRemoving(`${item.companyId}:${item.url}`);
    try {
      const response = await fetch("/api/market-intel/saved-articles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: item.companyId, url: item.url, on: false }),
      });
      if (!response.ok) throw new Error();
      setItems(previous => previous.filter(saved => saved.companyId !== item.companyId || saved.url !== item.url));
      toast("Item removed from your bookmarks.");
    } catch {
      toast("Could not remove this bookmark. Please try again.", "error");
    } finally {
      setRemoving(null);
    }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border border-border-light bg-white text-sm text-text-secondary"><Loader2 size={17} className="animate-spin" />Loading bookmarked items…</div>;
  if (error) return <div className="rounded-2xl border border-border-light bg-white px-6 py-12 text-center"><p className="text-sm text-text-secondary">Could not load your bookmarked items.</p><button type="button" onClick={() => { setLoading(true); setReload(value => value + 1); }} className="mt-3 text-sm font-semibold text-blue-primary hover:underline">Try again</button></div>;

  return (
    <section className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-[0_12px_36px_-32px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light bg-amber-50/50 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary"><Bookmark size={17} className="fill-amber-500 text-amber-600" />Bookmarked items</h2>
          <p className="mt-0.5 text-xs text-text-secondary">Your saved posts and articles from every company, newest first.</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 tnum">{shown.length}{search ? ` of ${items.length}` : ""} saved</span>
      </div>
      {shown.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-text-secondary">
          {items.length === 0 ? "Nothing bookmarked yet. Save a post or article from a company briefing and it will appear here." : "No bookmarked items match your search."}
        </div>
      ) : (
        <div className="divide-y divide-border-light">
          {shown.map(item => {
            const name = displayCompanyName(item, companies);
            const href = safeHref(item.url);
            return (
              <article key={`${item.companyId}:${item.url}`} className="group px-5 py-4 transition-colors hover:bg-slate-50/70">
                <div className="flex items-start gap-3.5">
                  <MiLogo name={name} logoUrl={companies[item.companyId]?.logoUrl} className="mt-0.5 h-9 w-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-text-secondary">
                      <Link href={`/market-intel/${encodeURIComponent(item.companyId)}`} className="font-semibold text-blue-primary hover:underline">{name}</Link>
                      <span aria-hidden="true">·</span><span>{kindName[item.kind] ?? "Saved item"}</span>
                      {item.sourceLabel && <><span aria-hidden="true">·</span><span>{item.sourceLabel}</span></>}
                      {item.date && Number.isFinite(Date.parse(item.date)) && <><span aria-hidden="true">·</span><time dateTime={item.date}>{new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></>}
                    </div>
                    <h3 className="mt-1 text-[14px] font-semibold leading-snug text-text-primary">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-blue-primary hover:underline">{item.title}</a> : item.title}</h3>
                    {item.body && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{item.body}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {href && <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open source: ${item.title}`} title="Open source" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-blue-50 hover:text-blue-primary"><ExternalLink size={15} /></a>}
                    <button type="button" disabled={removing === `${item.companyId}:${item.url}`} onClick={() => void remove(item)} aria-label={`Remove bookmark: ${item.title}`} title="Remove bookmark" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600 disabled:opacity-50">{removing === `${item.companyId}:${item.url}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
