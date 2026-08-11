"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  ChevronDown,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Plus,
  Radar,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type {
  CompetitionMaterial,
  CompetitionMaterialKind,
  CompetitorProduct,
} from "@/lib/offeringCompetition";

/**
 * THE COMPETITION TAB (Suren, Aug 11): for this offering, who competes with
 * it, with which product, and everything the team knows about that product —
 * pricing notes, what it is, links and documents. Rows open in place; anyone
 * signed in can add, same as sales materials.
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function OfferingCompetition({
  offeringId,
  offeringName,
  initialRows,
  suggestions,
  live,
}: {
  offeringId: string;
  offeringName: string;
  initialRows: CompetitorProduct[];
  /** Competitors already tracked in Market Intel, offered as quick picks. */
  suggestions: { id: string; name: string }[];
  live: boolean;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CompetitorProduct[]>(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---- add-competitor modal fields
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [pricing, setPricing] = useState("");
  const [about, setAbout] = useState("");

  // ---- per-row add-material form
  const [materialFor, setMaterialFor] = useState<string | null>(null);
  const [mKind, setMKind] = useState<CompetitionMaterialKind>("about");
  const [mLabel, setMLabel] = useState("");
  const [mText, setMText] = useState("");
  const [mUrl, setMUrl] = useState("");

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

  async function addMaterial(competitorId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await post({
        op: "add-material",
        competitorId,
        kind: mKind,
        label: mLabel,
        text: mText,
        url: mUrl,
      });
      await refresh();
      setMaterialFor(null);
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

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          <span className="font-semibold text-text-primary tnum">
            {rows.length}
          </span>{" "}
          competitor {rows.length === 1 ? "product" : "products"} on file
          against <span className="font-semibold text-text-primary">{offeringName}</span>.
          Anything the team learns lands here: pricing, what it is, links and
          documents.
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
        >
          <Plus size={14} strokeWidth={2.4} /> Add competitor product
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Swords}
            title="No competition on file yet"
            description={`Add the products that compete with ${offeringName} and collect the team's intel on each one: pricing, positioning, links and documents.`}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3 stagger">
          {rows.map((row) => {
            const open = openId === row.id;
            const counts = row.materials.reduce<Record<string, number>>(
              (acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] ?? 0) + 1 }),
              {}
            );
            return (
              <Card key={row.id} className="p-0">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : row.id)}
                  aria-expanded={open}
                  className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
                >
                  <CompanyLogo name={row.company} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[14px] font-semibold text-text-primary">
                        {row.company}
                      </span>
                      <span className="text-[13px] text-text-secondary">
                        {row.product}
                      </span>
                      {row.marketIntelId && (
                        <Link
                          href={`/market-intel/${row.marketIntelId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-full bg-[rgba(180,49,143,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B4318F] transition-opacity hover:opacity-80"
                        >
                          <Radar size={10} strokeWidth={2.4} /> Live intel
                        </Link>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {(Object.keys(KIND_META) as CompetitionMaterialKind[]).map(
                        (kind) =>
                          counts[kind] ? (
                            <span
                              key={kind}
                              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tnum"
                              style={{
                                color: KIND_META[kind].color,
                                background: `${KIND_META[kind].color}14`,
                              }}
                            >
                              {counts[kind]} {KIND_META[kind].label.toLowerCase()}
                            </span>
                          ) : null
                      )}
                      {row.materials.length === 0 && (
                        <span className="text-[11px] text-text-tertiary">
                          Nothing collected yet — open to add the first note
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-tertiary">
                    added by {row.addedBy.split(" ")[0]} · {fmtDate(row.addedAt)}
                    <ChevronDown
                      size={15}
                      strokeWidth={2.2}
                      className={cn(
                        "text-text-tertiary transition-transform",
                        open && "rotate-180 text-blue-primary"
                      )}
                    />
                  </span>
                </button>

                {open && (
                  <div className="tab-panel border-t border-border-light px-4 pb-4">
                    {row.materials.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {row.materials.map((m: CompetitionMaterial) => {
                          const meta = KIND_META[m.kind] ?? KIND_META.about;
                          const MIcon = meta.icon;
                          return (
                            <li
                              key={m.id}
                              className="flex items-start gap-2.5 rounded-lg border border-border-light bg-[var(--surface)] p-3"
                            >
                              <span
                                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                                style={{ color: meta.color, background: `${meta.color}14` }}
                              >
                                <MIcon size={14} strokeWidth={2.2} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] font-semibold text-text-primary">
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
                                        competitorId: row.id,
                                        materialId: m.id,
                                      },
                                      "Material removed"
                                    )
                                  }
                                  className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-white hover:text-[color:#DC2626]"
                                >
                                  <Trash2 size={13} strokeWidth={2.2} />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {materialFor === row.id ? (
                      <div className="mt-3 rounded-lg border border-blue-subtle bg-[rgba(0,113,227,0.03)] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <ColorSelect
                            value={mKind}
                            onChange={(v) => setMKind(v as CompetitionMaterialKind)}
                            ariaLabel="Material type"
                            minWidth={140}
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
                            className="h-[34px] min-w-[200px] flex-1 rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
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
                            disabled={busy}
                            onClick={() => addMaterial(row.id)}
                            className="cursor-pointer rounded-full bg-blue-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                          >
                            Save material
                          </button>
                          <button
                            type="button"
                            onClick={() => setMaterialFor(null)}
                            className="cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-surface"
                          >
                            <X size={13} strokeWidth={2.4} className="inline" /> Close
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {live ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialFor(row.id);
                              setMKind("about");
                            }}
                            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-blue-subtle bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-light"
                          >
                            <Plus size={13} strokeWidth={2.4} /> Add material
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">
                            Sample data — switch to Real mode to add intel.
                          </span>
                        )}
                        {live && (
                          <button
                            type="button"
                            onClick={() =>
                              remove(
                                { op: "remove-competitor", competitorId: row.id },
                                `${row.company} removed`
                              )
                            }
                            className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                          >
                            <Trash2 size={12.5} strokeWidth={2.2} /> Remove row
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a competitor product"
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
                    <CompanyLogo name={s.name} className="h-4 w-4" />
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
              Pricing intel <span className="font-normal text-text-tertiary">(optional)</span>
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
              What it is <span className="font-normal text-text-tertiary">(optional)</span>
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
