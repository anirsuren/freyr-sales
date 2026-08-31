"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

/**
 * "It's just links, and you figure out everything else" (Anir, Aug 11). One
 * field: the company's LinkedIn page. The server reads the page for the name,
 * logo and followers, pulls the first posts and news, and writes the AI
 * rundown — the briefing exists by the time the toast shows.
 */
export function TrackCompanyButton({
  group = "customer",
  canTrack = true,
}: {
  group?: "customer" | "competitor";
  /**
   * MAY THEY ADD ONE (Suren's map: Market Intel is *view* for everyone except
   * Admin). This button used to render for anybody who could open the page,
   * and the endpoint behind it had no module guard at all, so a BD Member
   * could put companies on the watch list — each one firing a paid scrape
   * (found Aug 31, walking every role in the browser).
   */
  canTrack?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

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
        body: JSON.stringify({ kind: "company-link", linkedinUrl, group }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`Now tracking ${data.company?.name ?? "them"}. Briefing is ready.`);
      setOpen(false);
      setLinkedinUrl("");
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
        title="Track a company"
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
              pulled from the page itself.
            </p>
          </div>
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
