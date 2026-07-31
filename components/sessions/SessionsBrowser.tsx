"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { HoverCard } from "@/components/ui/HoverCard";
import { OutcomeBadge } from "@/components/ui/Badge";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarClock, History, Building2, CircleDot } from "lucide-react";
import {
  SearchPriority,
  PrioritySearchInput,
  PriorityLabel,
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { cn, OUTCOME_META, formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { REVIEW_META } from "@/lib/review";
import type { ReviewStatus } from "@/lib/types";
import { toCSV, downloadCSV } from "@/lib/csv";

export interface SessionRow {
  id: string;
  customerId: string;
  contactId: string;
  company: string;
  contact: string;
  title: string;
  service: string;
  outcome: string | null;
  review: ReviewStatus;
  date: string;
  /** Everything a rep wants at a glance without opening the record. */
  contactMeta?: {
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    touches: number;
    sessions: number;
    lastTouch: string | null;
  };
  companyMeta?: {
    industry: string | null;
    sizeTier: string | null;
    geography: string | null;
    customerType: string | null;
    contacts: number;
    sessions: number;
    summary: string | null;
  };
}

// Each sort owns a distinct glyph + colour: they all shared one arrow icon,
// which read as three identical gray squares the moment the toolbar compressed
// (and broke the standing "never gray, always colour + icon" rule at rest too).
const SORTS = [
  { key: "recent", label: "Newest", icon: CalendarClock, color: "#0F766E" },
  { key: "oldest", label: "Oldest", icon: History, color: "#7C3AED" },
  { key: "company", label: "Company A–Z", icon: Building2, color: "#0071E3" },
];

/**
 * Column floors, declared once so the header and the body can't drift apart.
 *
 * Every column except Customer used to be `whitespace-nowrap`, which meant the
 * browser had exactly one column it was allowed to squeeze — and it squeezed it
 * all the way down to the longest single word. "Solara Consumer Health" came
 * out stacked on three lines and dragged every row's height with it (Anir, Jul
 * 27: "I don't see a need for Solara Consumer Health to be on three different
 * lines"). Nothing is truncated to fix it — truncation is banned app-wide — the
 * width is simply reallocated:
 *
 *   • Customer gets a real floor (210px = 32px logo + 12px gap + 166px of name),
 *     which fits the longest seeded account, "Meridian Pharmaceuticals", on ONE
 *     line and still reads cleanly if a longer name breaks to two.
 *   • Recommended Service keeps its single line — a service name split over two
 *     lines reads as two services — but pays for it by rendering a half-step
 *     smaller, and the three short pill/date columns hand back the rest.
 *   • Cell padding drops 20px → 16px across the board, which frees ~56px more
 *     without making any one column look different from its neighbours.
 */
const COLUMNS: { label: string; width: string }[] = [
  { label: "Customer", width: "min-w-[210px]" },
  { label: "Contact", width: "min-w-[152px]" },
  { label: "Recommended Service", width: "min-w-[212px]" },
  { label: "Outcome", width: "min-w-[96px]" },
  { label: "Review", width: "min-w-[92px]" },
  { label: "Date", width: "min-w-[88px]" },
];

export function SessionsBrowser({
  rows,
  headerAction,
}: {
  rows: SessionRow[];
  /** Rendered beside the page title, so a primary CTA never needs a row
   *  of its own above the heading. */
  headerAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [sort, setSort] = useState("recent");

  const outcomes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.outcome).filter(Boolean))) as string[],
    [rows]
  );

  const view = useMemo(() => {
    let v = rows.filter(
      (r) =>
        (outcome === "all" || r.outcome === outcome) &&
        (!q ||
          r.company.toLowerCase().includes(q.toLowerCase()) ||
          r.contact.toLowerCase().includes(q.toLowerCase()) ||
          r.service.toLowerCase().includes(q.toLowerCase()))
    );
    v = [...v];
    if (sort === "recent")
      v.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    else if (sort === "oldest")
      v.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    else v.sort((a, b) => a.company.localeCompare(b.company));
    return v;
  }, [rows, q, outcome, sort]);

  function exportCsv() {
    const csv = toCSV(
      ["Customer", "Contact", "Recommended Service", "Outcome", "Review", "Date"],
      view.map((r) => [
        r.company,
        r.contact,
        r.service,
        r.outcome ? OUTCOME_META[r.outcome]?.label || r.outcome : "",
        REVIEW_META[r.review].label,
        formatDateTime(r.date),
      ])
    );
    downloadCSV("freyr-sessions.csv", csv);
  }

  return (
    <div>
      {/* Title + filters (incl. a compact search) on one row — no standalone
          search bar eating a whole row (Suren). */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              Sessions
            </h1>
            {/* The New Session CTA sits WITH the title, not on a row of its own
                above it, which left a band of empty page across the top (Anir,
                Jul 28: "the new session button should not just be on its own
                row"). */}
            {headerAction}
          </div>
          <p className="text-[14px] text-text-secondary mt-0.5">
            {rows.length} pitch session{rows.length === 1 ? "" : "s"} across your book.
          </p>
        </div>
        {/* Search priority — press the search and the controls to its right
            compress to their colour + glyph (Suren, Jul 27). */}
        <SearchPriority
          query={q}
          className="flex items-center gap-2 flex-wrap shrink-0"
        >
          <PrioritySearchInput
            value={q}
            onChange={setQ}
            placeholder="Search sessions…"
            ariaLabel="Search sessions"
          />
          <ColorSelect
            value={outcome}
            onChange={setOutcome}
            minWidth={155}
            options={[
              // Blue + a glyph, so "no outcome filter" still reads as an
              // outcome filter once the words go.
              { value: "all", label: "All outcomes", color: "#0071E3", icon: CircleDot },
              ...outcomes.map<ColorOption>((o) => ({
                value: o,
                label: OUTCOME_META[o]?.label || o,
                color: OUTCOME_META[o]?.color,
              })),
            ]}
          />
          <ColorSelect
            value={sort}
            onChange={setSort}
            minWidth={150}
            options={SORTS.map<ColorOption>((s) => ({
              value: s.key,
              label: s.label,
              icon: s.icon,
              color: s.color,
            }))}
          />
          <PriorityTooltip label="Export CSV">
            <button
              onClick={exportCsv}
              aria-label="Export CSV"
              className="flex items-center text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              <Download size={16} strokeWidth={1.5} />
              <PriorityLabel>Export CSV</PriorityLabel>
            </button>
          </PriorityTooltip>
        </SearchPriority>
      </div>
      {view.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={CalendarClock}
            title="No sessions match"
            description="Try a different search or clear the filters."
            action={
              q || outcome !== "all" ? (
                <button
                  onClick={() => {
                    setQ("");
                    setOutcome("all");
                  }}
                  className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      className={cn(
                        "px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap",
                        c.width
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light stagger">
                {view.map((r) => (
                  <tr
                    key={r.id}
                    onClick={(event) => {
                      if ((event.target as Element).closest("a,button")) return;
                      router.push(`/sessions/${r.id}`);
                    }}
                    className="hover:bg-surface active:bg-blue-light/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-4">
                      <HoverCard
                        side="right"
                        width={300}
                        content={
                          <div>
                            <div className="flex items-center gap-2.5">
                              <CompanyLogo name={r.company} className="h-10 w-10 shrink-0 text-[10px]" />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold leading-snug text-text-primary">{r.company}</p>
                                <p className="text-[10.5px] text-text-tertiary">
                                  {[r.companyMeta?.industry, r.companyMeta?.geography].filter(Boolean).join(" · ") || "Account"}
                                </p>
                              </div>
                            </div>
                            {r.companyMeta?.customerType && (
                              <p className="mt-2 text-[11px] font-semibold text-blue-primary">
                                {r.companyMeta.customerType}
                              </p>
                            )}
                            {r.companyMeta?.summary && (
                              <p className="mt-2 text-[11.5px] leading-relaxed text-text-secondary">
                                {r.companyMeta.summary}
                              </p>
                            )}
                            <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
                              <div>
                                <p className="text-[12px] font-bold text-text-primary tnum">{r.companyMeta?.contacts ?? 0}</p>
                                <p className="text-[9px] text-text-tertiary">Contacts</p>
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-text-primary tnum">{r.companyMeta?.sessions ?? 0}</p>
                                <p className="text-[9px] text-text-tertiary">Sessions</p>
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-text-primary tnum uppercase">{r.companyMeta?.sizeTier || "-"}</p>
                                <p className="text-[9px] text-text-tertiary">Size</p>
                              </div>
                            </div>
                            <p className="mt-2.5 text-[11px] font-semibold text-blue-primary">Open the account →</p>
                          </div>
                        }
                      >
                        {/* min-w here (not just on the <th>) is what actually
                            raises the column's minimum content width in an
                            auto-layout table, the logo keeps its 32px and the
                            name gets the rest. */}
                        <Link
                          href={`/customers/${r.customerId}`}
                          className="group/company flex items-center gap-3 min-w-[210px]"
                        >
                          <CompanyLogo name={r.company} className="w-8 h-8 shrink-0 text-[11px]" />
                          {/* One line, always (Anir: names were folding onto
                              three). No ellipsis either — the standing rule —
                              so the column simply claims the width it needs
                              and the wrapper's overflow-x carries the rest. */}
                          <span className="whitespace-nowrap text-[13px] font-semibold text-text-primary group-hover/company:text-blue-primary">
                            {r.company}
                          </span>
                        </Link>
                      </HoverCard>
                    </td>
                    <td className="px-4 py-4">
                      <HoverCard
                        side="right"
                        width={300}
                        content={
                          <div>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.contact} className="h-10 w-10 shrink-0 text-[11px]" />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold leading-snug text-text-primary">{r.contact}</p>
                                <p className="text-[10.5px] text-text-tertiary">
                                  {[r.title, r.company].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2.5 space-y-1 text-[11.5px]">
                              {r.contactMeta?.email && (
                                <p className="truncate text-text-secondary">{r.contactMeta.email}</p>
                              )}
                              {r.contactMeta?.phone && (
                                <p className="text-text-secondary tnum">{r.contactMeta.phone}</p>
                              )}
                            </div>
                            <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
                              <div>
                                <p className="text-[12px] font-bold text-text-primary tnum">{r.contactMeta?.touches ?? 0}</p>
                                <p className="text-[9px] text-text-tertiary">Touches</p>
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-text-primary tnum">{r.contactMeta?.sessions ?? 0}</p>
                                <p className="text-[9px] text-text-tertiary">Sessions</p>
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-text-primary">{r.outcome ? OUTCOME_META[r.outcome]?.label || "-" : "-"}</p>
                                <p className="text-[9px] text-text-tertiary">Last outcome</p>
                              </div>
                            </div>
                            {r.contactMeta?.lastTouch && (
                              <p className="mt-2 text-[10.5px] text-text-tertiary">
                                Last touched {formatDateTime(r.contactMeta.lastTouch)}
                              </p>
                            )}
                            <p className="mt-2.5 text-[11px] font-semibold text-blue-primary">Open the contact →</p>
                          </div>
                        }
                      >
                        <Link
                          href={`/contacts/${r.contactId}`}
                          className="group/contact flex items-center gap-2.5"
                        >
                          <Avatar name={r.contact} className="w-7 h-7 shrink-0 text-[10px]" />
                          {/* Exactly two lines: the name on one, the role on the
                              next. The cell used to let both wrap, so a long
                              name broke across three or four lines and the rows
                              grew unevenly (Anir, Jul 26: "I want the contact to
                              just have two lines"). The date column gives back
                              the width this needs by stacking its time. */}
                          <div className="whitespace-nowrap">
                            <div className="text-[13px] font-semibold text-text-primary group-hover/contact:text-blue-primary">
                              {r.contact}
                            </div>
                            <div className="text-[11px] text-text-tertiary">{r.title}</div>
                          </div>
                        </Link>
                      </HoverCard>
                    </td>
                    {/* One line, always — a service is a name, and a name that
                        breaks across two lines reads as two things (Anir, Jul
                        27: "labeling and artwork management: I thought I told
                        you I need that on one line"). The chip is sized down a
                        half-step so the longest service, "Clinical Trial
                        Regulatory Support", still fits without stealing the
                        width the Customer column needs. */}
                    <td className="px-4 py-4">
                      <ServiceTag
                        name={r.service}
                        className="!text-[11.5px] !py-0.5 !pl-1 !pr-2 whitespace-nowrap"
                      />
                    </td>
                    <td className="px-4 py-4">{r.outcome ? <OutcomeBadge outcome={r.outcome} /> : "-"}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {(() => {
                        const rm = REVIEW_META[r.review];
                        const RIcon = rm.icon;
                        return (
                          <span
                            className="semantic-color-pill inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.04em] px-2 py-1 rounded"
                            style={
                              {
                                "--semantic-color": rm.color,
                                "--semantic-bg": rm.bg,
                              } as CSSProperties
                            }
                          >
                            <RIcon size={11} strokeWidth={2.4} />
                            {rm.label}
                          </span>
                        );
                      })()}
                    </td>
                    {/* Date over time, two short lines instead of one long one —
                        "Jul 24, 2026 • 9:01 AM" claimed more width than any
                        other column and starved the contact cell (Anir, Jul 26:
                        "the date is taking up too much room… stack the time on
                        top of the date or vice versa"). */}
                    <td className="px-4 py-4 whitespace-nowrap tnum">
                      <div className="text-[13px] text-text-secondary">{formatDate(r.date)}</div>
                      <div className="text-[11px] text-text-tertiary">{formatTime(r.date)}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/sessions/${r.id}`}
                        aria-label={`Open session for ${r.company}`}
                        className="inline-flex rounded p-1 text-text-tertiary group-hover:text-blue-primary hover:bg-blue-light transition-colors"
                      >
                        <ArrowRight size={16} strokeWidth={1.5} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
