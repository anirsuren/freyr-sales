"use client";

import { AlertCircle, CheckCircle2, Clock3, Pencil, Target } from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { isOpenLead, leadAgeDays, type Lead } from "@/lib/leadsShared";

const FOLLOW_UP_DAYS = 21;

function recommendedAction(lead: Lead) {
  switch (lead.status) {
    case "New": return "Make the first contact";
    case "Contacted": return "Confirm the need and buying process";
    case "Qualifying": return "Book a qualification meeting";
    case "Nurturing": return "Schedule the next follow-up";
    case "Converted": return "Continue from the opportunity";
    case "Disqualified": return "No follow-up needed";
  }
}

export function LeadPersonInsights({
  lead,
  accountMatched,
  onEdit,
}: {
  lead: Lead;
  accountMatched: boolean;
  onEdit?: () => void;
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
  const completeness = Math.round((captured / checks.length) * 100);
  const age = leadAgeDays(lead);
  const open = isOpenLead(lead);
  const overdueBy = open ? Math.max(0, age - FOLLOW_UP_DAYS) : 0;
  const remaining = Math.max(0, FOLLOW_UP_DAYS - age);
  const activityPct = Math.min(100, Math.round((age / FOLLOW_UP_DAYS) * 100));
  const clockColor = !open
    ? lead.status === "Converted" ? "#15803D" : "var(--status-red)"
    : overdueBy > 0 ? "var(--ink-orange)" : "var(--ink-bright-blue)";

  return (
    <section className="rounded-xl border border-border-light bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Lead readiness</span>
            <InfoHint text="Checks whether six useful details are recorded. It is a completeness check, not an AI score." />
          </div>
          <p className="mt-1 text-[13.5px] font-semibold text-text-primary">
            {captured} of {checks.length} useful details recorded
          </p>
        </div>
        <span className="rounded-full bg-blue-light px-2.5 py-1 text-[11px] font-bold text-blue-primary tnum">{completeness}%</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border-light" aria-label={`${completeness}% of useful lead details recorded`}>
        <div className="h-full rounded-full bg-blue-primary transition-[width]" style={{ width: `${completeness}%` }} />
      </div>

      {missingChecks.length > 0 ? (
        <div className="mt-3 rounded-lg bg-[rgba(194,65,12,0.055)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--ink-orange)]">
              <AlertCircle size={13} strokeWidth={2.2} />
              {missingChecks.length} {missingChecks.length === 1 ? "detail needs" : "details need"} attention
            </p>
            {onEdit && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onEdit(); }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-primary hover:bg-blue-light"
              >
                <Pencil size={12} strokeWidth={2.2} /> Edit lead
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingChecks.map((check) => (
              <span key={check.label} className="rounded-md border border-[rgba(194,65,12,0.13)] bg-white px-2 py-1 text-[10.5px] font-medium text-text-secondary">
                {check.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#15803D]">
          <CheckCircle2 size={13} strokeWidth={2.3} /> All useful details are present
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-lg border border-border-light bg-[var(--surface)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Clock3 size={12} strokeWidth={2.2} /> Follow-up timing
            <InfoHint text="Time since the lead was last updated. Open leads should receive another touch within 21 days." />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className="text-[17px] font-bold leading-none text-text-primary tnum">{open ? `${age} ${age === 1 ? "day" : "days"}` : "Closed"}</p>
            <span className="text-right text-[10.5px] font-semibold" style={{ color: clockColor }}>
              {!open ? lead.status : overdueBy > 0 ? `${overdueBy}d overdue` : remaining === 0 ? "Due today" : `${remaining}d remaining`}
            </span>
          </div>
          {open && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border-light">
              <div className="h-full rounded-full" style={{ width: `${activityPct}%`, background: clockColor }} />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border-light bg-[var(--surface)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            <Target size={12} strokeWidth={2.2} /> Next step
            <InfoHint text="A practical next step based on the lead's current status." />
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-snug text-blue-primary">{recommendedAction(lead)}</p>
          <p className="mt-1 text-[10.5px] text-text-tertiary">Based on the current {lead.status.toLowerCase()} status.</p>
        </div>
      </div>
    </section>
  );
}
