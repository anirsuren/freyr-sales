import Link from "next/link";
import { ArrowUpRight, ChevronRight, SearchX, ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { SizeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { DealTimeline } from "@/components/deals/DealTimeline";
import { DealSnapshot } from "@/components/deals/DealSnapshot";
import { DealFacts } from "@/components/deals/DealFacts";
import { DealCharts } from "@/components/deals/DealCharts";
import { DealServices } from "@/components/deals/DealServices";
import { DealContact } from "@/components/deals/DealContact";
import { DealActivity } from "@/components/deals/DealActivity";
import { daysSince, stageEnteredAt } from "@/components/deals/dealTime";
import {
  buildDeals,
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_PROBABILITY,
  OUTCOME_TO_STAGE,
  ROTTING_DAYS,
  type Stage,
} from "@/lib/pipeline";
import type { RecommendedService } from "@/lib/types";
import { getCurrentUser } from "@/lib/currentUser";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

// There used to be a Referer-driven "back" link here: it read the page you had
// come FROM and pointed at that. Suren, landing on Helix Biologics: "I can't go
// back, it glitches out somewhere else." Of course it did — "back" meant a
// different place on every visit, and a stale or missing Referer silently sent
// him somewhere else again. A deal now has exactly ONE way back, it is a plain
// <Link>, and it always goes to the board that owns every deal. No history
// games, no guessing, same destination every single time.
const DEAL_HOME = { href: "/pipeline", label: "Pipeline" };

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const currentUser = await getCurrentUser();
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
  // Every deal still in play — the real comparison set for "how does this one
  // size up". Closed-lost deals aren't competing for anyone's time, so they're
  // out; nothing here is synthesised, every entry is a real session.
  const openDeals = allDeals.filter((d) => d.stage !== "Closed Lost");
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
  // A deal's NAME is what is being sold. Suren opened this page and asked "how
  // the fuck did I get to this screen" — the company name was the headline and
  // the actual deal was buried three lines down in body copy. The offering is
  // the h1 now; the company is the supporting line right under it. The fallback
  // deliberately never contains the company name, so the page always has exactly
  // one heading carrying the account.
  const companyName = customer?.company_name || "This account";
  const serviceName = services[0]?.service_name?.trim();
  const dealName =
    serviceName && serviceName !== "—" ? serviceName : "Untitled deal";
  const StageIcon = STAGE_ICON[stage];
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

  // "Is this deal going stale?" — the only timing question a rep actually has.
  // Days on the current stage, measured against the 14-day quiet line. The old
  // panel also drew a hatched bar comparing this deal to the median of its
  // peers; nobody asked for that comparison and nobody could read it, so it's
  // gone (Suren: "I don't even know what the right one is showing").
  const stageStartedAt = stageEnteredAt(session.created_at, interactions);
  const daysInStage = daysSince(stageStartedAt, nowIso) ?? 0;

  return (
    // `stagger` is the app's shared entrance: each top-level block lifts in,
    // 40ms behind the one above it, exactly like the dashboard and reports.
    // (Suren: "there's no animation on that entire page like all other pages.")
    // It is disabled wholesale under prefers-reduced-motion in globals.css.
    <div className="stagger">
      {/* ONE way back, and it is the same place every time: the board that owns
          every deal. The trail also answers "where am I?" before you read
          anything else — Pipeline › this account › this deal. */}
      <nav
        aria-label="Breadcrumb"
        className="mb-3 flex min-w-0 items-center gap-1.5 text-[12.5px]"
      >
        <Link
          href={DEAL_HOME.href}
          className="-ml-1 inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          {DEAL_HOME.label}
        </Link>
        <ChevronRight
          size={13}
          strokeWidth={1.8}
          className="shrink-0 text-text-tertiary"
          aria-hidden
        />
        {/* Wraps rather than truncating: "BioNex Therapeutics — NDA/MAA CMC
            Wri…" tells a rep nothing, and the trail's whole job is telling you
            where you are. The one-way-back <Link> above is untouched. */}
        <span
          className="min-w-0 break-normal font-medium text-text-primary"
          aria-current="page"
        >
          {companyName} — {dealName}
        </span>
      </nav>
      {/* The record header, built to the same shape every other detail page in
          this app uses (see PageHeader and /customers/[id]): logo, title row,
          one identity line, one action. Suren on the version before this one:
          "the top is very, very cluttered. I can't even stand to look at it."
          It was seven stacked things. Gone: the "One deal" pill (the breadcrumb
          and the title already say it), and the three-line paragraph explaining
          what the screen is — a header is not the place to narrate the page.
          The KB badge moved down to Recommended Services, which is the only
          place it means anything. */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* The DEAL is the headline, so the mark beside it is the OFFERING's
              own glyph — the company logo lives on the company line below
              (Anir: "the company logo is supposed to be next to the company
              name… it's next to the service, it doesn't make sense"). */}
          <OfferingIcon name={dealName} className="w-12 h-12 shrink-0" />
          <div className="min-w-0">
            {/* The DEAL is the headline — what's being sold, not who it's to —
                and the stage sits beside it in the stage's own colour, the same
                colour the rail and the ring below are drawn in. */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
                {dealName}
              </h1>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                style={{
                  background: `${STAGE_COLOR[stage]}1A`,
                  color: STAGE_COLOR[stage],
                }}
              >
                <StageIcon size={12} strokeWidth={2.1} />
                {stage}
              </span>
            </div>
            {/* ONE identity line: who it's for, how big they are, who you talk
                to. Nothing else belongs in a header. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <CompanyLogo
                name={customer?.company_name || "?"}
                className="w-6 h-6 text-[9px] shrink-0"
              />
              <h2 className="text-[15px] font-semibold text-text-primary">
                {companyName}
              </h2>
              <SizeBadge tier={customer?.size_tier || null} />
              {contact?.full_name && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                  <Avatar name={contact.full_name} className="w-5 h-5 text-[9px]" />
                  {contact.full_name} · {contact.job_title}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* One line, not two. What it opens lives in the hover, where an
            explanation belongs. */}
        <Link
          href={`/sessions/${session.id}`}
          title="The writing workspace for this deal — the pitch, the email and the objections."
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-semibold text-blue-primary transition-colors hover:bg-surface hover:text-blue-hover"
        >
          Open full session
          <ArrowUpRight size={15} strokeWidth={1.9} />
        </Link>
      </div>

      {/* Stage rail — the funnel, and only the funnel. */}
      <DealTimeline
        stage={stage}
        stageDates={stageDates}
        nextStep={nextStep}
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
        rottingDays={ROTTING_DAYS}
      />

      {/* Key facts. This was two cards each holding one line above a wall of
          white — the dead space Suren pointed at. Four facts, one band, one
          rhythm, and every one of them lives nowhere else on the page: the
          money and the odds belong to the snapshot, the dates on the rail
          belong to the rail. */}
      <DealFacts
        owner={owner}
        isCurrentOwner={isCurrentOwner}
        companyName={companyName}
        customerId={customer?.id || null}
        sizeTier={customer?.size_tier || null}
        lastActivityAt={lastActivityAt}
        quietDays={quietDays}
        rotting={rotting}
        openedAt={session.created_at}
        nowIso={nowIso}
      />

      {/* The charts this page never had. Both are built from fields already on
          this record — the dated stage journey, and this deal's value against
          the rest of the open book. Nothing modelled, nothing benchmarked into
          existence. */}
      <DealCharts
        stage={stage}
        stageDates={stageDates}
        interactions={interactions}
        nowIso={nowIso}
        sessionId={session.id}
        value={value}
        openDeals={openDeals}
      />

      {/* The per-deal agent card is gone (Anir, Jul 27: "remove the agent
          notifications about each deal on every single page. We're not there
          yet") — the agent keeps its own page and the dock. */}

      {/* `items-start` so a long services column can't stretch the right-hand
          card into a column of empty white beneath its own content — each side
          ends where its content ends. The right column carries two blocks (who
          to call, then everything logged) so it finishes level with the two
          rich service cards rather than halfway up the page. */}
      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 lg:grid-cols-2">
        <DealServices
          services={services}
          kbVersion={session.kb_version}
          dealName={dealName}
        />
        <div>
          {contact && <DealContact contact={contact} />}
          <DealActivity interactions={interactions} nowIso={nowIso} />
        </div>
      </div>
    </div>
  );
}
