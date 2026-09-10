"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Star } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * ON MY PAGE, AND STARRED: the same two things the Manage companies pop-up
 * has, on the company's own briefing (Anir, Sep 10: "checkboxes are what let
 * me see it... Starred is completely different from my list").
 *
 * The tick decides whether this company appears on my Market Intel page, and
 * whether it keeps being collected at all. The star is a favourite inside my
 * list, and starring ticks the box for me.
 */
export function MyListToggle({
  companyId,
  companyName,
  onMyPage,
  starred,
}: {
  companyId: string;
  companyName: string;
  onMyPage: boolean;
  starred: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mine, setMine] = useState(onMyPage);
  const [star, setStar] = useState(starred);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save your list.");
      router.refresh();
      return data as { resumed?: boolean; stopped?: boolean };
    } finally {
      setBusy(false);
    }
  }

  async function toggleMine() {
    const next = !mine;
    setMine(next);
    if (!next) setStar(false);
    try {
      const data = await save({ id: companyId, on: next });
      if (data.resumed) toast(`${companyName} is on your page. Nobody had it, so it starts collecting again.`);
      else if (data.stopped) toast(`${companyName} is off your page. Nobody has it now, so it stops collecting.`);
      else toast(next ? `${companyName} is on your page.` : `${companyName} is off your page.`);
    } catch (caught) {
      setMine(!next);
      setStar(starred);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  async function toggleStar() {
    const next = !star;
    const joining = next && !mine;
    setStar(next);
    if (next) setMine(true);
    try {
      await save({ id: companyId, star: next });
      toast(
        next
          ? joining
            ? `${companyName} is starred, and now on your page too.`
            : `${companyName} is starred.`
          : `${companyName} is no longer starred. It stays on your page.`
      );
    } catch (caught) {
      setStar(!next);
      setMine(mine);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggleMine()}
        disabled={busy}
        aria-pressed={mine}
        title={
          mine
            ? "On your page. Click to take it off; if nobody else has it, it stops collecting."
            : "Put it on your page. That also keeps it collected."
        }
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60",
          mine
            ? "border-transparent bg-[rgba(0,113,227,0.10)] text-[color:var(--ink-bright-blue)] hover:bg-[rgba(0,113,227,0.18)]"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        {mine ? <Check size={13} strokeWidth={2.6} /> : <Plus size={13} strokeWidth={2.6} />}
        {mine ? "On my page" : "Add to my page"}
      </button>
      <button
        type="button"
        onClick={() => void toggleStar()}
        disabled={busy}
        aria-pressed={star}
        aria-label={star ? `Unstar ${companyName}` : `Star ${companyName}`}
        title={star ? "Starred. Click to unstar; it stays on your page." : "Star it as a favourite"}
        className={cn(
          "flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-60",
          star
            ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]"
            : "border border-border-light bg-white text-text-tertiary hover:text-[#B45309]"
        )}
      >
        <Star size={14} strokeWidth={2.2} fill={star ? "currentColor" : "none"} />
      </button>
    </span>
  );
}
