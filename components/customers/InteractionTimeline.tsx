import { MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OutcomeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import type { Interaction } from "@/lib/types";

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
    <div className="flex flex-col gap-3">
      {interactions.map((it) => (
        <Card key={it.id} className="p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <OutcomeBadge outcome={it.outcome} />
              {contactNames?.[it.contact_id] && (
                <span className="text-[13px] text-text-primary font-medium">
                  {contactNames[it.contact_id]}
                </span>
              )}
            </div>
            <span className="text-[12px] text-text-tertiary">
              {formatDate(it.created_at)}
            </span>
          </div>
          {it.notes && (
            <p className="text-[14px] text-text-secondary leading-relaxed">
              {it.notes}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[12px] text-text-tertiary">
            {it.follow_up_date && (
              <span>Follow-up: {formatDate(it.follow_up_date)}</span>
            )}
            {it.logged_by && <span>Logged by {it.logged_by}</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}
