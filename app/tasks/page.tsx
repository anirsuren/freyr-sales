import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { TasksWorkspace } from "@/components/tasks/TasksWorkspace";
import { nextBestActions, focusActions } from "@/lib/agent";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, agentPrefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);

  const custById = Object.fromEntries(customers.map((customer) => [customer.id, customer]));
  const contactById = Object.fromEntries(contacts.map((contact) => [contact.id, contact]));

  const reviewTasks = sessions
    .filter((session) =>
      session.review_status === "in_review" || session.review_status === "changes_requested"
    )
    .map((session) => {
      const services = (session.recommended_services || []) as RecommendedService[];
      const contact = contactById[session.contact_id];
      return {
        id: session.id,
        customerId: session.customer_id,
        contactId: session.contact_id,
        company: custById[session.customer_id]?.company_name || "Unknown account",
        contact: contact?.full_name || "Unknown contact",
        service: services[0]?.service_name || "Pitch review",
        status: session.review_status as string,
      };
    });

  const followUps = interactions
    .filter((interaction) => interaction.follow_up_date)
    .map((interaction) => {
      const contact = contactById[interaction.contact_id];
      return {
        id: interaction.id,
        company: custById[interaction.customer_id]?.company_name || "Unknown account",
        contact: contact?.full_name || "Unknown contact",
        customerId: interaction.customer_id,
        contactId: interaction.contact_id,
        due: interaction.follow_up_date as string,
      };
    })
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const agentActions = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    agentPrefs
  ).actions.slice(0, 4);

  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const total = reviewTasks.length + followUps.length;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={total ? `${total} items need your attention, sorted by urgency.` : "Your review and follow-up queue is clear."}
      />
      <TasksWorkspace
        reviewTasks={reviewTasks}
        followUps={followUps}
        agentActions={agentActions}
        todayMs={todayMs}
      />
    </div>
  );
}
