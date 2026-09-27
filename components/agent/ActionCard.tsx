"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { PendingActionPayload } from "@/lib/agentActionsShared";

/**
 * "DO YOU WANT TO DO THIS?" (Anir, Sep 26). The agent has proposed one
 * change; nothing has happened yet. Two buttons, the plain sentence of what
 * will change, and afterwards the plain sentence of what did. The primary
 * blue means "go"; red is reserved for destroying things, and this destroys
 * nothing.
 */
export function ActionCard({
  action,
  onDecide,
  compact = false,
}: {
  action: PendingActionPayload;
  onDecide?: (decision: "confirm" | "cancel") => Promise<void>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const open = action.status === "proposed" && !!onDecide;

  async function decide(decision: "confirm" | "cancel") {
    if (!onDecide || busy) return;
    setBusy(decision);
    try {
      await onDecide(decision);
    } finally {
      setBusy(null);
    }
  }

  const tone =
    action.status === "done"
      ? "border-[color:var(--status-green,#1f8f4d)]/40"
      : action.status === "failed"
        ? "border-[color:var(--status-red,#c8322b)]/40"
        : "border-blue-primary/30";

  return (
    <div
      data-testid="agent-action-card"
      className={cn(
        "mt-2 rounded-xl border bg-white text-left shadow-sm",
        compact ? "px-3 py-2.5 text-[12.5px]" : "px-4 py-3 text-[13.5px]",
        tone
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            action.status === "done"
              ? "bg-[color:var(--status-green,#1f8f4d)]/10 text-[color:var(--status-green,#1f8f4d)]"
              : action.status === "failed"
                ? "bg-[color:var(--status-red,#c8322b)]/10 text-[color:var(--status-red,#c8322b)]"
                : "bg-blue-light text-blue-primary"
          )}
        >
          {action.status === "done" ? <Check size={14} strokeWidth={2.4} /> : action.status === "failed" ? <X size={14} strokeWidth={2.4} /> : <Zap size={14} strokeWidth={2.2} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            {action.status === "proposed"
              ? "Proposed action"
              : action.status === "done"
                ? "Done"
                : action.status === "cancelled"
                  ? "Not done"
                  : action.status === "expired"
                    ? "Expired"
                    : "Could not do it"}
          </p>
          <p className="mt-0.5 leading-snug text-text-primary">{action.summary}</p>
          {action.status === "done" && action.result ? (
            <p className="mt-1 leading-snug text-text-secondary">
              {action.result}{" "}
              {action.link ? (
                <Link href={action.link} className="inline-flex items-center gap-0.5 font-medium text-blue-primary hover:underline">
                  Open it <ArrowRight size={12} strokeWidth={2.2} aria-hidden="true" />
                </Link>
              ) : null}
            </p>
          ) : null}
          {action.status === "failed" && action.result ? (
            <p className="mt-1 leading-snug text-text-secondary">{action.result}</p>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-2.5 flex items-center gap-2 pl-[34px]">
          <Button
            type="button"
            className={compact ? "px-3 py-1.5 text-[12.5px]" : "px-3.5 py-2 text-[13px]"}
            onClick={() => void decide("confirm")}
            loading={busy === "confirm"}
            disabled={busy !== null}
          >
            Do it
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={compact ? "px-3 py-1.5 text-[12.5px]" : "px-3.5 py-2 text-[13px]"}
            onClick={() => void decide("cancel")}
            loading={busy === "cancel"}
            disabled={busy !== null}
          >
            Not now
          </Button>
        </div>
      ) : null}
    </div>
  );
}
