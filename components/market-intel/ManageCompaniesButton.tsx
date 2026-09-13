"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownAZ,
  Building2,
  Check,
  CheckSquare,
  CircleSlash,
  ExternalLink,
  Globe2,
  Layers,
  ListChecks,
  Minus,
  Newspaper,
  Radio,
  Save,
  Loader2,
  Star,
  Swords,
  Tag,
  Trash2,
} from "lucide-react";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { useCollectionStatusRefresh } from "./useCollectionStatusRefresh";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { tint } from "@/lib/tint";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionChips } from "@/components/market-intel/DivisionChips";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { WatchStatus } from "@/components/market-intel/WatchStatus";
import { DIVISIONS, DIVISION_META } from "@/lib/offeringMaterials";
import { cn } from "@/lib/utils";
import { applyBookmarkChanges } from "@/lib/marketIntelBookmarkChanges";
import { useLeaveGuard } from "@/lib/useLeaveGuard";
import type { ManagedCompany } from "@/lib/marketIntelManaged";

/**
 * THE PLACE WHERE YOU BUILD YOUR PAGE (Anir, Sep 10: "It should be
 * checkboxes, and checkboxes are what let me see it. If GSK is not checked
 * off, I won't be able to see it on the page").
 *
 * Every company in this section is listed here, ticked or not: competitors in
 * Competitor Intelligence, customers in Customer Intelligence, never both
 * (Anir, Sep 11: "if i want to see customers ill go to the other section").
 * Ticking one edits a draft; Save changes updates your tracking list. The star is a separate
 * thing: a favourite inside your own list, which ticks the box too, because a
 * favourite you cannot see would be pointless.
 *
 * A PAGE OF ITS OWN (Anir, Sep 11: "the manage competitors should be like a
 * full page when i click on it... track competitors is a popup. that makes
 * more sense"). The toolbar and the list use the whole width; adding a
 * company is still the Track pop-up in the header.
 */
export type { ManagedCompany } from "@/lib/marketIntelManaged";

function CollectionStatus({ company: c }: { company: ManagedCompany }) {
  if (!c.onboarding) return null;
  return <span role="status" className={cn("inline-flex items-center gap-2 rounded-full border border-current/15 bg-white/80 px-3 py-1.5 text-xs font-semibold", c.onboarding.status === "failed" ? "text-red-600" : "text-blue-primary")}>
                            {c.onboarding.status === "failed" ? <AlertCircle size={13} /> : <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />}
                            {c.onboarding.status === "failed" ? "Collection needs attention" : c.onboarding.status === "queued" ? "Queued for collection" : c.onboarding.stage === "briefing" ? "Preparing briefing" : c.onboarding.stage === "saving" ? "Saving updates" : "Collection in progress"}
                          </span>;
}

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

type Show = "all" | "mine" | "starred" | "inactive";

/** Not being collected: added later, and on nobody's list. */
const idle = (c: ManagedCompany) => c.followers === 0 && !c.activeByDefault;
/** The "no division" choice in the division filter, same as the page grid. */
const UNTAGGED = "__untagged__";

/* A DIVISION IS SEARCHABLE TOO (Anir, Sep 11: "even the search bar didn't
   work" after typing "mdv"): the code finds its companies, and from three
   letters so does the division's name ("medical"). */
function matchesQuery(c: ManagedCompany, q: string): boolean {
  return (
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.divisions.some(
      (d) => d.toLowerCase() === q || (q.length >= 3 && DIVISION_META[d].label.toLowerCase().includes(q))
    )
  );
}

function passesDivision(c: ManagedCompany, filter: string[]): boolean {
  if (filter.length === 0) return true;
  if (c.divisions.length === 0) return filter.includes(UNTAGGED);
  return c.divisions.some((d) => filter.includes(d));
}
type Sort = "az" | "mine" | "status";

const WORDS = {
  customer: {
    button: "Manage customers",
    search: "Search customers…",
    empty: "No customer matches.",
  },
  competitor: {
    button: "Manage competitors",
    search: "Search competitors…",
    empty: "No competitor matches.",
  },
} as const;

/** Where Manage lives for each section. */
export function manageHref(group: "customer" | "competitor"): string {
  return group === "competitor" ? "/market-intel/manage?tab=competitors" : "/market-intel/manage";
}

/**
 * THE BUTTON IS A LINK NOW (Anir, Sep 11: "the manage competitors should be
 * like a full page when i click on it"). Same look as before; it opens the
 * Manage page for this section instead of a pop-up.
 */
export function ManageCompaniesButton({
  group = "customer",
  variant = "chip",
}: {
  group?: "customer" | "competitor";
  /** "cta" is the button inside the empty page, which has to be found. */
  variant?: "chip" | "cta";
}) {
  return (
    <Link
      href={manageHref(group)}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full font-semibold transition-colors",
        variant === "cta"
          ? "bg-blue-primary px-5 py-2.5 text-[13.5px] text-white hover:opacity-90"
          : "border border-border-light bg-white px-4 py-2 text-[13px] text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
      )}
    >
      <ListChecks size={14} strokeWidth={2.2} /> {WORDS[group].button}
    </Link>
  );
}

type ManageProps = {
  companies: ManagedCompany[];
  /** Which tab this was opened from: the copy and the default filter follow it. */
  group?: "customer" | "competitor";
  isAdmin?: boolean;
  /** Admin or BD: may add a company nobody is tracking yet. */
  canWrite?: boolean;
  /** What the viewer has ticked and starred, straight from the server. */
  myIds?: string[];
  starredIds?: string[];
};

export function ManageCompaniesPanel({
  companies,
  group = "customer",
  isAdmin = false,
  canWrite = false,
  myIds,
  starredIds,
}: ManageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const words = WORDS[group];
  const accent = group === "competitor" ? "var(--ink-magenta)" : "var(--ink-bright-blue)";
  const [rows, setRows] = useState<ManagedCompany[]>(companies);
  const [mine, setMine] = useState<Set<string>>(new Set(myIds ?? []));
  const [stars, setStars] = useState<Set<string>>(new Set(starredIds ?? []));
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("az");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ManagedCompany | null>(null);
  const [saved, setSaved] = useState({ mine: new Set(myIds ?? []), stars: new Set(starredIds ?? []) });
  const [saving, setSaving] = useState(false);
  const dirty = rows.some((c) => c.group === group &&
    (mine.has(c.id) !== saved.mine.has(c.id) || stars.has(c.id) !== saved.stars.has(c.id)));
  const draftRef = useRef({ mine, stars, saved });
  draftRef.current = { mine, stars, saved };
  const { leaving, stay, leave } = useLeaveGuard(dirty);
  const adopt = (ids: string[], favourites: string[]) => {
    setMine(new Set(ids));
    setStars(new Set(favourites));
    setSaved({ mine: new Set(ids), stars: new Set(favourites) });
  };

  useEffect(() => setRows(companies), [companies]);
  useCollectionStatusRefresh(rows);
  useEffect(() => {
    // Keep edited rows while incorporating newly tracked companies from the popup.
    const previous = draftRef.current;
    const allIds = new Set([...previous.mine, ...previous.saved.mine]);
    const changes = [...allIds].filter((id) =>
      previous.mine.has(id) !== previous.saved.mine.has(id) || previous.stars.has(id) !== previous.saved.stars.has(id))
      .map((id) => ({ id, on: previous.mine.has(id), star: previous.stars.has(id) }));
    const baseline = { companyIds: myIds ?? [], starredIds: starredIds ?? [] };
    const next = applyBookmarkChanges(baseline, changes);
    setMine(new Set(next.companyIds));
    setStars(new Set(next.starredIds));
    setSaved({ mine: new Set(baseline.companyIds), stars: new Set(baseline.starredIds) });
  }, [myIds, starredIds]);

  function toggleMine(company: ManagedCompany) {
    const next = new Set(mine);
    const favourites = new Set(stars);
    if (next.has(company.id)) { next.delete(company.id); favourites.delete(company.id); }
    else next.add(company.id);
    setMine(next);
    setStars(favourites);
  }

  function toggleStar(company: ManagedCompany) {
    const next = new Set(stars);
    if (next.has(company.id)) next.delete(company.id);
    else {
      next.add(company.id);
      setMine(new Set(mine).add(company.id));
    }
    setStars(next);
  }

  async function saveDraft() {
    if (saving || !dirty) return;
    setSaving(true);
    const changes = rows.filter((c) => c.group === group &&
      (mine.has(c.id) !== saved.mine.has(c.id) || stars.has(c.id) !== saved.stars.has(c.id)))
      .map((c) => ({ id: c.id, on: mine.has(c.id), star: stars.has(c.id) }));
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your list. Your changes are still here.");
      adopt(data.companyIds, data.starredIds);
      const count = rows.filter((c) => c.group === group && data.companyIds.includes(c.id)).length;
      toast(`Now tracking ${count} ${count === 1 ? "company" : "companies"}.`);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save your list. Your changes are still here.", "error");
    } finally { setSaving(false); }
  }

  async function remove(company: ManagedCompany) {
    setBusy(company.id);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "company", id: company.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete.");
      setRows((cur) => cur.filter((c) => c.id !== company.id));
      setMine((cur) => {
        const next = new Set(cur);
        next.delete(company.id);
        return next;
      });
      setStars((cur) => {
        const next = new Set(cur);
        next.delete(company.id);
        return next;
      });
      toast(`${company.name} is gone for everyone.`);
      setConfirming(null);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not delete.", "error");
    } finally {
      setBusy(null);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const rank = (c: ManagedCompany) => (idle(c) ? 1 : 0);
    return rows
      .filter((c) => c.group === group && passesDivision(c, divisionFilter) && matchesQuery(c, q))
      .filter((c) =>
        show === "all"
          ? true
          : show === "mine"
            ? mine.has(c.id)
            : show === "starred"
              ? stars.has(c.id)
              : idle(c)
      )
      .sort((a, b) =>
        sort === "mine"
          ? Number(mine.has(b.id)) - Number(mine.has(a.id)) || a.name.localeCompare(b.name)
          : sort === "status"
            ? rank(a) - rank(b) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name)
      );
  }, [rows, q, group, divisionFilter, show, sort, mine, stars]);

  const inSection = useMemo(
    () => rows.filter((c) => c.group === group && passesDivision(c, divisionFilter)),
    [rows, group, divisionFilter]
  );
  const untaggedCount = rows.filter((c) => c.group === group && c.divisions.length === 0).length;
  const counts = {
    all: inSection.length,
    mine: inSection.filter((c) => mine.has(c.id)).length,
    starred: inSection.filter((c) => stars.has(c.id)).length,
    inactive: inSection.filter(idle).length,
  };

  const chip = (key: Show, label: string, Icon: LucideIcon, count: number) => {
    const on = show === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setShow(key)}
        aria-pressed={on}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
          on
            ? "border-transparent bg-blue-primary text-white"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
        )}
      >
        <Icon size={13} strokeWidth={2.2} />
        {label}
        <span className={cn("tnum", on ? "opacity-85" : "text-text-tertiary")}>{count}</span>
      </button>
    );
  };

  return (
    <>
      <div className="rise-in">
        <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: accent, background: tint(accent, 12) }}
          >
            {group === "competitor" ? <Swords size={17} strokeWidth={2.2} /> : <Building2 size={17} strokeWidth={2.2} />}
          </span>
          <h1 className="flex min-h-9 items-center text-[22px] font-bold leading-none tracking-[-0.02em] text-text-primary">{words.button}</h1>
          <InfoHint className="h-9 shrink-0 justify-center leading-none" text="Choose the companies you want to track, then Save changes. Star your favourites to find them quickly. To add a company that is not listed, use Track a company." />
          </div>
          {canWrite && (
            <span className="ml-auto">
              <TrackCompanyButton group={group} canTrack={canWrite} />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={words.search}
            aria-label={words.search.replace("…", "")}
            className="h-[34px] min-w-[220px] flex-1 rounded-full border border-border-light bg-white px-3.5 text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-subtle"
          />
          <MultiColorSelect
            values={divisionFilter}
            onChange={setDivisionFilter}
            ariaLabel="Filter by division"
            minWidth={235}
            dense
            collapsible={false}
            allLabel="All divisions"
            allIcon={Layers}
            options={[
              ...DIVISIONS.map((d) => ({
                value: d,
                label: `${DIVISION_META[d].label} (${d})`,
                color: DIVISION_META[d].color,
                icon: DIVISION_META[d].icon,
              })),
              { value: UNTAGGED, label: `Untagged (${untaggedCount})`, color: "#5B6B8C", icon: Tag },
            ]}
          />
          <ColorSelect
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            ariaLabel="Sort companies"
            minWidth={175}
            dense
            collapsible={false}
            options={[
              { value: "az", label: "By name (A to Z)", color: "var(--ink-violet-soft)", icon: ArrowDownAZ },
              { value: "mine", label: "By my list first", color: "var(--ink-bright-blue)", icon: CheckSquare },
              ...(isAdmin ? [{ value: "status", label: "By active first", color: "var(--ink-green)", icon: Radio }] : []),
            ]}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {chip("all", "Everything", Layers, counts.all)}
          {chip("mine", "My list", CheckSquare, counts.mine)}
          {chip("starred", "Starred", Star, counts.starred)}
          {isAdmin && chip("inactive", "Inactive", CircleSlash, counts.inactive)}
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border-light bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                <th className="w-[48%] py-2.5 pl-4 pr-3">
                  <span className="flex items-center gap-3">
                    Company
                  </span>
                </th>
                {isAdmin && <th className="w-[18%] px-3 py-2.5">Status</th>}
                <th className="w-[14%] px-3 py-2.5">Sources</th>
                <th className="w-[10%] px-3 py-2.5">Starred</th>
                {/* Only an admin has anything to do here, and it is one bin. */}
                {isAdmin && (
                  <th className="w-[56px] px-3 py-2.5">
                    <span className="sr-only">Delete</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((c) => {
                const on = mine.has(c.id);
                const starred = stars.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "transition-colors",
                      c.onboarding && c.onboarding.status !== "failed" && "mi-collecting-row",
                      on ? "bg-[rgba(0,113,227,0.035)] hover:bg-[rgba(0,113,227,0.06)]" : "hover:bg-surface"
                    )}
                  >
                    <td className="py-2.5 pl-4 pr-3">
                      <span className="flex items-center gap-3">
                        {/* THE TICK IS THE WHOLE POINT: what is ticked is what
                            shows on my page (Anir, Sep 10). It sits right
                            beside the name it belongs to. */}
                        <TickBox
                          checked={on}
                          disabled={saving}
                          onChange={() => void toggleMine(c)}
                          label={on ? `Stop tracking ${c.name}` : `Track ${c.name}`}
                          title={on ? "Selected. Save changes to update your list." : "Select to track, then Save changes."}
                        />
                        <MiLogo name={c.name} logoUrl={c.logoUrl} className="h-8 w-8 shrink-0" />
                        <span className="min-w-0">
                          <Link
                            href={`/market-intel/${c.id}`}
                            className="group/name inline-flex items-center gap-1 text-[13px] font-semibold text-text-primary hover:text-blue-primary"
                          >
                            {c.name}
                            <ExternalLink size={11} strokeWidth={2.2} className="opacity-0 transition-opacity group-hover/name:opacity-100" />
                          </Link>
                          {!isAdmin && <CollectionStatus company={c} />}
                          {c.divisions.length > 0 && <DivisionChips divisions={c.divisions} className="mt-0.5" />}
                        </span>
                      </span>
                    </td>
                    {isAdmin && <td className="px-3 py-2.5">
                      {c.onboarding ? <CollectionStatus company={c} /> : <WatchStatus state={{ followers: c.followers, byDefault: c.activeByDefault }} />}
                    </td>}
                    <td className="px-3 py-2.5">
                      {/* WHICH SOURCES IT IS SET UP FOR: LinkedIn needs a page,
                          the website needs a domain, news always runs. */}
                      <span className="flex items-center gap-1" aria-label={`Sources: LinkedIn ${c.sources.linkedin ? "yes" : "no"}, news yes, website ${c.sources.website ? "yes" : "no"}`}>
                        {(
                          [
                            { on: c.sources.linkedin, label: "LinkedIn page", Icon: LinkedInGlyph, color: "var(--ink-bright-blue)" },
                            { on: c.sources.news, label: "News", Icon: Newspaper, color: "var(--ink-teal-deep)" },
                            { on: c.sources.website, label: "Their website", Icon: Globe2, color: "var(--ink-orange)" },
                          ] as const
                        ).map((src) => (
                          <span
                            key={src.label}
                            title={src.on ? `${src.label}: ${c.onboarding ? "collection in progress" : "configured"}` : `${src.label}: not set up for this company`}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md",
                              src.on ? "" : "opacity-30 grayscale"
                            )}
                            style={{ color: src.color, background: src.on ? tint(src.color, 10) : "transparent" }}
                          >
                            <src.Icon size={12} strokeWidth={2.2} />
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {/* STARRED IS NOT MY LIST (Anir, Sep 10). It is a
                          favourite inside it, and it ticks the box for you. */}
                      <button
                        type="button"
                        onClick={() => void toggleStar(c)}
                        disabled={saving}
                        aria-pressed={starred}
                        aria-label={starred ? `Unstar ${c.name}` : `Star ${c.name}`}
                        title={
                          starred
                            ? "Unstar this company. Save changes to apply."
                            : on
                              ? "Star it as a favourite."
                              : "Star it as a favourite and select it for tracking. Save changes to apply."
                        }
                        className={cn(
                          "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors",
                          starred ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]" : "text-text-tertiary hover:bg-white hover:text-[#B45309]"
                        )}
                      >
                        <Star size={14} strokeWidth={2.2} fill={starred ? "currentColor" : "none"} />
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2.5">
                        {/* Red, and it asks first, like every delete; a bin
                            rather than a column of red squares. */}
                        <button
                          type="button"
                          onClick={() => setConfirming(c)}
                          disabled={busy === c.id || dirty || saving}
                          aria-label={`Delete ${c.name} for everyone`}
                          title="Delete for everyone"
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#B02020] opacity-60 transition-[opacity,background-color] hover:bg-[rgba(176,32,32,0.10)] hover:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 3} className="px-3 py-8 text-center text-[12.5px] text-text-tertiary">
                    {show === "mine"
                      ? "No companies selected. Select companies, then Save changes."
                      : show === "starred"
                        ? "Nothing starred yet. The star marks a favourite inside your list."
                        : show === "inactive"
                          ? "Nothing is inactive. Every company here is being collected."
                          : words.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-subtle bg-white py-3 pl-4 pr-20 shadow-lg" aria-live="polite">
        <span className="mr-auto text-[13px] font-medium text-text-secondary">
          {dirty ? `${rows.filter((c) => c.group === group && mine.has(c.id)).length} companies selected · Unsaved changes`
            : `Now tracking ${rows.filter((c) => c.group === group && saved.mine.has(c.id)).length} companies`}
        </span>
        {dirty && <button type="button" disabled={saving} onClick={() => adopt([...saved.mine], [...saved.stars])}
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-text-secondary hover:bg-surface disabled:opacity-50">Discard changes</button>}
        <button type="button" onClick={() => void saveDraft()} disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-full bg-blue-primary px-5 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      <ConfirmDialog open={leaving !== null} onClose={stay} onConfirm={leave}
        title="Leave without saving?" body="Your changes to this tracking list have not been saved."
        confirmLabel="Discard and leave" />
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && void remove(confirming)}
        busy={busy !== null}
        title={`Delete ${confirming?.name ?? ""} for everyone?`}
        body={
          <>
            Everything collected about <b>{confirming?.name}</b> is deleted, and it
            disappears for the whole team.
            {(confirming?.followers ?? 0) > 0 && (
              <>
                {" "}
                {confirming?.followers} {confirming?.followers === 1 ? "person has" : "people have"} it on their list; it leaves theirs too.
              </>
            )}
          </>
        }
        detail="It leaves every list, and everything collected for it goes too."
        confirmLabel="Delete for everyone"
      />
    </>
  );
}

/**
 * A TICK BOX THAT LOOKS LIKE PART OF THE APP. Still a real checkbox underneath
 * (keyboard, screen readers, label), drawn as a rounded square that fills
 * blue with a white tick, or a dash when only some rows are ticked.
 */
function TickBox({
  checked,
  indeterminate = false,
  onChange,
  label,
  title,
  disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  title?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        title={title ?? label}
        className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-[#C5CEDB] bg-white transition-colors hover:border-blue-primary checked:border-blue-primary checked:bg-blue-primary indeterminate:border-blue-primary indeterminate:bg-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <Check
        size={12}
        strokeWidth={3.4}
        className="pointer-events-none absolute inset-0 m-auto hidden text-white peer-checked:block"
      />
      <Minus
        size={12}
        strokeWidth={3.4}
        className="pointer-events-none absolute inset-0 m-auto hidden text-white peer-indeterminate:block"
      />
    </span>
  );
}
