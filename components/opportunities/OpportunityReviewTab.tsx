"use client";
import { DateField } from "@/components/ui/DateField";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, CalendarDays, Check, Crown, Cpu, Flag, ListChecks, Pencil, Plus, Shapes, Target, Trash2, UserRound, Users, UsersRound } from "lucide-react";
import { FormRoom } from "@/components/ui/FormRoom";
import { Field as UiField, Input } from "@/components/ui/Input";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { OptionalMark, RequiredMark } from "@/components/ui/RequiredMark";
import type { OpportunityReview, OpportunityReviewOptions, OpportunityReviewPerson } from "@/lib/opportunitiesShared";
import { MultiPicker, type MultiPickerOption } from "@/components/ui/MultiPicker";
import { formatDayLabel } from "@/lib/utils";
import { readableDay } from "@/lib/agentActionsShared";

const ROLES = ["Executive Sponsor", "Budget Holder", "Decision Maker", "Champion", "Influencer", "Blocker", "Information Giver", "Evaluation Lead"];
const SENTIMENTS = ["Positive", "Neutral", "Distractor", "Unknown"] as const;
const SENIORITY = [
  { key: "senior", label: "C, VP and senior director", Icon: Crown },
  { key: "manager", label: "Director and manager", Icon: UserRound },
] as const;
const FUNCTIONS = [
  { key: "business", label: "Business", Icon: Briefcase },
  { key: "it", label: "IT", Icon: Cpu },
  { key: "other", label: "Other", Icon: Shapes },
] as const;

/* Anir, Sep 27, on this grid: "I don't even understand what the fuck that is."
   It is a map of the buying committee: every row is how senior someone is,
   every column is the part of the customer they sit in, and a cell is the
   people to work on in that square. Said once, in the hint, rather than as a
   paragraph nobody reads. */
const PEOPLE_HINT =
  "The customer's buying committee, as a map.\nRows: how senior the person is.\nColumns: the part of the business they sit in.\nPut each person in the square that fits, then give them a decision role and how they feel about Freyr.";

function blankReview(): OpportunityReview {
  return {
    compellingEvent: "",
    nextStep: { date: "", objective: "", stakeholderName: "", stakeholderTitle: "" },
    obstacles: ["", ""],
    competitors: [],
    strategy: "",
    people: [],
    thirdParties: [],
    actions: [],
  };
}

function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }

const field = "w-full rounded-xl border border-border-light bg-white px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10 disabled:bg-surface-secondary disabled:text-text-secondary";
const label = "mb-1.5 block truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary";


function ReviewValue({ value, empty = "Not recorded yet" }: { value: string; empty?: string }) {
  return <p className={`whitespace-pre-wrap text-[13px] leading-6 ${value ? "text-text-primary" : "text-text-tertiary"}`}>{value || empty}</p>;
}

function recordChoices(options: MultiPickerOption[], name: string, id?: string, company = false): MultiPickerOption[] {
  if (!name || options.some((option) => option.label.trim().toLowerCase() === name.trim().toLowerCase())) return options;
  return [...options, { id: `legacy:${name}`, label: name, sub: "Saved name", ...(company ? { logoName: name } : { avatarName: name }) }];
}

function chosenId(options: MultiPickerOption[], name: string, id?: string): string[] {
  if (!name) return [];
  return [options.find((option) => option.id === id && option.label.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? options.find((option) => option.label.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? `legacy:${name}`];
}

function RecordPicker({ choices, name, id, onPick, onCreate, placeholder, emptyLabel, company = false }: {
  choices: MultiPickerOption[];
  name: string;
  id?: string;
  onPick: (choice: MultiPickerOption) => void;
  onCreate?: (name: string) => void;
  placeholder: string;
  emptyLabel: string;
  company?: boolean;
}) {
  const all = recordChoices(choices, name, id, company);
  return <MultiPicker variant="dropdown" single options={all} selected={chosenId(all, name, id)}
    onToggle={(value) => { const choice = all.find((item) => item.id === value); if (choice) onPick(choice); }}
    onCreate={onCreate} createLabel={onCreate ? `Add new ${company ? "company" : "contact"}` : undefined}
    placeholder={placeholder} emptyLabel={emptyLabel} ariaLabel={placeholder} />;
}

export function OpportunityReviewTab({ review, mayEdit, onSave, dealId, editPage = false, onCancel, options, copiedFromId }: {
  review?: OpportunityReview;
  mayEdit: boolean;
  onSave?: (review: OpportunityReview, reviewedOn: string) => Promise<{ error: string | null; review?: OpportunityReview }>;
  dealId: string;
  editPage?: boolean;
  onCancel?: () => void;
  options?: OpportunityReviewOptions;
  copiedFromId?: string;
}) {
  const [draft, setDraft] = useState<OpportunityReview>(() => structuredClone(review ?? blankReview()));
  const [reviewedOn, setReviewedOn] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const editing = editPage;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(structuredClone(review ?? blankReview())); }, [review]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(review ?? blankReview());

  const update = (patch: Partial<OpportunityReview>) => setDraft((current) => ({ ...current, ...patch }));
  const patchPerson = (id: string, patch: Partial<OpportunityReviewPerson>) => update({ people: draft.people.map((person) => person.id === id ? { ...person, ...patch } : person) });
  const addPerson = (seniority: OpportunityReviewPerson["seniority"], kind: OpportunityReviewPerson["function"]) =>
    update({ people: [...draft.people, { id: uid(), seniority, function: kind, name: "", title: "", role: "", linkedin: "", sentiment: "Unknown" }] });
  const contactChoices: MultiPickerOption[] = (options?.contacts ?? []).map((contact) => ({ id: contact.id, label: contact.name, sub: contact.title, avatarName: contact.name, href: `/contacts/${contact.id}` }));
  const companyChoices: MultiPickerOption[] = (options?.companies ?? []).map((company) => ({ id: company.id, label: company.name, logoName: company.name, href: `/customers/${company.id}` }));
  const competitorChoices: MultiPickerOption[] = (options?.competitors ?? []).map((competitor) => ({ id: competitor.id, label: competitor.name, logoName: competitor.name, logoSrc: competitor.logoUrl ?? null, href: `/market-intel/${competitor.id}` }));
  const competitorLogo = (name: string) => options?.competitors.find((competitor) => competitor.name.trim().toLowerCase() === name.trim().toLowerCase())?.logoUrl ?? null;
  const teammateChoices: MultiPickerOption[] = (options?.teammates ?? []).map((teammate) => ({ id: teammate.id, label: teammate.name, avatarName: teammate.name }));
  const cancel = () => { setDraft(structuredClone(review ?? blankReview())); setError(""); onCancel?.(); };
  async function save() {
    if (!onSave) return;
    if (!reviewedOn) { setError("Choose the date of this review."); return; }
    if (!draft.compellingEvent.trim() && !draft.strategy.trim() && !draft.nextStep.objective.trim() && !draft.actions.length) {
      setError("Record the discussion or an agreed next step before saving."); return;
    }
    if (draft.actions.some((action) => !action.action.trim() || !action.owner.trim() || !action.deadline)) {
      setError("Every review action needs a description, owner, and deadline."); return;
    }
    if (draft.people.some((person) => !person.name.trim())) {
      setError("Name each person you added, or remove the empty row."); return;
    }
    setSaving(true); setError("");
    const result = await onSave(draft, reviewedOn);
    setSaving(false);
    if (result.error) setError(result.error);
    else { setDraft(structuredClone(result.review ?? draft)); onCancel?.(); }
  }

  /* THE FORM, IN THE SAME ROOMS EVERY OTHER EDIT SCREEN USES (Anir, Sep 28:
     "completely revamp the UI of this... look at all the other pages"). A
     meeting, a deal and a contract are each a run of FormRooms: the first
     open, the rest shut with a one-line summary of what they hold, every
     field a shared Field with its required or optional mark. This is that. */
  const dateHint = copiedFromId
    ? "Copied from a saved review.\nSaving creates a new record and the earlier review stays exactly as it was."
    : "Records this discussion as its own dated snapshot.\nA later review can copy it and change only what moved.";
  const peopleSummary = draft.people.length ? `${draft.people.length} ${draft.people.length === 1 ? "person" : "people"} mapped` : "Nobody mapped yet";
  const winSummary = draft.strategy.trim() ? "Strategy written" : draft.obstacles.some((o) => o.trim()) ? "Obstacles noted" : "Not written yet";
  const commitSummary = draft.nextStep.objective.trim() ? draft.nextStep.objective.trim().slice(0, 60) : draft.nextStep.date ? `Due ${readableDay(draft.nextStep.date)}` : "No next step yet";
  const actionsSummary = draft.actions.length ? `${draft.actions.length} ${draft.actions.length === 1 ? "action" : "actions"}` : "No actions yet";

  return <div className="space-y-3 pb-12">
    {!editing && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-4">
      <div><h2 className="text-[18px] font-semibold text-text-primary">Opportunity review</h2><p className="mt-1 text-[12.5px] text-text-secondary">Decision, relationships and next moves</p></div>
      {mayEdit && <Link href={`/opportunities/${dealId}/review/edit`} className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary"><Pencil size={14} /> Edit review</Link>}
    </div>}

    <FormRoom icon={Flag} title="The discussion" defaultOpen summary={draft.compellingEvent.trim() ? "Compelling event written" : "Nothing written yet"}>
      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
        <UiField label="Review date" required hint={dateHint}>
          <DateField className={field} value={reviewedOn} onChange={(event) => setReviewedOn(event)} ariaLabel="Review date" />
        </UiField>
        <div className="sm:pt-6"><span className="inline-flex items-center rounded-full border border-blue-subtle bg-white px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary">{copiedFromId ? "Copied from an earlier review" : "New snapshot"}</span></div>
      </div>
      <div className="mt-3">
        <UiField label="Compelling event" hint="What is at stake, why must the customer act, and why now? Include the deadline or consequence.">
          {editing ? <textarea className={`${field} min-h-28 resize-y`} value={draft.compellingEvent} onChange={(e) => update({ compellingEvent: e.target.value })} placeholder="The time-bound opportunity or risk the customer cannot ignore" /> : <ReviewValue value={draft.compellingEvent} empty="No compelling event recorded yet" />}
        </UiField>
      </div>
    </FormRoom>

    <FormRoom icon={CalendarDays} title="Customer commitment" summary={commitSummary}>
      <p className="mb-3 text-[12px] text-text-secondary">The next step agreed with the customer: the commitment made together, not an internal intention.</p>
      {editing ? <div className="grid gap-3 sm:grid-cols-2">
        <UiField label="Date"><DateField className={field} value={draft.nextStep.date} onChange={(e) => update({ nextStep: { ...draft.nextStep, date: e } })} ariaLabel="Next step date" /></UiField>
        <UiField label="Objective"><Input value={draft.nextStep.objective} onChange={(e) => update({ nextStep: { ...draft.nextStep, objective: e.target.value } })} placeholder="What will be achieved?" /></UiField>
        <UiField label="Highest stakeholder"><RecordPicker choices={contactChoices} name={draft.nextStep.stakeholderName} id={draft.nextStep.stakeholderContactId} placeholder="Search contacts" emptyLabel="No contacts found" onPick={(choice) => { const contact = options?.contacts.find((item) => item.id === choice.id); update({ nextStep: { ...draft.nextStep, stakeholderName: choice.label, stakeholderContactId: contact?.id, stakeholderTitle: contact?.title || draft.nextStep.stakeholderTitle } }); }} onCreate={(name) => update({ nextStep: { ...draft.nextStep, stakeholderName: name, stakeholderContactId: undefined, stakeholderTitle: "" } })} /></UiField>
        <UiField label="Stakeholder title"><Input value={draft.nextStep.stakeholderTitle} onChange={(e) => update({ nextStep: { ...draft.nextStep, stakeholderTitle: e.target.value } })} placeholder="Title" /></UiField>
      </div> : <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2"><div><span className={label}>Date</span><ReviewValue value={draft.nextStep.date ? formatDayLabel(draft.nextStep.date, "en-US") : ""} /></div><div><span className={label}>Objective</span><ReviewValue value={draft.nextStep.objective} /></div><div><span className={label}>Highest stakeholder</span><ReviewValue value={draft.nextStep.stakeholderName} /></div><div><span className={label}>Stakeholder title</span><ReviewValue value={draft.nextStep.stakeholderTitle} /></div></div>}
    </FormRoom>

    <FormRoom icon={Target} title="How Freyr wins" summary={winSummary}>
      <UiField label="Freyr's strategy to win" hint="The overarching positioning that guides decisions through the sales cycle. Keep short-term tasks in Agreed actions.">
        {editing ? <textarea className={`${field} min-h-24 resize-y`} value={draft.strategy} onChange={(e) => update({ strategy: e.target.value })} placeholder="How Freyr will win and sustain its advantage" /> : <ReviewValue value={draft.strategy} empty="No strategy recorded yet" />}
      </UiField>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {draft.obstacles.map((obstacle, index) => <UiField key={index} label={`Obstacle ${index + 1}`} hint={index === 0 ? "The two biggest barriers to winning this opportunity." : undefined}>
          {editing ? <textarea className={`${field} min-h-20 resize-y`} value={obstacle} onChange={(e) => { const next: [string, string] = [...draft.obstacles]; next[index] = e.target.value; update({ obstacles: next }); }} placeholder="Describe the obstacle" /> : <ReviewValue value={obstacle} />}
        </UiField>)}
      </div>
      <div className="mt-3">
        <UiField label="Confirmed competitors" hint="Only competitors the customer or another reliable source has confirmed. Never assume.">
          <div className="space-y-2">{draft.competitors.map((competitor, index) => editing ? <div key={index} className="flex min-w-0 gap-2"><div className="min-w-0 flex-1"><RecordPicker choices={competitorChoices} name={competitor} id={draft.competitorIds?.[competitor]} company placeholder="Search tracked competitors" emptyLabel="No tracked competitors found" onPick={(choice) => { const nextIds = { ...draft.competitorIds }; delete nextIds[competitor]; if (!choice.id.startsWith("legacy:")) nextIds[choice.label] = choice.id; update({ competitors: draft.competitors.map((value, at) => at === index ? choice.label : value), competitorIds: nextIds }); }} /></div><button type="button" onClick={() => { const nextIds = { ...draft.competitorIds }; delete nextIds[competitor]; update({ competitors: draft.competitors.filter((_, at) => at !== index), competitorIds: nextIds }); }} className="rounded-lg px-2 text-text-tertiary hover:text-red-600" aria-label={`Remove competitor ${index + 1}`}><Trash2 size={16} /></button></div> : <span key={index} className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white px-2.5 py-1 text-[12.5px] font-medium text-text-primary"><CompanyLogo name={competitor} src={competitorLogo(competitor)} className="h-[18px] w-[18px] shrink-0 text-[7px]" />{competitor}</span>)}{!draft.competitors.length && <p className="text-[13px] text-text-tertiary">No confirmed competitors yet.</p>}{editing && <button type="button" onClick={() => update({ competitors: [...draft.competitors, ""] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add competitor</button>}</div>
        </UiField>
      </div>
    </FormRoom>

    <FormRoom icon={Users} title="People to influence" summary={peopleSummary}>
      <div className="mb-3 flex items-center gap-2"><span className="text-[12px] text-text-secondary">The customer's buying committee, as a map.</span><InfoHint text={PEOPLE_HINT} /></div>
      <div className="grid gap-3 grid-cols-[176px_repeat(3,minmax(0,1fr))]">
        <div />{FUNCTIONS.map((kind) => <div key={kind.key} className="flex items-center gap-1.5 px-1 pb-1 text-[12px] font-semibold text-text-primary"><kind.Icon size={14} className="text-blue-primary" aria-hidden="true" />{kind.label}</div>)}
        {SENIORITY.map((seniority) => <div key={seniority.key} className="contents">
          <div className="flex items-center gap-2 rounded-xl border border-blue-subtle bg-white px-3 py-3 text-[12px] font-semibold text-text-primary"><seniority.Icon size={14} className="shrink-0 text-blue-primary" aria-hidden="true" />{seniority.label}</div>
          {FUNCTIONS.map((kind) => {
            const members = draft.people.filter((person) => person.seniority === seniority.key && person.function === kind.key);
            if (!members.length) {
              return <div key={`${seniority.key}-${kind.key}`} className="min-w-0">
                {editing
                  ? <button type="button" onClick={() => addPerson(seniority.key, kind.key)}
                      className="flex h-full min-h-[86px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-light bg-white text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:bg-blue-light/30 hover:text-blue-primary">
                      <Plus size={14} aria-hidden="true" /> Add person
                    </button>
                  : <div className="flex h-full min-h-[86px] items-center justify-center rounded-xl border border-dashed border-border-light bg-white text-[12px] text-text-tertiary">No one here</div>}
              </div>;
            }
            return <div key={`${seniority.key}-${kind.key}`} className="min-w-0 rounded-xl border border-border-light bg-white p-3">
              <div className="space-y-3">{members.map((person) => <div key={person.id} className="rounded-xl border border-border-light bg-blue-light/20 p-3">
                {editing ? <div className="space-y-2"><RecordPicker choices={contactChoices} name={person.name} id={person.contactId} placeholder="Search contacts" emptyLabel="No contacts found" onPick={(choice) => { const contact = options?.contacts.find((item) => item.id === choice.id); patchPerson(person.id, { name: choice.label, contactId: contact?.id, title: contact?.title || person.title, linkedin: contact?.linkedin || person.linkedin }); }} onCreate={(name) => patchPerson(person.id, { name, contactId: undefined })} /><Input value={person.title} onChange={(e) => patchPerson(person.id, { title: e.target.value })} placeholder="Title" aria-label="Person title" /><select className={field} value={person.role} onChange={(e) => patchPerson(person.id, { role: e.target.value })} aria-label="Decision role"><option value="">Decision role</option>{ROLES.map((role) => <option key={role}>{role}</option>)}</select><Input value={person.linkedin} onChange={(e) => patchPerson(person.id, { linkedin: e.target.value })} placeholder="LinkedIn URL" aria-label="LinkedIn URL" /><div className="flex gap-2"><select className={field} value={person.sentiment} onChange={(e) => patchPerson(person.id, { sentiment: e.target.value as OpportunityReviewPerson["sentiment"] })} aria-label="Freyr sentiment">{SENTIMENTS.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => update({ people: draft.people.filter((item) => item.id !== person.id) })} className="px-1 text-text-tertiary hover:text-red-600" aria-label={`Remove ${person.name || "person"}`}><Trash2 size={15} /></button></div></div> : <div><div className="flex items-center gap-1.5"><Users size={14} className="text-blue-primary" />{person.contactId ? <Link href={`/contacts/${person.contactId}`} className="truncate text-[12.5px] font-semibold text-blue-primary hover:underline">{person.name}</Link> : <strong className="truncate text-[12.5px] text-text-primary">{person.name}</strong>}</div><p className="mt-1 text-[11.5px] text-text-secondary">{[person.title, person.role].filter(Boolean).join(" · ") || "No title or role yet"}</p><span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">{person.sentiment}</span></div>}
              </div>)}</div>
              {editing && <button type="button" onClick={() => addPerson(seniority.key, kind.key)} className="mt-3 inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"><Plus size={13} aria-hidden="true" /> Add person</button>}
            </div>;
          })}
        </div>)}
      </div>
      <details className="group mt-3 rounded-xl border border-border-light bg-white px-4 py-3 text-[12px] text-text-secondary"><summary className="cursor-pointer list-none font-semibold text-blue-primary">What each decision role means</summary><div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">{[["Executive Sponsor", "Defends the budget with the investment committee."], ["Budget Holder", "Controls the budget."], ["Decision Maker", "Makes the final purchase decision."], ["Champion", "Advocates for Freyr and removes roadblocks."], ["Influencer", "Can sway the decision without the final say."], ["Blocker", "Can slow the process."], ["Information Giver", "Shares inside information without decision influence."], ["Evaluation Lead", "Runs the vendor evaluation."]].map(([name, meaning]) => <p key={name} className="leading-5"><strong className="text-text-primary">{name}</strong><br />{meaning}</p>)}</div></details>
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2"><UsersRound size={14} className="text-blue-primary" aria-hidden="true" /><span className="text-[12.5px] font-semibold text-text-primary">Outside influence</span><InfoHint text="Organizations outside the customer that influence the same decision makers, such as a consultancy or independent advisor." /></div>
        <div className="space-y-3">{draft.thirdParties.map((party) => <div key={party.id} className="rounded-xl border border-border-light bg-white p-3">{editing ? <div className="grid gap-2 sm:grid-cols-2"><RecordPicker choices={companyChoices} name={party.company} id={party.customerId} company placeholder="Search companies" emptyLabel="No companies found" onPick={(choice) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, company: choice.label, customerId: options?.companies.find((company) => company.id === choice.id)?.id } : item) })} onCreate={(name) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, company: name, customerId: undefined } : item) })} /><Input value={party.role} onChange={(e) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, role: e.target.value } : item) })} placeholder="Role in the opportunity" aria-label="Third-party role" /><select className={field} value={party.sentiment} onChange={(e) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, sentiment: e.target.value as typeof party.sentiment } : item) })} aria-label="Third-party sentiment">{SENTIMENTS.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => update({ thirdParties: draft.thirdParties.filter((item) => item.id !== party.id) })} className="justify-self-end px-2 text-text-tertiary hover:text-red-600" aria-label={`Remove ${party.company || "third party"}`}><Trash2 size={16} /></button></div> : <div><strong className="text-[13px] text-text-primary">{party.company}</strong><p className="mt-1 text-[12px] text-text-secondary">{party.role || "Role not recorded"} · {party.sentiment}</p></div>}</div>)}{!draft.thirdParties.length && <p className="text-[13px] text-text-tertiary">No third parties recorded yet.</p>}{editing && <button type="button" onClick={() => update({ thirdParties: [...draft.thirdParties, { id: uid(), company: "", role: "", sentiment: "Unknown" }] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add third party</button>}</div>
      </div>
    </FormRoom>

    <FormRoom icon={ListChecks} title="Agreed actions" summary={actionsSummary}>
      <p className="mb-3 text-[12px] text-text-secondary">Actions agreed during the review. Every action needs an owner and a deadline.</p>
      <div className="space-y-3">{draft.actions.map((action) => <div key={action.id} className="rounded-xl border border-border-light bg-white p-3">{editing ? <div className="grid gap-2 sm:grid-cols-2"><div className="sm:col-span-2"><Input value={action.action} onChange={(e) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, action: e.target.value } : item) })} placeholder="Action agreed" aria-label="Review action" /></div><RecordPicker choices={teammateChoices} name={action.owner} id={action.ownerId} placeholder="Search teammates" emptyLabel="No teammates found" onPick={(choice) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, owner: choice.label, ownerId: options?.teammates.find((teammate) => teammate.id === choice.id)?.id } : item) })} /><div className="flex gap-2"><div className="min-w-0 flex-1"><DateField className={field} value={action.deadline} onChange={(e) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, deadline: e } : item) })} ariaLabel="Action deadline" /></div><button type="button" onClick={() => update({ actions: draft.actions.filter((item) => item.id !== action.id) })} className="px-2 text-text-tertiary hover:text-red-600" aria-label="Remove action"><Trash2 size={16} /></button></div></div> : <div><strong className="text-[13px] text-text-primary">{action.action}</strong><p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary"><CalendarDays size={13} /> {action.owner} · {action.deadline}</p></div>}</div>)}{!draft.actions.length && <p className="text-[13px] text-text-tertiary">No actions agreed yet.</p>}{editing && <button type="button" onClick={() => update({ actions: [...draft.actions, { id: uid(), action: "", owner: "", deadline: "" }] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add action</button>}</div>
    </FormRoom>
    {editing && <div className="sticky bottom-0 z-30 -mx-1 mt-2 px-1 pb-1">
      <div data-agent-dock-clearance className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-subtle bg-canvas/95 px-4 py-3 shadow-[0_-2px_18px_-6px_rgba(16,22,30,0.22)] backdrop-blur">
        <span className="text-[13px] font-semibold text-text-primary">{dirty ? "New review ready to save" : "New opportunity review"}</span>
        {error && <p role="alert" className="min-w-0 text-[12.5px] font-medium text-[color:var(--status-red)]">{error}</p>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={cancel} disabled={saving} className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"><Check size={14} />{saving ? "Saving…" : "Save review"}</button>
        </div>
      </div>
    </div>}
  </div>;
}
