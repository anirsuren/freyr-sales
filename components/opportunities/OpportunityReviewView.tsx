"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, CircleAlert, Copy, ExternalLink, Flag, Plus, ShieldAlert, Target, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import type { OpportunityReview, OpportunityReviewPerson, OpportunityReviewRecord } from "@/lib/opportunitiesShared";
import { formatDayLabel } from "@/lib/utils";
import { companyDestination } from "@/lib/companyDestination";
import { repSlug } from "@/lib/team";
import { COMPETITOR_SOURCES } from "@/lib/marketIntelSources";

const sentimentStyle: Record<OpportunityReviewPerson["sentiment"], string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-[#26352b] dark:text-[#a7c9ae] dark:ring-[#435949]",
  Neutral: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-[#292b2e] dark:text-[#c6c8cd] dark:ring-[#414348]",
  Distractor: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-[#36272b] dark:text-[#e5b0aa] dark:ring-[#5a3a3e]",
  Unknown: "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-[#292b2e] dark:text-[#aeb1b8] dark:ring-[#414348]",
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

export function OpportunityReviewView({ review, records = [], mayEdit, dealId }: { review?: OpportunityReview; records?: OpportunityReviewRecord[]; mayEdit: boolean; dealId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = records.length ? records : review ? [{ id: "legacy", reviewedOn: "", recordedAt: "", recordedBy: "", review }] : [];
  const selected = history.find((item) => item.id === selectedId) ?? history[history.length - 1];
  const data = selected?.review;
  const sponsor = data?.people.find((person) => person.name.trim().toLowerCase() === data.nextStep.stakeholderName.trim().toLowerCase());
  const people = data?.people ?? [];
  const obstacles = data?.obstacles.filter(Boolean) ?? [];

  return <div className="pb-12">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-[19px] font-semibold tracking-tight text-text-primary">Opportunity reviews</h2><p className="mt-1 text-[12.5px] text-text-secondary">Each discussion keeps its own date, decisions and agreed next steps.</p></div>
      {mayEdit && <div className="flex flex-wrap gap-2"><Link href={`/opportunities/${dealId}/review/edit?new=1`} className="inline-flex items-center gap-2 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Plus size={14} /> New review</Link>{selected && <Link href={`/opportunities/${dealId}/review/edit?copy=${encodeURIComponent(selected.id)}`} className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary"><Copy size={14} /> Copy into new review</Link>}</div>}
    </div>
    {history.length > 0 && <div className="mt-5 flex flex-wrap gap-2" aria-label="Saved opportunity reviews">{[...history].reverse().map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id} className={`rounded-xl border px-3 py-2 text-left text-[12.5px] transition-colors ${selected?.id === item.id ? "border-blue-primary bg-blue-light text-blue-primary" : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"}`}><span className="block font-semibold">{item.reviewedOn ? formatDayLabel(item.reviewedOn, "en-US") : "Earlier review · date not recorded"}</span><span className="text-[11px]">{item.recordedBy || (index === 0 ? "Latest saved review" : "Saved review")}</span></button>)}</div>}
    {!data && <div className="mt-5 rounded-2xl border border-dashed border-border-light bg-white p-8 text-center text-[13px] text-text-secondary">No reviews yet. Start one after your next customer discussion.</div>}
    {data && <div className="tab-panel mt-5 space-y-4">
      <h3 className="text-[15px] font-semibold text-text-primary">Decision brief</h3>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
        <section className="min-w-0 rounded-2xl border border-border-light bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"><Flag size={15} className="text-blue-primary" /> Why now</div>
          {data?.compellingEvent ? <p className="mt-4 max-w-[75ch] whitespace-pre-wrap text-[16px] font-medium leading-7 text-text-primary">{data.compellingEvent}</p> : <div className="mt-4"><Empty>No compelling event recorded. Add the customer’s deadline or consequence in Edit review.</Empty></div>}
        </section>
        <section className="min-w-0 rounded-2xl border border-border-light bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"><CalendarDays size={15} className="text-blue-primary" /> Customer commitment</div>
          {data?.nextStep.date && <p className="mt-4 text-[20px] font-semibold tracking-tight text-text-primary">{formatDayLabel(data.nextStep.date, "en-US")}</p>}
          <p className={`mt-2 text-[13.5px] leading-6 ${data?.nextStep.objective ? "text-text-primary" : "text-text-tertiary"}`}>{data?.nextStep.objective || "No next step agreed yet."}</p>
          {data?.nextStep.stakeholderName && <div className="mt-5 flex items-center gap-2.5 border-t border-border-light pt-4"><Avatar name={data.nextStep.stakeholderName} className="h-9 w-9" /><div className="min-w-0">{(data.nextStep.stakeholderContactId || sponsor?.contactId) ? <Link href={`/contacts/${data.nextStep.stakeholderContactId || sponsor?.contactId}`} className="block truncate text-[12.5px] font-semibold text-blue-primary hover:underline">{data.nextStep.stakeholderName}</Link> : <span className="block truncate text-[12.5px] font-semibold text-text-primary">{data.nextStep.stakeholderName}</span>}<p className="truncate text-[11.5px] text-text-secondary">{data.nextStep.stakeholderTitle || "Customer stakeholder"}</p></div></div>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary"><Target size={18} className="text-blue-primary" /> How Freyr wins</div><div className="mt-3">{data?.strategy ? <p className="whitespace-pre-wrap text-[13.5px] leading-6 text-text-primary">{data.strategy}</p> : <Empty>No strategy recorded yet.</Empty>}</div></section>
        <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary"><ShieldAlert size={18} className="text-amber-700" /> Barriers to clear</div>{obstacles.length ? <ol className="mt-3 divide-y divide-border-light">{obstacles.map((obstacle, index) => <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-800">{index + 1}</span><span className="text-[13px] leading-5.5 text-text-primary">{obstacle}</span></li>)}</ol> : <div className="mt-3"><Empty>No obstacles recorded yet.</Empty></div>}</section>
      </div>

      <section className="rounded-2xl border border-border-light bg-white px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center gap-x-6 gap-y-3"><div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary"><CircleAlert size={17} className="text-text-secondary" /> Confirmed competitors</div>{data?.competitors.length ? <div className="flex flex-wrap gap-2">{data.competitors.map((name) => { const id = data.competitorIds?.[name] || COMPETITOR_SOURCES.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id; return <Link key={name} href={id ? `/market-intel/${id}` : "/market-intel?tab=competitors"} className="inline-flex items-center gap-2 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-medium text-blue-primary hover:border-blue-subtle hover:bg-blue-light"><CompanyLogo name={name} className="h-6 w-6 text-[9px]" />{name}</Link>; })}</div> : <Empty>None confirmed.</Empty>}</div></section>
    </div>}

    {data && <div className="mt-8">
      <h3 className="mb-4 text-[15px] font-semibold text-text-primary">People & influence</h3>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-[16px] font-semibold text-text-primary">People shaping the decision</h3><p className="mt-1 text-[12.5px] text-text-secondary">Their role, area, and current stance in one place</p></div><span className="text-[12px] font-medium text-text-secondary">{people.length} {people.length === 1 ? "stakeholder" : "stakeholders"} mapped</span></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-border-light bg-white">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(130px,0.9fr)_minmax(100px,0.55fr)_auto] gap-4 border-b border-border-light bg-surface-secondary/60 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-secondary sm:grid"><span>Person</span><span>Decision role</span><span>Area</span><span className="text-right">Stance</span></div>
          {people.length ? [...people].sort((a, b) => (a.seniority === "senior" ? 0 : 1) - (b.seniority === "senior" ? 0 : 1)).map((person) => <PersonRow key={person.id} person={person} />) : <div className="p-5"><Empty>No people added yet. Use Edit review to map the decision circle.</Empty></div>}
        </section>
        <section className="rounded-2xl border border-border-light bg-white p-5"><div className="flex items-center gap-2"><UsersRound size={17} className="text-blue-primary" /><h3 className="text-[13.5px] font-semibold text-text-primary">Outside influence</h3></div><p className="mt-1 text-[11.5px] text-text-secondary">Advisors involved in the same decision</p>{data?.thirdParties.length ? <div className="mt-4 space-y-4">{data.thirdParties.map((party) => <div key={party.id} className="flex items-start gap-3 border-t border-border-light pt-4 first:border-t-0 first:pt-0"><CompanyLogo name={party.company} className="h-10 w-10 text-[11px]" /><div className="min-w-0 flex-1"><Link href={companyDestination(party.company, party.customerId)} className="block text-[12.5px] font-semibold text-blue-primary hover:underline">{party.company}</Link><p className="mt-1 text-[11.5px] leading-5 text-text-secondary">{party.role || "Role not recorded"}</p><div className="mt-2"><Sentiment value={party.sentiment} /></div></div></div>)}</div> : <div className="mt-4"><Empty>No external parties recorded.</Empty></div>}</section>
      </div>
    </div>}

    {data && <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
      <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[15px] font-semibold text-text-primary">Agreed actions</h3><p className="mt-1 text-[12px] text-text-secondary">An owner and a deadline for every move</p></div><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-primary">{data?.actions.length ?? 0}</span></div>{data?.actions.length ? <ol className="mt-4 divide-y divide-border-light">{data.actions.map((action, index) => <li key={action.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium leading-6 text-text-primary">{action.action}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-text-secondary"><Link href={`/analytics/reps/${repSlug(action.owner)}`} className="inline-flex items-center gap-1.5 font-medium text-blue-primary hover:underline"><Avatar name={action.owner} className="h-5 w-5" />{action.owner}</Link><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDayLabel(action.deadline, "en-US")}</span></div></div></li>)}</ol> : <div className="mt-4"><Empty>No review actions agreed yet.</Empty></div>}</section>
      <section className="h-fit rounded-2xl border border-border-light bg-white p-5 sm:p-6"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary">Next customer step</span><p className="mt-3 text-[14px] font-semibold leading-6 text-text-primary">{data?.nextStep.objective || "No next step agreed yet"}</p>{data?.nextStep.date && <p className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-blue-primary"><CalendarDays size={15} />{formatDayLabel(data.nextStep.date, "en-US")}</p>}{data?.nextStep.stakeholderName && <div className="mt-4 flex items-center gap-2 border-t border-border-light pt-4"><Avatar name={data.nextStep.stakeholderName} className="h-8 w-8" />{data.nextStep.stakeholderContactId ? <Link href={`/contacts/${data.nextStep.stakeholderContactId}`} className="text-[12.5px] font-medium text-blue-primary hover:underline">{data.nextStep.stakeholderName}</Link> : <span className="text-[12.5px] font-medium text-text-primary">{data.nextStep.stakeholderName}</span>}</div>}</section>
    </div>}
  </div>;
}
