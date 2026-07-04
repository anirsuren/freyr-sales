import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Send,
  Clock,
  PhoneCall,
  Package,
  Check,
  X,
  SearchX,
  BarChart3,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCampaign } from "@/lib/campaigns";
import { getOffering } from "@/lib/offerings";
import { listVoiceQueue } from "@/lib/voice";
import { formatDate, formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

// One campaign, one page (Anir's audit: "click View more and it takes me to a
// page with only that campaign — graphs, beautiful visuals"). Every number and
// chart here is REAL — recipients, companies, voice touches, statuses. What
// can't be real yet (opens/replies) says so instead of faking it.
export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = getCampaign(params.id);
  if (!campaign) {
    return (
      <EmptyState
        icon={SearchX}
        title="Campaign not found"
        description="The link may be out of date, or this campaign was removed. Head back to campaigns to find it."
        className="py-24"
        action={
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to campaigns
          </Link>
        }
      />
    );
  }

  const db = getDb();
  const [contacts, customers] = await Promise.all([
    db.contacts.list(),
    db.customers.list(),
  ]);
  const companyById = new Map(customers.map((c) => [c.id, c.company_name]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const recipients = campaign.recipient_contact_ids
    .map((id) => {
      const c = contactById.get(id);
      return c
        ? {
            id,
            name: c.full_name,
            title: c.job_title || "",
            email: c.email || "",
            company: companyById.get(c.customer_id) || "—",
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const total = recipients.length;
  const sent = Math.min(campaign.sent_count, total);
  const queued = campaign.status === "queued" ? total - sent : 0;
  const offering = campaign.offering_id ? getOffering(campaign.offering_id) : null;

  // Voice touches — real cross-link: queued/placed calls for these recipients.
  const recipientIds = new Set(campaign.recipient_contact_ids);
  const voiceTouches = listVoiceQueue().filter((q) =>
    recipientIds.has(q.contact_id)
  );
  const voiceByContact = new Set(voiceTouches.map((q) => q.contact_id));

  // Recipients by company — a real composition chart.
  const byCompany = new Map<string, number>();
  for (const r of recipients)
    byCompany.set(r.company, (byCompany.get(r.company) || 0) + 1);
  const companyBars = Array.from(byCompany.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const maxCompany = Math.max(1, ...companyBars.map(([, n]) => n));

  const checks = [
    { label: "Subject", ok: !!campaign.subject.trim() },
    { label: "Message", ok: campaign.body.trim().length >= 40 },
    { label: "Offering linked", ok: !!campaign.offering_id },
    { label: "Recipients", ok: total > 0 },
  ];

  // Delivery donut — sent (green) vs queued (amber) vs unqueued draft (grey).
  const r = 52;
  const C = 2 * Math.PI * r;
  const sentFrac = total ? sent / total : 0;
  const queuedFrac = total ? queued / total : 0;

  const tiles = [
    { label: "Recipients", value: String(total), icon: Users },
    { label: "Sent", value: String(sent), icon: Send },
    { label: "Queued", value: String(queued), icon: Clock },
    { label: "Voice touches", value: String(voiceTouches.length), icon: PhoneCall },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          All campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            {campaign.name}
          </h1>
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
              campaign.status === "queued"
                ? "text-warning bg-warning/10"
                : "text-text-secondary bg-surface border border-border-light"
            )}
          >
            {campaign.status === "queued" ? "Queued" : "Draft"}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-[13px] text-text-secondary mt-1.5">
          {offering && (
            <Link
              href={`/offerings/${offering.id}`}
              className="inline-flex items-center gap-1 text-blue-primary hover:underline"
            >
              <Package size={13} strokeWidth={1.8} />
              {offering.offering_name}
            </Link>
          )}
          <span className="tnum">Created {formatDate(campaign.created_at)}</span>
          {campaign.queued_at && (
            <span className="tnum">Queued {formatDate(campaign.queued_at)}</span>
          )}
        </p>
      </div>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.label} className="h-[116px] flex flex-col">
              <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-2.5">
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {t.label}
              </span>
              <span className="mt-auto text-[24px] font-bold leading-none tnum text-text-primary">
                {t.value}
              </span>
            </Card>
          );
        })}
      </section>

      {/* Visual row: delivery donut + recipients by company */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">
            Delivery
          </h2>
          <p className="text-[12px] text-text-tertiary mb-3">
            {campaign.status === "queued"
              ? "Everything is queued — it sends the moment the email channel connects."
              : "Still a draft — queue the blast to line it up."}
          </p>
          <div className="flex items-center gap-6">
            <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
              <circle cx="65" cy="65" r={r} fill="none" stroke="#E5E5EA" strokeWidth="12" />
              {queuedFrac > 0 && (
                <circle
                  cx="65" cy="65" r={r} fill="none" stroke="#FF9F0A" strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${C * queuedFrac} ${C}`}
                  transform="rotate(-90 65 65)"
                  className="donut-arc"
                  style={{ ["--donut-c" as string]: C }}
                />
              )}
              {sentFrac > 0 && (
                <circle
                  cx="65" cy="65" r={r} fill="none" stroke="#34C759" strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${C * sentFrac} ${C}`}
                  transform={`rotate(${-90 + queuedFrac * 360} 65 65)`}
                />
              )}
              <text x="65" y="59" textAnchor="middle" className="tnum" fontSize="24" fontWeight="700" fill="#1D1D1F">
                {total ? Math.round(sentFrac * 100) : 0}%
              </text>
              <text x="65" y="77" textAnchor="middle" fontSize="10" fill="#8A8A8E">
                sent
              </text>
            </svg>
            <div className="space-y-2 text-[13px]">
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                <span className="text-text-secondary">Sent</span>
                <span className="font-semibold text-text-primary tnum">{sent}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                <span className="text-text-secondary">Queued</span>
                <span className="font-semibold text-text-primary tnum">{queued}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-border" />
                <span className="text-text-secondary">Not queued</span>
                <span className="font-semibold text-text-primary tnum">
                  {total - sent - queued}
                </span>
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">
            Recipients by company
          </h2>
          <p className="text-[12px] text-text-tertiary mb-3">
            Where this blast lands.
          </p>
          {companyBars.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">No recipients yet.</p>
          ) : (
            <div className="space-y-2.5">
              {companyBars.map(([company, n]) => (
                <div key={company}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span className="text-text-secondary truncate">{company}</span>
                    <span className="text-text-primary font-medium tnum">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-primary"
                      style={{ width: `${(n / maxCompany) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Message + readiness */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">
            Message
          </h2>
          <p className="text-[13px] text-text-primary bg-surface rounded-md px-3 py-2 mb-2.5">
            <span className="font-semibold text-text-tertiary">Subject: </span>
            {campaign.subject}
          </p>
          <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line max-h-[300px] overflow-y-auto">
            {campaign.body}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-light">
            {checks.map((k) => (
              <span
                key={k.label}
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-0.5",
                  k.ok
                    ? "text-success bg-success/10"
                    : "text-text-tertiary bg-surface border border-border-light"
                )}
              >
                {k.ok ? <Check size={11} strokeWidth={2.4} /> : <X size={11} strokeWidth={2.4} />}
                {k.label}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">
            Recipients ({total})
          </h2>
          {total === 0 ? (
            <p className="text-[13px] text-text-tertiary">None picked yet.</p>
          ) : (
            <ul className="divide-y divide-border-light max-h-[380px] overflow-y-auto">
              {recipients.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/contacts/${p.id}`}
                      className="text-[13.5px] font-medium text-text-primary hover:text-blue-primary truncate block"
                    >
                      {p.name}
                    </Link>
                    <p className="text-[11.5px] text-text-tertiary truncate">
                      {p.company} · {p.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {voiceByContact.has(p.id) && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-2 py-0.5">
                        <PhoneCall size={10} strokeWidth={2.2} />
                        Voice
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                        campaign.status === "queued"
                          ? "text-warning bg-warning/10"
                          : "text-text-secondary bg-surface border border-border-light"
                      )}
                    >
                      {campaign.status === "queued" ? "Queued" : "Draft"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Voice touches — the calls linked to this campaign's people */}
      <Card>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
          <PhoneCall size={16} strokeWidth={1.8} className="text-blue-primary" />
          Voice touches ({voiceTouches.length})
        </h2>
        <p className="text-[12px] text-text-tertiary mb-3">
          AI calls queued or placed for people on this campaign.
        </p>
        {voiceTouches.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            None yet — queue calls from a contact&apos;s AI voice call, or select
            these recipients on the Contacts page and run a category&apos;s agent.
          </p>
        ) : (
          <ul className="divide-y divide-border-light">
            {voiceTouches.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2 py-2.5 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text-primary">{q.contact_name}</span>
                  <span className="text-text-tertiary"> · {q.offering_name}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                      q.status === "called"
                        ? "text-success bg-success/10"
                        : "text-warning bg-warning/10"
                    )}
                  >
                    {q.status === "called" ? "Called" : "Waiting for number"}
                  </span>
                  <span className="text-[11.5px] text-text-tertiary tnum">
                    {formatDateTime(q.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Honest engagement frame */}
      <Card>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
          <BarChart3 size={16} strokeWidth={1.8} className="text-blue-primary" />
          Engagement
        </h2>
        <p className="text-[13px] text-text-secondary leading-relaxed">
          Opens, replies and click-throughs chart here automatically once the
          email channel (Resend / SMTP) is connected and the blast goes out —
          real numbers only, nothing simulated.
        </p>
      </Card>
    </div>
  );
}
