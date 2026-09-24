"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { OpportunityReview, OpportunityReviewPerson } from "@/lib/opportunitiesShared";

const ROLES = ["Executive Sponsor", "Budget Holder", "Decision Maker", "Champion", "Influencer", "Blocker", "Information Giver", "Evaluation Lead"];
const SENTIMENTS = ["Positive", "Neutral", "Distractor", "Unknown"] as const;
const SENIORITY = [
  { key: "senior", label: "C, VP and senior director" },
  { key: "manager", label: "Director and manager" },
] as const;
const FUNCTIONS = [
  { key: "business", label: "Business" },
  { key: "it", label: "IT" },
  { key: "other", label: "Other" },
] as const;

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
const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary";

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className={label}>{title}</span>{children}</label>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-6">
    <div className="mb-4"><h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>{note && <p className="mt-1 text-[12px] leading-5 text-text-secondary">{note}</p>}</div>
    {children}
  </section>;
}

export function OpportunityReviewTab({ review, mayEdit, onSave }: {
  review?: OpportunityReview;
  mayEdit: boolean;
  onSave: (review: OpportunityReview) => Promise<{ error: string | null; review?: OpportunityReview }>;
}) {
  const [draft, setDraft] = useState<OpportunityReview>(() => structuredClone(review ?? blankReview()));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(structuredClone(review ?? blankReview())); }, [review]);

  const update = (patch: Partial<OpportunityReview>) => setDraft((current) => ({ ...current, ...patch }));
  const patchPerson = (id: string, patch: Partial<OpportunityReviewPerson>) => update({ people: draft.people.map((person) => person.id === id ? { ...person, ...patch } : person) });
  const addPerson = (seniority: OpportunityReviewPerson["seniority"], kind: OpportunityReviewPerson["function"]) =>
    update({ people: [...draft.people, { id: uid(), seniority, function: kind, name: "", title: "", role: "", linkedin: "", sentiment: "Unknown" }] });
  const cancel = () => { setDraft(structuredClone(review ?? blankReview())); setError(""); setEditing(false); };
  async function save() {
    if (draft.actions.some((action) => !action.action.trim() || !action.owner.trim() || !action.deadline)) {
      setError("Every review action needs a description, owner, and deadline."); return;
    }
    if (draft.people.some((person) => !person.name.trim())) {
      setError("Name each person you added, or remove the empty row."); return;
    }
    setSaving(true); setError("");
    const result = await onSave(draft);
    setSaving(false);
    if (result.error) setError(result.error);
    else { setDraft(structuredClone(result.review ?? draft)); setEditing(false); }
  }

  return <div className="space-y-4 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-blue-subtle bg-blue-light/40 px-5 py-4">
      <div><h2 className="text-[17px] font-semibold text-text-primary">Opportunity review</h2><p className="mt-1 max-w-2xl text-[12.5px] text-text-secondary">Capture why the customer must act, the people shaping the decision, and the actions agreed to move it forward.</p></div>
      {mayEdit && (!editing ? <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-blue-primary hover:border-blue-primary"><Pencil size={14} /> Edit review</button> : <div className="flex items-center gap-2"><button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-border-light bg-white px-4 py-2 text-[13px] font-medium text-text-secondary">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"><Check size={15} /> {saving ? "Saving…" : "Save review"}</button></div>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-medium text-red-700">{error}</p>}

    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Compelling event" note="What is at stake, why must the customer act, and why now? Include the deadline or consequence.">
        <textarea className={`${field} min-h-28 resize-y`} value={draft.compellingEvent} readOnly={!editing} onChange={(e) => update({ compellingEvent: e.target.value })} placeholder={editing ? "The time-bound opportunity or risk the customer cannot ignore" : "No compelling event recorded yet"} />
      </Section>
      <Section title="Next step agreed with the customer" note="Record the commitment made together, not an internal intention.">
        <div className="grid gap-3 sm:grid-cols-2"><Field title="Date"><input type="date" className={field} value={draft.nextStep.date} disabled={!editing} onChange={(e) => update({ nextStep: { ...draft.nextStep, date: e.target.value } })} /></Field><Field title="Objective"><input className={field} value={draft.nextStep.objective} readOnly={!editing} onChange={(e) => update({ nextStep: { ...draft.nextStep, objective: e.target.value } })} placeholder="What will be achieved?" /></Field><Field title="Highest stakeholder involved"><input className={field} value={draft.nextStep.stakeholderName} readOnly={!editing} onChange={(e) => update({ nextStep: { ...draft.nextStep, stakeholderName: e.target.value } })} placeholder="Name" /></Field><Field title="Stakeholder title"><input className={field} value={draft.nextStep.stakeholderTitle} readOnly={!editing} onChange={(e) => update({ nextStep: { ...draft.nextStep, stakeholderTitle: e.target.value } })} placeholder="Title" /></Field></div>
      </Section>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Two major obstacles" note="The two biggest barriers to winning this opportunity.">
        <div className="space-y-3">{draft.obstacles.map((obstacle, index) => <Field key={index} title={`Obstacle ${index + 1}`}><textarea className={`${field} min-h-20 resize-y`} value={obstacle} readOnly={!editing} onChange={(e) => { const next: [string, string] = [...draft.obstacles]; next[index] = e.target.value; update({ obstacles: next }); }} placeholder={editing ? "Describe the obstacle" : "Not recorded"} /></Field>)}</div>
      </Section>
      <Section title="Confirmed competitors" note="Only include competitors the customer or another reliable source has confirmed. Never assume.">
        <div className="space-y-2">{draft.competitors.map((competitor, index) => <div key={index} className="flex gap-2"><input className={field} value={competitor} readOnly={!editing} onChange={(e) => update({ competitors: draft.competitors.map((value, at) => at === index ? e.target.value : value) })} aria-label={`Competitor ${index + 1}`} />{editing && <button type="button" onClick={() => update({ competitors: draft.competitors.filter((_, at) => at !== index) })} className="rounded-lg px-2 text-text-tertiary hover:text-red-600" aria-label={`Remove competitor ${index + 1}`}><Trash2 size={16} /></button>}</div>)}{!draft.competitors.length && !editing && <p className="text-[13px] text-text-secondary">None confirmed yet.</p>}{editing && <button type="button" onClick={() => update({ competitors: [...draft.competitors, ""] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add competitor</button>}</div>
      </Section>
    </div>

    <Section title="Freyr’s strategy to win" note="The overarching positioning that guides decisions through the sales cycle. Keep short-term tasks in Review actions below.">
      <textarea className={`${field} min-h-28 resize-y`} value={draft.strategy} readOnly={!editing} onChange={(e) => update({ strategy: e.target.value })} placeholder={editing ? "How Freyr will win and sustain its advantage" : "No strategy recorded yet"} />
    </Section>

    <Section title="People to influence" note="Place each person by seniority and function. Their decision role and sentiment help the team focus its outreach.">
      <div className="grid gap-3 lg:grid-cols-[180px_repeat(3,minmax(0,1fr))]">
        <div className="hidden lg:block" />{FUNCTIONS.map((kind) => <div key={kind.key} className="hidden rounded-xl bg-surface-secondary px-3 py-2 text-[12px] font-semibold text-text-secondary lg:block">{kind.label}</div>)}
        {SENIORITY.map((seniority) => <div key={seniority.key} className="contents">
          <div className="rounded-xl bg-surface-secondary px-3 py-3 text-[12px] font-semibold text-text-secondary">{seniority.label}</div>
          {FUNCTIONS.map((kind) => {
            const members = draft.people.filter((person) => person.seniority === seniority.key && person.function === kind.key);
            return <div key={`${seniority.key}-${kind.key}`} className="min-w-0 rounded-xl border border-border-light p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary lg:hidden">{kind.label}</span>{editing && <button type="button" onClick={() => addPerson(seniority.key, kind.key)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary"><Plus size={13} /> Add person</button>}</div>
              {members.length ? <div className="space-y-3">{members.map((person) => <div key={person.id} className="rounded-xl bg-surface-secondary/70 p-3">
                {editing ? <div className="space-y-2"><input className={field} value={person.name} onChange={(e) => patchPerson(person.id, { name: e.target.value })} placeholder="Name" aria-label="Person name" /><input className={field} value={person.title} onChange={(e) => patchPerson(person.id, { title: e.target.value })} placeholder="Title" aria-label="Person title" /><select className={field} value={person.role} onChange={(e) => patchPerson(person.id, { role: e.target.value })} aria-label="Decision role"><option value="">Decision role</option>{ROLES.map((role) => <option key={role}>{role}</option>)}</select><input className={field} value={person.linkedin} onChange={(e) => patchPerson(person.id, { linkedin: e.target.value })} placeholder="LinkedIn URL" aria-label="LinkedIn URL" /><div className="flex gap-2"><select className={field} value={person.sentiment} onChange={(e) => patchPerson(person.id, { sentiment: e.target.value as OpportunityReviewPerson["sentiment"] })} aria-label="Freyr sentiment">{SENTIMENTS.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => update({ people: draft.people.filter((item) => item.id !== person.id) })} className="px-1 text-text-tertiary hover:text-red-600" aria-label={`Remove ${person.name || "person"}`}><Trash2 size={15} /></button></div></div> : <div><div className="flex items-center gap-1.5"><Users size={14} className="text-blue-primary" />{person.contactId ? <Link href={`/contacts/${person.contactId}`} className="truncate text-[12.5px] font-semibold text-blue-primary hover:underline">{person.name}</Link> : <strong className="truncate text-[12.5px] text-text-primary">{person.name}</strong>}</div><p className="mt-1 text-[11.5px] text-text-secondary">{[person.title, person.role].filter(Boolean).join(" · ") || "No title or role yet"}</p><span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">{person.sentiment}</span></div>}
              </div>)}</div> : <p className="text-[11.5px] text-text-tertiary">No one added yet</p>}
            </div>;
          })}
        </div>)}
      </div>
      <details className="mt-4 text-[12px] text-text-secondary"><summary className="cursor-pointer font-semibold text-blue-primary">Decision role definitions</summary><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{[["Executive Sponsor", "Defends the budget with the investment committee."], ["Budget Holder", "Controls the budget."], ["Decision Maker", "Makes the final purchase decision."], ["Champion", "Advocates for Freyr and removes roadblocks."], ["Influencer", "Can sway the decision without the final say."], ["Blocker", "Can slow the process."], ["Information Giver", "Shares inside information without decision influence."], ["Evaluation Lead", "Runs the vendor evaluation."]].map(([name, meaning]) => <p key={name}><strong>{name}:</strong> {meaning}</p>)}</div></details>
    </Section>

    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="External third parties" note="Organizations outside the customer that influence the same decision makers, such as a consultancy or independent advisor.">
        <div className="space-y-3">{draft.thirdParties.map((party) => <div key={party.id} className="rounded-xl border border-border-light p-3">{editing ? <div className="grid gap-2 sm:grid-cols-2"><input className={field} value={party.company} onChange={(e) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, company: e.target.value } : item) })} placeholder="Company name" aria-label="Third-party company" /><input className={field} value={party.role} onChange={(e) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, role: e.target.value } : item) })} placeholder="Role in the opportunity" aria-label="Third-party role" /><select className={field} value={party.sentiment} onChange={(e) => update({ thirdParties: draft.thirdParties.map((item) => item.id === party.id ? { ...item, sentiment: e.target.value as typeof party.sentiment } : item) })} aria-label="Third-party sentiment">{SENTIMENTS.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => update({ thirdParties: draft.thirdParties.filter((item) => item.id !== party.id) })} className="justify-self-end px-2 text-text-tertiary hover:text-red-600" aria-label={`Remove ${party.company || "third party"}`}><Trash2 size={16} /></button></div> : <div><strong className="text-[13px] text-text-primary">{party.company}</strong><p className="mt-1 text-[12px] text-text-secondary">{party.role || "Role not recorded"} · {party.sentiment}</p></div>}</div>)}{!draft.thirdParties.length && !editing && <p className="text-[13px] text-text-secondary">None recorded yet.</p>}{editing && <button type="button" onClick={() => update({ thirdParties: [...draft.thirdParties, { id: uid(), company: "", role: "", sentiment: "Unknown" }] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add third party</button>}</div>
      </Section>
      <Section title="Review actions" note="Actions agreed during the review. Every action must have an owner and a deadline.">
        <div className="space-y-3">{draft.actions.map((action) => <div key={action.id} className="rounded-xl border border-border-light p-3">{editing ? <div className="grid gap-2 sm:grid-cols-2"><input className={`${field} sm:col-span-2`} value={action.action} onChange={(e) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, action: e.target.value } : item) })} placeholder="Action agreed" aria-label="Review action" /><input className={field} value={action.owner} onChange={(e) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, owner: e.target.value } : item) })} placeholder="Owner" aria-label="Action owner" /><input type="date" className={field} value={action.deadline} onChange={(e) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, deadline: e.target.value } : item) })} aria-label="Action deadline" /><button type="button" onClick={() => update({ actions: draft.actions.filter((item) => item.id !== action.id) })} className="justify-self-end px-2 text-text-tertiary hover:text-red-600 sm:col-span-2" aria-label="Remove action"><Trash2 size={16} /></button></div> : <div><strong className="text-[13px] text-text-primary">{action.action}</strong><p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary"><CalendarDays size={13} /> {action.owner} · {action.deadline}</p></div>}</div>)}{!draft.actions.length && !editing && <p className="text-[13px] text-text-secondary">No actions agreed yet.</p>}{editing && <button type="button" onClick={() => update({ actions: [...draft.actions, { id: uid(), action: "", owner: "", deadline: "" }] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add action</button>}</div>
      </Section>
    </div>
    {editing && <div className="flex justify-end gap-2"><button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-border-light bg-white px-4 py-2 text-[13px] font-medium text-text-secondary">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-blue-primary px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save review"}</button></div>}
  </div>;
}
