"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, UserSearch, CheckSquare, Square, X, Mail, PhoneCall, LayoutGrid, List, ArrowDownWideNarrow } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge, OutcomeBadge } from "@/components/ui/Badge";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { DonutChart, DonutLegend, Sparkline, VIZ, type TipItem } from "@/components/charts/Charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { toCSV, downloadCSV } from "@/lib/csv";
import { cn, formatDate } from "@/lib/utils";

export interface ContactRow {
  id: string;
  name: string;
  title: string;
  company: string;
  companyId?: string | null;
  role: string;
  email: string;
  phone?: string | null;
  linkedin?: string | null;
  // Engagement signal for the card's scale-up hover.
  touches?: number;
  lastOutcome?: string | null;
  lastTouch?: string | null;
  offerings?: number;
  outcomeMix?: { label: string; value: number; color: string; tip?: TipItem[] }[];
  trend?: number[];
  // The touches behind each weekly point of `trend`, for the sparkline hover.
  trendTips?: TipItem[][];
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// Color-code the role pill by function so a rep scans the room by color, not by
// reading every label (Suren: "color-code everything"). Keyed on a keyword in
// the role bucket so it's resilient to naming ("Regulatory Affairs",
// "Reg Ops", etc.). Each entry is a soft tinted bg + a saturated text color.
const ROLE_STYLES: { test: RegExp; bg: string; color: string }[] = [
  { test: /exec|c-?level|ceo|coo|cfo|founder|chief/i, bg: "rgba(124,58,237,0.10)", color: "#6D28D9" }, // violet — leadership
  { test: /regulatory|reg\b|ra\b/i, bg: "rgba(0,113,227,0.10)", color: "#0040A0" }, // blue — regulatory
  { test: /medical|clinical|scientific/i, bg: "rgba(5,150,105,0.12)", color: "#047857" }, // emerald — medical
  { test: /quality|qa|cmc|manufactur/i, bg: "rgba(217,119,6,0.12)", color: "#B45309" }, // amber — quality
  { test: /complian|legal|audit/i, bg: "rgba(225,29,72,0.10)", color: "#BE123C" }, // rose — compliance
  { test: /commercial|market|sales|business/i, bg: "rgba(2,132,199,0.12)", color: "#0369A1" }, // sky — commercial
];
function roleStyle(role: string): { bg: string; color: string } {
  const hit = ROLE_STYLES.find((s) => s.test.test(role));
  return hit ?? { bg: "rgba(100,116,139,0.12)", color: "#475569" }; // slate default
}

export function ContactsBrowser({
  rows,
  voiceCategories = [],
}: {
  rows: ContactRow[];
  // Offering categories with a wired voice agent — powers the bulk run
  // (Suren: "select a bunch of contacts, then for every offering category
  // there's a voice agent that you select and run").
  voiceCategories?: string[];
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("name");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voiceCategory, setVoiceCategory] = useState(voiceCategories[0] || "");
  const [voiceBusy, setVoiceBusy] = useState(false);

  async function runVoiceAgent() {
    if (!voiceCategory || selected.size === 0) return;
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/voice/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selected),
          category: voiceCategory,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          data.called > 0
            ? `Dialing ${data.called} of ${data.queued} now — the rest are queued.`
            : `Queued ${data.queued} call${data.queued === 1 ? "" : "s"} — they dial as soon as a phone number is connected.`
        );
        setSelected(new Set());
        setSelectMode(false);
      } else {
        toast(data.error || "Couldn't queue the calls.", "error");
      }
    } catch {
      toast("Couldn't queue the calls.", "error");
    } finally {
      setVoiceBusy(false);
    }
  }

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const roles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.role).filter(Boolean))),
    [rows]
  );

  const view = useMemo(() => {
    let v = rows.filter(
      (r) =>
        (role === "all" || r.role === role) &&
        (!q ||
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          r.title.toLowerCase().includes(q.toLowerCase()) ||
          r.company.toLowerCase().includes(q.toLowerCase()))
    );
    v = [...v].sort((a, b) =>
      sort === "company"
        ? a.company.localeCompare(b.company)
        : a.name.localeCompare(b.name)
    );
    return v;
  }, [rows, q, role, sort]);

  function rowsToCsv(list: ContactRow[]) {
    // Email is the whole point of a contact export (outreach lists) and shows on
    // every card — it was missing from the CSV, so add it.
    return toCSV(
      ["Name", "Title", "Company", "Role", "Email"],
      list.map((r) => [r.name, r.title, r.company, r.role, r.email])
    );
  }
  function exportCsv() {
    downloadCSV("freyr-contacts.csv", rowsToCsv(view));
  }
  function exportSelected() {
    const list = view.filter((r) => selected.has(r.id));
    if (!list.length) return;
    downloadCSV("freyr-contacts-selected.csv", rowsToCsv(list));
    toast(`Exported ${list.length} contact${list.length === 1 ? "" : "s"}`);
  }

  return (
    <div>
      {/* Title + filters (incl. a compact search) on one row — no standalone
          search bar eating a whole row (Suren). */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            Contacts
          </h1>
          <p className="text-[14px] text-text-secondary mt-0.5">
            Decision-makers across your accounts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="relative w-[190px]">
            <Search size={15} strokeWidth={1.6} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contacts…"
              className="w-full text-[13px] bg-surface border border-border rounded-md pl-8 pr-3 py-2 outline-none focus:border-blue-primary"
            />
          </div>
          <ColorSelect
            value={role}
            onChange={setRole}
            minWidth={150}
            options={[
              { value: "all", label: "All roles" },
              ...roles.map<ColorOption>((r) => ({
                value: r,
                label: r,
                color: roleStyle(r).color,
              })),
            ]}
          />
          <ColorSelect
            value={sort}
            onChange={setSort}
            minWidth={150}
            options={[
              { value: "name", label: "Name A–Z", icon: ArrowDownWideNarrow },
              { value: "company", label: "Company A–Z", icon: ArrowDownWideNarrow },
            ]}
          />
          {/* Grid ↔ list view (Suren: "we need a grid view on this or whatever
              the other view is"). */}
          <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setLayout("grid")}
              aria-label="Grid view"
              aria-pressed={layout === "grid"}
              className={cn(
                "inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-2 transition-colors",
                layout === "grid"
                  ? "bg-blue-light text-blue-primary"
                  : "text-text-secondary hover:bg-surface"
              )}
            >
              <LayoutGrid size={15} strokeWidth={1.8} />
              Grid
            </button>
            <button
              onClick={() => setLayout("list")}
              aria-label="List view"
              aria-pressed={layout === "list"}
              className={cn(
                "inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-2 border-l border-border transition-colors",
                layout === "list"
                  ? "bg-blue-light text-blue-primary"
                  : "text-text-secondary hover:bg-surface"
              )}
            >
              <List size={15} strokeWidth={1.8} />
              List
            </button>
          </div>
          <button
            onClick={() => {
              setSelectMode((m) => !m);
              setSelected(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border transition-colors",
              selectMode
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            <CheckSquare size={15} strokeWidth={1.8} />
            {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <Download size={16} strokeWidth={1.5} />
            Export CSV
          </button>
        </div>
      </div>
      {/* Bulk action bar — shows the moment Select is on, with SELECT ALL and
          the voice-agent run INLINE (Suren: "select a bunch of contacts, then
          for every offering category there's a voice agent you select and
          run") — no popup blocking the list. */}
      {selectMode && (
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-blue-primary bg-blue-light">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-blue-primary tnum">
              {selected.size} selected
            </span>
            <button
              onClick={() =>
                setSelected(
                  selected.size === view.length
                    ? new Set()
                    : new Set(view.map((r) => r.id))
                )
              }
              className="text-[13px] font-semibold text-blue-primary hover:underline"
            >
              {selected.size === view.length
                ? "Clear all"
                : `Select all (${view.length})`}
            </button>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {voiceCategories.length > 0 && (
                <>
                  <select
                    aria-label="Voice agent category"
                    value={voiceCategory}
                    onChange={(e) => setVoiceCategory(e.target.value)}
                    className="text-[12.5px] font-medium bg-white border border-border-light rounded-md px-2.5 py-1.5 outline-none focus:border-blue-primary max-w-[280px]"
                  >
                    {voiceCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={runVoiceAgent}
                    disabled={voiceBusy || selected.size === 0}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md border border-blue-primary text-blue-primary hover:bg-white transition-colors disabled:opacity-50"
                  >
                    <PhoneCall size={15} strokeWidth={1.8} />
                    {voiceBusy
                      ? "Queuing…"
                      : `Run voice agent${selected.size ? ` (${selected.size})` : ""}`}
                  </button>
                </>
              )}
              <button
                onClick={exportSelected}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
              >
                <Download size={15} strokeWidth={1.8} />
                Export selected
              </button>
              <button
                onClick={() => {
                  setSelected(new Set());
                  setSelectMode(false);
                }}
                aria-label="Done selecting"
                className="text-text-tertiary hover:text-text-primary"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          {voiceCategories.length > 0 && (
            <p className="text-[11.5px] text-text-secondary mt-1.5">
              The {voiceCategory} agent calls each selected contact about that
              category&apos;s offerings — calls queue until a phone number is
              connected, nothing dials silently.
            </p>
          )}
        </div>
      )}

      {view.length > 0 && (
        <p className="text-[13px] text-text-secondary mb-4 tnum">
          Showing <span className="font-semibold text-text-primary">{view.length}</span> of{" "}
          <span className="font-semibold text-text-primary">{rows.length}</span>{" "}
          {rows.length === 1 ? "contact" : "contacts"}
        </p>
      )}

      {view.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={UserSearch}
            title="No contacts match"
            description="Try a different search or role filter."
            action={
              q || role !== "all" ? (
                <button
                  onClick={() => {
                    setQ("");
                    setRole("all");
                  }}
                  className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : layout === "list" ? (
        // Compact list view — a dense, scannable alternative to the cards
        // (Suren: "we need a grid view on this or whatever the other view is").
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border-light stagger">
            {view.map((c) => {
              const isSel = selected.has(c.id);
              const row = (
                <>
                  {selectMode && (
                    <span className="text-blue-primary shrink-0">
                      {isSel ? (
                        <CheckSquare size={17} strokeWidth={1.8} />
                      ) : (
                        <Square size={17} strokeWidth={1.8} className="text-text-tertiary" />
                      )}
                    </span>
                  )}
                  <Avatar name={c.name} className="w-9 h-9 text-[13px] shrink-0" />
                  <div className="min-w-0 w-[38%] sm:w-[28%]">
                    <p className="text-[13.5px] font-semibold text-text-primary truncate">
                      {c.name}
                    </p>
                    <p className="text-[12px] text-text-tertiary truncate">
                      {c.title}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1">
                    <CompanyLogo name={c.company} className="w-5 h-5 text-[8px] shrink-0" />
                    <span className="text-[13px] text-text-secondary truncate">
                      {c.company}
                    </span>
                  </div>
                  {c.role && (
                    <Badge
                      label={c.role}
                      bg={roleStyle(c.role).bg}
                      color={roleStyle(c.role).color}
                      className="!normal-case tracking-normal shrink-0 hidden md:inline-flex"
                    />
                  )}
                  <span className="hidden lg:flex items-center gap-1.5 text-[12px] text-text-tertiary w-[24%] min-w-0">
                    <Mail size={12} strokeWidth={1.6} className="shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </span>
                </>
              );
              const rowClass =
                "w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface active:bg-blue-light/50";
              return selectMode ? (
                <button
                  key={c.id}
                  onClick={() => toggleSel(c.id)}
                  aria-pressed={isSel}
                  className={cn(rowClass, isSel && "bg-blue-light/60")}
                >
                  {row}
                </button>
              ) : (
                <Link key={c.id} href={`/contacts/${c.id}`} className={rowClass}>
                  {row}
                </Link>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {view.map((c) => {
            const isSel = selected.has(c.id);

            // The identity block is shared between select mode and browse mode —
            // avatar, name, title, company, role, and contact details.
            const identity = (
              <>
                <div className="flex items-center gap-3 mb-3">
                  {selectMode && (
                    <span className="text-blue-primary shrink-0">
                      {isSel ? (
                        <CheckSquare size={18} strokeWidth={1.8} />
                      ) : (
                        <Square size={18} strokeWidth={1.8} className="text-text-tertiary" />
                      )}
                    </span>
                  )}
                  <Avatar name={c.name} className="w-10 h-10 text-[14px]" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
                      {/* Stretched-link pattern: the name link's ::after overlay
                          covers the whole card, so clicking anywhere opens the
                          contact — while the LinkedIn icon (lifted above it) stays
                          its own separate link. No nested anchors. */}
                      {selectMode ? (
                        <span className="truncate">{c.name}</span>
                      ) : (
                        <Link
                          href={`/contacts/${c.id}`}
                          aria-label={`View ${c.name}`}
                          className="min-w-0 rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-1 group-hover:text-blue-primary transition-colors"
                        >
                          <span className="block truncate">{c.name}</span>
                        </Link>
                      )}
                      <span className="relative z-10 shrink-0">
                        <LinkedInLink url={c.linkedin} size={14} />
                      </span>
                    </p>
                    <p className="text-[13px] text-text-secondary truncate">{c.title}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {c.companyId ? (
                    // Lifted above the card's stretched link so it opens the
                    // COMPANY, not the contact (Suren: "click on the company here").
                    <Link
                      href={`/customers/${c.companyId}`}
                      className="relative z-10 flex items-center gap-2 min-w-0 group/co"
                    >
                      <CompanyLogo name={c.company} className="w-5 h-5 text-[8px] shrink-0" />
                      <span className="text-[13px] text-text-secondary truncate group-hover/co:text-blue-primary transition-colors">
                        {c.company}
                      </span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 min-w-0">
                      <CompanyLogo name={c.company} className="w-5 h-5 text-[8px] shrink-0" />
                      <span className="text-[13px] text-text-secondary truncate">{c.company}</span>
                    </span>
                  )}
                  {c.role && (
                    <Badge label={c.role} bg={roleStyle(c.role).bg} color={roleStyle(c.role).color} className="!normal-case tracking-normal shrink-0" />
                  )}
                </div>
                {(c.email || c.phone) && (
                  <div className="mt-2 pt-2 border-t border-border-light space-y-1">
                    {c.email && (
                      <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                        <Mail size={12} strokeWidth={1.6} className="shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary tnum">
                        <PhoneCall size={12} strokeWidth={1.6} className="shrink-0" />
                        <span className="truncate">{c.phone}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            );

            if (selectMode) {
              return (
                <Card
                  key={c.id}
                  onClick={() => toggleSel(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSel(c.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={`Select ${c.name}`}
                  className={cn(
                    "relative transition-all duration-150 h-full cursor-pointer",
                    isSel
                      ? "border-blue-primary ring-1 ring-blue-primary"
                      : "hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98] active:shadow-none active:translate-y-0"
                  )}
                >
                  <div>{identity}</div>
                </Card>
              );
            }

            // Browse mode: the voice-station scale-up hover (Suren: "do that for
            // the customers and the contacts too"). Resting card is unchanged; on
            // hover it pops out and reveals engagement + one-tap Email/Call.
            const touches = c.touches ?? 0;
            return (
              <HoverExpandCard
                key={c.id}
                className="h-full"
                summary={identity}
                extra={
                  <>
                    {/* Charts like the voice-agent reveal (Suren): how this
                        contact's touches landed + the weekly touch trend. */}
                    {c.outcomeMix && c.outcomeMix.length > 0 && (
                      <div className="mb-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                          How touches landed
                        </p>
                        <div className="flex items-center gap-3">
                          <DonutChart
                            segments={c.outcomeMix}
                            size={78}
                            thickness={10}
                            centerLabel={String(touches)}
                            centerSub="touches"
                          />
                          <DonutLegend items={c.outcomeMix} />
                        </div>
                      </div>
                    )}
                    {c.trend && c.trend.some((v) => v > 0) && (
                      <div className="mb-3.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            Activity · last 8 weeks
                          </p>
                        </div>
                        <Sparkline
                          points={c.trend}
                          color={VIZ.blue}
                          height={34}
                          unit="touches"
                          pointTips={c.trendTips}
                          xLabels={c.trend.map((_, i) =>
                            i === c.trend!.length - 1 ? "this week" : `${c.trend!.length - 1 - i}w ago`
                          )}
                        />
                      </div>
                    )}
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                      Engagement
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { l: "Touches", v: String(touches) },
                        { l: "Offerings", v: String(c.offerings ?? 0) },
                        { l: "Last spoke", v: c.lastTouch ? formatDate(c.lastTouch) : "—" },
                      ].map((s) => (
                        <div key={s.l} className="rounded-lg bg-surface px-2.5 py-2">
                          <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            {s.l}
                          </p>
                          <p className="text-[13px] font-semibold text-text-primary tnum truncate mt-0.5">
                            {s.v}
                          </p>
                        </div>
                      ))}
                    </div>
                    {c.lastOutcome && (
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] text-text-tertiary">Latest outcome</span>
                        <OutcomeBadge outcome={c.lastOutcome} />
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="relative z-10 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
                        >
                          <Mail size={13} strokeWidth={1.9} />
                          Email
                        </a>
                      )}
                      {c.phone && (
                        <a
                          href={tel(c.phone)}
                          className="relative z-10 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
                        >
                          <PhoneCall size={13} strokeWidth={1.9} />
                          Call
                        </a>
                      )}
                    </div>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
