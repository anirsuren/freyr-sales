"use client";

import Link from "next/link";
import { ArrowRight, AlertCircle, CheckCircle2, Clock3, Pencil, Target } from "lucide-react";
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
  onEdit,
}: {
  lead: Lead;
  onEdit?: () => void;
}) {
  const checks = [
    { label: "Email or phone", complete: Boolean(lead.email || lead.phone) },
    { label: "Job title", complete: Boolean(lead.title?.trim()) },
    { label: "What they need", complete: Boolean(lead.interest?.trim()) },
    { label: "Owner", complete: Boolean(lead.owner?.trim()) },
    { label: "Country", complete: Boolean(lead.country?.trim()) },
  ];
  const missingChecks = checks.filter((check) => !check.complete);
  const age = leadAgeDays(lead);
  const open = isOpenLead(lead);
  const overdueBy = open ? Math.max(0, age - FOLLOW_UP_DAYS) : 0;
  const remaining = Math.max(0, FOLLOW_UP_DAYS - age);
  const activityPct = Math.min(100, Math.round((age / FOLLOW_UP_DAYS) * 100));
  const clockColor = !open
    ? lead.status === "Converted" ? "#15803D" : "var(--status-red)"
    : overdueBy > 0 ? "var(--ink-orange)" : "var(--ink-bright-blue)";

  const explanation = lead.status === "Converted"
    ? "This lead is now an opportunity. Manage the deal and its next steps there."
    : lead.status === "Disqualified"
      ? lead.disqualifiedReason || "This lead is closed. No further outreach is needed."
      : {
          New: "Reach out to understand what they need and who is involved.",
          Contacted: "Clarify the scope, timing, and who makes the decision.",
          Qualifying: "Review the requirements together and agree on the next step.",
          Nurturing: "Keep the conversation moving with a relevant follow-up.",
        }[lead.status];

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-light bg-white">
      <header className="px-4 pt-4">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Lead follow-up</h3>
      </header>

      <div className="flex items-start gap-3 px-4 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          {open ? <Target size={17} /> : <CheckCircle2 size={17} />}
        </span>
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold leading-snug text-text-primary">{recommendedAction(lead)}</h4>
          <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">{explanation}</p>
          {lead.status === "Converted" && lead.convertedOpportunityId && (
            <Link href={`/opportunities/${lead.convertedOpportunityId}`}
              onClick={event => event.stopPropagation()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-primary px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-blue-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-primary">
              Open opportunity <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>

      {open && (
        <div className="mx-4 border-t border-border-light py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
              <Clock3 size={13} className="shrink-0" />
              <span><strong className="font-semibold text-text-primary">{age} {age === 1 ? "day" : "days"}</strong> since last update</span>
              <InfoHint text="Time since the lead was last updated. Open leads should receive another touch within 21 days." />
            </span>
            <span className="text-[11px] font-semibold tnum" style={{ color: clockColor }}>
              {overdueBy > 0 ? `${overdueBy}d overdue` : remaining === 0 ? "Due today" : `${remaining}d remaining`}
            </span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border-light">
            <div className="h-full rounded-full" style={{ width: `${activityPct}%`, background: clockColor }} />
          </div>
        </div>
      )}

      <footer className="mt-auto border-t border-border-light px-4 py-3">
        {missingChecks.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--ink-orange)]">
                <AlertCircle size={13} className="shrink-0" />
                Missing: {missingChecks.map(check => check.label).join(" · ")}
              </p>
              {onEdit && (
                <button type="button" onClick={event => { event.stopPropagation(); onEdit(); }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-primary hover:bg-blue-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                  <Pencil size={12} /> Edit lead
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-[11px] text-text-secondary">
            <CheckCircle2 size={14} className="shrink-0 text-[#15803D]" />
            Contact and qualification details complete
          </p>
        )}
      </footer>
    </section>
  );
}
