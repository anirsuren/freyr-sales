import { Fragment } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Flame, BookOpen, Sparkles, SearchX, ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { SizeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { AgentActions } from "@/components/agent/AgentActions";
import { AgentRunPanel } from "@/components/agent/AgentRunPanel";
import { BriefingCard } from "@/components/agent/BriefingCard";
import { nextBestActions, buildDealBriefing } from "@/lib/agent";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { DonutChart, BarChart, VIZ } from "@/components/charts/Charts";
import { BackButton } from "@/components/ui/BackButton";
import { GLOSSARY, stageKey } from "@/lib/glossary";
import {
  buildDeals,
  STAGES,
  STAGE_PROBABILITY,
  OUTCOME_TO_STAGE,
  formatMoney,
  ROTTING_DAYS,
} from "@/lib/pipeline";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const db = getDb();
  const session = await db.pitchSessions.get(id);
  if (!session) {
    return (
      <EmptyState
        icon={SearchX}
        title="Deal not found"
        description="The link may be out of date, or this deal was closed or removed. Head back to the pipeline to pick up where you left off."
        className="py-24"
        action={
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to pipeline
          </Link>
        }
      />
    );
  }

  const [customer, contact, interactions, sessions, customers, contacts, allInteractions] =
    await Promise.all([
      db.customers.get(session.customer_id),
      db.contacts.get(session.contact_id),
      db.interactions.list(undefined, session.contact_id),
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
    ]);

  const deal = buildDeals(sessions, customers, contacts, allInteractions).find(
    (d) => d.sessionId === id
  );
  const stage = deal?.stage || "Prospect";
  const value = deal?.value || 0;
  const staleDays = deal?.staleDays ?? 0;
  const rotting = staleDays > ROTTING_DAYS && stage !== "Closed Lost";
  const weighted = value * (STAGE_PROBABILITY[stage] ?? 0);
  const winProb = Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100);
  const services = (session.recommended_services || []) as RecommendedService[];
  const nextStep = interactions.find((i) => i.follow_up_date)?.follow_up_date || null;
  const stageIdx = STAGES.indexOf(stage as any);
  const lastActivityAt = interactions[0]?.created_at || null;

  // When the deal first reached each stage — so we can date the journey.
  const stageDates: Partial<Record<string, string>> = { Prospect: session.created_at };
  for (const it of [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    const st = OUTCOME_TO_STAGE[it.outcome];
    if (st && !stageDates[st]) stageDates[st] = it.created_at;
  }

  // Agent next-best-action for this deal (V9) — the agent works the pipeline too.
  const dealAgentActions = nextBestActions({
    sessions: sessions.filter((s) => s.customer_id === session.customer_id),
    customers: customer ? [customer] : [],
    contacts: contacts.filter((c) => c.customer_id === session.customer_id),
    interactions: allInteractions.filter(
      (i) => i.customer_id === session.customer_id
    ),
  });

  // Pre-call deal briefing (V9 #73) — the agent's research read on this deal.
  const dealBriefing = buildDealBriefing({
    company: customer?.company_name || "This deal",
    stage,
    value: formatMoney(value),
    weighted: formatMoney(weighted),
    winProb: Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100),
    staleDays,
    rotting,
    nextStep: nextStep ? formatDate(nextStep) : null,
    topAction: dealAgentActions[0]?.title,
  });

  return (
    <div>
      <BackButton fallback="/pipeline" label="Back to pipeline" />
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <CompanyLogo name={customer?.company_name || "?"} className="w-12 h-12 text-[16px]" />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {customer?.company_name || "Deal"}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SizeBadge tier={customer?.size_tier || null} />
              {contact?.full_name && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                  <Avatar name={contact.full_name} className="w-5 h-5 text-[9px]" />
                  {contact.full_name} · {contact.job_title}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-tertiary bg-surface border border-border-light rounded px-1.5 py-0.5">
                <BookOpen size={12} strokeWidth={1.5} /> KB v{session.kb_version}
                <InfoHint text="Knowledge base version — which snapshot of Freyr's services and positioning this pitch was built from." />
              </span>
            </div>
          </div>
        </div>
        <Link
          href={`/sessions/${session.id}`}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-primary hover:text-blue-hover px-3 py-2 rounded-lg border border-border hover:bg-surface transition-colors"
        >
          Open full session
          <ArrowUpRight size={16} strokeWidth={1.75} />
        </Link>
      </div>

      {/* Stage tracker — the deal's identity/visual read leads (Anir's audit);
          the full pre-call brief follows right below, nothing removed. */}
      <Card className="mb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-[13px] font-semibold text-text-primary">Deal stage</h2>
          <InfoHint text="The deal's journey, left to right — from first contact (Prospect) to won (Meeting Booked) or lost (Closed Lost). The highlighted one is where it is now; dates show when it got there." />
          <span className="text-[12px] text-text-tertiary">
            — where this deal is in its journey, first contact to close
          </span>
        </div>
        {/* Connectors flex to fill the width, so the tracker always fits — no
            horizontal scroll (Suren: "why can I scroll… this is making me sad"). */}
        <div className="flex items-start gap-2">
          {STAGES.map((s, i) => {
            const done = i < stageIdx;
            const current = i === stageIdx;
            const date = stageDates[s];
            return (
              <Fragment key={s}>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Tooltip label={GLOSSARY[stageKey(s)]?.def} side="bottom">
                    <span
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap cursor-help",
                        current
                          ? s === "Closed Lost"
                            ? "bg-error text-white"
                            : "bg-blue-primary text-white"
                          : done
                          ? "bg-blue-light text-blue-primary"
                          : "bg-surface text-text-tertiary border border-border-light"
                      )}
                    >
                      {s}
                    </span>
                  </Tooltip>
                  <span className="text-[10px] text-text-tertiary tnum h-3.5">
                    {date && i <= stageIdx ? formatDateTime(date) : ""}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <span className={cn("flex-1 h-px mt-3.5 min-w-[12px]", done ? "bg-blue-primary" : "bg-border-light")} />
                )}
              </Fragment>
            );
          })}
        </div>
      </Card>

      {/* Deal snapshot — three graphs a rep actually reads (Suren wanted graphs
          on every deal: win chance, value at stake, and progress to close). */}
      <Card className="mb-6">
        <h2 className="text-[13px] font-semibold text-text-primary mb-1">Deal snapshot</h2>
        <p className="text-[12px] text-text-tertiary mb-4">
          Win chance, the value at stake, and how far this deal has come.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1 — Win chance */}
          <div className="rounded-xl border border-border-light p-4 flex flex-col items-center">
            <p className="self-start text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
              Win chance
            </p>
            <DonutChart
              segments={[
                { label: "Win chance", value: winProb, color: VIZ.blue },
                { label: "Remaining", value: Math.max(0, 100 - winProb), color: "#E5E5EA" },
              ]}
              size={124}
              thickness={13}
              centerLabel={`${winProb}%`}
              centerSub="to close"
            />
            <p className="mt-2 text-[12px] text-text-secondary text-center">
              Weighted to{" "}
              <span className="font-semibold text-text-primary tnum">{formatMoney(weighted)}</span>
            </p>
          </div>

          {/* 2 — Value at stake: full vs risk-adjusted */}
          <div className="rounded-xl border border-border-light p-4 flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
              Value at stake
            </p>
            <div className="flex-1">
              <BarChart
                data={[
                  { label: "Open", value, color: VIZ.blue },
                  { label: "Weighted", value: weighted, color: VIZ.green },
                ]}
                height={132}
                format="money"
              />
            </div>
            <p className="mt-1 text-[12px] text-text-secondary">Full value vs. risk-adjusted.</p>
          </div>

          {/* 3 — Pipeline progress */}
          <div className="rounded-xl border border-border-light p-4 flex flex-col items-center">
            <p className="self-start text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
              Pipeline progress
            </p>
            <DonutChart
              segments={[
                {
                  label: "Progress",
                  value: Math.round(((stageIdx + 1) / STAGES.length) * 100),
                  color: VIZ.indigo,
                },
                {
                  label: "Remaining",
                  value: 100 - Math.round(((stageIdx + 1) / STAGES.length) * 100),
                  color: "#E5E5EA",
                },
              ]}
              size={124}
              thickness={13}
              centerLabel={`${stageIdx + 1}/${STAGES.length}`}
              centerSub="stage"
            />
            <p className="mt-2 text-[12px] text-text-secondary text-center">
              <span className="font-semibold text-text-primary">{stage}</span>
              {" · "}
              {staleDays > 0 ? `${staleDays}d since touch` : "touched today"}
            </p>
          </div>
        </div>
      </Card>

      {/* Pre-call deal briefing (#73) — after the visual identity read */}
      <div className="mb-6">
        <BriefingCard briefing={dealBriefing} label="Pre-call brief" />
        <p className="text-[12px] text-text-tertiary mt-1.5 px-1">
          A quick read on this deal from your agent — where it stands and the smartest next move — so
          you&apos;re prepared before you call or email. The agent never reaches out on its own.
        </p>
      </div>

      {/* Key facts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Deal value</p>
          <p className="text-[24px] font-bold text-text-primary tnum mt-1">{formatMoney(value)}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">The full amount if it closes.</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary inline-flex items-center gap-1">
            Weighted
            <InfoHint text="The deal value adjusted for how likely it is to close at its current stage — a more realistic forecast number." />
          </p>
          <p className="text-[24px] font-bold text-text-primary tnum mt-1">{formatMoney(weighted)}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5 tnum">{Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100)}% chance of closing</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Owner</p>
          <div className="flex items-center gap-2 mt-2">
            <Avatar name="Suren Dheen" className="w-6 h-6 text-[10px]" tooltip="Owner: Suren Dheen — that's you" />
            <span className="text-[14px] text-text-primary">Suren Dheen</span>
          </div>
          <p className="text-[11px] text-text-tertiary mt-1">Who&apos;s running this deal — that&apos;s you.</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Last activity</p>
          <div className="flex items-center gap-2 mt-2">
            {rotting ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-error">
                <Flame size={14} strokeWidth={1.75} /> {lastActivityAt ? formatDateTime(lastActivityAt) : "No activity"} · {staleDays}d quiet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[13px] text-text-secondary">
                <Clock size={14} strokeWidth={1.5} /> {lastActivityAt ? formatDateTime(lastActivityAt) : "No activity yet"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary mt-1">
            {lastActivityAt
              ? `Your most recent logged call, email, or note${staleDays > 0 ? ` — ${staleDays} day${staleDays === 1 ? "" : "s"} ago` : " — today"}.`
              : "No call, email, or note logged yet."}
          </p>
          {nextStep && (
            <p className="text-[11px] text-blue-primary mt-1">Next step scheduled: {formatDate(nextStep)}</p>
          )}
        </Card>
      </div>

      {/* Agent surface for this deal (V9) — recommended next action + run a play */}
      <Card className="mb-6 bg-blue-light/40 border-blue-subtle">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={17} strokeWidth={1.8} className="text-blue-primary" />
            Agent — next best action for this deal
            <InfoHint text="A 'play' is the agent doing the legwork for one clear next step — drafting the outreach and prepping you. You review and approve before anything is sent." />
          </h2>
          {customer && (
            <AgentRunPanel
              customerId={customer.id}
              company={customer.company_name}
            />
          )}
        </div>
        {dealAgentActions.length > 0 ? (
          <AgentActions actions={dealAgentActions} compact />
        ) : (
          <p className="text-[13px] text-text-secondary">
            Nothing urgent on this deal right now — run a play to open or advance
            the conversation.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary mb-3">Recommended Services</h2>
          <div className="space-y-3">
            {services.map((s, i) => {
              const pct = Math.max(0, Math.min(100, Math.round((s.relevance_score || 0) * 10)));
              return (
                <Card key={i}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[14px] font-semibold text-text-primary">{s.service_name}</span>
                    <span className="text-blue-primary font-bold text-[12px] tnum">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border-light overflow-hidden">
                    <div className="h-full bg-blue-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  {s.pitch_angle && (
                    <p className="text-[13px] text-text-secondary mt-2 leading-relaxed">{s.pitch_angle}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-[17px] font-semibold text-text-primary mb-3">Activity</h2>
          <InteractionTimeline interactions={interactions} />
        </div>
      </div>
    </div>
  );
}
