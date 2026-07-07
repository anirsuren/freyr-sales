"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Send } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Bulk controls for the inbox approval lane (V9). "Approve all" clears every
// pitch in compliance review; "Send all approved" delivers everything that's
// cleared but unsent. Each reuses the per-session semantics, just batched.
export function InboxBulkActions({
  approveCount,
  sendCount,
}: {
  approveCount: number;
  sendCount: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "send" | null>(null);

  const run = useCallback(
    async (kind: "approve" | "send") => {
      setBusy(kind);
      try {
        const res = await fetch(
          kind === "approve" ? "/api/agent/approve-all" : "/api/agent/send-all",
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        const data = await res.json();
        if (data.ok) {
          toast(
            kind === "approve"
              ? `Approved ${data.approved} pitch${data.approved === 1 ? "" : "es"}`
              : `Sent ${data.sent} approved pitch${data.sent === 1 ? "" : "es"}`
          );
          router.refresh();
        } else {
          toast(data.error || "Couldn't complete that", "error");
        }
      } catch {
        toast("Couldn't complete that", "error");
      } finally {
        setBusy(null);
      }
    },
    [router, toast]
  );

  // Keyboard triage (V9 #18): A = approve all, S = send all approved.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "a" && approveCount > 0 && busy === null) {
        e.preventDefault();
        run("approve");
      } else if (k === "s" && sendCount > 0 && busy === null) {
        e.preventDefault();
        run("send");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approveCount, sendCount, busy, run]);

  if (approveCount === 0 && sendCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {approveCount > 0 && (
        <button
          onClick={() => run("approve")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
        >
          <ShieldCheck size={15} strokeWidth={1.9} />
          {busy === "approve" ? "Approving…" : `Approve all (${approveCount})`}
        </button>
      )}
      {sendCount > 0 && (
        <button
          onClick={() => run("send")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-border-light text-blue-primary hover:bg-blue-light transition-colors disabled:opacity-50"
        >
          <Send size={15} strokeWidth={1.9} />
          {busy === "send" ? "Sending…" : `Send all approved (${sendCount})`}
        </button>
      )}
      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-text-tertiary ml-1">
        {approveCount > 0 && (
          <>
            <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-surface font-semibold">
              A
            </kbd>
            approve
          </>
        )}
        {sendCount > 0 && (
          <>
            <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-surface font-semibold ml-1.5">
              S
            </kbd>
            send
          </>
        )}
      </span>
    </div>
  );
}
