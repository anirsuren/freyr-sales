"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { DivisionPicker } from "@/components/market-intel/DivisionChips";
import type { Division } from "@/lib/offeringMaterials";

/**
 * "It's just links, and you figure out everything else" (Anir, Aug 11). One
 * field: the company's LinkedIn page. The server reads the page for the name,
 * logo and followers, pulls the first posts and news, and writes the AI
 * rundown — the briefing exists by the time the toast shows.
 *
 * Sep 10: the divisions it belongs to (Saras), and ONE SHARED LIST (Anir): a
 * company already on the watch is not scraped again, it is simply added to
 * this person's own list, and the toast says which of the two happened.
 */
export function TrackCompanyButton({
  group = "customer",
  canTrack = true,
  addedLeft = null,
  isAdmin = false,
}: {
  group?: "customer" | "competitor";
  /** MAY THEY ADD ONE: the Market Intel row of the privilege table decides. */
  canTrack?: boolean;
  /** How many NEW companies this person may still add; null means no limit. */
  addedLeft?: number | null;
  /** Admins choose: the workspace's standing watch, or just their own list. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [standing, setStanding] = useState(true);

  async function save() {
    if (!linkedinUrl.trim()) {
      setError("Paste the company's LinkedIn page link.");
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
          standing: isAdmin && standing,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      const name = data.company?.name ?? "them";
      const where = data.company?.group === "competitor" ? "Competitor" : "Customer";
      toast(
        data.resumed
          ? `${name} was paused and is back on the watch. It's on your list now.`
          : data.existing
            ? `${name} was already on the watch (${where} Intelligence), so nothing new was scraped. It's on your list now.`
            : isAdmin && standing
              ? `Now tracking ${name} for everyone. Briefing is ready.`
              : `Now tracking ${name} on your list. Briefing is ready.`
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

  return (
    <>
      <Button onClick={() => setOpen(true)} className="!px-4 !py-2 text-[13px]">
        <Plus size={15} strokeWidth={2.4} />
        {group === "competitor" ? "Track a competitor" : "Track a company"}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={group === "competitor" ? "Track a competitor" : "Track a company"}
      >
        <div className="space-y-3">
          <div>
            <label
              className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-text-primary"
              htmlFor="mi-company-link"
            >
              <LinkedInIcon size={12} /> Their LinkedIn page
            </label>
            <input
              id="mi-company-link"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="linkedin.com/company/their-name"
              autoFocus
              disabled={busy}
            />
            <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
              That&apos;s all. Name, logo, posts, news and the rundown are
              pulled from the page itself. A company already being tracked is
              simply added to your list; nothing is collected twice.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-primary">
              Which of Freyr&apos;s divisions
            </p>
            <DivisionPicker value={divisions} onChange={setDivisions} disabled={busy} />
            <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
              Needed for a company that isn&apos;t on the list yet. Pick every one
              that applies.
            </p>
          </div>
          {isAdmin && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-text-primary">Who it&apos;s for</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who it's for">
                {[
                  { on: true, label: "For everyone" },
                  { on: false, label: "Just for me" },
                ].map((choice) => (
                  <button
                    key={String(choice.on)}
                    type="button"
                    aria-pressed={standing === choice.on}
                    disabled={busy}
                    onClick={() => setStanding(choice.on)}
                    className={
                      standing === choice.on
                        ? "flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white"
                        : "flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                    }
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
                For everyone: the whole team sees it and it keeps updating no
                matter what. Just for me: it goes on your list and keeps updating
                as long as someone has it on theirs.
              </p>
            </div>
          )}
          {addedLeft !== null && (
            <p className="text-[11.5px] text-text-secondary tnum">
              {addedLeft > 0
                ? `You can add ${addedLeft} more new ${addedLeft === 1 ? "company" : "companies"}. Following companies already on the list is unlimited.`
                : "You've added the most new companies one person can. You can still follow any company already on the list."}
            </p>
          )}
          {error && (
            <p className="text-[12.5px] font-medium text-[#DC2626]">{error}</p>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11.5px] text-text-tertiary">
              {busy ? "Reading the page and pulling everything. Takes about half a minute." : ""}
            </p>
            <Button onClick={save} loading={busy} className="!px-5 !py-2 text-[13px]">
              Start tracking
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
