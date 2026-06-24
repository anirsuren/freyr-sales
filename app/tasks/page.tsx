import Link from "next/link";
import { ClipboardCheck, CalendarClock, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

// Turn a follow-up date into a plain-English urgency a rep reads at a glance:
// overdue (act now), due today/soon, or a future date.
function dueInfo(due: string, todayMs: number) {
  const d = new Date(due);
  const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayMs - todayMs) / 86400000);
  if (days < 0)
    return { kind: "overdue", label: `Overdue · ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` };
  if (days === 0) return { kind: "today", label: "Due today" };
  if (days === 1) return { kind: "soon", label: "Due tomorrow" };
  if (days <= 7) return { kind: "soon", label: `Due in ${days} days` };
  return { kind: "later", label: `Due ${formatDate(due)}` };
}

export default async function TasksPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));

  const reviewTasks = sessions
    .filter(
      (s) =>
        s.review_status === "in_review" || s.review_status === "changes_requested"
    )
    .map((s) => {
      const svc = (s.recommended_services || []) as RecommendedService[];
      return {
        id: s.id,
        company: custById[s.customer_id]?.company_name || "—",
        contact: contactById[s.contact_id]?.full_name || "—",
        service: svc[0]?.service_name || "Pitch",
        status: s.review_status as string,
      };
    });

  const followUps = interactions
    .filter((i) => i.follow_up_date)
    .map((i) => ({
      id: i.id,
      company: custById[i.customer_id]?.company_name || "—",
      contact: contactById[i.contact_id]?.full_name || "—",
      customerId: i.customer_id,
      due: i.follow_up_date as string,
    }))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const total = reviewTasks.length + followUps.length;

  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const overdueCount = followUps.filter((t) => dueInfo(t.due, todayMs).kind === "overdue").length;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={
          total
            ? `${total} item${total === 1 ? "" : "s"} need your attention.`
            : "Pitches awaiting review and upcoming follow-ups land here."
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="You're all caught up"
          description="No pitches awaiting review and no follow-ups due. Submit a pitch for compliance review and it will appear here."
        />
      ) : (
        <div className="space-y-8 max-w-[820px]">
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3 flex items-center gap-2">
              <ClipboardCheck size={15} strokeWidth={1.7} className="text-blue-primary" />
              Awaiting compliance review
              <span className="text-text-primary tnum">({reviewTasks.length})</span>
            </h2>
            {reviewTasks.length === 0 ? (
              <p className="text-[13px] text-text-secondary">Nothing in the review queue.</p>
            ) : (
              <div className="space-y-2.5">
                {reviewTasks.map((t) => (
                  <Link key={t.id} href={`/sessions/${t.id}`}>
                    <Card className="p-4 hover:border-blue-subtle transition-colors group flex items-center gap-3">
                      <Avatar name={t.company} className="w-9 h-9 text-[12px] rounded-lg shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-text-primary truncate">
                          {t.company}
                        </p>
                        <p className="text-[12px] text-text-secondary truncate">
                          {t.service} · {t.contact}
                        </p>
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-[0.04em] px-2 py-1 rounded shrink-0"
                        style={
                          t.status === "changes_requested"
                            ? { background: "rgba(255,59,48,0.12)", color: "#B02020" }
                            : { background: "rgba(255,159,10,0.14)", color: "#7A4A00" }
                        }
                      >
                        {t.status === "changes_requested" ? "Changes requested" : "In review"}
                      </span>
                      <ArrowRight size={16} strokeWidth={1.5} className="text-text-tertiary group-hover:text-blue-primary shrink-0" />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3 flex items-center gap-2">
              <CalendarClock size={15} strokeWidth={1.7} className="text-blue-primary" />
              Upcoming follow-ups
              <span className="text-text-primary tnum">({followUps.length})</span>
              {overdueCount > 0 && (
                <span
                  className="text-[11px] font-bold normal-case tracking-normal px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(255,59,48,0.12)", color: "#B02020" }}
                >
                  {overdueCount} overdue
                </span>
              )}
            </h2>
            {followUps.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No follow-ups scheduled.</p>
            ) : (
              <div className="space-y-2.5">
                {followUps.map((t) => {
                  const d = dueInfo(t.due, todayMs);
                  return (
                  <Link key={t.id} href={`/customers/${t.customerId}`}>
                    <Card className="p-4 hover:border-blue-subtle transition-colors group flex items-center gap-3">
                      <Avatar name={t.company} className="w-9 h-9 text-[12px] rounded-lg shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-text-primary truncate">
                          {t.company}
                        </p>
                        <p className="text-[12px] text-text-secondary truncate">{t.contact}</p>
                      </div>
                      <span
                        className={cn(
                          "text-[11px] tnum shrink-0 rounded px-2 py-1 inline-flex items-center gap-1",
                          d.kind === "soon" && "bg-blue-light text-blue-primary font-semibold",
                          d.kind === "later" && "text-text-secondary font-medium"
                        )}
                        style={
                          d.kind === "overdue"
                            ? { background: "rgba(255,59,48,0.12)", color: "#B02020" }
                            : d.kind === "today"
                            ? { background: "rgba(255,159,10,0.14)", color: "#7A4A00" }
                            : undefined
                        }
                      >
                        {d.kind === "overdue" && <AlertTriangle size={11} strokeWidth={2.2} />}
                        {d.label}
                      </span>
                      <ArrowRight size={16} strokeWidth={1.5} className="text-text-tertiary group-hover:text-blue-primary shrink-0" />
                    </Card>
                  </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
