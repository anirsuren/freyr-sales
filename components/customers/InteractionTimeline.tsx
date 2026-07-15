import { MessageSquareText, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OutcomeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate, formatDateTime, OUTCOME_META } from "@/lib/utils";
import type { Interaction } from "@/lib/types";

// A real vertical timeline (Suren): newest at the top, a spine down the left,
// a coloured node per touch, and the date + time on each. Scrolls inside its
// own container so old history never pushes the page down.
export function InteractionTimeline({
  interactions,
  contactNames,
}: {
  interactions: Interaction[];
  contactNames?: Record<string, string>;
}) {
  if (!interactions || interactions.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={MessageSquareText}
          title="No interactions yet"
          description="Log an outcome after your first touch and it will appear here."
        />
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="max-h-[460px] overflow-y-auto p-5">
        <ol className="relative">
          {/* the spine */}
          <div className="absolute left-[6px] top-1.5 bottom-1.5 w-px bg-border-light" />
          {interactions.map((it) => {
            const c = OUTCOME_META[it.outcome]?.color || "#8A8A8E";
            return (
              <li key={it.id} className="relative pl-7 pb-5 last:pb-0">
                <span
                  className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full ring-4 ring-white"
                  style={{ background: c }}
                />
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <OutcomeBadge outcome={it.outcome} />
                    {contactNames?.[it.contact_id] && (
                      <span className="flex min-w-0 items-center gap-2 text-[13px] text-text-primary font-medium">
                        <Avatar
                          name={contactNames[it.contact_id]}
                          className="h-7 w-7 shrink-0 text-[9px]"
                        />
                        <span className="truncate">{contactNames[it.contact_id]}</span>
                      </span>
                    )}
                  </div>
                  <span className="text-[11.5px] text-text-tertiary tnum whitespace-nowrap shrink-0">
                    {formatDateTime(it.created_at)}
                  </span>
                </div>
                {it.notes && (
                  <p className="text-[13.5px] text-text-secondary leading-relaxed">
                    {it.notes}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11.5px] text-text-tertiary">
                  {it.follow_up_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} strokeWidth={1.7} />
                      Follow-up {formatDate(it.follow_up_date)}
                    </span>
                  )}
                  {it.logged_by && (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={it.logged_by} className="h-5 w-5 text-[7px]" />
                      Logged by {it.logged_by}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
