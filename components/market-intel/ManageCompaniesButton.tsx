"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  Building2,
  ExternalLink,
  Globe2,
  Layers,
  ListChecks,
  Newspaper,
  PauseCircle,
  ShieldCheck,
  ShieldOff,
  Star,
  Swords,
  Trash2,
} from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { tint } from "@/lib/tint";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { DivisionChips } from "@/components/market-intel/DivisionChips";
import { WatchStatus, isPaused } from "@/components/market-intel/WatchStatus";
import type { Division } from "@/lib/offeringMaterials";
import { cn } from "@/lib/utils";

/**
 * EVERY COMPANY ON THE WATCH, IN ONE LIST (Anir, Sep 10: "I want a place
 * where I can see all my companies, see everything, remove stuff, and
 * bookmark stuff... it will show me a list. It's like a pop-up").
 *
 * One row per company, customers and competitors alike: why it is on the
 * watch, how busy it is, the star for your own list, and for an admin the
 * standing-watch switch and a delete. Wide and a fixed height, so filtering
 * never moves the frame (the list scrolls inside it).
 */
export type ManagedCompany = {
  id: string;
  name: string;
  group: "customer" | "competitor";
  standing: boolean;
  followers: number;
  divisions: Division[];
  itemsThisMonth: number;
  logoUrl: string | null;
  /** Which of the three sources this company is set up for. */
  sources: { linkedin: boolean; news: boolean; website: boolean };
};

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

type Show = "all" | "mine" | "standing" | "paused";
type Kind = "all" | "customer" | "competitor";
type Sort = "az" | "status" | "month";

export function ManageCompaniesButton({
  companies,
  isAdmin = false,
  canWrite = false,
  showAll = false,
}: {
  companies: ManagedCompany[];
  isAdmin?: boolean;
  /** Admin or BD: may wake a paused company (that costs a scrape). */
  canWrite?: boolean;
  /** Whether my page shows every company the team tracks, or only mine. */
  showAll?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ManagedCompany[]>(companies);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("az");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ManagedCompany | null>(null);
  const [confirmingStop, setConfirmingStop] = useState<ManagedCompany | null>(null);
  const [all, setAll] = useState(showAll);
  useEffect(() => setAll(showAll), [showAll]);

  async function toggleShowAll(next: boolean) {
    setAll(next);
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showAll: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(next ? "Your page now shows every company the team tracks." : "Your page now shows only your companies.");
      router.refresh();
    } catch (caught) {
      setAll(!next);
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    }
  }

  useEffect(() => setRows(companies), [companies]);

  // My own list, read when the pop-up opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/market-intel/bookmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive) setMine(new Set<string>(Array.isArray(data?.companyIds) ? data.companyIds : []));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  const patch = (id: string, change: Partial<ManagedCompany>) =>
    setRows((cur) => cur.map((c) => (c.id === id ? { ...c, ...change } : c)));

  async function toggleMine(company: ManagedCompany) {
    const on = !mine.has(company.id);
    const before = new Set(mine);
    const next = new Set(mine);
    if (on) next.add(company.id);
    else next.delete(company.id);
    setMine(next);
    patch(company.id, { followers: Math.max(0, company.followers + (on ? 1 : -1)) });
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: company.id, on }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      if (data?.resumed) toast(`${company.name} was paused and is back on the watch.`);
      else if (data?.paused) toast(`${company.name} is off your list. Nobody has it now, so it's paused.`);
      router.refresh();
    } catch (caught) {
      setMine(before);
      patch(company.id, { followers: company.followers });
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  async function toggleStanding(company: ManagedCompany) {
    setConfirmingStop(null);
    setBusy(company.id);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "standing", id: company.id, on: !company.standing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      patch(company.id, { standing: !company.standing });
      const nowPaused = company.standing && company.followers === 0;
      toast(
        !company.standing
          ? `${company.name} is now tracked for everyone.`
          : nowPaused
            ? `${company.name} is paused. Nobody has it on their list, so nothing new is collected until someone adds it back.`
            : `${company.name} is no longer tracked for everyone. It keeps updating while it's on someone's list.`
      );
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(null);
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
    const state = (c: ManagedCompany) => ({ standing: c.standing, followers: c.followers });
    const rank = (c: ManagedCompany) => (isPaused(state(c)) ? 2 : c.standing ? 0 : 1);
    return rows
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .filter((c) => kind === "all" || c.group === kind)
      .filter((c) =>
        show === "all"
          ? true
          : show === "mine"
            ? mine.has(c.id)
            : show === "standing"
              ? c.standing
              : isPaused(state(c))
      )
      .sort((a, b) =>
        sort === "month"
          ? b.itemsThisMonth - a.itemsThisMonth || a.name.localeCompare(b.name)
          : sort === "status"
            ? rank(a) - rank(b) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name)
      );
  }, [rows, q, kind, show, sort, mine]);

  const counts = {
    all: rows.length,
    mine: rows.filter((c) => mine.has(c.id)).length,
    standing: rows.filter((c) => c.standing).length,
    paused: rows.filter((c) => isPaused({ standing: c.standing, followers: c.followers })).length,
  };

  const chip = (key: Show, label: string, Icon: typeof Star, count: number) => {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
      >
        <ListChecks size={14} strokeWidth={2.2} /> Manage companies
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Companies on the watch"
        size="workflow"
        bodyClassName="flex h-[68vh] flex-col"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
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
            minWidth={165}
            dense
            collapsible={false}
            options={[
              { value: "az", label: "By name (A to Z)", color: "var(--ink-violet-soft)", icon: ArrowDownAZ },
              { value: "status", label: "By who has it", color: "var(--ink-bright-blue)", icon: ShieldCheck },
              { value: "month", label: "By this month", color: "var(--ink-teal-deep)", icon: Newspaper },
            ]}
          />
        </div>
        {/* THE BOX (Anir, Sep 10): my page shows my companies unless I ask
            for everyone's. */}
        <label className="mt-2.5 flex cursor-pointer items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2 text-[12.5px] text-text-primary">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => void toggleShowAll(e.target.checked)}
            className="h-4 w-4 accent-[#0071E3]"
          />
          <span className="font-semibold">Show all companies on my page</span>
          <span className="text-text-tertiary">
            {all ? "Everything the team tracks is on your page." : "Your page shows only what you added or starred."}
          </span>
        </label>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {chip("all", "Everything", Layers, counts.all)}
          {chip("mine", "My list", Star, counts.mine)}
          {chip("standing", "For everyone", ShieldCheck, counts.standing)}
          {chip("paused", "Paused", PauseCircle, counts.paused)}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-border-light">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                <th className="w-[30%] px-3 py-2.5">Company</th>
                <th className="w-[11%] px-3 py-2.5">Type</th>
                <th className="w-[19%] px-3 py-2.5">Status</th>
                <th className="w-[12%] px-3 py-2.5">Sources</th>
                <th className="w-[9%] px-3 py-2.5">This month</th>
                <th className="w-[7%] px-3 py-2.5">My list</th>
                <th className="w-[12%] px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((c) => {
                const state = { standing: c.standing, followers: c.followers };
                const on = mine.has(c.id);
                return (
                  <tr key={c.id} className={cn("transition-colors hover:bg-surface", isPaused(state) && "opacity-75")}>
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
                      <WatchStatus state={state} />
                    </td>
                    <td className="px-3 py-2.5">
                      {/* WHICH SOURCES IT IS SET UP FOR (Anir, Sep 10: "does it
                          have all the necessary data sources?"): LinkedIn needs
                          a page, the website needs a domain, news always runs. */}
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
                    <td className="px-3 py-2.5 text-[13px] text-text-secondary tnum">{c.itemsThisMonth}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void toggleMine(c)}
                        disabled={!on && isPaused(state) && !canWrite}
                        aria-pressed={on}
                        aria-label={on ? `Remove ${c.name} from my list` : `Add ${c.name} to my list`}
                        title={
                          on
                            ? "On your list. Click to remove it."
                            : isPaused(state) && !canWrite
                              ? "Paused. An admin or a BD member can bring it back."
                              : "Add to my list"
                        }
                        className={cn(
                          "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          on ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]" : "text-text-tertiary hover:bg-white hover:text-[#B45309]"
                        )}
                      >
                        <Star size={14} strokeWidth={2.2} fill={on ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {isAdmin ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => (c.standing && c.followers === 0 ? setConfirmingStop(c) : void toggleStanding(c))}
                            disabled={busy === c.id}
                            aria-pressed={c.standing}
                            aria-label={c.standing ? `Stop tracking ${c.name} for everyone` : `Track ${c.name} for everyone`}
                            title={c.standing ? "Stop tracking for everyone" : "Track for everyone"}
                            className={cn(
                              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:opacity-50",
                              c.standing
                                ? "bg-[rgba(0,113,227,0.10)] text-[color:var(--ink-bright-blue)] hover:bg-[rgba(0,113,227,0.18)]"
                                : "text-text-tertiary hover:bg-white hover:text-blue-primary"
                            )}
                          >
                            {c.standing ? <ShieldOff size={14} strokeWidth={2.1} /> : <ShieldCheck size={14} strokeWidth={2.1} />}
                          </button>
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
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-text-tertiary">Use the star</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[12.5px] text-text-tertiary">
                    {show === "mine"
                      ? "Nothing on your list yet. Press a star to add a company."
                      : show === "paused"
                        ? "Nothing is paused. Every company on the watch has somebody who wants it."
                        : "No company matches."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-text-tertiary">
          A company keeps updating while it is tracked for everyone or on
          someone&apos;s list. When nobody has it, it pauses: nothing new is
          collected until someone adds it back.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmingStop !== null}
        onClose={() => setConfirmingStop(null)}
        onConfirm={() => confirmingStop && void toggleStanding(confirmingStop)}
        busy={busy !== null}
        title={`Stop tracking ${confirmingStop?.name ?? ""} for everyone?`}
        body={
          <>
            Nobody has <b>{confirmingStop?.name}</b> on their list, so it will pause:
            nothing new is collected until someone adds it back. Everything collected so far stays.
          </>
        }
        detail="It disappears from the team's page. An admin can still find it under Paused."
        confirmLabel="Stop tracking"
      />
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && void remove(confirming)}
        busy={busy !== null}
        title={`Delete ${confirming?.name ?? ""} for everyone?`}
        body={
          <>
            Everything collected about <b>{confirming?.name}</b> is deleted, and it disappears
            for the whole team.
            {(confirming?.followers ?? 0) > 0 && (
              <>
                {" "}
                {confirming?.followers} {confirming?.followers === 1 ? "person has" : "people have"} it on their list; it leaves theirs too.
              </>
            )}
          </>
        }
        detail="To stop collecting without deleting anything, use Stop tracking for everyone instead. It pauses by itself once nobody has it on their list."
        confirmLabel="Delete for everyone"
      />
    </>
  );
}
