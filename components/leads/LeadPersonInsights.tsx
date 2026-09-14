"use client";

import { AlertCircle, CheckCircle2, Clock3, Target } from "lucide-react";
import { DonutChart } from "@/components/charts/Charts";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";
import { isOpenLead, leadAgeDays, type Lead } from "@/lib/leadsShared";

const FOLLOW_UP_DAYS = 21;

function nextMove(lead: Lead) {
  switch (lead.status) {
    case "New":
      return "Make the first contact";
    case "Contacted":
      return "Confirm the need and buying process";
    case "Qualifying":
      return "Book the qualification meeting";
    case "Nurturing":
      return "Set the next follow-up";
    case "Converted":
      return "Continue in the opportunity";
    case "Disqualified":
      return "No active follow-up";
  }
}

export function LeadPersonInsights({
  lead,
  accountMatched,
}: {
  lead: Lead;
  accountMatched: boolean;
}) {
  const checks = [
    { label: "Contact channel", complete: Boolean(lead.email || lead.phone) },
    { label: "Role", complete: Boolean(lead.title?.trim()) },
    { label: "Need", complete: Boolean(lead.interest?.trim()) },
    { label: "Owner", complete: Boolean(lead.owner?.trim()) },
    { label: "Country", complete: Boolean(lead.country?.trim()) },
    { label: "Account match", complete: accountMatched },
  ];
  const captured = checks.filter((check) => check.complete).length;
  const missing = checks.length - captured;
  const completeness = Math.round((captured / checks.length) * 100);
  const age = leadAgeDays(lead);
  const followUpPct = Math.min(100, Math.round((age / FOLLOW_UP_DAYS) * 100));
  const open = isOpenLead(lead);
  const clockColor = !open
    ? lead.status === "Converted"
      ? "#16A34A"
      : "#DC2626"
    : age >= FOLLOW_UP_DAYS
      ? "var(--ink-amber)"
      : "var(--ink-bright-blue)";

  return (
    <div className="border-b border-border-light p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Qualification snapshot
        </span>
        <InfoHint text="Record coverage uses six fields already stored on this lead: a contact channel, role, need, owner, country and matched customer account. It is a completeness check, not a prediction or AI score." />
      </div>

      <div className="mt-3 grid grid-cols-[112px_1fr] items-center gap-4">
        <DonutChart
          segments={[
            {
              label: "Captured",
              value: captured,
              color: "var(--ink-bright-blue)",
              tip: checks
                .filter((check) => check.complete)
                .map((check) => ({ name: check.label, value: "Captured" })),
            },
            {
              label: "Missing",
              value: missing,
              color: "var(--ink-orange)",
              tip: checks
                .filter((check) => !check.complete)
                .map((check) => ({ name: check.label, value: "Missing" })),
            },
          ].filter((segment) => segment.value > 0)}
          centerLabel={`${completeness}%`}
          centerSub="captured"
          size={108}
          thickness={14}
          format="number"
        />

        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-text-primary">
            {missing === 0 ? "The lead record is complete" : `${missing} ${missing === 1 ? "detail" : "details"} still missing`}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {checks.map((check) => (
              <span
                key={check.label}
                className={cn(
                  "inline-flex min-w-0 items-center gap-1 text-[10.5px]",
                  check.complete ? "text-text-secondary" : "font-semibold text-[color:var(--ink-orange)]"
                )}
              >
                {check.complete ? (
                  <CheckCircle2 size={11} className="shrink-0 text-[#16A34A]" strokeWidth={2.3} />
                ) : (
                  <AlertCircle size={11} className="shrink-0" strokeWidth={2.3} />
                )}
                <span className="truncate">{check.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Clock3 size={12} strokeWidth={2.2} /> Follow-up clock
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-[18px] font-bold leading-none text-text-primary tnum">
              {open ? `${age}d` : "Closed"}
            </p>
            <span className="text-[10px] text-text-tertiary">
              {open ? `${FOLLOW_UP_DAYS}d stale threshold` : lead.status}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-light">
            <span
              className="block h-full rounded-full transition-[width]"
              style={{ width: open ? `${followUpPct}%` : "100%", background: clockColor }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Target size={12} strokeWidth={2.2} /> Next move
          </div>
          <p className="mt-2 text-[12.5px] font-semibold leading-snug" style={{ color: clockColor }}>
            {nextMove(lead)}
          </p>
          <p className="mt-1 text-[10.5px] text-text-tertiary">Based on the current lead stage</p>
        </div>
      </div>
    </div>
  );
}
