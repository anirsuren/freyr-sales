"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Flag, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatDateTime } from "@/lib/utils";
import { leadStatusColor, type Lead } from "@/lib/leadsShared";
import { repSlug } from "@/lib/team";
import { tint } from "@/lib/tint";

export function LeadJourney({ lead }: { lead: Lead }) {
  const converted = lead.status === "Converted";
  const stopped = lead.status === "Disqualified";
  const resolved = converted || stopped;
  const statusColor = leadStatusColor(lead.status);
  const outcomeColor = converted
    ? "#15803D"
    : stopped
      ? "var(--status-red)"
      : "var(--text-tertiary)";

  const connector = (complete: boolean, color: string) =>
    complete
      ? { background: color }
      : { borderColor: "var(--border)", background: "transparent" };

  return (
    <section className="border-t border-border-light px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
            Lead journey
          </h3>
          <p className="mt-0.5 text-[10.5px] text-text-tertiary">
            From first enquiry to the decision on this lead
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
          style={{ color: statusColor, background: tint(statusColor, 10) }}
        >
          <Circle size={8} fill="currentColor" strokeWidth={0} />
          Now: {lead.status}
        </span>
      </div>

      {/* One continuous rail, following the same anatomy as the deal-stage
          timeline: milestone, connector, then the facts belonging to that
          point. Three separate cards made this read like unrelated summaries
          instead of a journey. */}
      <ol className="mt-4 grid grid-cols-1 rounded-xl border border-border-light bg-[var(--surface)] px-4 py-4 md:grid-cols-3 md:px-5">
        <li className="relative grid min-w-0 grid-cols-[32px_minmax(0,1fr)] md:block">
          <div className="flex h-full flex-col items-center md:h-auto md:flex-row">
            <span
              className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-[0_0_0_4px_var(--surface)]"
              style={{ background: "var(--ink-bright-blue)" }}
            >
              <Radio size={14} strokeWidth={2.3} />
            </span>
            <span
              aria-hidden="true"
              className="min-h-5 w-0.5 flex-1 md:h-0.5 md:min-h-0 md:w-auto"
              style={connector(true, statusColor)}
            />
          </div>
          <div className="min-w-0 pb-5 pl-3 md:pb-0 md:pl-0 md:pr-8 md:pt-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Received
            </span>
            <p className="mt-1 text-[13px] font-semibold text-text-primary">
              Lead received via {lead.source}
            </p>
            <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
              {formatDateTime(lead.createdAt)}
            </p>
          </div>
        </li>

        <li className="relative grid min-w-0 grid-cols-[32px_minmax(0,1fr)] md:block">
          <div className="flex h-full flex-col items-center md:h-auto md:flex-row">
            <span
              className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
              style={{ background: statusColor, boxShadow: `0 0 0 4px ${tint(statusColor, 12)}` }}
            >
              <Circle size={10} fill="currentColor" strokeWidth={0} />
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "min-h-5 w-0.5 flex-1 md:h-0.5 md:min-h-0 md:w-auto",
                !resolved && "border-l-2 border-dashed md:border-l-0 md:border-t-2"
              )}
              style={connector(resolved, outcomeColor)}
            />
          </div>
          <div className="min-w-0 pb-5 pl-3 md:pb-0 md:pl-0 md:pr-8 md:pt-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Current status
            </span>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: statusColor }}>
              {lead.status}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-text-tertiary">
              <span className="tnum">{formatDateTime(lead.updatedAt)}</span>
              <span aria-hidden="true">·</span>
              <Link
                href={`/analytics/reps/${repSlug(lead.updatedBy)}`}
                onClick={(event) => event.stopPropagation()}
                className="group/mover inline-flex min-w-0 items-center gap-1 hover:text-blue-primary hover:underline"
              >
                <Avatar name={lead.updatedBy} className="h-4 w-4 shrink-0 text-[6px]" />
                <span className="truncate">{lead.updatedBy}</span>
              </Link>
            </div>
          </div>
        </li>

        <li className="relative grid min-w-0 grid-cols-[32px_minmax(0,1fr)] md:block">
          <div className="flex h-full flex-col items-center md:h-auto md:flex-row">
            <span
              className={cn(
                "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full shadow-[0_0_0_4px_var(--surface)]",
                !resolved && "border-2 border-dashed bg-[var(--surface)]"
              )}
              style={
                resolved
                  ? { color: outcomeColor, background: tint(outcomeColor, 12) }
                  : { color: outcomeColor, borderColor: "var(--border)" }
              }
            >
              {converted ? (
                <CheckCircle2 size={16} strokeWidth={2.4} />
              ) : (
                <Flag size={14} strokeWidth={2.2} />
              )}
            </span>
          </div>
          <div className="min-w-0 pl-3 md:pl-0 md:pt-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Outcome
            </span>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: outcomeColor }}>
              {converted
                ? "Opportunity created"
                : stopped
                  ? "Lead disqualified"
                  : "Decision still ahead"}
            </p>
            <p className="mt-1 text-[10.5px] leading-snug text-text-tertiary tnum">
              {converted
                ? formatDateTime(lead.convertedAt || lead.updatedAt)
                : stopped
                  ? lead.disqualifiedReason || "This lead will not progress"
                  : "Qualify the lead to create an opportunity"}
            </p>
            {lead.convertedOpportunityId && (
              <Link
                href={`/opportunities/${lead.convertedOpportunityId}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-1.5 inline-flex text-[10.5px] font-semibold text-blue-primary hover:underline"
              >
                Open opportunity
              </Link>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
