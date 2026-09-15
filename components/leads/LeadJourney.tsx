"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Flag, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatDateTime } from "@/lib/utils";
import { leadStatusColor, type Lead } from "@/lib/leadsShared";
import { repSlug } from "@/lib/team";

export function LeadJourney({ lead }: { lead: Lead }) {
  const converted = lead.status === "Converted";
  const stopped = lead.status === "Disqualified";
  const outcomeColor = converted ? "#15803D" : stopped ? "var(--status-red)" : "var(--text-tertiary)";

  return (
    <section className="border-t border-border-light px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Lead journey</span>
        <span className="text-[10.5px] text-text-tertiary">Received → current status → outcome</span>
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <div className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-[18px] hidden h-px bg-border-light md:block" aria-hidden="true" />

        <article className="relative rounded-xl border border-border-light bg-[var(--surface)] p-3.5">
          <div className="flex items-center gap-2">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-primary text-white ring-4 ring-white"><Radio size={14} strokeWidth={2.3} /></span>
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Received</span>
          </div>
          <p className="mt-3 text-[13px] font-semibold text-text-primary">Lead received via {lead.source}</p>
          <p className="mt-1 text-[10.5px] text-text-tertiary tnum">{formatDateTime(lead.createdAt)}</p>
        </article>

        <article className="relative rounded-xl border border-blue-subtle bg-blue-light/25 p-3.5">
          <div className="flex items-center gap-2">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white" style={{ background: leadStatusColor(lead.status) }}><Circle size={13} fill="currentColor" strokeWidth={0} /></span>
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Current status</span>
          </div>
          <p className="mt-3 text-[13px] font-semibold" style={{ color: leadStatusColor(lead.status) }}>{lead.status}</p>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] text-text-tertiary">
            <span className="tnum">{formatDateTime(lead.updatedAt)}</span><span aria-hidden="true">·</span>
            <Link href={`/analytics/reps/${repSlug(lead.updatedBy)}`} onClick={(event) => event.stopPropagation()} className="group/mover flex min-w-0 items-center gap-1 hover:text-blue-primary hover:underline">
              <Avatar name={lead.updatedBy} className="h-4 w-4 shrink-0 text-[6px]" /><span className="truncate">{lead.updatedBy}</span>
            </Link>
          </div>
        </article>

        <article className={cn("relative rounded-xl border border-border-light p-3.5", converted ? "bg-[rgba(22,163,74,0.055)]" : stopped ? "bg-[rgba(220,38,38,0.045)]" : "bg-[var(--surface)]")}>
          <div className="flex items-center gap-2">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white ring-4 ring-white" style={{ borderColor: outcomeColor, color: outcomeColor }}>
              {converted ? <CheckCircle2 size={15} strokeWidth={2.3} /> : <Flag size={14} strokeWidth={2.2} />}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Outcome</span>
          </div>
          <p className="mt-3 text-[13px] font-semibold" style={{ color: outcomeColor }}>{converted ? "Opportunity created" : stopped ? "Lead disqualified" : "Not decided yet"}</p>
          <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
            {converted ? formatDateTime(lead.convertedAt || lead.updatedAt) : stopped ? lead.disqualifiedReason || "This lead will not progress" : "Qualify the lead to create an opportunity"}
          </p>
          {lead.convertedOpportunityId && (
            <Link href={`/opportunities/${lead.convertedOpportunityId}`} onClick={(event) => event.stopPropagation()} className="mt-1.5 block text-[10.5px] font-semibold text-blue-primary hover:underline">Open opportunity</Link>
          )}
        </article>
      </div>
    </section>
  );
}
