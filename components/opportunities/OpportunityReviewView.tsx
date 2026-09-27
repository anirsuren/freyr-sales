"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, CircleAlert, ClipboardList, Copy, ExternalLink, Flag, ListChecks, Plus, ShieldAlert, Target, Users, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { SectionCard } from "@/components/ui/SectionCard";
import type { OpportunityReview, OpportunityReviewPerson, OpportunityReviewRecord } from "@/lib/opportunitiesShared";
import { formatDayLabel } from "@/lib/utils";
import { companyDestination } from "@/lib/companyDestination";
import { repSlug } from "@/lib/team";
import { COMPETITOR_SOURCES } from "@/lib/marketIntelSources";

/*
 * THE READ SIDE OF A REVIEW, BUILT FROM THE SAME PARTS AS EVERY OTHER RECORD
 * PAGE (Anir, Sep 28: "look at all the other pages. Everything on all the
 * other pages is good... analyze all the little nuances and differences, and
 * just make this page look better"). It used to draw its own rounded panels
 * with their own eyebrow styles; a meeting or a solutioning request draws
 * SectionCard, so this does too, and the two can no longer drift apart.
 */

const sentimentStyle: Record<OpportunityReviewPerson["sentiment"], string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-[#26352b] dark:text-[#a7c9ae] dark:ring-[#435949]",
  Neutral: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-[#292b2e] dark:text-[#c6c8cd] dark:ring-[#414348]",
  Distractor: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-[#36272b] dark:text-[#e5b0aa] dark:ring-[#5a3a3e]",
  Unknown: "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-[#292b2e] dark:text-[#aeb1b8] dark:ring-[#414348]",
};

function Sentiment({ value }: { value: OpportunityReviewPerson["sentiment"] }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${sentimentStyle[value]}`}>{value}</span>;
}

/** Quiet, never a wall: the same tone every empty cell in the app uses. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-6 text-text-tertiary">{children}</p>;
}

/** The uppercase eyebrow every record page labels a fact with. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">{children}</span>;
}

/**
 * A REVIEW SOMEBODY ACTUALLY WROTE. A blank review object is what the store
 * holds for a deal that was opened in the editor and never filled in; it used
 * to surface as "Earlier review · date not recorded" over an all-empty brief
 * (Anir, Sep 28: "what does that earlier review thing mean? Is that a bug?").
 * It was. Blank means no review.
 */
export function reviewHasContent(review?: OpportunityReview | null): boolean {
  if (!review) return false;
  return Boolean(
    review.compellingEvent?.trim() ||
    review.strategy?.trim() ||
    review.nextStep?.objective?.trim() ||
    review.nextStep?.date ||
    review.nextStep?.stakeholderName?.trim() ||
    review.obstacles?.some((o) => o?.trim()) ||
    review.competitors?.length ||
    review.people?.length ||
    review.thirdParties?.length ||
    review.actions?.length
  );
}

function PersonRow({ person }: { person: OpportunityReviewPerson }) {
  const area = person.function === "it" ? "Technology" : person.function === "business" ? "Business" : /procurement/i.test(person.title) ? "Procurement" : "Other";
  return <div className="grid min-w-0 items-center gap-4 border-t border-border-light px-5 py-3.5 first:border-t-0 grid-cols-[minmax(0,1.5fr)_minmax(130px,0.9fr)_minmax(100px,0.55fr)_auto]">
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={person.name} className="h-9 w-9 shrink-0" />
      <div className="min-w-0">
        {person.contactId ? <Link href={`/contacts/${person.contactId}`} className="block truncate text-[13px] font-semibold text-blue-primary hover:underline">{person.name}</Link> : <span className="block truncate text-[13px] font-semibold text-text-primary">{person.name}</span>}
        <p className="truncate text-[11.5px] text-text-secondary">{person.title || "Title not recorded"}</p>
      </div>
    </div>
    <p className="text-[12px] font-medium text-text-primary">{person.role || "Role not recorded"}</p>
    <p className="text-[11.5px] text-text-secondary">{area}{person.seniority === "senior" ? " · Senior" : ""}</p>
    <div className="flex items-center justify-end gap-2">
      <Sentiment value={person.sentiment} />
      {person.linkedin && <a href={person.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on LinkedIn`} className="text-text-tertiary hover:text-blue-primary"><ExternalLink size={14} /></a>}
    </div>
  </div>;
}

export function OpportunityReviewView({ review, records = [], mayEdit, dealId }: { review?: OpportunityReview; records?: OpportunityReviewRecord[]; mayEdit: boolean; dealId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* Saved records count only when somebody wrote something in them: an
     empty record is the editor opened and closed, not a review. */
  const written = records.filter((item) => reviewHasContent(item.review));
  const history: OpportunityReviewRecord[] = written.length
    ? written
    : reviewHasContent(review) && review
      ? [{ id: "legacy", reviewedOn: "", recordedAt: "", recordedBy: "", review }]
      : [];
  const selected = history.find((item) => item.id === selectedId) ?? history[history.length - 1];
  const data = selected?.review;
  const sponsor = data?.people.find((person) => person.name.trim().toLowerCase() === data.nextStep.stakeholderName.trim().toLowerCase());
  const people = data?.people ?? [];
  const obstacles = data?.obstacles.filter(Boolean) ?? [];
  const stakeholderContactId = data?.nextStep.stakeholderContactId || sponsor?.contactId;

  return <div className="pb-12">
    {/* HEAD LEFT, ACTIONS RIGHT, like every tab on a record. */}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-text-primary">Opportunity reviews</h2>
        <p className="mt-1 text-[12.5px] text-text-secondary">{history.length ? `${history.length} ${history.length === 1 ? "review" : "reviews"}, each with its own date, decisions and agreed next steps.` : "Each discussion keeps its own date, decisions and agreed next steps."}</p>
      </div>
      {mayEdit && <div className="flex flex-wrap gap-2">
        <Link href={`/opportunities/${dealId}/review/edit?new=1`} className="inline-flex items-center gap-2 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Plus size={14} /> New review</Link>
        {selected && <Link href={`/opportunities/${dealId}/review/edit?copy=${encodeURIComponent(selected.id)}`} className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary"><Copy size={14} /> Copy into new review</Link>}
      </div>}
    </div>

    {/* WHICH REVIEW. Only when there is more than one to choose between: a
        single review needs no selector, and a chip that says nothing but
        "date not recorded" is exactly the kind of line nobody should read. */}
    {history.length > 1 && <div className="mt-5 flex flex-wrap gap-2" aria-label="Saved opportunity reviews">
      {[...history].reverse().map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${selected?.id === item.id ? "border-blue-primary bg-blue-light text-blue-primary" : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"}`}>
        <CalendarDays size={13} aria-hidden="true" />
        {item.reviewedOn ? formatDayLabel(item.reviewedOn, "en-US") : "Saved review"}
        {index === 0 && <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide">latest</span>}
      </button>)}
    </div>}

    {!data && <div className="mt-5 rounded-xl border border-dashed border-border-light bg-surface/30 px-6 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-light/40 text-blue-primary"><ClipboardList size={19} strokeWidth={1.9} /></div>
      <h3 className="mt-4 text-[15px] font-semibold text-text-primary">No reviews yet</h3>
      <p className="mx-auto mt-1 max-w-lg text-[12.5px] leading-5 text-text-secondary">Start one after your next customer discussion.</p>
    </div>}

    {data && <div className="tab-panel mt-5 space-y-4">
      {selected?.reviewedOn && <p className="text-[12.5px] text-text-secondary">Reviewed {formatDayLabel(selected.reviewedOn, "en-US")}{selected.recordedBy ? ` by ${selected.recordedBy}` : ""}.</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
        <SectionCard title="Why now" icon={Flag}>
          {data.compellingEvent
            ? <p className="max-w-[75ch] whitespace-pre-wrap text-[15px] font-medium leading-7 text-text-primary">{data.compellingEvent}</p>
            : <Empty>No compelling event recorded. Add the customer's deadline or consequence in a new review.</Empty>}
        </SectionCard>
        <SectionCard title="Customer commitment" icon={CalendarDays}>
          {data.nextStep.date && <p className="text-[20px] font-semibold tracking-tight text-text-primary">{formatDayLabel(data.nextStep.date, "en-US")}</p>}
          <p className={`${data.nextStep.date ? "mt-1.5" : ""} text-[13.5px] leading-6 ${data.nextStep.objective ? "text-text-primary" : "text-text-tertiary"}`}>{data.nextStep.objective || "No next step agreed yet."}</p>
          {data.nextStep.stakeholderName && <div className="mt-4 flex items-center gap-2.5 border-t border-border-light pt-4">
            <Avatar name={data.nextStep.stakeholderName} className="h-9 w-9" />
            <div className="min-w-0">
              {stakeholderContactId ? <Link href={`/contacts/${stakeholderContactId}`} className="block truncate text-[12.5px] font-semibold text-blue-primary hover:underline">{data.nextStep.stakeholderName}</Link> : <span className="block truncate text-[12.5px] font-semibold text-text-primary">{data.nextStep.stakeholderName}</span>}
              <p className="truncate text-[11.5px] text-text-secondary">{data.nextStep.stakeholderTitle || "Customer stakeholder"}</p>
            </div>
          </div>}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="How Freyr wins" icon={Target}>
          {data.strategy ? <p className="whitespace-pre-wrap text-[13.5px] leading-6 text-text-primary">{data.strategy}</p> : <Empty>No strategy recorded yet.</Empty>}
        </SectionCard>
        <SectionCard title="Barriers to clear" icon={ShieldAlert}>
          {obstacles.length ? <ol className="divide-y divide-border-light">{obstacles.map((obstacle, index) => <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-800">{index + 1}</span>
            <span className="text-[13px] leading-5.5 text-text-primary">{obstacle}</span>
          </li>)}</ol> : <Empty>No obstacles recorded yet.</Empty>}
        </SectionCard>
      </div>

      <SectionCard title="Confirmed competitors" icon={CircleAlert} bodyClassName="px-5 py-4">
        {data.competitors.length ? <div className="flex flex-wrap gap-2">{data.competitors.map((name) => {
          const id = data.competitorIds?.[name] || COMPETITOR_SOURCES.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id;
          return <Link key={name} href={id ? `/market-intel/${id}` : "/market-intel?tab=competitors"} className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white py-0.5 pl-0.5 pr-2.5 text-[12.5px] font-medium text-text-primary hover:border-blue-subtle hover:bg-blue-light"><CompanyLogo name={name} className="h-6 w-6 text-[8px]" />{name}</Link>;
        })}</div> : <Empty>None confirmed.</Empty>}
      </SectionCard>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)]">
        <SectionCard title="People shaping the decision" icon={Users} bodyClassName="p-0"
          action={<span className="text-[12px] font-medium text-text-secondary">{people.length} {people.length === 1 ? "stakeholder" : "stakeholders"} mapped</span>}>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(130px,0.9fr)_minmax(100px,0.55fr)_auto] gap-4 border-b border-border-light bg-surface-secondary/60 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-secondary"><span>Person</span><span>Decision role</span><span>Area</span><span className="text-right">Stance</span></div>
          {people.length
            ? [...people].sort((a, b) => (a.seniority === "senior" ? 0 : 1) - (b.seniority === "senior" ? 0 : 1)).map((person) => <PersonRow key={person.id} person={person} />)
            : <div className="p-5"><Empty>No people added yet. Map the decision circle in a new review.</Empty></div>}
        </SectionCard>
        <SectionCard title="Outside influence" icon={UsersRound}>
          {data.thirdParties.length ? <div className="space-y-4">{data.thirdParties.map((party) => <div key={party.id} className="flex items-start gap-3 border-t border-border-light pt-4 first:border-t-0 first:pt-0">
            <CompanyLogo name={party.company} className="h-9 w-9 text-[10px]" />
            <div className="min-w-0 flex-1">
              <Link href={companyDestination(party.company, party.customerId)} className="block text-[12.5px] font-semibold text-blue-primary hover:underline">{party.company}</Link>
              <p className="mt-0.5 text-[11.5px] leading-5 text-text-secondary">{party.role || "Role not recorded"}</p>
              <div className="mt-2"><Sentiment value={party.sentiment} /></div>
            </div>
          </div>)}</div> : <Empty>No advisors or outside parties recorded.</Empty>}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <SectionCard title="Agreed actions" icon={ListChecks}
          action={<span className="rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary">{data.actions.length}</span>}>
          {data.actions.length ? <ol className="divide-y divide-border-light">{data.actions.map((action, index) => <li key={action.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-light text-[11px] font-bold text-blue-primary">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium leading-6 text-text-primary">{action.action}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-text-secondary">
                <Link href={`/analytics/reps/${repSlug(action.owner)}`} className="inline-flex items-center gap-1.5 font-medium text-blue-primary hover:underline"><Avatar name={action.owner} className="h-5 w-5" />{action.owner}</Link>
                <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDayLabel(action.deadline, "en-US")}</span>
              </div>
            </div>
          </li>)}</ol> : <Empty>No review actions agreed yet.</Empty>}
        </SectionCard>
        <SectionCard title="Next customer step" icon={CalendarDays} className="h-fit">
          <p className="text-[14px] font-semibold leading-6 text-text-primary">{data.nextStep.objective || "No next step agreed yet"}</p>
          {data.nextStep.date && <p className="mt-2 inline-flex items-center gap-2 text-[12px] font-medium text-blue-primary"><CalendarDays size={15} />{formatDayLabel(data.nextStep.date, "en-US")}</p>}
          {data.nextStep.stakeholderName && <div className="mt-4 flex items-center gap-2 border-t border-border-light pt-4">
            <Avatar name={data.nextStep.stakeholderName} className="h-8 w-8" />
            {stakeholderContactId ? <Link href={`/contacts/${stakeholderContactId}`} className="text-[12.5px] font-medium text-blue-primary hover:underline">{data.nextStep.stakeholderName}</Link> : <span className="text-[12.5px] font-medium text-text-primary">{data.nextStep.stakeholderName}</span>}
          </div>}
        </SectionCard>
      </div>
    </div>}
  </div>;
}
