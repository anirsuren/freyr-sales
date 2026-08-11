"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

/**
 * Follow one more person: paste their LinkedIn profile link and that's it
 * (Anir, Aug 11: "it just asks me for the link, and you pull everything
 * else"). The server reads the profile for their name, title and photo, then
 * collects their first posts before the toast fires.
 */
export function TrackPersonButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  async function save() {
    if (!linkedinUrl.trim()) {
      setError("Paste their LinkedIn profile link.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "person-link", companyId, linkedinUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`Now following ${data.person?.name ?? "them"} at ${companyName}.`);
      setOpen(false);
      setLinkedinUrl("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[rgba(0,113,227,0.08)] text-blue-primary transition-colors hover:bg-blue-primary hover:text-white"
        aria-label={`Follow someone at ${companyName}`}
        title="Follow someone here"
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Follow someone at ${companyName}`}
      >
        <div className="space-y-3">
          <div>
            <label
              className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-text-primary"
              htmlFor="mi-person-link"
            >
              <LinkedInIcon size={12} /> Their LinkedIn profile
            </label>
            <input
              id="mi-person-link"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="linkedin.com/in/their-name"
              autoFocus
              disabled={busy}
            />
            <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
              That&apos;s all. Name, title, photo and their recent posts are
              pulled from the profile itself.
            </p>
          </div>
          {error && (
            <p className="text-[12.5px] font-medium text-[#DC2626]">{error}</p>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11.5px] text-text-tertiary">
              {busy ? "Reading the profile and pulling their posts…" : ""}
            </p>
            <Button onClick={save} loading={busy} className="!px-5 !py-2 text-[13px]">
              Follow their posts
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
