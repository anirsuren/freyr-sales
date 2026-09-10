"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe2, Loader2, Newspaper, Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * "It's just links, and you figure out everything else" (Anir, Aug 11). One
 * field: the company's LinkedIn page. The server reads the page for the name,
 * logo and posts, finds the news and the company's own website, and writes
 * the AI rundown, so the briefing exists by the time the toast shows.
 *
 * Sep 10 (Anir: "bigger popup, more aesthetic and visual, too much text that
 * can be tucked into a ? or an i"): a wide dialog with the form on the left
 * and what gets collected drawn on the right; every explanation lives in a
 * hint. A company somebody already has is not scraped again, it is simply
 * ticked onto this person's list.
 */
const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

const WHAT_YOU_GET: { Icon: LucideIcon; color: string; label: string; sub: string; hint: string }[] = [
  {
    Icon: LinkedInGlyph,
    color: "var(--ink-bright-blue)",
    label: "LinkedIn posts",
    sub: "From their company page",
    hint: "Read straight from the LinkedIn page you paste: the name, logo, follower count and the latest posts.",
  },
  {
    Icon: Newspaper,
    color: "var(--ink-teal-deep)",
    label: "News",
    sub: "Google News and today's headlines",
    hint: "Articles about them from Google News, plus a same-day search for stories Google has not picked up yet. Repeats of the same story are grouped.",
  },
  {
    Icon: Globe2,
    color: "var(--ink-orange)",
    label: "Their website",
    sub: "Press releases and updates",
    hint: "Their official website is found from the company name, then its recent press releases and news pages are collected.",
  },
  {
    Icon: Sparkles,
    color: "var(--ink-violet-soft)",
    label: "AI rundown",
    sub: "Nine signals and why they matter",
    hint: "Every item is read and tagged with one of the nine signals and a line on why it matters to Freyr, and a short rundown sums up the month.",
  },
];

export function TrackCompanyButton({
  group = "customer",
  canTrack = true,
  addedLeft = null,
  stacked = false,
  compact = false,
}: {
  group?: "customer" | "competitor";
  /** MAY THEY ADD ONE: the Market Intel row of the privilege table decides. */
  canTrack?: boolean;
  /** How many NEW companies this person may still add; null means no limit. */
  addedLeft?: number | null;
  /** Opened from inside another dialog (the Manage companies pop-up). */
  stacked?: boolean;
  /** A smaller button, for a dialog header. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);

  const noun = group === "competitor" ? "competitor" : "company";
  const slug = linkedinUrl.match(/linkedin\.com\/company\/([^/?#\s]+)/i)?.[1] ?? null;
  const typedSomething = linkedinUrl.trim().length > 0;

  async function save() {
    if (!linkedinUrl.trim()) {
      setError(`Paste the ${noun}'s LinkedIn page link.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "company-link",
          linkedinUrl,
          group,
          divisions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      const name = data.company?.name ?? "them";
      const where = data.company?.group === "competitor" ? "Competitor" : "Customer";
      toast(
        data.resumed
          ? `Nobody had ${name}, so it starts collecting again. It's on your page now.`
          : data.existing
            ? `${name} was already in the list (${where} Intelligence), so nothing new was scraped. It's on your page now.`
            : `Now tracking ${name}. It's on your page and the briefing is ready.`
      );
      setOpen(false);
      setLinkedinUrl("");
      setDivisions([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  /* Every hook above has already run, so bailing here is safe. */
  if (!canTrack) return null;

  const title = group === "competitor" ? "Track a competitor" : "Track a company";

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={compact ? "!px-3 !py-1.5 text-[12.5px]" : "!px-4 !py-2 text-[13px]"}
      >
        <Plus size={compact ? 14 : 15} strokeWidth={2.4} />
        {title}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        stacked={stacked}
        size="workflow"
        dialogClassName="!max-w-[880px]"
        title={title}
        titleAfter={
          <InfoHint
            text={`Paste their LinkedIn page and everything else is found for you. A ${noun} somebody already has is simply ticked onto your list, so nothing is collected twice.`}
          />
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.35fr_1fr]">
          {/* ---------------------------------------------------- the form */}
          <div className="flex min-w-0 flex-col">
            <label
              htmlFor="mi-company-link"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary"
            >
              LinkedIn page
              <InfoHint text="The company page, not a person's profile. It looks like linkedin.com/company/their-name." />
            </label>
            <div
              className={cn(
                "mt-2 flex h-12 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition-colors focus-within:border-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/10",
                error ? "border-[#DC2626]" : "border-border-light"
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,113,227,0.10)] text-[color:var(--ink-bright-blue)]">
                <LinkedInIcon size={14} />
              </span>
              <input
                id="mi-company-link"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void save();
                }}
                placeholder="linkedin.com/company/their-name"
                autoFocus
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
              />
              {slug && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(26,122,53,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink-green)]">
                  <Check size={11} strokeWidth={2.8} /> Looks right
                </span>
              )}
            </div>
            <p className="mt-1.5 min-h-[18px] text-[12px] leading-snug">
              {error ? (
                <span className="font-medium text-[#DC2626]">{error}</span>
              ) : typedSomething && !slug ? (
                <span className="text-text-tertiary">It should look like linkedin.com/company/their-name</span>
              ) : null}
            </p>

            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
              Divisions
              <InfoHint text={`Which of Freyr's divisions this ${noun} matters to. Needed for one nobody is tracking yet; pick every one that applies.`} />
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Divisions">
              {DIVISIONS.map((d) => {
                const meta = DIVISION_META[d];
                const Icon = meta.icon;
                const on = divisions.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() =>
                      setDivisions(on ? divisions.filter((v) => v !== d) : DIVISIONS.filter((v) => v === d || divisions.includes(v)))
                    }
                    className={cn(
                      "relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
                      on ? "shadow-[0_2px_10px_-4px_rgba(0,0,0,0.18)]" : "border-border-light bg-white hover:border-blue-subtle"
                    )}
                    style={on ? { borderColor: meta.color, background: tint(meta.color, 6) } : undefined}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ color: meta.color, background: tint(meta.color, 12) }}
                    >
                      <Icon size={16} strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold leading-tight text-text-primary">{meta.label}</span>
                      <span className="mt-0.5 block text-[11px] font-bold tracking-[0.04em]" style={{ color: meta.color }}>
                        {meta.short}
                      </span>
                    </span>
                    {on && (
                      <span
                        className="absolute right-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white"
                        style={{ background: meta.color }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-6">
              {addedLeft !== null ? (
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tnum",
                    addedLeft > 0
                      ? "bg-[rgba(0,113,227,0.08)] text-[color:var(--ink-bright-blue)]"
                      : "bg-[rgba(180,83,9,0.10)] text-[#B45309]"
                  )}
                >
                  {addedLeft} new {addedLeft === 1 ? "company" : "companies"} left
                  <InfoHint
                    text={
                      addedLeft > 0
                        ? "Adding one nobody is tracking yet uses one. Ticking companies already in the list is unlimited."
                        : "You've added the most new companies one person can. You can still tick any company already in the list."
                    }
                  />
                </span>
              ) : (
                <span />
              )}
              <Button onClick={save} loading={busy} className="!px-5 !py-2.5 text-[13.5px]">
                Start tracking
              </Button>
            </div>
          </div>

          {/* ------------------------------------ what gets collected, drawn */}
          <aside className="rounded-2xl border border-border-light bg-surface p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">What you&apos;ll get</p>
            <ul className="mt-3 space-y-2.5">
              {WHAT_YOU_GET.map((item) => (
                <li key={item.label} className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ color: item.color, background: tint(item.color, 12) }}
                  >
                    <item.Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-text-primary">{item.label}</span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">{item.sub}</span>
                  </span>
                  <InfoHint text={item.hint} />
                </li>
              ))}
            </ul>
            <p
              className={cn(
                "mt-3 flex items-center gap-1.5 text-[11.5px] font-medium transition-opacity",
                busy ? "text-blue-primary opacity-100" : "opacity-0"
              )}
              aria-live="polite"
            >
              <Loader2 size={12} strokeWidth={2.4} className={busy ? "animate-spin" : ""} />
              {busy ? "Reading the page and pulling everything. About half a minute." : " "}
            </p>
          </aside>
        </div>
      </Modal>
    </>
  );
}
