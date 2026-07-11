import { getDb } from "@/lib/db";
import { ContactsBrowser, type ContactRow } from "@/components/contacts/ContactsBrowser";
import type { TipItem } from "@/components/charts/Charts";
import { voiceStatus } from "@/lib/voice";
import { OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const db = getDb();
  const [contacts, customers, interactions] = await Promise.all([
    db.contacts.list(),
    db.customers.list(),
    db.interactions.list(),
  ]);
  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));

  // Per-contact engagement, so the card's scale-up hover can show real signal
  // (touch outcomes + a weekly trend + headline stats) — charts like the voice
  // agents, not just a couple of numbers (Suren).
  const byContact = new Map<string, typeof interactions>();
  for (const i of interactions) {
    if (!i.contact_id) continue;
    const list = byContact.get(i.contact_id);
    if (list) list.push(i);
    else byContact.set(i.contact_id, [i]);
  }
  const now = Date.now();
  const WEEK = 7 * 86400000;

  const rows: ContactRow[] = contacts.map((c) => {
    const ints = (byContact.get(c.id) || []).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const cust = customerById[c.customer_id];
    // Outcome breakdown for the reveal's donut.
    const counts = new Map<string, number>();
    for (const i of ints) counts.set(i.outcome, (counts.get(i.outcome) || 0) + 1);
    const outcomeMix = Array.from(counts.entries())
      .map(([k, v]) => ({
        label: OUTCOME_META[k]?.label || k,
        value: v,
        color: OUTCOME_CHART_COLOR[k] || "#AF9BF5",
        // The actual touches behind this slice, so the donut hover shows who /
        // when, not just a count (Suren: entities behind every chart segment).
        tip: ints
          .filter((i) => i.outcome === k)
          .map(
            (i): TipItem => ({
              avatar: c.full_name,
              name: c.full_name,
              sub: cust?.company_name || "—",
              value: OUTCOME_META[i.outcome]?.label || i.outcome,
            })
          ),
      }))
      .sort((a, b) => b.value - a.value);
    // Weekly touch trend (last 8 weeks) for the reveal's sparkline.
    const trend = Array.from({ length: 8 }, (_, w) => {
      const start = now - (7 - w) * WEEK;
      return ints.filter((i) => {
        const t = new Date(i.created_at).getTime();
        return t >= start && t < start + WEEK;
      }).length;
    });
    // Same weekly buckets, carrying the touches behind each point so the
    // sparkline hover names the person / outcome that week.
    const trendTips: TipItem[][] = Array.from({ length: 8 }, (_, w) => {
      const start = now - (7 - w) * WEEK;
      return ints
        .filter((i) => {
          const t = new Date(i.created_at).getTime();
          return t >= start && t < start + WEEK;
        })
        .map(
          (i): TipItem => ({
            avatar: c.full_name,
            name: c.full_name,
            sub: OUTCOME_META[i.outcome]?.label || i.outcome,
          })
        );
    });
    return {
      id: c.id,
      name: c.full_name,
      title: c.job_title || "",
      company: cust?.company_name || "—",
      companyId: cust ? c.customer_id : null,
      role: c.role_bucket || "",
      email: c.email || "",
      phone: c.phone || null,
      linkedin: c.linkedin_url || null,
      touches: ints.length,
      lastOutcome: ints[0]?.outcome || null,
      lastTouch: ints[0]?.created_at || null,
      offerings: cust?.offerings_in_use?.length ?? 0,
      outcomeMix,
      trend,
      trendTips,
    };
  });

  return (
    <div>
      <ContactsBrowser
        rows={rows}
        voiceCategories={Object.keys(voiceStatus().agents)}
      />
    </div>
  );
}
