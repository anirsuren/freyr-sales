import { getDb } from "@/lib/db";
import { SessionsBrowser, type SessionRow } from "@/components/sessions/SessionsBrowser";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const latestOutcome: Record<string, string> = {};
  for (const i of [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    latestOutcome[i.contact_id] = i.outcome;
  }

  const rows: SessionRow[] = sessions.map((s) => {
    const c = customerById[s.customer_id];
    const ct = contactById[s.contact_id];
    const svc = (s.recommended_services || []) as RecommendedService[];
    return {
      id: s.id,
      customerId: s.customer_id,
      contactId: s.contact_id,
      company: c?.company_name || "—",
      contact: ct?.full_name || "—",
      title: ct?.job_title || "",
      service: svc[0]?.service_name || "—",
      outcome: latestOutcome[s.contact_id] || null,
      review: s.review_status || "draft",
      date: s.created_at,
    };
  });

  return (
    <div>
      <SessionsBrowser rows={rows} />
    </div>
  );
}
