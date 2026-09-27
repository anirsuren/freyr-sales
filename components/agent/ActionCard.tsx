"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleSlash, Clock, TriangleAlert, Zap } from "lucide-react";
import { AgentResponseMarkdown } from "@/components/agent/AgentResponseMarkdown";
import type { Entity } from "@/components/agent/EntityPills";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { actionLabel, type PendingActionPayload } from "@/lib/agentActionsShared";

/**
 * "DO YOU WANT TO DO THIS?" (Anir, Sep 26). The agent has proposed one
 * change; nothing has happened yet.
 *
 * Redesigned Sep 27 ("the confirmation where you approve something... I don't
 * really like the way they look"). The card now reads top to bottom as a
 * decision: a tinted header saying what state this is in and what kind of
 * change it is, the plain sentence of what will happen, then the two buttons
 * with the reassurance that nothing has moved yet. Afterwards the same card
 * carries the answer: green and what was done with a link to it, red and the
 * route's own words when it was refused.
 *
 * The header colour is the state and nothing else — blue waiting, green done,
 * red failed, amber expired, ink for a no. No colour is used as decoration.
 */

type Look = {
  label: string;
  icon: typeof Zap;
  /** Header strip. */
  strip: string;
  /** Icon chip inside the strip. */
  chip: string;
  /** The card's own border. */
  border: string;
};

function lookFor(status: PendingActionPayload["status"]): Look {
  switch (status) {
    case "done":
      return {
        label: "Done",
        icon: Check,
        strip: "bg-[color:var(--status-fill-success,#15803d)]/[0.07] text-[color:var(--status-fill-success,#15803d)]",
        chip: "bg-[color:var(--status-fill-success,#15803d)]/15 text-[color:var(--status-fill-success,#15803d)]",
        border: "border-[color:var(--status-fill-success,#15803d)]/30",
      };
    case "failed":
      return {
        label: "Couldn't do it",
        icon: TriangleAlert,
        strip: "bg-[color:var(--status-red,#DC2626)]/[0.07] text-[color:var(--status-red,#DC2626)]",
        chip: "bg-[color:var(--status-red,#DC2626)]/15 text-[color:var(--status-red,#DC2626)]",
        border: "border-[color:var(--status-red,#DC2626)]/30",
      };
    case "cancelled":
      return {
        label: "Not done",
        icon: CircleSlash,
        strip: "bg-surface text-text-secondary",
        chip: "bg-black/[0.06] text-text-secondary",
        border: "border-border-light",
      };
    case "expired":
      return {
        label: "Expired",
        icon: Clock,
        strip: "bg-[color:var(--ink-amber,#B45309)]/[0.07] text-[color:var(--ink-amber,#B45309)]",
        chip: "bg-[color:var(--ink-amber,#B45309)]/15 text-[color:var(--ink-amber,#B45309)]",
        border: "border-[color:var(--ink-amber,#B45309)]/30",
      };
    default:
      return {
        label: "Needs your approval",
        icon: Zap,
        strip: "bg-blue-light text-blue-primary",
        chip: "bg-blue-primary/15 text-blue-primary",
        border: "border-blue-primary/35",
      };
  }
}

export function ActionCard({
  action,
  onDecide,
  compact = false,
  entities = [],
}: {
  action: PendingActionPayload;
  onDecide?: (decision: "confirm" | "cancel") => Promise<void>;
  compact?: boolean;
  /** The workspace entity index, so names in the sentence become pills. */
  entities?: Entity[];
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const open = action.status === "proposed" && !!onDecide;
  const look = lookFor(action.status);
  const Icon = look.icon;

  async function decide(decision: "confirm" | "cancel") {
    if (!onDecide || busy) return;
    setBusy(decision);
    try {
      await onDecide(decision);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="agent-action-card"
      data-state={action.status}
      className={cn(
        "mt-2 overflow-hidden rounded-xl border bg-white text-left shadow-sm",
        look.border
      )}
    >
      {/* THE STATE, ACROSS THE TOP. One glance answers "is this waiting on me,
          or is it already done?" before any sentence is read. */}
      <div className={cn("flex items-center justify-between gap-3 px-3 py-2", look.strip)}>
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md", look.chip)}
          >
            <Icon size={12} strokeWidth={2.5} />
          </span>
          <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.07em]">
            {look.label}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
          {actionLabel(action.action)}
        </span>
      </div>

      <div className={cn(compact ? "px-3 py-2.5" : "px-3.5 py-3")}>
        {/* THE SENTENCE, RENDERED LIKE EVERY OTHER MESSAGE, so a person's name
            is a face and a goal is a chip right where it is said (Anir, Sep 27:
            "you put it in the pill shape everywhere else in the messages, you
            might as well just do it there. Why are you saying it twice?"). */}
        <div className={cn("leading-snug text-text-primary", compact ? "text-[13px]" : "text-[13.5px]")}>
          <AgentResponseMarkdown text={action.summary} entities={entities} />
        </div>

        {action.result && (action.status === "done" || action.status === "failed") ? (
          <p className="mt-1.5 leading-snug text-[12.5px] text-text-secondary">{action.result}</p>
        ) : null}

        {action.status === "done" && action.link ? (
          <Link
            href={action.link}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-border-light px-2.5 py-1 text-[12.5px] font-semibold text-blue-primary hover:bg-blue-light"
          >
            Open it <ArrowRight size={12} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        ) : null}

        {open ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
            <Button
              type="button"
              className={compact ? "px-3 py-1.5 text-[12.5px]" : "px-3.5 py-2 text-[13px]"}
              onClick={() => void decide("confirm")}
              loading={busy === "confirm"}
              disabled={busy !== null}
            >
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
              Yes, do it
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
            <span className="ml-auto text-[11.5px] text-text-tertiary">Nothing has changed yet.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
