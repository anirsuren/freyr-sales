"use client";

import { AlertCircle, CheckCircle2, Clock3, Target } from "lucide-react";
import { DonutChart } from "@/components/charts/Charts";
import { InfoHint } from "@/components/ui/InfoHint";
import { isOpenLead, leadAgeDays, type Lead } from "@/lib/leadsShared";

const FOLLOW_UP_DAYS = 21;

function recommendedAction(lead: Lead) {
  switch (lead.status) {
    case "New":
      return "Make the first contact";
    case "Contacted":
      return "Confirm the need and buying process";
    case "Qualifying":
      return "Book a qualification meeting";
    case "Nurturing":
      return "Schedule the next follow-up";
    case "Converted":
      return "Continue from the opportunity";
    case "Disqualified":
      return "No follow-up needed";
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
    { label: "Email or phone", complete: Boolean(lead.email || lead.phone) },
    { label: "Job title", complete: Boolean(lead.title?.trim()) },
    { label: "What they need", complete: Boolean(lead.interest?.trim()) },
    { label: "Owner", complete: Boolean(lead.owner?.trim()) },
    { label: "Country", complete: Boolean(lead.country?.trim()) },
    { label: "Matched customer", complete: accountMatched },
  ];
  const captured = checks.filter((check) => check.complete).length;
  const missingChecks = checks.filter((check) => !check.complete);
  const missing = missingChecks.length;
  const completeness = Math.round((captured / checks.length) * 100);
  const age = leadAgeDays(lead);
  const open = isOpenLead(lead);
  const overdueBy = open ? Math.max(0, age - FOLLOW_UP_DAYS) : 0;
  const clockRange = Math.max(FOLLOW_UP_DAYS, age, 1);
  const activityPct = Math.min(100, Math.round((age / clockRange) * 100));
  const thresholdPct = Math.min(100, Math.round((FOLLOW_UP_DAYS / clockRange) * 100));
  const clockColor = !open
    ? lead.status === "Converted"
      ? "#16A34A"
      : "#DC2626"
    : overdueBy > 0
      ? "var(--ink-orange)"
      : "var(--ink-bright-blue)";

  return (
    <div className="border-b border-border-light p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Lead information
        </span>
        <InfoHint text="This checks whether six useful lead details have been recorded. Blue means the information is present. Orange means it still needs to be added. This is a completeness check, not an AI score." />
      </div>

      <div className="mt-3 grid grid-cols-[100px_1fr] items-center gap-4">
        <DonutChart
          segments={[
            {
              label: "Complete",
              value: captured,
              color: "var(--ink-bright-blue)",
              tip: checks
                .filter((check) => check.complete)
                .map((check) => ({ name: check.label, value: "Present" })),
            },
            {
              label: "Missing",
              value: missing,
              color: "var(--ink-orange)",
              tip: missingChecks.map((check) => ({ name: check.label, value: "Missing" })),
            },
          ].filter((segment) => segment.value > 0)}
          centerLabel={`${completeness}%`}
          centerSub="complete"
          size={96}
          thickness={7}
          format="number"
        />

        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">
            {captured} of {checks.length} useful details recorded
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-medium">
            <span className="inline-flex items-center gap-1.5 text-blue-primary">
              <span className="h-2 w-2 rounded-full bg-blue-primary" />
              Present · {captured}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ink-orange)]">
              <span className="h-2 w-2 rounded-full bg-[color:var(--ink-orange)]" />
              Missing · {missing}
            </span>
          </div>

          {missing > 0 ? (
            <div className="mt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                Add to complete this lead
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {missingChecks.map((check) => (
                  <span
                    key={check.label}
                    className="inline-flex items-center gap-1 rounded-full bg-[rgba(194,65,12,0.09)] px-2 py-1 text-[10.5px] font-semibold text-[color:var(--ink-orange)]"
                  >
                    <AlertCircle size={11} strokeWidth={2.3} />
                    {check.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#15803D]">
              <CheckCircle2 size={13} strokeWidth={2.3} /> All useful details are present
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border-light bg-[var(--surface)] px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Clock3 size={12} strokeWidth={2.2} /> Time since last activity
            <InfoHint text="How many days have passed since this lead was last updated. Open leads should receive another touch within 21 days." />
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-[18px] font-bold leading-none text-text-primary tnum">
              {open ? `${age} days` : "Closed"}
            </p>
            <span className="text-right text-[10.5px] font-semibold" style={{ color: clockColor }}>
              {!open
                ? lead.status
                : overdueBy > 0
                  ? `${overdueBy} ${overdueBy === 1 ? "day" : "days"} overdue`
                  : `${FOLLOW_UP_DAYS - age} ${FOLLOW_UP_DAYS - age === 1 ? "day" : "days"} left`}
            </span>
          </div>
          <div className="relative mt-2.5 h-2 overflow-visible rounded-full bg-border-light">
            {open ? (
              <>
                <span
                  className="absolute inset-y-0 left-0 rounded-l-full bg-blue-primary"
                  style={{ width: `${Math.min(activityPct, thresholdPct)}%` }}
                />
                {overdueBy > 0 && (
                  <span
                    className="absolute inset-y-0 rounded-r-full bg-[color:var(--ink-orange)]"
                    style={{ left: `${thresholdPct}%`, width: `${Math.max(0, activityPct - thresholdPct)}%` }}
                  />
                )}
              </>
            ) : (
              <span className="absolute inset-0 rounded-full" style={{ background: clockColor }} />
            )}
            {open && (
              <span
                className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-secondary"
                style={{ left: `${thresholdPct}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-text-tertiary">
            <span>Last update</span>
            <span>Follow up within {FOLLOW_UP_DAYS} days</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-light bg-[var(--surface)] px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Target size={12} strokeWidth={2.2} /> Recommended action
            <InfoHint text="A practical next step based on the lead's current stage. It is a workflow recommendation, not an AI prediction." />
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-snug" style={{ color: clockColor }}>
            {recommendedAction(lead)}
          </p>
          <p className="mt-1 text-[10.5px] text-text-tertiary">
            Suggested because this lead is {lead.status.toLowerCase()}.
          </p>
        </div>
      </div>
    </div>
  );
}
