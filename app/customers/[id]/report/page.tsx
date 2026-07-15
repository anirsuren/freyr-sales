import { getDb } from "@/lib/db";
import { ReportToolbar } from "@/components/customers/ReportToolbar";
import { buildDeals, formatMoney, ownerFor } from "@/lib/pipeline";
import { formatDate, formatDateTime, SIZE_TIER_LABEL, OUTCOME_META } from "@/lib/utils";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Account report" };
export const dynamic = "force-dynamic";

export default async function AccountReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const db = getDb();
  const customer = await db.customers.get(id);
  if (!customer) {
    return (
      <div className="p-10 text-[14px] text-text-secondary">
        Account not found.
      </div>
    );
  }

  const [contacts, sessions, interactions, allCustomers, allContacts] =
    await Promise.all([
      db.contacts.list(id),
      db.pitchSessions.list(id),
      db.interactions.list(id),
      db.customers.list(),
      db.contacts.list(),
    ]);

  const deals = buildDeals(sessions, allCustomers, allContacts, interactions).filter(
    (d) => d.customerId === id
  );
  const accountDeals = customer.account_deals || [];
  const services: RecommendedService[] = [];
  const seen = new Set<string>();
  for (const s of sessions)
    for (const svc of (s.recommended_services || []) as RecommendedService[])
      if (!seen.has(svc.service_name)) {
        seen.add(svc.service_name);
        services.push(svc);
      }
  const openValue =
    deals.filter((d) => d.stage !== "Closed Lost").reduce((s, d) => s + d.value, 0) +
    accountDeals.reduce((s, d) => s + d.value, 0);

  const facts = [
    { label: "Industry", value: customer.industry || "—" },
    { label: "Geography", value: customer.geography || "—" },
    {
      label: "Size",
      value: customer.size_tier
        ? SIZE_TIER_LABEL[customer.size_tier] || customer.size_tier
        : "—",
    },
    // Show the effective owner (the same rep the pipeline/forecast assign) so the
    // report doesn't read "Unassigned" while the deal is clearly owned elsewhere.
    { label: "Owner", value: ownerFor(customer) },
    { label: "Competitor", value: customer.competitor || "—" },
    {
      label: "Open value",
      value: openValue ? formatMoney(openValue) : "—",
    },
  ];

  return (
    <div className="min-h-screen bg-surface print:bg-white">
      <ReportToolbar customerId={customer.id} />

      <div className="max-w-[820px] mx-auto px-6 py-8 print:px-0 print:py-0">
        <article className="bg-white rounded-xl border border-border-light shadow-card p-10 print:border-0 print:shadow-none print:p-0">
          {/* header */}
          <header className="flex items-start justify-between gap-4 border-b border-border-light pb-5 mb-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-primary">
                Freyr · Account Report
              </p>
              <h1 className="text-[28px] font-bold tracking-[-0.02em] text-text-primary mt-1">
                {customer.company_name}
              </h1>
              <p className="text-[13px] text-text-secondary mt-1">
                {customer.website_url?.replace(/^https?:\/\//, "") || ""}
              </p>
            </div>
            <p className="text-[12px] text-text-tertiary tnum text-right">
              Generated
              <br />
              {formatDate(new Date().toISOString())}
            </p>
          </header>

          {/* facts */}
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-7">
            {facts.map((f) => (
              <div key={f.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {f.label}
                </p>
                <p className="text-[14px] text-text-primary mt-0.5">{f.value}</p>
              </div>
            ))}
          </section>

          {/* summary */}
          {customer.enrichment_summary && (
            <section className="mb-7">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-tertiary mb-2">
                Account summary
              </h2>
              <p className="text-[14px] text-text-secondary leading-relaxed">
                {customer.enrichment_summary}
              </p>
            </section>
          )}

          {/* contacts */}
          <section className="mb-7">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-tertiary mb-2">
              Buying committee ({contacts.length})
            </h2>
            <ul className="divide-y divide-border-light border-y border-border-light">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] font-medium text-text-primary">
                    {c.full_name}
                  </span>
                  <span className="text-[13px] text-text-secondary">{c.job_title}</span>
                </li>
              ))}
              {contacts.length === 0 && (
                <li className="py-2.5 text-[13px] text-text-secondary">No contacts.</li>
              )}
            </ul>
          </section>

          {/* deals */}
          <section className="mb-7">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-tertiary mb-2">
              Deals ({deals.length + accountDeals.length})
            </h2>
            <ul className="divide-y divide-border-light border-y border-border-light">
              {deals.map((d) => (
                <li key={d.sessionId} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] text-text-primary">{d.service}</span>
                  <span className="text-[13px] text-text-secondary tnum">
                    {d.stage} · {formatMoney(d.value)}
                  </span>
                </li>
              ))}
              {accountDeals.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] text-text-primary">{d.name}</span>
                  <span className="text-[13px] text-text-secondary tnum">
                    {d.stage} · {formatMoney(d.value)}
                  </span>
                </li>
              ))}
              {deals.length + accountDeals.length === 0 && (
                <li className="py-2.5 text-[13px] text-text-secondary">No deals.</li>
              )}
            </ul>
          </section>

          {/* recommended services */}
          {services.length > 0 && (
            <section className="mb-7">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-tertiary mb-2">
                Recommended Freyr services
              </h2>
              <ul className="list-disc pl-5 space-y-1">
                {services.slice(0, 6).map((s, i) => (
                  <li key={i} className="text-[14px] text-text-primary">
                    {s.service_name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* activity */}
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-tertiary mb-2">
              Recent activity
            </h2>
            <ul className="divide-y divide-border-light border-y border-border-light">
              {interactions.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-text-secondary truncate">
                    {OUTCOME_META[i.outcome]?.label || i.outcome}
                    {i.notes ? ` — ${i.notes}` : ""}
                  </span>
                  <span className="text-[12px] text-text-tertiary tnum shrink-0">
                    {formatDateTime(i.created_at)}
                  </span>
                </li>
              ))}
              {interactions.length === 0 && (
                <li className="py-2.5 text-[13px] text-text-secondary">
                  No activity logged.
                </li>
              )}
            </ul>
          </section>

          <footer className="mt-8 pt-5 border-t border-border-light text-[11px] text-text-tertiary">
            Freyr Sales Intelligence · Confidential · Prepared for internal use.
          </footer>
        </article>
      </div>
    </div>
  );
}
