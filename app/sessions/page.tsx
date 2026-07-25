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

  // Counts + last-touch per entity, so a hover can answer "who is this?"
  // without a click (Anir: "a quick blurb with all the shit I'd need").
  const sessionsPerCustomer = new Map<string, number>();
  const sessionsPerContact = new Map<string, number>();
  for (const s of sessions) {
    sessionsPerCustomer.set(s.customer_id, (sessionsPerCustomer.get(s.customer_id) || 0) + 1);
    sessionsPerContact.set(s.contact_id, (sessionsPerContact.get(s.contact_id) || 0) + 1);
  }
  const contactsPerCustomer = new Map<string, number>();
  for (const ct of contacts)
    contactsPerCustomer.set(ct.customer_id, (contactsPerCustomer.get(ct.customer_id) || 0) + 1);
  const lastTouchByContact = new Map<string, string>();
  for (const i of interactions) {
    const prev = lastTouchByContact.get(i.contact_id);
    if (!prev || new Date(i.created_at) > new Date(prev))
      lastTouchByContact.set(i.contact_id, i.created_at);
  }
  const touchesByContact = new Map<string, number>();
  for (const i of interactions)
    touchesByContact.set(i.contact_id, (touchesByContact.get(i.contact_id) || 0) + 1);

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
      contactMeta: {
        email: ct?.email || null,
        phone: ct?.phone || null,
        linkedin: ct?.linkedin_url || null,
        touches: touchesByContact.get(s.contact_id) || 0,
        sessions: sessionsPerContact.get(s.contact_id) || 0,
        lastTouch: lastTouchByContact.get(s.contact_id) || null,
      },
      companyMeta: {
        industry: c?.industry || null,
        sizeTier: c?.size_tier || null,
        geography: c?.geography || null,
        customerType: c?.customer_type || null,
        contacts: contactsPerCustomer.get(s.customer_id) || 0,
        sessions: sessionsPerCustomer.get(s.customer_id) || 0,
        summary: c?.enrichment_summary || null,
      },
    };
  });

  return (
    <div>
      <SessionsBrowser rows={rows} />
    </div>
  );
}
