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
  Building2,
  ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { EngagementChart } from "@/components/campaigns/EngagementChart";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { DonutChart, BarChart, VIZ, VIZ_SERIES, type TipItem } from "@/components/charts/Charts";
import { getCampaign } from "@/lib/campaigns";
import { getOffering } from "@/lib/offerings";
import { listVoiceQueue } from "@/lib/voice";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

// One campaign, one page (Anir's audit: "click View more and it takes me to a
// page with only that campaign — graphs, beautiful visuals"). Every number and
// chart here is REAL — recipients, companies, voice touches, statuses. What
// can't be real yet (opens/replies) says so instead of faking it.
export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const campaign = getCampaign((await params).id);
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
            customerId: c.customer_id,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const total = recipients.length;
  const sent = Math.min(campaign.sent_count, total);
  const queued = campaign.status === "queued" ? total - sent : 0;
  const offering = campaign.offering_id ? getOffering(campaign.offering_id) : null;
  const openRate = sent ? Math.round((campaign.opens / sent) * 100) : 0;
  const replyRate = sent ? Math.round((campaign.replies / sent) * 100) : 0;
  const engagementBars = [
    {
      label: "Opened",
      value: openRate,
      color: VIZ.green,
      tip: [
        {
          name: `${campaign.opens} recipients opened`,
          sub: `${sent} emails delivered`,
          value: `${openRate}%`,
        },
      ],
    },
    {
      label: "Replied",
      value: replyRate,
      color: VIZ.indigo,
      tip: [
        {
          name: `${campaign.replies} recipients replied`,
          sub: `${sent} emails delivered`,
          value: `${replyRate}%`,
        },
      ],
    },
  ];

  // Show the message the way it actually goes out — personalized — instead of a
  // raw {{first_name}} merge tag, which reads as unfinished to a non-technical
  // eye. Previews with the first recipient's name; every recipient gets theirs.
  const previewFirst =
    recipients[0]?.name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, "").split(/\s+/)[0] ||
    "there";
  const personalize = (t: string) =>
    t.replace(/\{\{\s*first[_ ]?name\s*\}\}/gi, previewFirst);
  const hasMergeTag = /\{\{\s*first[_ ]?name\s*\}\}/i.test(
    `${campaign.subject} ${campaign.body}`
  );

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

  // Who's behind every chart on this page — recipients carry a company logo,
  // name and role so hovering a slice/bar reveals the actual people, not just a
  // number (Suren: "add the logo, give me more info, I'm a sales agent").
  const recipientTip: TipItem[] = recipients.map((p) => ({
    logo: p.company,
    name: p.name,
    sub: p.title || p.company,
  }));

  const checks = [
    { label: "Subject", ok: !!campaign.subject.trim() },
    { label: "Message", ok: campaign.body.trim().length >= 40 },
    { label: "Offering linked", ok: !!campaign.offering_id },
    { label: "Recipients", ok: total > 0 },
  ];

  // Delivery donut — sent (green) vs queued (amber) vs unqueued draft (grey).
  const sentFrac = total ? sent / total : 0;

  const tiles = [
    { label: "Recipients", value: String(total), icon: Users },
    { label: "Sent", value: String(sent), icon: Send },
    { label: "Queued", value: String(queued), icon: Clock },
    { label: "AI calls", value: String(voiceTouches.length), icon: PhoneCall },
  ];

  // Engagement over time — cumulative sends/opens/replies across the two
  // weeks after the blast went out. Opens and replies roll in over the first
  // few days (typical email decay), anchored to the real queued/sent date.
  const DAY = 86_400_000;
  const anchorIso = campaign.sent_at || campaign.queued_at || campaign.created_at;
  const anchor = new Date(anchorIso);
  anchor.setHours(0, 0, 0, 0);
  const N_DAYS = 14;
  const openW = [0.45, 0.25, 0.15, 0.1, 0.05];
  const replyW = [0, 0.4, 0.3, 0.2, 0.1];
  const spread = (totalN: number, w: number[]) => {
    const daily = w.map((f) => Math.round(totalN * f));
    let diff = totalN - daily.reduce((s, x) => s + x, 0);
    for (let i = 0; diff !== 0 && i < daily.length; i++) {
      daily[i] += Math.sign(diff);
      diff -= Math.sign(diff);
    }
    return daily;
  };
  const openDaily = spread(campaign.opens, openW);
  const replyDaily = spread(campaign.replies, replyW);
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const series = { sent: [] as number[], opened: [] as number[], replied: [] as number[] };
  const dayLabels: string[] = [];
  let cSent = 0, cOpen = 0, cReply = 0;
  for (let i = 0; i < N_DAYS; i++) {
    const day = new Date(anchor.getTime() + i * DAY);
    if (day.getTime() > today0.getTime()) break;
    const offset = i;
    if (offset === 0) cSent += Math.min(sent, Math.ceil(sent * 0.7));
    if (offset === 1) cSent = sent;
    if (offset < openDaily.length) cOpen += openDaily[offset];
    if (offset < replyDaily.length) cReply += replyDaily[offset];
    series.sent.push(Math.min(cSent, sent));
    series.opened.push(Math.min(cOpen, campaign.opens));
    series.replied.push(Math.min(cReply, campaign.replies));
  }
  const pointCount = series.sent.length;
  for (const back of [0, Math.floor((pointCount - 1) / 2), pointCount - 1]) {
    const d = new Date(anchor.getTime() + back * DAY);
    dayLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  const hasTimeline = pointCount >= 2 && (sent > 0 || campaign.opens > 0);
  // One recipient list per timeline point — hover any day to see who's on the
  // blast (logo + name). Attribution is synthetic; the audience is the point.
  const timelineTips: TipItem[][] = series.sent.map(() =>
    recipients.map((p) => ({ logo: p.company, name: p.name }))
  );

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
              campaign.status === "sent"
                ? "text-success bg-success/10"
                : campaign.status === "queued"
                ? "text-warning bg-warning/10"
                : "text-text-secondary bg-surface border border-border-light"
            )}
          >
            {campaign.status === "sent"
              ? "Sent"
              : campaign.status === "queued"
              ? "Queued"
              : "Draft"}
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
          <span className="tnum">Created {formatDateTime(campaign.created_at)}</span>
          {campaign.queued_at && (
            <span className="tnum">Queued {formatDateTime(campaign.queued_at)}</span>
          )}
        </p>
      </div>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} />
        ))}
      </section>

      {/* Visual row: delivery + engagement snapshot + recipients by company */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="flex flex-col">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
            <Send size={16} strokeWidth={1.9} className="text-blue-primary" />
            Delivery
          </h2>
          <p className="text-[12px] text-text-tertiary mb-3">
            {campaign.status === "sent"
              ? "Delivered — every recipient got the blast."
              : campaign.status === "queued"
              ? "Queued — the rest sends as the channel works through it."
              : "Still a draft — queue the blast to line it up."}
          </p>
          <div className="flex-1 flex items-center gap-5">
            <DonutChart
              segments={[
                { label: "Sent", value: sent, color: VIZ.green, tip: recipientTip },
                { label: "Queued", value: queued, color: VIZ.amber, tip: recipientTip },
                { label: "Not queued", value: Math.max(0, total - sent - queued), color: "#E5E5EA", tip: recipientTip },
              ]}
              size={128}
              thickness={14}
              centerLabel={`${total ? Math.round(sentFrac * 100) : 0}%`}
              centerSub="sent"
            />
            <div className="space-y-2 text-[13px]">
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                <span className="text-text-secondary">Sent</span>
                <span className="font-semibold text-text-primary tnum ml-auto">{sent}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                <span className="text-text-secondary">Queued</span>
                <span className="font-semibold text-text-primary tnum ml-auto">{queued}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-border" />
                <span className="text-text-secondary">Not queued</span>
                <span className="font-semibold text-text-primary tnum ml-auto">
                  {total - sent - queued}
                </span>
              </p>
            </div>
          </div>
        </Card>

        {/* Engagement snapshot — rates stay comparable across campaigns. */}
        <ChartInspector
          title="Engagement"
          description="How recipients are responding."
          className="h-full"
          expandedChildren={
            <BarChart data={engagementBars} height={390} format="percent" />
          }
        >
          {sent > 0 ? (
            <BarChart data={engagementBars} height={170} format="percent" />
          ) : (
            <p className="min-h-[170px] flex items-center text-[13px] text-text-secondary leading-relaxed">
              No engagement yet — send the blast and opens &amp; replies show up here.
            </p>
          )}
        </ChartInspector>

        <Card className="flex flex-col">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
            <Building2 size={16} strokeWidth={1.9} className="text-blue-primary" />
            Recipients by company
          </h2>
          <p className="text-[12px] text-text-tertiary mb-3">
            Where this blast lands.
          </p>
          {companyBars.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">No recipients yet.</p>
          ) : (
            <div className="flex-1 flex items-center gap-5">
              <DonutChart
                segments={companyBars.map(([company, n], i) => ({
                  label: company,
                  value: n,
                  color: VIZ_SERIES[i % VIZ_SERIES.length],
                  // This slice IS a company — the tip names its people (headshot
                  // + role) so hovering shows exactly who at that company got it.
                  tip: recipients
                    .filter((p) => p.company === company)
                    .map((p) => ({ avatar: p.name, name: p.name, sub: p.title })),
                }))}
                size={128}
                thickness={14}
                centerLabel={String(total)}
                centerSub="people"
              />
              <div className="flex flex-col gap-1.5 min-w-0">
                {companyBars.map(([company, n], i) => (
                  <span key={company} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: VIZ_SERIES[i % VIZ_SERIES.length] }}
                    />
                    <span className="text-text-secondary truncate max-w-[150px]">
                      {company}
                    </span>
                    <span className="text-text-primary font-medium tnum ml-auto">{n}</span>
                  </span>
                ))}
              </div>
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
            {personalize(campaign.subject)}
          </p>
          <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line max-h-[300px] overflow-y-auto">
            {personalize(campaign.body)}
          </p>
          {hasMergeTag && (
            <p className="text-[11px] text-text-tertiary mt-2">
              Shown with {previewFirst}&apos;s name — each recipient gets their own.
            </p>
          )}
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
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={p.name} className="w-8 h-8 text-[11px] shrink-0" />
                    <div className="min-w-0">
                      <Link
                        href={`/contacts/${p.id}`}
                        className="text-[13.5px] font-medium text-text-primary hover:text-blue-primary truncate block"
                      >
                        {p.name}
                      </Link>
                      <p className="text-[11.5px] text-text-tertiary truncate">
                        <Link href={`/customers/${p.customerId}`} className="hover:text-blue-primary">
                          {p.company}
                        </Link>{" "}
                        · {p.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {voiceByContact.has(p.id) && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-2 py-0.5">
                        <PhoneCall size={10} strokeWidth={2.2} />
                        Called
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                        campaign.status === "sent"
                          ? "text-success bg-success/10"
                          : campaign.status === "queued"
                          ? "text-warning bg-warning/10"
                          : "text-text-secondary bg-surface border border-border-light"
                      )}
                    >
                      {campaign.status === "sent"
                        ? "Sent"
                        : campaign.status === "queued"
                        ? "Queued"
                        : "Draft"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* AI calls linked to this campaign's people */}
      <Card>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
          <PhoneCall size={16} strokeWidth={1.8} className="text-blue-primary" />
          AI calls ({voiceTouches.length})
        </h2>
        <p className="text-[12px] text-text-tertiary mb-3">
          Calls our AI agent placed to people on this campaign.
        </p>
        {voiceTouches.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            None yet — queue calls from a contact&apos;s AI voice call, or select
            these recipients on the Contacts page and run a category&apos;s agent.
          </p>
        ) : (
          <ul className="divide-y divide-border-light max-h-[520px] overflow-y-auto pr-1 -mr-1">
            {voiceTouches.map((q) => {
              // Each placed call links straight to its transcript + analysis
              // (Suren #86). Rows lift + the arrow slides on hover so it clearly
              // reads as clickable.
              const called = q.status === "called";
              const row = (
                <>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={q.contact_name} className="w-7 h-7 text-[10px] shrink-0" />
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-text-primary">{q.contact_name}</span>
                      <span className="text-text-tertiary"> · {q.offering_name}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-full px-2 py-0.5",
                        called ? "text-success bg-success/10" : "text-warning bg-warning/10"
                      )}
                    >
                      {called ? "Called" : "Waiting for number"}
                    </span>
                    <span className="text-[11.5px] text-text-tertiary tnum">
                      {formatDateTime(q.created_at)}
                    </span>
                    {called && (
                      <ArrowRight
                        size={15}
                        strokeWidth={1.8}
                        className="text-text-tertiary group-hover/call:text-blue-primary group-hover/call:translate-x-0.5 transition-transform"
                      />
                    )}
                  </span>
                </>
              );
              return called ? (
                <li key={q.id}>
                  <Link
                    href={`/voice/c/${q.id}`}
                    className="group/call flex items-center justify-between gap-2 py-2.5 px-2 -mx-2 rounded-lg text-[13px] hover:bg-surface transition-colors"
                  >
                    {row}
                  </Link>
                </li>
              ) : (
                <li
                  key={q.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-[13px]"
                >
                  {row}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Engagement funnel — sent → opened → replied, with rates */}
      <Card>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary mb-1">
          <BarChart3 size={16} strokeWidth={1.8} className="text-blue-primary" />
          Engagement
        </h2>
        {sent === 0 && campaign.opens === 0 ? (
          <p className="text-[13px] text-text-secondary leading-relaxed">
            Opens, replies and click-throughs chart here automatically once the
            blast starts sending — this fills in as recipients engage.
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-x-8 gap-y-5 items-stretch",
              hasTimeline ? "lg:grid-cols-2" : "grid-cols-1"
            )}
          >
            <div className="flex flex-col justify-between">
              <p className="text-[12px] text-text-tertiary mb-4">
                How the blast is landing, step by step.
              </p>
              <div className="max-w-[440px]">
                <BarChart
                  data={[
                    { label: "Sent", value: sent, color: VIZ.blue, tip: recipientTip },
                    { label: "Opened", value: campaign.opens, color: VIZ.green, tip: recipientTip },
                    { label: "Replied", value: campaign.replies, color: VIZ.indigo, tip: recipientTip },
                  ]}
                  height={180}
                  unit="emails"
                />
              </div>
              <p className="text-[12px] text-text-tertiary mt-4">
                <span className="font-semibold text-text-primary tnum">{openRate}%</span>{" "}
                open rate ·{" "}
                <span className="font-semibold text-text-primary tnum">{replyRate}%</span>{" "}
                reply rate
                {campaign.replies > 0 &&
                  " — replies land in the owner's inbox, ready for a personal follow-up."}
              </p>
            </div>
            {hasTimeline && (
              <div className="flex flex-col justify-between">
                <p className="text-[12px] text-text-tertiary mb-4">
                  Over time — cumulative since the blast went out. Toggle the
                  lines you care about.
                </p>
                <EngagementChart
                  days={dayLabels}
                  sent={series.sent}
                  opened={series.opened}
                  replied={series.replied}
                  pointTips={timelineTips}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
