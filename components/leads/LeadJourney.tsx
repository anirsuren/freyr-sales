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

  const steps = [
    {
      key: "received",
      label: "Received",
      title: `Lead received via ${lead.source}`,
      detail: formatDateTime(lead.createdAt),
      color: "var(--ink-bright-blue)",
      icon: Radio,
      dashed: false,
    },
    {
      key: "status",
      label: "Current status",
      title: lead.status,
      detail: formatDateTime(lead.updatedAt),
      color: statusColor,
      icon: Circle,
      dashed: false,
    },
    {
      key: "outcome",
      label: "Outcome",
      title: converted
        ? "Opportunity created"
        : stopped
          ? "Lead disqualified"
          : "Decision still ahead",
      detail: converted
        ? formatDateTime(lead.convertedAt || lead.updatedAt)
        : stopped
          ? lead.disqualifiedReason || "This lead will not progress"
          : "Qualify the lead to create an opportunity",
      color: outcomeColor,
      icon: converted ? CheckCircle2 : Flag,
      dashed: !resolved,
    },
  ] as const;

  return (
    <aside className="min-w-0 self-start xl:border-l xl:border-border-light xl:pl-6">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        Lead journey
      </h3>

      <ol className="mt-3 max-h-[320px] overflow-y-auto overscroll-contain pr-1">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.key}
              className={cn("relative pl-8", index < steps.length - 1 && "pb-4")}
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-[10px] top-[24px] w-[2px]",
                    index === 1 && !resolved
                      ? "border-l-2 border-dashed border-border bg-transparent"
                      : "bg-border-light"
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full",
                  step.dashed && "border border-dashed bg-white"
                )}
                style={
                  step.dashed
                    ? { color: step.color, borderColor: "var(--border)" }
                    : { color: step.color, background: tint(step.color, 10) }
                }
              >
                <Icon
                  size={step.key === "status" ? 9 : 11}
                  fill={step.key === "status" ? "currentColor" : "none"}
                  strokeWidth={step.key === "status" ? 0 : 2.4}
                />
              </span>

              <div className="min-w-0">
                <p
                  className="text-[12.5px] font-medium leading-[22px] text-text-primary"
                >
                  {step.title}
                </p>
                {step.key === "status" ? (
                  <Link
                    href={`/analytics/reps/${repSlug(lead.updatedBy)}`}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-0.5 inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-text-tertiary hover:text-blue-primary hover:underline"
                  >
                    <Avatar name={lead.updatedBy} className="h-[14px] w-[14px] shrink-0 text-[6px]" />
                    <span className="truncate">{lead.updatedBy}</span>
                    <span className="whitespace-nowrap tnum">· {step.detail}</span>
                  </Link>
                ) : (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-text-tertiary tnum">
                    {step.detail}
                  </p>
                )}

                {step.key === "outcome" && lead.convertedOpportunityId && (
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
          );
        })}
      </ol>
    </aside>
  );
}
