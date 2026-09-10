"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  Building2,
  CheckSquare,
  CircleSlash,
  ExternalLink,
  Globe2,
  Layers,
  ListChecks,
  Newspaper,
  Radio,
  Star,
  Swords,
  Trash2,
} from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { tint } from "@/lib/tint";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionChips } from "@/components/market-intel/DivisionChips";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { WatchStatus } from "@/components/market-intel/WatchStatus";
import type { Division } from "@/lib/offeringMaterials";
import { cn } from "@/lib/utils";

/**
 * THE PLACE WHERE YOU BUILD YOUR PAGE (Anir, Sep 10: "It should be
 * checkboxes, and checkboxes are what let me see it. If GSK is not checked
 * off, I won't be able to see it on the page").
 *
 * Every company the team knows about is listed here, ticked or not. Ticking
 * one puts it on your Market Intel page and keeps it collected; unticking it
 * takes it off your page, and if you were the last person who had it, the
 * collection stops. The star is a separate thing: a favourite inside your own
 * list, which ticks the box too, because a favourite you cannot see would be
 * pointless.
 *
 * Wide and a fixed height, so filtering never moves the frame.
 */
export type ManagedCompany = {
  id: string;
  name: string;
  group: "customer" | "competitor";
  /** How many people have it on their list: 0 means nothing is collected. */
  followers: number;
  divisions: Division[];
  logoUrl: string | null;
  /** Which of the three sources this company is set up for. */
  sources: { linkedin: boolean; news: boolean; website: boolean };
};

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

type Show = "all" | "mine" | "starred" | "inactive";
type Kind = "all" | "customer" | "competitor";
type Sort = "az" | "mine" | "status";

const WORDS = {
  customer: {
    button: "Manage companies",
    title: "Companies on your watch",
    search: "Search companies…",
    empty: "No company matches.",
  },
  competitor: {
    button: "Manage competitors",
    title: "Competitors on your watch",
    search: "Search competitors…",
    empty: "No competitor matches.",
  },
} as const;

/**
 * ONE DIALOG FOR THE WHOLE PAGE. Both the toolbar chip and the button on the
 * empty page open the SAME pop-up: ticking the first company flips the page
 * from empty to a grid, and a dialog owned by the empty state would vanish
 * mid-click when that half of the page unmounts.
 */
const ManageOpen = createContext<((open: boolean) => void) | null>(null);

export function ManageCompaniesProvider({
  children,
  ...props
}: ManageProps & { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ManageOpen.Provider value={setOpen}>
      {children}
      <ManageCompaniesDialog {...props} open={open} onClose={() => setOpen(false)} />
    </ManageOpen.Provider>
  );
}

/** The button. It only opens the dialog the provider owns. */
export function ManageCompaniesButton({
  group = "customer",
  variant = "chip",
}: {
  group?: "customer" | "competitor";
  /** "cta" is the button inside the empty page, which has to be found. */
  variant?: "chip" | "cta";
}) {
  const setOpen = useContext(ManageOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen?.(true)}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full font-semibold transition-colors",
        variant === "cta"
          ? "bg-blue-primary px-5 py-2.5 text-[13.5px] text-white hover:opacity-90"
          : "border border-border-light bg-white px-4 py-2 text-[13px] text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
      )}
    >
      <ListChecks size={14} strokeWidth={2.2} /> {WORDS[group].button}
    </button>
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

function ManageCompaniesDialog({
  companies,
  group = "customer",
  isAdmin = false,
  canWrite = false,
  myIds,
  starredIds,
  open,
  onClose,
}: ManageProps & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const words = WORDS[group];
  const [rows, setRows] = useState<ManagedCompany[]>(companies);
  const [mine, setMine] = useState<Set<string>>(new Set(myIds ?? []));
  const [stars, setStars] = useState<Set<string>>(new Set(starredIds ?? []));
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [kind, setKind] = useState<Kind>(group);
  const [sort, setSort] = useState<Sort>("az");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ManagedCompany | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<{ ids: string[]; waking: number } | null>(null);
  const allBox = useRef<HTMLInputElement>(null);

  useEffect(() => setRows(companies), [companies]);
  useEffect(() => setMine(new Set(myIds ?? [])), [myIds]);
  useEffect(() => setStars(new Set(starredIds ?? [])), [starredIds]);
  useEffect(() => setKind(group), [group]);

  /* My list, re-read whenever the pop-up opens, so a change made on another
     tab or on a card is reflected here. */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/market-intel/bookmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setMine(new Set<string>(Array.isArray(data.companyIds) ? data.companyIds : []));
        setStars(new Set<string>(Array.isArray(data.starredIds) ? data.starredIds : []));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  const patch = (id: string, change: Partial<ManagedCompany>) =>
    setRows((cur) => cur.map((c) => (c.id === id ? { ...c, ...change } : c)));

  async function save(body: Record<string, unknown>) {
    const res = await fetch("/api/market-intel/bookmarks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save your list.");
    return data as { companyIds?: string[]; starredIds?: string[]; resumed?: boolean; stopped?: boolean };
  }

  /** THE TICK: on my page or not. */
  async function toggleMine(company: ManagedCompany) {
    const on = !mine.has(company.id);
    const beforeMine = new Set(mine);
    const beforeStars = new Set(stars);
    const nextMine = new Set(mine);
    const nextStars = new Set(stars);
    if (on) nextMine.add(company.id);
    else {
      nextMine.delete(company.id);
      nextStars.delete(company.id);
    }
    setMine(nextMine);
    setStars(nextStars);
    patch(company.id, { followers: Math.max(0, company.followers + (on ? 1 : -1)) });
    try {
      const data = await save({ id: company.id, on });
      if (data.resumed) toast(`${company.name} is on your page. Nobody had it, so it starts collecting again.`);
      else if (data.stopped) toast(`${company.name} is off your page. Nobody has it now, so it stops collecting.`);
      else if (on) toast(`${company.name} is on your page.`);
      else toast(`${company.name} is off your page.`);
      router.refresh();
    } catch (caught) {
      setMine(beforeMine);
      setStars(beforeStars);
      patch(company.id, { followers: company.followers });
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  /** THE STAR: a favourite, which is not the same as being on my list. */
  async function toggleStar(company: ManagedCompany) {
    const on = !stars.has(company.id);
    const beforeMine = new Set(mine);
    const beforeStars = new Set(stars);
    const nextStars = new Set(stars);
    const nextMine = new Set(mine);
    if (on) {
      nextStars.add(company.id);
      nextMine.add(company.id);
    } else nextStars.delete(company.id);
    setStars(nextStars);
    setMine(nextMine);
    const joining = on && !beforeMine.has(company.id);
    if (joining) patch(company.id, { followers: company.followers + 1 });
    try {
      const data = await save({ id: company.id, star: on });
      if (on) toast(joining ? `${company.name} is starred, and now on your page too.` : `${company.name} is starred.`);
      else toast(`${company.name} is no longer starred. It stays on your page.`);
      if (data.resumed) toast(`Nobody had ${company.name}, so it starts collecting again.`);
      router.refresh();
    } catch (caught) {
      setMine(beforeMine);
      setStars(beforeStars);
      patch(company.id, { followers: company.followers });
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  /** SELECT ALL, over exactly the rows on screen. */
  async function setBatch(ids: string[], on: boolean) {
    setConfirmBulk(null);
    if (ids.length === 0) return;
    const beforeMine = new Set(mine);
    const beforeStars = new Set(stars);
    const beforeRows = rows;
    const nextMine = new Set(mine);
    const nextStars = new Set(stars);
    for (const id of ids) {
      if (on) nextMine.add(id);
      else {
        nextMine.delete(id);
        nextStars.delete(id);
      }
    }
    setMine(nextMine);
    setStars(nextStars);
    setRows((cur) =>
      cur.map((c) =>
        ids.includes(c.id) && beforeMine.has(c.id) !== on
          ? { ...c, followers: Math.max(0, c.followers + (on ? 1 : -1)) }
          : c
      )
    );
    try {
      await save({ ids, on });
      toast(
        on
          ? `${ids.length} ${ids.length === 1 ? "company is" : "companies are"} on your page.`
          : `${ids.length} ${ids.length === 1 ? "company is" : "companies are"} off your page.`
      );
      router.refresh();
    } catch (caught) {
      setMine(beforeMine);
      setStars(beforeStars);
      setRows(beforeRows);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
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
    const rank = (c: ManagedCompany) => (c.followers > 0 ? 0 : 1);
    return rows
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .filter((c) => kind === "all" || c.group === kind)
      .filter((c) =>
        show === "all"
          ? true
          : show === "mine"
            ? mine.has(c.id)
            : show === "starred"
              ? stars.has(c.id)
              : c.followers === 0
      )
      .sort((a, b) =>
        sort === "mine"
          ? Number(mine.has(b.id)) - Number(mine.has(a.id)) || a.name.localeCompare(b.name)
          : sort === "status"
            ? rank(a) - rank(b) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name)
      );
  }, [rows, q, kind, show, sort, mine, stars]);

  const inKind = useMemo(
    () => rows.filter((c) => kind === "all" || c.group === kind),
    [rows, kind]
  );
  const counts = {
    all: inKind.length,
    mine: inKind.filter((c) => mine.has(c.id)).length,
    starred: inKind.filter((c) => stars.has(c.id)).length,
    inactive: inKind.filter((c) => c.followers === 0).length,
  };

  const shownTicked = shown.filter((c) => mine.has(c.id)).length;
  const allShownOn = shown.length > 0 && shownTicked === shown.length;
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = shownTicked > 0 && !allShownOn;
  }, [shownTicked, allShownOn]);

  function toggleAllShown() {
    const ids = shown.map((c) => c.id);
    if (allShownOn) {
      void setBatch(ids, false);
      return;
    }
    const adding = shown.filter((c) => !mine.has(c.id));
    const waking = adding.filter((c) => c.followers === 0).length;
    /* Waking a pile of companies at once starts a pile of paid scrapes: say
       how many before it happens. */
    if (waking > 3) {
      setConfirmBulk({ ids: adding.map((c) => c.id), waking });
      return;
    }
    void setBatch(adding.map((c) => c.id), true);
  }

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
      <Modal
        open={open}
        onClose={onClose}
        title={words.title}
        size="workflow"
        bodyClassName="flex h-[68vh] flex-col"
        titleAfter={
          <InfoHint text="Tick a company to put it on your page and keep it collected. Untick it and it leaves your page; if nobody else has it, it stops collecting and everything already collected is kept. The star is a favourite inside your own list, and starring ticks the box for you." />
        }
        actions={
          canWrite ? (
            <TrackCompanyButton
              group={group}
              canTrack={canWrite}
              stacked
              compact
            />
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={words.search}
            aria-label={words.search.replace("…", "")}
            className="h-[34px] min-w-[220px] flex-1 rounded-full border border-border-light bg-white px-3.5 text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-subtle"
          />
          <ColorSelect
            value={kind}
            onChange={(v) => setKind(v as Kind)}
            ariaLabel="Filter by type"
            minWidth={150}
            dense
            collapsible={false}
            options={[
              { value: "all", label: "All types", color: "var(--ink-bright-blue)", icon: Layers },
              { value: "customer", label: "Customers", color: "var(--ink-bright-blue)", icon: Building2 },
              { value: "competitor", label: "Competitors", color: "var(--ink-magenta)", icon: Swords },
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
              { value: "status", label: "By active first", color: "var(--ink-green)", icon: Radio },
            ]}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {chip("all", "Everything", Layers, counts.all)}
          {chip("mine", "My list", CheckSquare, counts.mine)}
          {chip("starred", "Starred", Star, counts.starred)}
          {chip("inactive", "Inactive", CircleSlash, counts.inactive)}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-border-light">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                <th className="w-[11%] px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <input
                      ref={allBox}
                      type="checkbox"
                      checked={allShownOn}
                      onChange={toggleAllShown}
                      disabled={shown.length === 0}
                      aria-label={allShownOn ? "Take all of these off my page" : "Put all of these on my page"}
                      title={allShownOn ? "Take all of these off my page" : "Put all of these on my page"}
                      className="h-4 w-4 cursor-pointer accent-[#0071E3]"
                    />
                    My list
                  </span>
                </th>
                <th className="w-[31%] px-3 py-2.5">Company</th>
                <th className="w-[11%] px-3 py-2.5">Type</th>
                <th className="w-[16%] px-3 py-2.5">Status</th>
                <th className="w-[12%] px-3 py-2.5">Sources</th>
                <th className="w-[8%] px-3 py-2.5">Starred</th>
                <th className="w-[11%] px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((c) => {
                const on = mine.has(c.id);
                const starred = stars.has(c.id);
                return (
                  <tr key={c.id} className={cn("transition-colors hover:bg-surface", !on && "opacity-[0.92]")}>
                    <td className="px-3 py-2.5">
                      {/* THE TICK IS THE WHOLE POINT: what is ticked is what
                          shows on my page (Anir, Sep 10). */}
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => void toggleMine(c)}
                        aria-label={on ? `Take ${c.name} off my page` : `Put ${c.name} on my page`}
                        title={
                          on
                            ? "On your page. Untick to take it off."
                            : c.followers === 0
                              ? "Not on your page. Ticking it starts collecting again."
                              : "Not on your page. Tick it to add it."
                        }
                        className="h-4 w-4 cursor-pointer accent-[#0071E3]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <MiLogo name={c.name} logoUrl={c.logoUrl} className="h-8 w-8 shrink-0" />
                        <span className="min-w-0">
                          <Link
                            href={`/market-intel/${c.id}`}
                            className="group/name inline-flex items-center gap-1 text-[13px] font-semibold text-text-primary hover:text-blue-primary"
                          >
                            {c.name}
                            <ExternalLink size={11} strokeWidth={2.2} className="opacity-0 transition-opacity group-hover/name:opacity-100" />
                          </Link>
                          {c.divisions.length > 0 && <DivisionChips divisions={c.divisions} className="mt-0.5" />}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          color: c.group === "competitor" ? "var(--ink-magenta)" : "var(--ink-bright-blue)",
                          background: c.group === "competitor" ? "rgba(180,49,143,0.10)" : "rgba(0,113,227,0.08)",
                        }}
                      >
                        {c.group === "competitor" ? <Swords size={11} strokeWidth={2.2} /> : <Building2 size={11} strokeWidth={2.2} />}
                        {c.group === "competitor" ? "Competitor" : "Customer"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <WatchStatus state={{ followers: c.followers }} />
                    </td>
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
                            title={src.on ? `${src.label}: collected` : `${src.label}: not set up for this company`}
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
                        aria-pressed={starred}
                        aria-label={starred ? `Unstar ${c.name}` : `Star ${c.name}`}
                        title={
                          starred
                            ? "Starred. Click to unstar; it stays on your page."
                            : on
                              ? "Star it as a favourite."
                              : "Star it as a favourite. That puts it on your page too."
                        }
                        className={cn(
                          "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors",
                          starred ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]" : "text-text-tertiary hover:bg-white hover:text-[#B45309]"
                        )}
                      >
                        <Star size={14} strokeWidth={2.2} fill={starred ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setConfirming(c)}
                          disabled={busy === c.id}
                          aria-label={`Delete ${c.name} for everyone`}
                          title="Delete for everyone"
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[color:#B02020] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                        >
                          <Trash2 size={13} strokeWidth={2.2} />
                        </button>
                      ) : (
                        <span className="text-[11.5px] text-text-tertiary">Use the tick box</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[12.5px] text-text-tertiary">
                    {show === "mine"
                      ? "Nothing on your list yet. Tick a company to put it on your page."
                      : show === "starred"
                        ? "Nothing starred yet. The star marks a favourite inside your list."
                        : show === "inactive"
                          ? "Nothing is inactive. Every company here is on somebody's list."
                          : words.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmBulk !== null}
        onClose={() => setConfirmBulk(null)}
        onConfirm={() => confirmBulk && void setBatch(confirmBulk.ids, true)}
        title={`Put ${confirmBulk?.ids.length ?? 0} companies on your page?`}
        body={
          <>
            <b>{confirmBulk?.waking}</b> of them are inactive right now, so ticking
            them starts collecting news and posts for each one again.
          </>
        }
        detail="Untick any of them later and they stop again once nobody has them."
        confirmLabel="Put them on my page"
      />
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
        detail="To stop collecting without deleting anything, untick it instead. It stops by itself once nobody has it."
        confirmLabel="Delete for everyone"
      />
    </>
  );
}
