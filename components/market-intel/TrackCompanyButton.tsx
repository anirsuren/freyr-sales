"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * ADD A COMPANY BY ITS OWN SOURCES (Anir, Sep 10: "the user enters the
 * official site and the official LinkedIn. At least one is mandatory").
 * Nothing is guessed: the website someone types is the website that is
 * searched, the LinkedIn page they paste is the page that is read. Posts come
 * from LinkedIn, press releases from the website, and news and the AI rundown
 * come with either.
 *
 * One column, explanations tucked into the ? hints ("left side is fine, I
 * don't think we need the right side, put that in an i or ?"). A company
 * somebody already has is not scraped again; it is simply ticked onto this
 * person's list.
 */

/** The domain someone typed, or null when it is not a website. */
function siteDomain(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let host = "";
  try {
    host = new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./i, "").toLowerCase();
  if (/(^|\.)linkedin\.com$/.test(host)) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
}

function linkedInSlug(raw: string): string | null {
  return raw.match(/linkedin\.com\/company\/([^/?#\s]+)/i)?.[1] ?? null;
}

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
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);

  const noun = group === "competitor" ? "competitor" : "company";
  const domain = siteDomain(website);
  const slug = linkedInSlug(linkedinUrl);
  const bothEmpty = !website.trim() && !linkedinUrl.trim();

  function reset() {
    setWebsite("");
    setLinkedinUrl("");
    setDivisions([]);
    setError("");
  }

  async function save() {
    /* AT LEAST ONE, AND EACH ONE RIGHT, before anything is sent. */
    if (bothEmpty) {
      setError("Enter their website or their LinkedIn page. At least one is needed.");
      return;
    }
    if (website.trim() && !domain) {
      setError(
        /linkedin\.com/i.test(website)
          ? "That's a LinkedIn link. Put it in the LinkedIn page box."
          : "That website doesn't look right. It should look like gsk.com."
      );
      return;
    }
    if (linkedinUrl.trim() && !slug) {
      setError("That LinkedIn link should be a company page, like linkedin.com/company/gsk.");
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
          website: domain ?? "",
          linkedinUrl: slug ? linkedinUrl.trim() : "",
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
      reset();
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

  const field = (props: {
    id: string;
    label: string;
    hint: string;
    icon: React.ReactNode;
    color: string;
    value: string;
    set: (v: string) => void;
    placeholder: string;
    ok: boolean;
  }) => (
    <div>
      <label htmlFor={props.id} className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
        {props.label}
        <InfoHint text={props.hint} />
      </label>
      <div
        className={cn(
          "mt-1.5 flex h-12 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition-colors focus-within:border-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/10",
          "border-border-light"
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ color: props.color, background: tint(props.color, 12) }}
        >
          {props.icon}
        </span>
        <input
          id={props.id}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
          value={props.value}
          onChange={(e) => {
            props.set(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void save();
          }}
          placeholder={props.placeholder}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        {props.ok && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(26,122,53,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink-green)]">
            <Check size={11} strokeWidth={2.8} /> Looks right
          </span>
        )}
      </div>
    </div>
  );

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
        size="wide"
        title={title}
        titleAfter={
          <InfoHint
            text={`Enter their official website, their LinkedIn page, or both. The website gives press releases and updates, LinkedIn gives their posts, and news from Google plus an AI rundown come with either. A ${noun} somebody already has is just ticked onto your list, so nothing is collected twice.`}
          />
        }
      >
        <div className="flex flex-col gap-4">
          {field({
            id: "mi-company-site",
            label: "Official website",
            hint: "Their own website, like gsk.com. Press releases and updates are collected from it and nowhere else.",
            icon: <Globe2 size={14} strokeWidth={2.2} />,
            color: "var(--ink-orange)",
            value: website,
            set: setWebsite,
            placeholder: "their-website.com",
            ok: !!domain,
          })}
          {field({
            id: "mi-company-link",
            label: "LinkedIn page",
            hint: "Their company page, not a person's profile, like linkedin.com/company/gsk. Their posts are collected from it.",
            icon: <LinkedInIcon size={14} />,
            color: "var(--ink-bright-blue)",
            value: linkedinUrl,
            set: setLinkedinUrl,
            placeholder: "linkedin.com/company/their-name",
            ok: !!slug,
          })}
          <p className="-mt-2 min-h-[18px] text-[12px] leading-snug" aria-live="polite">
            {error ? (
              <span className="font-medium text-[#DC2626]">{error}</span>
            ) : bothEmpty ? (
              <span className="text-text-tertiary">Fill in at least one. Both is best.</span>
            ) : null}
          </p>

          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
              Divisions
              <InfoHint text={`Which of Freyr's divisions this ${noun} matters to. Needed for one nobody is tracking yet; pick every one that applies.`} />
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2" role="group" aria-label="Divisions">
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
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
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
              <span className="text-[11.5px] text-text-tertiary">{busy ? "Reading their pages. About half a minute." : ""}</span>
            )}
            <Button onClick={save} loading={busy} className="!px-5 !py-2.5 text-[13.5px]">
              Start tracking
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
