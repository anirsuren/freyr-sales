"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  ChevronDown,
  ExternalLink,
  FileText,
  Info,
  LayoutGrid,
  Link2,
  List,
  Plus,
  Radar,
  Swords,
  Table2,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";
import type {
  CompetitionMaterialKind,
  CompetitorProduct,
} from "@/lib/offeringCompetition";

/**
 * THE COMPETITION TAB (Suren, Aug 11): who competes with this offering, with
 * which product, and everything the team knows about it. Three views — tiles,
 * rows, table — and every competitor opens as a popup where the intel lives:
 * pricing notes, what-it-is notes, links and document links. Nothing more,
 * by design (Anir: "don't go beyond that").
 */

const KIND_META: Record<
  CompetitionMaterialKind,
  { label: string; color: string; icon: typeof Info }
> = {
  pricing: { label: "Pricing", color: "#C2410C", icon: BadgeDollarSign },
  about: { label: "About", color: "#0071E3", icon: Info },
  link: { label: "Link", color: "#6D28D9", icon: Link2 },
  file: { label: "Document", color: "#0F766E", icon: FileText },
};

const VIEWS = ["tiles", "rows", "table"] as const;
type View = (typeof VIEWS)[number];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function aboutPreview(row: CompetitorProduct): string | null {
  return row.materials.find((m) => m.kind === "about")?.text ?? null;
}

export function OfferingCompetition({
  offeringId,
  offeringName,
  initialRows,
  suggestions,
  logos,
  live,
}: {
  offeringId: string;
  offeringName: string;
  initialRows: CompetitorProduct[];
  /** Competitors already tracked in Market Intel, offered as quick picks. */
  suggestions: { id: string; name: string }[];
  /** Real LinkedIn logos by Market Intel company id. */
  logos: Record<string, string>;
  live: boolean;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CompetitorProduct[]>(initialRows);
  const [view, chooseView] = useStoredView<View>(
    "freyr.competition.view",
    "tiles",
    VIEWS
  );
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLSpanElement>(null);
  // Capture phase, same as the Market Intel menus: the menu closes on any
  // click elsewhere without that click also activating what's under it.
  useEffect(() => {
    if (!viewOpen) return;
    const close = (e: MouseEvent) => {
      if (!viewRef.current?.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [viewOpen]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---- add-competitor modal fields
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [pricing, setPricing] = useState("");
  const [about, setAbout] = useState("");

  // ---- add-material form (inside the competitor popup)
  const [formOpen, setFormOpen] = useState(false);
  const [mKind, setMKind] = useState<CompetitionMaterialKind>("about");
  const [mLabel, setMLabel] = useState("");
  const [mText, setMText] = useState("");
  const [mUrl, setMUrl] = useState("");

  const openRow = rows.find((r) => r.id === openId) ?? null;

  const matchedSuggestions = useMemo(() => {
    const q = company.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 6);
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [company, suggestions]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/offerings/competition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offeringId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "That didn't save.");
    return data;
  }

  async function refresh() {
    const res = await fetch(
      `/api/offerings/competition?offeringId=${encodeURIComponent(offeringId)}`
    );
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.rows)) setRows(data.rows);
  }

  async function addCompetitor() {
    if (busy) return;
    setBusy(true);
    try {
      const matched = suggestions.find(
        (s) => s.name.toLowerCase() === company.trim().toLowerCase()
      );
      await post({
        op: "add-competitor",
        company,
        product,
        marketIntelId: matched?.id ?? null,
        pricing,
        about,
      });
      await refresh();
      setAdding(false);
      setCompany("");
      setProduct("");
      setPricing("");
      setAbout("");
      toast(`${company.trim()} added to the competition list`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial() {
    if (busy || !openId) return;
    setBusy(true);
    try {
      await post({
        op: "add-material",
        competitorId: openId,
        kind: mKind,
        label: mLabel,
        text: mText,
        url: mUrl,
      });
      await refresh();
      setFormOpen(false);
      setMLabel("");
      setMText("");
      setMUrl("");
      toast("Material added", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(body: Record<string, unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await post(body);
      await refresh();
      toast(done, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "error");
    } finally {
      setBusy(false);
    }
  }

  const needsUrl = mKind === "link" || mKind === "file";

  const logoFor = (row: CompetitorProduct) =>
    row.marketIntelId && logos[row.marketIntelId] ? (
      <MiLogo
        name={row.company}
        logoUrl={logos[row.marketIntelId]}
        className="h-10 w-10 shrink-0"
      />
    ) : (
      <CompanyLogo name={row.company} className="h-10 w-10 shrink-0" />
    );

  const kindChips = (row: CompetitorProduct, size: "sm" | "md" = "md") => {
    const counts = row.materials.reduce<Record<string, number>>(
      (acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] ?? 0) + 1 }),
      {}
    );
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(KIND_META) as CompetitionMaterialKind[]).map((kind) => {
          if (!counts[kind]) return null;
          const meta = KIND_META[kind];
          const KIcon = meta.icon;
          return (
            <span
              key={kind}
              className={cn(
                "flex items-center gap-1 rounded-full font-semibold tnum",
                size === "sm"
                  ? "px-1.5 py-0.5 text-[10px]"
                  : "px-2 py-0.5 text-[10.5px]"
              )}
              style={{ color: meta.color, background: `${meta.color}14` }}
            >
              <KIcon size={size === "sm" ? 10 : 10.5} strokeWidth={2.2} />
              {counts[kind]} {meta.label.toLowerCase()}
            </span>
          );
        })}
        {row.materials.length === 0 && (
          <span
            className={cn(
              "rounded-full bg-[rgba(0,113,227,0.06)] font-medium text-text-tertiary",
              size === "sm"
                ? "px-1.5 py-0.5 text-[10px]"
                : "px-2 py-0.5 text-[10.5px]"
            )}
          >
            no intel yet
          </span>
        )}
      </span>
    );
  };

  const liveIntelChip = (row: CompetitorProduct) =>
    row.marketIntelId ? (
      <Link
        href={`/market-intel/${row.marketIntelId}`}
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(180,49,143,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B4318F] transition-opacity hover:opacity-80"
      >
        <Radar size={10} strokeWidth={2.4} /> Live intel
      </Link>
    ) : null;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          <span className="font-semibold text-text-primary tnum">
            {rows.length}
          </span>{" "}
          competitor {rows.length === 1 ? "product" : "products"} on file
          against{" "}
          <span className="font-semibold text-text-primary">
            {offeringName}
          </span>
          . Click one for the team&apos;s intel on it.
        </p>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <Plus size={14} strokeWidth={2.4} /> Add competitor product
          </button>
          <span className="relative" ref={viewRef}>
            <button
              type="button"
              onClick={() => setViewOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={viewOpen}
              aria-label="Layout"
              title="Layout"
              className="flex h-[36px] cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 transition-colors hover:border-blue-subtle"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(0,113,227,0.10)] text-blue-primary">
                {view === "tiles" ? (
                  <LayoutGrid size={14} strokeWidth={2.2} />
                ) : view === "rows" ? (
                  <List size={14} strokeWidth={2.2} />
                ) : (
                  <Table2 size={14} strokeWidth={2.2} />
                )}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={2.2}
                className={cn(
                  "text-text-tertiary transition-transform",
                  viewOpen && "rotate-180 text-blue-primary"
                )}
              />
            </button>
            {viewOpen && (
              <span
                role="menu"
                className="menu-in absolute right-0 top-full z-50 mt-2 flex gap-1 rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
              >
                {VIEWS.map((v) => {
                  const VIcon =
                    v === "tiles" ? LayoutGrid : v === "rows" ? List : Table2;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="menuitemradio"
                      aria-checked={view === v}
                      aria-label={v}
                      title={v}
                      onClick={() => {
                        chooseView(v);
                        setViewOpen(false);
                      }}
                      className={cn(
                        "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors",
                        view === v
                          ? "bg-[rgba(0,113,227,0.12)] text-blue-primary"
                          : "text-text-tertiary hover:bg-surface hover:text-text-primary"
                      )}
                    >
                      <VIcon size={16} strokeWidth={2.2} />
                    </button>
                  );
                })}
              </span>
            )}
          </span>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Swords}
            title="No competition on file yet"
            description={`Add the products that compete with ${offeringName} and collect the team's intel on each one: pricing, positioning, links and documents.`}
          />
        </div>
      ) : view === "tiles" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {rows.map((row) => {
            const preview = aboutPreview(row);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setOpenId(row.id)}
                className="group flex cursor-pointer flex-col rounded-xl border border-border-light bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {logoFor(row)}
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
                        {row.company}
                      </span>
                      <span className="block truncate text-[12px] text-text-secondary">
                        {row.product}
                      </span>
                    </span>
                  </span>
                  {liveIntelChip(row)}
                </span>
                {preview ? (
                  <span className="mt-3 flex-1 overflow-hidden text-[12.5px] leading-relaxed text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                    {preview}
                  </span>
                ) : (
                  <span className="mt-3 flex h-[58px] flex-1 items-center justify-center rounded-md border border-dashed border-border-light text-[10.5px] font-medium text-text-tertiary">
                    No notes yet — open to add the first one
                  </span>
                )}
                <span className="mt-3 flex items-center justify-between gap-2 border-t border-border-light pt-2.5">
                  {kindChips(row)}
                  <span className="shrink-0 text-[10.5px] text-text-tertiary">
                    {fmtDate(row.addedAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : view === "rows" ? (
        <div className="mt-4 space-y-2.5 stagger">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border-light bg-white p-3.5 text-left shadow-card transition-all hover:border-blue-subtle hover:shadow-md active:scale-[0.995]"
            >
              {logoFor(row)}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[14px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
                    {row.company}
                  </span>
                  <span className="text-[12.5px] text-text-secondary">
                    {row.product}
                  </span>
                  {liveIntelChip(row)}
                </span>
                <span className="mt-1 block">{kindChips(row, "sm")}</span>
              </span>
              <span className="hidden shrink-0 text-[11px] text-text-tertiary sm:block">
                {row.addedBy.split(" ")[0]} · {fmtDate(row.addedAt)}
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                className="shrink-0 -rotate-90 text-text-tertiary transition-colors group-hover:text-blue-primary"
              />
            </button>
          ))}
        </div>
      ) : (
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border-light">
                {["Competitor", "Their product", "Intel on file", "Added"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setOpenId(row.id)}
                  className="cursor-pointer transition-colors hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      {logoFor(row)}
                      <span className="text-[13.5px] font-semibold text-text-primary">
                        {row.company}
                      </span>
                      {liveIntelChip(row)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-text-secondary">
                    {row.product}
                  </td>
                  <td className="px-4 py-3">{kindChips(row, "sm")}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12px] text-text-tertiary">
                    {row.addedBy.split(" ")[0]} · {fmtDate(row.addedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* -------------------------------------------- competitor detail popup */}
      <Modal
        open={openRow !== null}
        onClose={() => {
          setOpenId(null);
          setFormOpen(false);
        }}
        title={openRow ? `${openRow.company} — ${openRow.product}` : ""}
        size="workflow"
        tall
      >
        {openRow && (
          <div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-light bg-[var(--surface)] p-3.5">
              {logoFor(openRow)}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-text-primary">
                  {openRow.company}
                </span>
                <span className="block text-[12.5px] text-text-secondary">
                  {openRow.product} · competes with {offeringName}
                </span>
              </span>
              {openRow.marketIntelId && (
                <Link
                  href={`/market-intel/${openRow.marketIntelId}`}
                  className="flex items-center gap-1.5 rounded-full bg-[rgba(180,49,143,0.10)] px-3 py-1.5 text-[12px] font-semibold text-[color:#B4318F] transition-opacity hover:opacity-80"
                >
                  <Radar size={12} strokeWidth={2.4} /> Live intel
                </Link>
              )}
            </div>

            <div className="-mr-2 mt-3 max-h-[46vh] space-y-2.5 overflow-y-auto pr-2">
              {openRow.materials.length === 0 && !formOpen && (
                <p className="rounded-lg bg-surface px-4 py-5 text-center text-[12.5px] leading-relaxed text-text-secondary">
                  Nothing collected on this product yet. Add the first note,
                  link or document below.
                </p>
              )}
              {openRow.materials.map((m) => {
                const meta = KIND_META[m.kind] ?? KIND_META.about;
                const MIcon = meta.icon;
                return (
                  <div
                    key={m.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border-light bg-white p-3.5 shadow-card"
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        color: meta.color,
                        background: `${meta.color}14`,
                      }}
                    >
                      <MIcon size={15} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-text-primary">
                        {m.label}
                        <span className="text-[10.5px] font-medium text-text-tertiary">
                          {m.addedBy.split(" ")[0]} · {fmtDate(m.addedAt)}
                        </span>
                      </span>
                      {m.text && (
                        <span className="mt-0.5 block whitespace-pre-line text-[12.5px] leading-relaxed text-text-secondary">
                          {m.text}
                        </span>
                      )}
                      {m.url && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                        >
                          Open <ExternalLink size={11} strokeWidth={2.2} />
                        </a>
                      )}
                    </span>
                    {live && (
                      <button
                        type="button"
                        aria-label={`Remove ${m.label}`}
                        onClick={() =>
                          remove(
                            {
                              op: "remove-material",
                              competitorId: openRow.id,
                              materialId: m.id,
                            },
                            "Material removed"
                          )
                        }
                        className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                );
              })}

              {formOpen && (
                <div className="rounded-xl border border-blue-subtle bg-[rgba(0,113,227,0.03)] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ColorSelect
                      value={mKind}
                      onChange={(v) => setMKind(v as CompetitionMaterialKind)}
                      ariaLabel="Material type"
                      minWidth={160}
                      dense
                      options={(
                        Object.keys(KIND_META) as CompetitionMaterialKind[]
                      ).map((kind) => ({
                        value: kind,
                        label:
                          kind === "file"
                            ? "Document link"
                            : `${KIND_META[kind].label}${kind === "link" ? "" : " note"}`,
                        color: KIND_META[kind].color,
                        icon: KIND_META[kind].icon,
                      }))}
                    />
                    <input
                      value={mLabel}
                      onChange={(e) => setMLabel(e.target.value)}
                      placeholder='Name it, e.g. "2026 list pricing"'
                      className="h-[34px] min-w-[180px] flex-1 rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
                    />
                  </div>
                  {needsUrl ? (
                    <input
                      value={mUrl}
                      onChange={(e) => setMUrl(e.target.value)}
                      placeholder={
                        mKind === "file"
                          ? "Paste the document's link (Teams, SharePoint, Drive…)"
                          : "https://…"
                      }
                      className="mt-2 h-[34px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
                    />
                  ) : (
                    <textarea
                      value={mText}
                      onChange={(e) => setMText(e.target.value)}
                      placeholder="The note itself: what the team should know."
                      rows={3}
                      className="mt-2 w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-subtle"
                    />
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || !mLabel.trim()}
                      onClick={addMaterial}
                      className="cursor-pointer rounded-full bg-blue-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save material"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      className="cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-surface"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
              {live ? (
                <>
                  {!formOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormOpen(true);
                        setMKind("about");
                      }}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                      <Plus size={13} strokeWidth={2.4} /> Add material
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      remove(
                        { op: "remove-competitor", competitorId: openRow.id },
                        `${openRow.company} removed`
                      ).then(() => setOpenId(null))
                    }
                    className="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                  >
                    <Trash2 size={12.5} strokeWidth={2.2} /> Remove from list
                  </button>
                </>
              ) : (
                <span className="text-[11.5px] text-text-tertiary">
                  Sample data — switch to Real mode to add intel.
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* -------------------------------------------------- add competitor */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a competitor product"
        size="wide"
        tall
      >
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          Who competes with {offeringName}, and with what? Companies already
          tracked in Market Intel appear as quick picks and link to their live
          briefing.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              Competitor company
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Veeva Systems"
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
            />
            {matchedSuggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {matchedSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCompany(s.name)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                      company.trim().toLowerCase() === s.name.toLowerCase()
                        ? "border-transparent bg-blue-primary text-white"
                        : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                    )}
                  >
                    {logos[s.id] ? (
                      <MiLogo name={s.name} logoUrl={logos[s.id]} className="h-4 w-4" />
                    ) : (
                      <CompanyLogo name={s.name} className="h-4 w-4" />
                    )}
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              Their competing product
            </label>
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. Vault RIM"
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              Pricing intel{" "}
              <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <textarea
              value={pricing}
              onChange={(e) => setPricing(e.target.value)}
              rows={2}
              placeholder="What do they charge? Any deals seen in the wild?"
              className="mt-1 w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-subtle"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              What it is{" "}
              <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={2}
              placeholder="What the product does and how we win against it."
              className="mt-1 w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-subtle"
            />
          </div>
          <button
            type="button"
            disabled={busy || !company.trim() || !product.trim()}
            onClick={addCompetitor}
            className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add to the competition list"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
