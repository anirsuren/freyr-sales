"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Star } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const [confirm, setConfirm] = useState<"remove" | "unstar" | null>(null);
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
      setConfirm(null);
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
      await save({ id: companyId, on: next });
      toast(next ? `Now tracking ${companyName}.` : `Stopped tracking ${companyName}.`);
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
            ? `${companyName} is now tracked and starred.`
            : `${companyName} is starred.`
          : `${companyName} is no longer starred. You are still tracking it.`
      );
    } catch (caught) {
      setStar(!next);
      setMine(mine);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  }

  return (
    <>
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => mine ? setConfirm("remove") : void toggleMine()}
        disabled={busy}
        aria-pressed={mine}
        title={
          mine
            ? "Tracking this company. Click to stop tracking."
            : "Track this company."
        }
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60",
          mine
            ? "border-transparent bg-[rgba(0,113,227,0.10)] text-[color:var(--ink-bright-blue)] hover:bg-[rgba(0,113,227,0.18)]"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        {mine ? <Check size={13} strokeWidth={2.6} /> : <Plus size={13} strokeWidth={2.6} />}
        {mine ? "Tracking" : "Track company"}
      </button>
      <button
        type="button"
        onClick={() => star ? setConfirm("unstar") : void toggleStar()}
        disabled={busy}
        aria-pressed={star}
        aria-label={star ? `Unstar ${companyName}` : `Star ${companyName}`}
        title={star ? "Starred. Click to unstar; tracking stays on." : "Star it as a favourite"}
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
    <ConfirmDialog
      open={confirm !== null}
      onClose={() => !busy && setConfirm(null)}
      onConfirm={() => void (confirm === "remove" ? toggleMine() : toggleStar())}
      busy={busy}
      tone="primary"
      title={confirm === "remove" ? "Stop tracking?" : "Remove star?"}
      body={confirm === "remove" ? `${companyName} will leave your Market Intel page and starred list. You can add it again from Manage companies.` : `${companyName} will no longer be starred. It will stay on your page.`}
      confirmLabel={confirm === "remove" ? "Stop tracking" : "Remove star"}
    />
    </>
  );
}
