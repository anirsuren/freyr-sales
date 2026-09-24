"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, ExternalLink, Flag, Pencil, ShieldAlert, Target, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import type { OpportunityReview, OpportunityReviewPerson } from "@/lib/opportunitiesShared";
import { formatDayLabel } from "@/lib/utils";

type ReviewSection = "decision" | "people" | "actions";

const sections: { id: ReviewSection; label: string; description: string; icon: typeof Target }[] = [
  { id: "decision", label: "Decision brief", description: "Why they buy and how we win", icon: Target },
  { id: "people", label: "People & influence", description: "The decision circle", icon: UsersRound },
  { id: "actions", label: "Next moves", description: "Owners and deadlines", icon: CheckCircle2 },
];

const sentimentStyle: Record<OpportunityReviewPerson["sentiment"], string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Neutral: "bg-slate-50 text-slate-600 ring-slate-200",
  Distractor: "bg-rose-50 text-rose-700 ring-rose-200",
  Unknown: "bg-slate-50 text-slate-500 ring-slate-200",
};

function Sentiment({ value }: { value: OpportunityReviewPerson["sentiment"] }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${sentimentStyle[value]}`}>{value}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-6 text-text-tertiary">{children}</p>;
}

function PersonRow({ person }: { person: OpportunityReviewPerson }) {
  const area = person.function === "it" ? "Technology" : person.function === "business" ? "Business" : /procurement/i.test(person.title) ? "Procurement" : "Other";
  return <div className="grid min-w-0 gap-2 border-t border-border-light px-4 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(130px,0.9fr)_minmax(100px,0.55fr)_auto] sm:items-center sm:gap-4 sm:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={person.name} className="h-10 w-10 shrink-0" />
      <div className="min-w-0">{person.contactId ? <Link href={`/contacts/${person.contactId}`} className="block truncate text-[13px] font-semibold text-blue-primary hover:underline">{person.name}</Link> : <span className="block truncate text-[13px] font-semibold text-text-primary">{person.name}</span>}<p className="mt-0.5 truncate text-[11.5px] text-text-secondary">{person.title || "Title not recorded"}</p></div>
    </div>
    <p className="pl-[52px] text-[12px] font-medium text-text-primary sm:pl-0">{person.role || "Role not recorded"}</p>
    <p className="pl-[52px] text-[11.5px] text-text-secondary sm:pl-0">{area}{person.seniority === "senior" ? " · Senior" : ""}</p>
    <div className="flex items-center gap-2 pl-[52px] sm:justify-end sm:pl-0"><Sentiment value={person.sentiment} />{person.linkedin && <a href={person.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on LinkedIn`} className="shrink-0 text-blue-primary hover:underline"><ExternalLink size={14} /></a>}</div>
  </div>;
}

export function OpportunityReviewView({ review, mayEdit, dealId }: { review?: OpportunityReview; mayEdit: boolean; dealId: string }) {
  const [section, setSection] = useState<ReviewSection>("decision");
  const data = review;
  const sponsor = data?.people.find((person) => person.name.trim().toLowerCase() === data.nextStep.stakeholderName.trim().toLowerCase());
  const people = data?.people ?? [];
  const obstacles = data?.obstacles.filter(Boolean) ?? [];

  return <div className="pb-12">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4">
      <div><h2 className="text-[19px] font-semibold tracking-tight text-text-primary">Opportunity review</h2><p className="mt-1 text-[12.5px] text-text-secondary">The decision, the people shaping it, and what happens next</p></div>
      {mayEdit && <Link href={`/opportunities/${dealId}/review/edit`} className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary"><Pencil size={14} /> Edit review</Link>}
    </div>

    <div role="tablist" aria-label="Opportunity review sections" className="mt-4 flex max-w-full overflow-x-auto border-b border-border-light">
      {sections.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" role="tab" id={`review-tab-${id}`} aria-selected={section === id} aria-controls={`review-panel-${id}`} onClick={() => setSection(id)} className={`group flex min-w-[185px] flex-1 items-center gap-3 border-b-[3px] px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-primary ${section === id ? "border-blue-primary bg-white text-text-primary" : "border-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${section === id ? "bg-blue-light text-blue-primary" : "bg-surface-secondary group-hover:bg-white"}`}><Icon size={17} /></span><span className="min-w-0"><span className="flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap">{label}{id === "people" && people.length > 0 && <span className="text-[11px] font-medium text-text-secondary">{people.length}</span>}{id === "actions" && !!data?.actions.length && <span className="text-[11px] font-medium text-text-secondary">{data.actions.length}</span>}</span><span className="mt-0.5 block text-[11.5px] font-normal text-text-secondary whitespace-nowrap">{description}</span></span></button>)}
    </div>

    {section === "decision" && <div role="tabpanel" id="review-panel-decision" aria-labelledby="review-tab-decision" className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
        <section className="min-w-0 rounded-2xl border border-border-light bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"><Flag size={15} className="text-blue-primary" /> Why now</div>
          {data?.compellingEvent ? <p className="mt-4 max-w-[75ch] whitespace-pre-wrap text-[16px] font-medium leading-7 text-text-primary">{data.compellingEvent}</p> : <div className="mt-4"><Empty>No compelling event recorded. Add the customer’s deadline or consequence in Edit review.</Empty></div>}
        </section>
        <section className="min-w-0 rounded-2xl border border-border-light bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"><CalendarDays size={15} className="text-blue-primary" /> Customer commitment</div>
          {data?.nextStep.date && <p className="mt-4 text-[20px] font-semibold tracking-tight text-text-primary">{formatDayLabel(data.nextStep.date, "en-US")}</p>}
          <p className={`mt-2 text-[13.5px] leading-6 ${data?.nextStep.objective ? "text-text-primary" : "text-text-tertiary"}`}>{data?.nextStep.objective || "No next step agreed yet."}</p>
          {data?.nextStep.stakeholderName && <div className="mt-5 flex items-center gap-2.5 border-t border-border-light pt-4"><Avatar name={data.nextStep.stakeholderName} className="h-9 w-9" /><div className="min-w-0">{sponsor?.contactId ? <Link href={`/contacts/${sponsor.contactId}`} className="block truncate text-[12.5px] font-semibold text-blue-primary hover:underline">{data.nextStep.stakeholderName}</Link> : <span className="block truncate text-[12.5px] font-semibold text-text-primary">{data.nextStep.stakeholderName}</span>}<p className="truncate text-[11.5px] text-text-secondary">{data.nextStep.stakeholderTitle || "Customer stakeholder"}</p></div></div>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary"><Target size={18} className="text-blue-primary" /> How Freyr wins</div><div className="mt-3">{data?.strategy ? <p className="whitespace-pre-wrap text-[13.5px] leading-6 text-text-primary">{data.strategy}</p> : <Empty>No strategy recorded yet.</Empty>}</div></section>
        <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary"><ShieldAlert size={18} className="text-amber-700" /> Barriers to clear</div>{obstacles.length ? <ol className="mt-3 divide-y divide-border-light">{obstacles.map((obstacle, index) => <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-800">{index + 1}</span><span className="text-[13px] leading-5.5 text-text-primary">{obstacle}</span></li>)}</ol> : <div className="mt-3"><Empty>No obstacles recorded yet.</Empty></div>}</section>
      </div>

      <section className="rounded-2xl border border-border-light bg-white px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center gap-x-6 gap-y-3"><div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary"><CircleAlert size={17} className="text-text-secondary" /> Confirmed competitors</div>{data?.competitors.length ? <div className="flex flex-wrap gap-2">{data.competitors.map((name) => <span key={name} className="inline-flex items-center gap-2 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-medium text-text-primary"><CompanyLogo name={name} className="h-6 w-6 text-[9px]" />{name}</span>)}</div> : <Empty>None confirmed.</Empty>}</div></section>
    </div>}

    {section === "people" && <div role="tabpanel" id="review-panel-people" aria-labelledby="review-tab-people" className="mt-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-[16px] font-semibold text-text-primary">People shaping the decision</h3><p className="mt-1 text-[12.5px] text-text-secondary">Their role, area, and current stance in one place</p></div><span className="text-[12px] font-medium text-text-secondary">{people.length} {people.length === 1 ? "stakeholder" : "stakeholders"} mapped</span></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-border-light bg-white">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(130px,0.9fr)_minmax(100px,0.55fr)_auto] gap-4 border-b border-border-light bg-surface-secondary/60 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-secondary sm:grid"><span>Person</span><span>Decision role</span><span>Area</span><span className="text-right">Stance</span></div>
          {people.length ? [...people].sort((a, b) => (a.seniority === "senior" ? 0 : 1) - (b.seniority === "senior" ? 0 : 1)).map((person) => <PersonRow key={person.id} person={person} />) : <div className="p-5"><Empty>No people added yet. Use Edit review to map the decision circle.</Empty></div>}
        </section>
        <section className="rounded-2xl border border-border-light bg-white p-5"><div className="flex items-center gap-2"><UsersRound size={17} className="text-blue-primary" /><h3 className="text-[13.5px] font-semibold text-text-primary">Outside influence</h3></div><p className="mt-1 text-[11.5px] text-text-secondary">Advisors involved in the same decision</p>{data?.thirdParties.length ? <div className="mt-4 space-y-4">{data.thirdParties.map((party) => <div key={party.id} className="flex items-start gap-3 border-t border-border-light pt-4 first:border-t-0 first:pt-0"><CompanyLogo name={party.company} className="h-10 w-10 text-[11px]" /><div className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-text-primary">{party.company}</span><p className="mt-1 text-[11.5px] leading-5 text-text-secondary">{party.role || "Role not recorded"}</p><div className="mt-2"><Sentiment value={party.sentiment} /></div></div></div>)}</div> : <div className="mt-4"><Empty>No external parties recorded.</Empty></div>}</section>
      </div>
    </div>}

    {section === "actions" && <div role="tabpanel" id="review-panel-actions" aria-labelledby="review-tab-actions" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
      <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[15px] font-semibold text-text-primary">Agreed actions</h3><p className="mt-1 text-[12px] text-text-secondary">An owner and a deadline for every move</p></div><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-primary">{data?.actions.length ?? 0}</span></div>{data?.actions.length ? <ol className="mt-4 divide-y divide-border-light">{data.actions.map((action, index) => <li key={action.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium leading-6 text-text-primary">{action.action}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-text-secondary"><span className="inline-flex items-center gap-1.5"><Avatar name={action.owner} className="h-5 w-5" />{action.owner}</span><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDayLabel(action.deadline, "en-US")}</span></div></div></li>)}</ol> : <div className="mt-4"><Empty>No review actions agreed yet.</Empty></div>}</section>
      <section className="h-fit rounded-2xl border border-border-light bg-white p-5 sm:p-6"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary">Next customer step</span><p className="mt-3 text-[14px] font-semibold leading-6 text-text-primary">{data?.nextStep.objective || "No next step agreed yet"}</p>{data?.nextStep.date && <p className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-blue-primary"><CalendarDays size={15} />{formatDayLabel(data.nextStep.date, "en-US")}</p>}{data?.nextStep.stakeholderName && <div className="mt-4 flex items-center gap-2 border-t border-border-light pt-4"><Avatar name={data.nextStep.stakeholderName} className="h-8 w-8" /><span className="text-[12.5px] font-medium text-text-primary">{data.nextStep.stakeholderName}</span></div>}<button type="button" onClick={() => setSection("decision")} className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline">See decision brief <ArrowRight size={14} /></button></section>
    </div>}
  </div>;
}
