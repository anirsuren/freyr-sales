"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatDateTime } from "@/lib/utils";
import { leadStatusColor, type Lead } from "@/lib/leadsShared";
import { repSlug } from "@/lib/team";

export function LeadJourney({ lead }: { lead: Lead }) {
  const converted = lead.status === "Converted";
  const stopped = lead.status === "Disqualified";
  const outcomeColor = converted
    ? "#16A34A"
    : stopped
      ? "#DC2626"
      : "var(--text-tertiary)";

  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Lead journey
        </span>
        <span className="text-[10px] text-text-tertiary">Scroll sideways to follow the journey</span>
      </div>

      <div className="mt-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
        <div className="flex min-w-[690px] snap-x snap-mandatory items-stretch gap-2">
          <article className="w-[210px] shrink-0 snap-start rounded-xl border border-border-light bg-[var(--surface)] p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-primary text-[10px] font-bold text-white">1</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Started</span>
            </div>
            <p className="mt-2 text-[12.5px] font-semibold text-text-primary">Lead received</p>
            <p className="mt-1 text-[10.5px] text-text-tertiary tnum">{formatDateTime(lead.createdAt)}</p>
            <p className="mt-1 text-[10.5px] font-medium text-text-secondary">Came in via {lead.source}</p>
          </article>

          <span className="flex w-5 shrink-0 items-center justify-center text-text-tertiary" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={1.8} />
          </span>

          <article className="w-[220px] shrink-0 snap-start rounded-xl border border-blue-subtle bg-blue-light/30 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: leadStatusColor(lead.status) }}>2</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Current stage</span>
            </div>
            <p className="mt-2 text-[12.5px] font-semibold" style={{ color: leadStatusColor(lead.status) }}>{lead.status}</p>
            <p className="mt-1 text-[10.5px] text-text-tertiary tnum">Updated {formatDateTime(lead.updatedAt)}</p>
            <Link
              href={`/analytics/reps/${repSlug(lead.updatedBy)}`}
              onClick={(event) => event.stopPropagation()}
              className="group/mover mt-1.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-text-secondary"
            >
              <Avatar name={lead.updatedBy} className="h-5 w-5 shrink-0 text-[7px]" />
              <span className="truncate group-hover/mover:text-blue-primary group-hover/mover:underline">Updated by {lead.updatedBy}</span>
            </Link>
          </article>

          <span className="flex w-5 shrink-0 items-center justify-center text-text-tertiary" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={1.8} />
          </span>

          <article
            className={cn(
              "w-[210px] shrink-0 snap-start rounded-xl border border-border-light p-3",
              converted ? "bg-[rgba(22,163,74,0.06)]" : stopped ? "bg-[rgba(220,38,38,0.05)]" : "bg-[var(--surface)]"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white text-[10px] font-bold" style={{ borderColor: outcomeColor, color: outcomeColor }}>3</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">Outcome</span>
            </div>
            <p className="mt-2 text-[12.5px] font-semibold" style={{ color: outcomeColor }}>
              {converted ? "Opportunity created" : stopped ? "Journey ended" : "Opportunity"}
            </p>
            <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
              {converted
                ? formatDateTime(lead.convertedAt || lead.updatedAt)
                : stopped
                  ? "Lead was disqualified"
                  : "Next destination when qualified"}
            </p>
            {lead.convertedOpportunityId && (
              <Link href={`/opportunities/${lead.convertedOpportunityId}`} onClick={(event) => event.stopPropagation()} className="mt-1.5 block text-[10.5px] font-semibold text-blue-primary hover:underline">Open the opportunity</Link>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
