"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * WHAT AN ADMIN CAN DO TO A COMPANY (Anir, Sep 10: "I should be able to add
 * and remove stuff"): put it on or take it off the workspace's standing
 * watch, move it between the customer and competitor tabs, or delete it for
 * everyone. Taking it off the watch does not stop anything by itself: it
 * keeps refreshing while anybody follows it, and pauses when nobody does.
 * Everybody else uses the star for their own list.
 */
export function CompanyAdminControls({
  companyId,
  companyName,
  group,
  standing,
  followers,
}: {
  companyId: string;
  companyName: string;
  group: "customer" | "competitor";
  standing: boolean;
  followers: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"standing" | "group" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/market-intel/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save.");
    return data;
  }

  async function toggleStanding() {
    setConfirmingStop(false);
    setBusy("standing");
    try {
      await post({ kind: "standing", id: companyId, on: !standing });
      toast(
        !standing
          ? `${companyName} is now tracked for everyone.`
          : followers > 0
            ? `${companyName} is no longer tracked for everyone. It keeps updating while it's on ${followers} ${followers === 1 ? "person's list" : "people's lists"}.`
            : `${companyName} is paused. Nobody has it on their list, so nothing new is collected until someone adds it back.`
      );
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function move() {
    setBusy("group");
    const next = group === "competitor" ? "customer" : "competitor";
    try {
      await post({ kind: "group", id: companyId, group: next });
      toast(`${companyName} moved to ${next === "competitor" ? "Competitor" : "Customer"} Intelligence.`);
      router.push(next === "competitor" ? "/market-intel?tab=competitors" : "/market-intel");
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "company", id: companyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete.");
      toast(`${companyName} is gone for everyone.`);
      router.push(group === "competitor" ? "/market-intel?tab=competitors" : "/market-intel");
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not delete.", "error");
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => (standing && followers === 0 ? setConfirmingStop(true) : void toggleStanding())}
        disabled={busy !== null}
        aria-pressed={standing}
        title={standing ? "Stop tracking it for the whole team. It keeps updating only while someone has it on their list." : "Track it for the whole team."}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
          standing
            ? "border-transparent bg-[rgba(0,113,227,0.10)] text-[color:var(--ink-bright-blue)] hover:bg-[rgba(0,113,227,0.16)]"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        {standing ? <ShieldOff size={13} strokeWidth={2} /> : <ShieldCheck size={13} strokeWidth={2} />}
        {standing ? "Stop tracking for everyone" : "Track for everyone"}
      </button>
      <button
        type="button"
        onClick={() => void move()}
        disabled={busy !== null}
        title={group === "competitor" ? "Move to Customer Intelligence" : "Move to Competitor Intelligence"}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:opacity-60"
      >
        <ArrowLeftRight size={13} strokeWidth={2} />
        {group === "competitor" ? "Move to customers" : "Move to competitors"}
      </button>
      {/* DELETE IS A RED SQUARE WITH A CONFIRM, like every delete in the app. */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy !== null}
        aria-label={`Delete ${companyName} for everyone`}
        title="Delete for everyone"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-[color:#B02020] text-white transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>

      {/* STOPPING WHEN NOBODY ELSE HAS IT PAUSES IT: say so before it happens. */}
      <ConfirmDialog
        open={confirmingStop}
        onClose={() => setConfirmingStop(false)}
        onConfirm={() => void toggleStanding()}
        busy={busy === "standing"}
        title={`Stop tracking ${companyName} for everyone?`}
        body={
          <>
            Nobody has <b>{companyName}</b> on their list, so it will pause: nothing
            new is collected until someone adds it back. Everything collected so far stays.
          </>
        }
        detail="It disappears from the team's page. An admin can still find it under Paused."
        confirmLabel="Stop tracking"
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
        busy={busy === "delete"}
        title={`Delete ${companyName} for everyone?`}
        body={
          <>
            Everything collected about <b>{companyName}</b> is deleted, and it
            disappears for the whole team.
            {followers > 0 && (
              <>
                {" "}
                {followers} {followers === 1 ? "person has" : "people have"} it on their own list; it leaves
                theirs too.
              </>
            )}
          </>
        }
        detail="To stop collecting without deleting anything, use Stop tracking for everyone instead. It pauses by itself once nobody has it on their list."
        confirmLabel="Delete for everyone"
      />
    </span>
  );
}
