import Link from "next/link";
import { headers } from "next/headers";
import {
  ArrowUpRight,
  Clock,
  Flame,
  BookOpen,
  Sparkles,
  SearchX,
  ArrowLeft,
  Handshake,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { SizeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { AgentActions } from "@/components/agent/AgentActions";
import { BriefingCard } from "@/components/agent/BriefingCard";
import { DealTimeline } from "@/components/deals/DealTimeline";
import { DealSnapshot } from "@/components/deals/DealSnapshot";
import {
  daysSince,
  medianDays,
  stageEnteredAt,
} from "@/components/deals/dealTime";
import { nextBestActions, buildDealBriefing } from "@/lib/agent";
import { formatDate, formatDateTime } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  buildDeals,
  STAGE_PROBABILITY,
  OUTCOME_TO_STAGE,
  formatMoney,
  ROTTING_DAYS,
  type Stage,
} from "@/lib/pipeline";
import type { Interaction, RecommendedService } from "@/lib/types";
import { getCurrentUser } from "@/lib/currentUser";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

// Where "back" actually goes. Suren clicked a deal driver on the forecast page,
// landed here, saw "Back to pipeline" and concluded the app had dumped him in
// the pipeline: "I don't even know how I got to the pipeline… is that right?"
// The request that renders this page carries the page he clicked FROM in its
// Referer header (true for a hard load and for a client-side navigation), so we
// can name the real destination instead of guessing one.
const BACK_LABELS: [RegExp, string][] = [
  [/^\/forecast/, "Back to the forecast"],
  [/^\/pipeline/, "Back to the pipeline board"],
  [/^\/customers/, "Back to the account"],
  [/^\/analytics/, "Back to analytics"],
  [/^\/agent/, "Back to the agent"],
  [/^\/team/, "Back to the team"],
  [/^\/tasks/, "Back to your tasks"],
  [/^\/(dashboard)?$/, "Back to home"],
];

function backTarget(referer: string | null, host: string | null) {
  const fallback = { href: "/pipeline", label: "Back to the pipeline board" };
  if (!referer) return fallback;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return fallback;
  }
  // Only ever offer a link back INTO this app.
  if (host && url.host !== host) return fallback;
  if (url.pathname.startsWith("/deals/")) return fallback;
  const label = BACK_LABELS.find(([test]) => test.test(url.pathname))?.[1];
  if (!label) return fallback;
  return { href: `${url.pathname}${url.search}`, label };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const currentUser = await getCurrentUser();
  const requestHeaders = await headers();
  const back = backTarget(
    requestHeaders.get("referer"),
    requestHeaders.get("host")
  );
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

  const allDeals = buildDeals(sessions, customers, contacts, allInteractions);
  const deal = allDeals.find((d) => d.sessionId === id);
  const stage: Stage = deal?.stage || "Prospect";
  const owner = deal?.owner || "Unassigned";
  const isCurrentOwner =
    !!deal?.ownerUserId &&
    !!currentUser.memberId &&
    deal.ownerUserId === currentUser.memberId;
  const value = deal?.value || 0;
  const weighted = value * (STAGE_PROBABILITY[stage] ?? 0);
  const winProb = Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100);
  const services = (session.recommended_services || []) as RecommendedService[];
  const nextStep = interactions.find((i) => i.follow_up_date)?.follow_up_date || null;
  const lastActivityAt = interactions[0]?.created_at || null;
  // One "now" for the whole page so the timeline and the snapshot can never
  // disagree about what today is.
  const nowIso = new Date().toISOString();
  // Elapsed time is counted in CALENDAR days everywhere on this page. The
  // pipeline's staleDays counts 24-hour blocks, which reads a day short next to
  // a printed date — "Jul 23" sitting above "2 days ago" on Jul 26 is exactly
  // the kind of mismatch Suren spots.
  const quietDays = daysSince(lastActivityAt, nowIso) ?? deal?.staleDays ?? 0;
  const rotting = quietDays > ROTTING_DAYS && stage !== "Closed Lost";

  // When the deal first reached each stage — so we can date the journey.
  const stageDates: Record<string, string | undefined> = { Prospect: session.created_at };
  for (const it of [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    const st = OUTCOME_TO_STAGE[it.outcome];
    if (st && !stageDates[st]) stageDates[st] = it.created_at;
  }

  // "Is this deal stalling?" — the question the old 4/5-stage donut couldn't
  // answer. Days on the current stage, next to the median for the other open
  // deals sitting on that same stage right now. Those are real deals from the
  // same book: no invented benchmark, and when there are none we say so rather
  // than inventing a "typical".
  const stageStartedAt = stageEnteredAt(session.created_at, interactions);
  const daysInStage = daysSince(stageStartedAt, nowIso) ?? 0;
  const interactionsByContact = new Map<string, Interaction[]>();
  for (const it of allInteractions) {
    const list = interactionsByContact.get(it.contact_id);
    if (list) list.push(it);
    else interactionsByContact.set(it.contact_id, [it]);
  }
  const peers =
    stage === "Closed Lost"
      ? []
      : allDeals.filter((d) => d.sessionId !== id && d.stage === stage);
  const peerDaysList = peers.map(
    (d) =>
      daysSince(
        stageEnteredAt(d.createdAt, interactionsByContact.get(d.contactId) ?? []),
        nowIso
      ) ?? 0
  );
  const peerDays = medianDays(peerDaysList);

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
    staleDays: quietDays,
    rotting,
    nextStep: nextStep ? formatDate(nextStep) : null,
    topAction: dealAgentActions[0]?.title,
  });

  return (
    <div>
      {/* The link names the page it actually returns to, not a guess. */}
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 -ml-1 mb-3 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={16} strokeWidth={1.8} />
        {back.label}
      </Link>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <CompanyLogo
            name={customer?.company_name || "?"}
            className="w-12 h-12 text-[16px] mt-5"
          />
          <div>
            {/* Says plainly what this page IS. Suren read the deal page as the
                pipeline itself: "I don't even know how I got to the pipeline." */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-light px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-blue-primary">
              <Handshake size={12} strokeWidth={2.1} />
              One deal
            </span>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
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
            <p className="mt-1.5 text-[12.5px] text-text-secondary">
              This page is one deal
              {services[0]?.service_name ? ` — ${services[0].service_name} for ` : " with "}
              {customer?.company_name || "this account"}. Every deal you&apos;re working sits on
              the{" "}
              <Link href="/pipeline" className="font-medium text-blue-primary hover:underline">
                pipeline board
              </Link>
              .
            </p>
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

      {/* Stage tracker — reworked into a real timeline with a TODAY marker.
          Suren: "it doesn't show me where today is… It said there was a meeting
          booked on July 23rd, but it doesn't show me where today is relative.
          That's a problem." */}
      <DealTimeline
        stage={stage}
        stageDates={stageDates}
        stageStartedAt={stageStartedAt}
        nextStep={nextStep}
        lastActivityAt={lastActivityAt}
        nowIso={nowIso}
      />

      {/* Deal snapshot — win chance, money at stake, and whether it's moving. */}
      <DealSnapshot
        company={customer?.company_name || "this account"}
        contactName={contact?.full_name || null}
        stage={stage}
        winProb={winProb}
        value={value}
        weighted={weighted}
        daysInStage={daysInStage}
        stageStartedAt={stageStartedAt}
        peerDays={peerDays}
        peerCount={peers.length}
        rottingDays={ROTTING_DAYS}
      />

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
            <Avatar
              name={owner}
              className="w-6 h-6 text-[10px]"
              tooltip={`Owner: ${owner}${isCurrentOwner ? " — that's you" : ""}`}
            />
            <span className="text-[14px] text-text-primary">
              {owner}{isCurrentOwner ? " · you" : ""}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary mt-1">
            {isCurrentOwner
              ? "You're running this deal."
              : owner === "Unassigned"
                ? "No teammate owns this deal yet."
                : `${owner} is running this deal.`}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Last activity</p>
          <div className="flex items-center gap-2 mt-2">
            {rotting ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-error">
                <Flame size={14} strokeWidth={1.75} /> {lastActivityAt ? formatDateTime(lastActivityAt) : "No activity"} · {quietDays}d quiet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[13px] text-text-secondary">
                <Clock size={14} strokeWidth={1.5} /> {lastActivityAt ? formatDateTime(lastActivityAt) : "No activity yet"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary mt-1">
            {lastActivityAt
              ? `Your most recent logged call, email, or note${quietDays > 0 ? ` — ${quietDays} day${quietDays === 1 ? "" : "s"} ago` : " — today"}.`
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
          {/* "Let the agent work" removed — see CustomerTabs. The named
              actions below carry their own meaning. */}
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
