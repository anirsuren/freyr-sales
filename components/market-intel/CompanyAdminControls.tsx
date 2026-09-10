"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

/**
 * WHAT AN ADMIN CAN DO TO A COMPANY (Anir, Sep 10): move it between the
 * customer and competitor tabs, or delete it for everyone. Nothing is
 * "tracked for everyone" any more: a company is collected while at least one
 * person has it ticked on their own list, and stops when the last person
 * unticks it.
 */
export function CompanyAdminControls({
  companyId,
  companyName,
  group,
  followers,
}: {
  companyId: string;
  companyName: string;
  group: "customer" | "competitor";
  /** How many people have it on their list, for the delete warning. */
  followers: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"group" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);

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
        detail="To stop collecting without deleting anything, untick it in Manage companies instead. It stops by itself once nobody has it."
        confirmLabel="Delete for everyone"
      />
    </span>
  );
}
