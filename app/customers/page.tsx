import { getDb } from "@/lib/db";
import { CustomersBrowser } from "@/components/customers/CustomersBrowser";
import { buildDeals, formatMoney, STAGES, STAGE_COLOR, type Stage } from "@/lib/pipeline";
import { accountHealth, accountHealthSeries } from "@/lib/health";
import { formatDateTime, OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";
import type { TipItem } from "@/components/charts/Charts";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const db = getDb();
  const customers = await db.customers.list();
  const allContacts = await db.contacts.list();

  const enriched = await Promise.all(
    customers.map(async (c) => {
      const contacts = await db.contacts.list(c.id);
      const interactions = await db.interactions.list(c.id);
      const sessions = await db.pitchSessions.list(c.id);
      const deals = buildDeals(sessions, customers, allContacts, interactions).filter(
        (d) => d.customerId === c.id
      );

      // Hover charts (Suren): the two things a rep wants at a glance —
      // where the money sits (pipeline mix) and whether the relationship is
      // warming or cooling (health trend). Each slice/point carries the real
      // deals/touches behind it, so hover gives MORE, not a restatement.
      const open = deals.filter((d) => d.stage !== "Closed Lost");
      const stage_mix = STAGES.filter((s) => s !== "Closed Lost")
        .map((stage) => {
          const ds = open.filter((d) => d.stage === stage);
          return {
            label: stage as string,
            value: ds.reduce((s, d) => s + d.value, 0),
            color: STAGE_COLOR[stage as Stage],
            tip: ds.map<TipItem>((d) => ({
              name: d.service,
              sub: d.contactName,
              value: formatMoney(d.value),
            })),
          };
        })
        .filter((s) => s.value > 0);

      // No open pipeline → fall back to how the logged touches landed.
      const contactName = new Map(contacts.map((ct) => [ct.id, ct.full_name]));
      const outcome_mix =
        stage_mix.length > 0
          ? []
          : Object.keys(OUTCOME_CHART_COLOR)
              .map((o) => {
                const ints = interactions.filter((x) => x.outcome === o);
                const meta = OUTCOME_META[o as keyof typeof OUTCOME_META];
                return {
                  label: meta?.label ?? o,
                  value: ints.length,
                  color: OUTCOME_CHART_COLOR[o as keyof typeof OUTCOME_CHART_COLOR],
                  tip: ints.map<TipItem>((x) => ({
                    avatar: contactName.get(x.contact_id) || "Contact",
                    name: contactName.get(x.contact_id) || "A contact",
                    sub: formatDateTime(x.created_at),
                  })),
                };
              })
              .filter((s) => s.value > 0);

      const series = accountHealthSeries({
        interactions,
        deals,
        contactCount: contacts.length,
      });
      // The touches logged in each of the 5 trend weeks — the "why" behind
      // each health point.
      const WEEK = 7 * 86400000;
      const now = Date.now();
      const trend_tips = Array.from({ length: series.points.length }, (_, idx) => {
        const weeksAgo = series.points.length - 1 - idx;
        const end = now - weeksAgo * WEEK;
        const start = end - WEEK;
        return interactions
          .filter((x) => {
            const t = new Date(x.created_at).getTime();
            return t > start && t <= end;
          })
          .map<TipItem>((x) => ({
            avatar: contactName.get(x.contact_id) || "Contact",
            name: contactName.get(x.contact_id) || "A contact",
            sub: formatDateTime(x.created_at),
            value: x.outcome
              ? OUTCOME_META[x.outcome as keyof typeof OUTCOME_META]?.label
              : undefined,
          }));
      });

      return {
        ...c,
        contact_count: contacts.length,
        contacts_preview: contacts.map((ct) => ({ id: ct.id, name: ct.full_name })),
        last_outcome: interactions[0]?.outcome || null,
        last_session_date: sessions[0]?.created_at || null,
        health: accountHealth({
          interactions,
          deals,
          contactCount: contacts.length,
        }),
        stage_mix,
        outcome_mix,
        health_trend: series.points,
        trend_tips,
      };
    })
  );

  return (
    <div>
      <CustomersBrowser customers={enriched} />
    </div>
  );
}
