"use client";
import { DateField } from "@/components/ui/DateField";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, Briefcase, CalendarDays, Check, CircleHelp, ClipboardCheck, Crown, Cpu, Flag, Gavel, Handshake, Lightbulb, ListChecks, Megaphone, Minus, Pencil, Plus, Search, Shapes, ShieldCheck, Target, ThumbsUp, Trash2, UserRound, Users, UsersRound, Wallet } from "lucide-react";
import { FormRoom } from "@/components/ui/FormRoom";
import { Field as UiField, Input } from "@/components/ui/Input";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import type { OpportunityReview, OpportunityReviewOptions, OpportunityReviewPerson } from "@/lib/opportunitiesShared";
import { MultiPicker, type MultiPickerOption } from "@/components/ui/MultiPicker";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLink, PersonLink } from "@/components/ui/EntityLink";
import { tint } from "@/lib/tint";
import { formatDayLabel } from "@/lib/utils";
import { readableDay } from "@/lib/agentActionsShared";

/* WHAT THE PERSON DOES IN THE DECISION, with the meaning on the option itself
   (Anir, Sep 28: "for the decision roll-down, make sure it is correct as it
   should be"). A role is a category, so it carries its colour and its icon
   like every other category in the app, and the sentence that used to sit in
   a fold below the grid now sits on the choice you are making. */
const ROLES = [
  { value: "Executive Sponsor", icon: ShieldCheck, color: "var(--ink-indigo)", description: "Defends the budget with the investment committee." },
  { value: "Budget Holder", icon: Wallet, color: "var(--ink-teal-deep)", description: "Controls the budget." },
  { value: "Decision Maker", icon: Gavel, color: "var(--ink-blue)", description: "Makes the final purchase decision." },
  { value: "Champion", icon: Handshake, color: "var(--ink-emerald)", description: "Advocates for Freyr and removes roadblocks." },
  { value: "Influencer", icon: Megaphone, color: "var(--ink-violet-soft)", description: "Can sway the decision without the final say." },
  { value: "Blocker", icon: Ban, color: "var(--ink-red)", description: "Can slow the process." },
  { value: "Information Giver", icon: Lightbulb, color: "var(--ink-amber)", description: "Shares inside information without decision influence." },
  { value: "Evaluation Lead", icon: ClipboardCheck, color: "var(--ink-magenta)", description: "Runs the vendor evaluation." },
] as const;
/* HOW THEY FEEL ABOUT FREYR. These four are a verdict, not an identity, so
   they are the one place the status colours belong. */
const SENTIMENTS = [
  { value: "Positive", icon: ThumbsUp, color: "var(--ink-emerald)", description: "Wants Freyr to win." },
  { value: "Neutral", icon: Minus, color: "var(--ink-bright-blue)", description: "No preference either way yet." },
  { value: "Distractor", icon: AlertTriangle, color: "var(--ink-red)", description: "Pulling the decision somewhere else." },
  { value: "Unknown", icon: CircleHelp, color: "var(--ink-violet-soft)", description: "Not established yet." },
] as const;
const roleMeta = (value: string) => ROLES.find((role) => role.value === value);
const sentimentMeta = (value: string) => SENTIMENTS.find((item) => item.value === value);
const NOT_CHOSEN = { value: "", label: "Not said yet", color: "var(--ink-neutral)", icon: CircleHelp, description: "Nobody has judged this yet." };

/** A category as it is drawn everywhere else: its colour, its icon, its word. */
function MetaChip({ meta, size = "sm" }: { meta: { value: string; icon: typeof Crown; color: string }; size?: "sm" | "xs" }) {
  const Icon = meta.icon;
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${size === "xs" ? "px-1.5 py-[2px] text-[10.5px]" : "px-2 py-[3px] text-[11px]"}`} style={{ background: tint(meta.color, 10), color: meta.color }}>
    <Icon size={size === "xs" ? 10 : 11} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
    <span className="truncate">{meta.value}</span>
  </span>;
}
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
  "The customer’s buying committee, as a map.\nRows: how senior the person is.\nColumns: the part of the business they sit in.\nPut each person in the square that fits, then give them a decision role and how they feel about Freyr.";
const ROLE_HINT = ROLES.map((role) => `${role.value}: ${role.description}`).join("\n");

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


/* NOTHING HERE YET, DRAWN THE SAME WAY EVERYWHERE (Anir, Sep 28: "if there's
   no action, make it look better. It should be centered"). A dashed box with
   the sentence in the middle of it, not a stray line of grey text. */
function EmptyBox({ children, onAdd, addLabel }: { children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  if (!onAdd) return <p className="rounded-xl border border-dashed border-border-light bg-white px-3 py-5 text-center text-[12.5px] text-text-tertiary">{children}</p>;
  return <button type="button" onClick={onAdd} className="w-full cursor-pointer rounded-xl border border-dashed border-border-light bg-white px-3 py-5 text-center text-[12.5px] text-text-tertiary transition-colors hover:border-blue-primary hover:bg-blue-light/30">
    {children} <span className="font-semibold text-blue-primary">{addLabel}</span>
  </button>;
}

/* THE HEAD OF A LIST: its name on the left, the way to add on the right, as a
   quiet white-and-blue plus (Anir, Sep 28: "don't put the add competitor
   there. You got to put it where it normally is... it should be on the right
   side with the plus button, like a blue plus, white and blue plus. Same goes
   for all those pages"). The same shape the record tabs already keep. */
function SubHead({ icon: Icon, title, hint, onAdd, addLabel }: { icon?: typeof Users; title: string; hint?: string; onAdd?: () => void; addLabel: string }) {
  return <div className="mb-2 flex items-center gap-2">
    {Icon && <Icon size={14} className="shrink-0 text-blue-primary" aria-hidden="true" />}
    <span className="text-[12.5px] font-semibold text-text-primary">{title}</span>
    {hint && <InfoHint text={hint} />}
    {onAdd && <button type="button" onClick={onAdd} aria-label={addLabel} title={addLabel} className="ml-auto inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-opacity hover:opacity-90"><Plus size={15} strokeWidth={2.8} /></button>}
  </div>;
}

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
  /* ADDING SOMEONE IS A POP-UP (Anir, Sep 28: "when I press Add person, it
     should be a pop-up, and then I enter that information... when I press
     Save, it gets inputted in"). The cells used to grow a stack of bare
     inputs, which is what he was looking at. */
  const [personDraft, setPersonDraft] = useState<OpportunityReviewPerson | null>(null);
  const [personIsNew, setPersonIsNew] = useState(false);
  const [personError, setPersonError] = useState("");
  const openNewPerson = (seniority: OpportunityReviewPerson["seniority"], kind: OpportunityReviewPerson["function"]) => {
    setPersonDraft({ id: uid(), seniority, function: kind, name: "", title: "", role: "", linkedin: "", sentiment: "" });
    setPersonIsNew(true); setPersonError("");
  };
  const openPerson = (person: OpportunityReviewPerson) => { setPersonDraft({ ...person }); setPersonIsNew(false); setPersonError(""); };
  const closePerson = () => { setPersonDraft(null); setPersonError(""); };
  const patchDraftPerson = (patch: Partial<OpportunityReviewPerson>) => setPersonDraft((current) => current ? { ...current, ...patch } : current);
  const [partyDraft, setPartyDraft] = useState<OpportunityReview["thirdParties"][number] | null>(null);
  const [partyIsNew, setPartyIsNew] = useState(false);
  const [partyError, setPartyError] = useState("");
  const openNewParty = () => { setPartyDraft({ id: uid(), company: "", role: "", sentiment: "" }); setPartyIsNew(true); setPartyError(""); };
  const openParty = (party: OpportunityReview["thirdParties"][number]) => { setPartyDraft({ ...party }); setPartyIsNew(false); setPartyError(""); };
  const closeParty = () => { setPartyDraft(null); setPartyError(""); };
  function saveParty() {
    if (!partyDraft) return;
    if (!partyDraft.company.trim()) { setPartyError("Which company? Pick one or type its name."); return; }
    update({ thirdParties: partyIsNew ? [...draft.thirdParties, partyDraft] : draft.thirdParties.map((item) => item.id === partyDraft.id ? partyDraft : item) });
    closeParty();
  }
  const [competitorOpen, setCompetitorOpen] = useState(false);
  const [competitorQuery, setCompetitorQuery] = useState("");
  const openNewCompetitor = () => { setCompetitorQuery(""); setCompetitorOpen(true); };
  function saveCompetitor(nameToAdd: string, id?: string) {
    const name = nameToAdd.trim();
    if (!name) return;
    if (draft.competitors.some((value) => value.trim().toLowerCase() === name.toLowerCase())) { setCompetitorOpen(false); return; }
    const nextIds = { ...draft.competitorIds };
    if (id && !id.startsWith("legacy:")) nextIds[name] = id;
    update({ competitors: [...draft.competitors.filter((value) => value.trim()), name], competitorIds: nextIds });
    setCompetitorOpen(false);
  }

  const [actionDraft, setActionDraft] = useState<OpportunityReview["actions"][number] | null>(null);
  const [actionIsNew, setActionIsNew] = useState(false);
  const [actionError, setActionError] = useState("");
  const openNewAction = () => { setActionDraft({ id: uid(), action: "", owner: "", deadline: "" }); setActionIsNew(true); setActionError(""); };
  const openAction = (action: OpportunityReview["actions"][number]) => { setActionDraft({ ...action }); setActionIsNew(false); setActionError(""); };
  const closeAction = () => { setActionDraft(null); setActionError(""); };
  function saveAction() {
    if (!actionDraft) return;
    if (!actionDraft.action.trim()) { setActionError("What was agreed?"); return; }
    if (!actionDraft.owner.trim()) { setActionError("Who owns it?"); return; }
    if (!actionDraft.deadline) { setActionError("When is it due?"); return; }
    update({ actions: actionIsNew ? [...draft.actions, actionDraft] : draft.actions.map((item) => item.id === actionDraft.id ? actionDraft : item) });
    closeAction();
  }

  function savePerson() {
    if (!personDraft) return;
    if (!personDraft.name.trim()) { setPersonError("Who is it? Pick a contact or type their name."); return; }
    update({ people: personIsNew ? [...draft.people, personDraft] : draft.people.map((item) => item.id === personDraft.id ? personDraft : item) });
    closePerson();
  }
  const contactChoices: MultiPickerOption[] = (options?.contacts ?? []).map((contact) => ({ id: contact.id, label: contact.name, sub: contact.title, avatarName: contact.name, href: `/contacts/${contact.id}` }));
  const companyChoices: MultiPickerOption[] = (options?.companies ?? []).map((company) => ({ id: company.id, label: company.name, logoName: company.name, href: `/customers/${company.id}` }));
  const competitorChoices: MultiPickerOption[] = (options?.competitors ?? []).map((competitor) => ({ id: competitor.id, label: competitor.name, logoName: competitor.name, logoSrc: competitor.logoUrl ?? null, href: `/market-intel/${competitor.id}` }));
  const availableCompetitors = competitorChoices.filter((competitor) =>
    !draft.competitors.some((name) => name.trim().toLowerCase() === competitor.label.trim().toLowerCase())
  );
  const matchingCompetitors = availableCompetitors.filter((competitor) =>
    competitor.label.toLowerCase().includes(competitorQuery.trim().toLowerCase())
  );
  const exactCompetitor = availableCompetitors.find((competitor) =>
    competitor.label.trim().toLowerCase() === competitorQuery.trim().toLowerCase()
  );
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
    ? "This review keeps its own date. Saving creates a new review and leaves the one it was copied from exactly as it was."
    : "The day this discussion happened. Each review is kept under its own date, so you can look back at what was true then.";
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
          <DateField value={reviewedOn} onChange={(event) => setReviewedOn(event)} ariaLabel="Review date" />
        </UiField>
        {/* NO BADGE HERE (Anir, Sep 28: "what does new snapshot mean? Why is
            it just a random tag there? It looks like a button"). Nothing to
            say on a new review; when one is copied, one plain sentence. */}
        {copiedFromId ? <p className="text-[12px] leading-5 text-text-secondary sm:pt-7">Copied from an earlier review. Saving keeps that one as it was.</p> : <div />}
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
        <UiField label="Date"><DateField value={draft.nextStep.date} onChange={(e) => update({ nextStep: { ...draft.nextStep, date: e } })} ariaLabel="Next step date" /></UiField>
        <UiField label="Objective"><Input value={draft.nextStep.objective} onChange={(e) => update({ nextStep: { ...draft.nextStep, objective: e.target.value } })} placeholder="What will be achieved?" /></UiField>
        <UiField label="Highest stakeholder"><RecordPicker choices={contactChoices} name={draft.nextStep.stakeholderName} id={draft.nextStep.stakeholderContactId} placeholder="Search contacts" emptyLabel="No contacts found" onPick={(choice) => { const contact = options?.contacts.find((item) => item.id === choice.id); update({ nextStep: { ...draft.nextStep, stakeholderName: choice.label, stakeholderContactId: contact?.id, stakeholderTitle: contact?.title || draft.nextStep.stakeholderTitle } }); }} onCreate={(name) => update({ nextStep: { ...draft.nextStep, stakeholderName: name, stakeholderContactId: undefined, stakeholderTitle: "" } })} /></UiField>
        <UiField label="Stakeholder title"><Input value={draft.nextStep.stakeholderTitle} onChange={(e) => update({ nextStep: { ...draft.nextStep, stakeholderTitle: e.target.value } })} placeholder="Title" /></UiField>
      </div> : <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2"><div><span className={label}>Date</span><ReviewValue value={draft.nextStep.date ? formatDayLabel(draft.nextStep.date, "en-US") : ""} /></div><div><span className={label}>Objective</span><ReviewValue value={draft.nextStep.objective} /></div><div><span className={label}>Highest stakeholder</span><ReviewValue value={draft.nextStep.stakeholderName} /></div><div><span className={label}>Stakeholder title</span><ReviewValue value={draft.nextStep.stakeholderTitle} /></div></div>}
    </FormRoom>

    <FormRoom icon={Target} title="How Freyr wins" summary={winSummary}>
      <UiField label="Freyr’s strategy to win" hint="The overarching positioning that guides decisions through the sales cycle. Keep short-term tasks in Agreed actions.">
        {editing ? <textarea className={`${field} min-h-24 resize-y`} value={draft.strategy} onChange={(e) => update({ strategy: e.target.value })} placeholder="How Freyr will win and sustain its advantage" /> : <ReviewValue value={draft.strategy} empty="No strategy recorded yet" />}
      </UiField>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {draft.obstacles.map((obstacle, index) => <UiField key={index} label={`Obstacle ${index + 1}`} hint={index === 0 ? "The two biggest barriers to winning this opportunity." : undefined}>
          {editing ? <textarea className={`${field} min-h-20 resize-y`} value={obstacle} onChange={(e) => { const next: [string, string] = [...draft.obstacles]; next[index] = e.target.value; update({ obstacles: next }); }} placeholder="Describe the obstacle" /> : <ReviewValue value={obstacle} />}
        </UiField>)}
      </div>
      <div className="mt-3">
        <SubHead title="Confirmed competitors" hint="Only competitors the customer or another reliable source has confirmed. Never assume." addLabel="Add a competitor" onAdd={editing ? openNewCompetitor : undefined} />
        {/* A TABLE, AND A SAVED ONE IS NOT EDITED IN PLACE (Anir, Sep 28:
            "confirm competitors should be in a proper table... I don't know
            why I'm able to change it. I shouldn't be able to change a
            confirmed competitor. I can just delete it and add a new one"). */}
        {draft.competitors.length > 0 ? <div className="overflow-hidden rounded-xl border border-border-light bg-white">
          <table className="w-full text-left">
            <thead><tr className="border-b border-border-light bg-surface/60 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              <th className="px-3 py-2 font-bold">Competitor</th><th className="px-3 py-2 font-bold">Where it is tracked</th>{editing && <th className="w-10 px-3 py-2" aria-label="Actions" />}
            </tr></thead>
            <tbody>{draft.competitors.filter((name) => name.trim()).map((competitor, index) => {
              const marketId = draft.competitorIds?.[competitor];
              return <tr key={`${competitor}-${index}`} className="border-b border-border-light last:border-b-0 transition-colors hover:bg-surface/50">
                <td className="px-3 py-2.5"><CompanyLink name={competitor} href={marketId ? `/market-intel/${marketId}` : null} src={competitorLogo(competitor)} logoClassName="h-6 w-6 shrink-0 text-[8px]" nameClassName="text-[12.5px] font-semibold text-text-primary" /></td>
                <td className="px-3 py-2.5 text-[12.5px] text-text-secondary">{marketId ? "Market Intel" : "Typed in for this review"}</td>
                {editing && <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => { const nextIds = { ...draft.competitorIds }; delete nextIds[competitor]; update({ competitors: draft.competitors.filter((value) => value !== competitor), competitorIds: nextIds }); }} aria-label={`Remove ${competitor}`} className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-[color:var(--status-red)]/10 hover:text-[color:var(--status-red)]"><Trash2 size={14} /></button></td>}
              </tr>;
            })}</tbody>
          </table>
        </div> : <EmptyBox onAdd={editing ? openNewCompetitor : undefined} addLabel="Add the first one.">No confirmed competitors yet.</EmptyBox>}
      </div>
    </FormRoom>

    <FormRoom icon={Users} title="People to influence" summary={peopleSummary}>
      {/* THE MEANINGS LIVE IN A BUBBLE (Anir, Sep 28: "this decision role
          section where you say what each one means, you have to tuck that in
          somewhere. I don't want it to show up. It should be like a question
          mark"). They are also on each option inside the picker, where the
          choice is actually made. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-2 text-[12px] text-text-secondary">The customer’s buying committee, as a map.<InfoHint text={PEOPLE_HINT} /></span><span className="flex items-center gap-1.5 text-[12px] text-text-secondary">What each decision role means<InfoHint text={ROLE_HINT} /></span></div>
      <div className="grid gap-2.5 grid-cols-[216px_repeat(3,minmax(0,1fr))]">
        <div />{FUNCTIONS.map((kind) => <div key={kind.key} className="flex items-center gap-1.5 px-1 pb-1 text-[12px] font-semibold text-text-primary"><kind.Icon size={14} className="text-blue-primary" aria-hidden="true" />{kind.label}</div>)}
        {SENIORITY.map((seniority) => <div key={seniority.key} className="contents">
          {/* ONE LINE, ALWAYS (Anir, Sep 28: "I don't like the way the C, VP
              and senior director look because it's on two lines"). The column
              is as wide as its longest label rather than wrapping it. */}
          <div className="flex items-center gap-2 self-stretch whitespace-nowrap rounded-xl border border-blue-subtle bg-white px-3 py-3 text-[12px] font-semibold text-text-primary"><seniority.Icon size={14} className="shrink-0 text-blue-primary" aria-hidden="true" />{seniority.label}</div>
          {FUNCTIONS.map((kind) => {
            const members = draft.people.filter((person) => person.seniority === seniority.key && person.function === kind.key);
            return <div key={`${seniority.key}-${kind.key}`} className="flex min-w-0 flex-col gap-2">
              {members.map((person) => {
                const role = roleMeta(person.role);
                const mood = sentimentMeta(person.sentiment);
                const body = <>
                  <Avatar name={person.name || "?"} className="mt-[1px] h-7 w-7 shrink-0 text-[9px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text-primary">{person.name || "Unnamed"}</span>
                    <span className="block truncate text-[11px] text-text-secondary">{person.title || "No title yet"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1">{role && <MetaChip meta={role} size="xs" />}{mood ? <MetaChip meta={mood} size="xs" /> : <span className="text-[10.5px] text-text-tertiary">Not said yet</span>}</span>
                  </span>
                </>;
                return <div key={person.id} className="group/person relative rounded-xl border border-border-light bg-white p-2.5 transition-colors hover:border-blue-subtle">
                  {editing
                    ? <button type="button" onClick={() => openPerson(person)} aria-label={`Edit ${person.name || "this person"}`} className="flex w-full min-w-0 cursor-pointer items-start gap-2 pr-5 text-left">{body}</button>
                    : <div className="flex min-w-0 items-start gap-2">{body}</div>}
                  {editing && <button type="button" onClick={() => update({ people: draft.people.filter((item) => item.id !== person.id) })} aria-label={`Take ${person.name || "this person"} off the map`} className="absolute right-1.5 top-1.5 cursor-pointer rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-[color:var(--status-red)]/10 hover:text-[color:var(--status-red)] focus-visible:opacity-100 group-hover/person:opacity-100"><Trash2 size={13} /></button>}
                </div>;
              })}
              {editing
                ? <button type="button" onClick={() => openNewPerson(seniority.key, kind.key)} className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-light bg-white text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:bg-blue-light/30 hover:text-blue-primary ${members.length ? "py-2" : "min-h-[92px] flex-1"}`}><Plus size={14} aria-hidden="true" /> Add person</button>
                : !members.length && <div className="flex min-h-[92px] flex-1 items-center justify-center rounded-xl border border-dashed border-border-light bg-white text-[12px] text-text-tertiary">No one here</div>}
            </div>;
          })}
        </div>)}
      </div>
      <div className="mt-4">
        <SubHead icon={UsersRound} title="Outside influence" hint="Organizations outside the customer that influence the same decision makers, such as a consultancy or independent advisor." addLabel="Add a third party" onAdd={editing ? openNewParty : undefined} />
        {/* A TABLE, AND ADDING ONE IS A POP-UP (Anir, Sep 28: "for the Add
            Third Party... I'm expecting it to be kind of like a table"). It
            used to add an empty row of bare inputs in place. */}
        {draft.thirdParties.length > 0 && <div className="overflow-hidden rounded-xl border border-border-light bg-white">
          <table className="w-full text-left">
            <thead><tr className="border-b border-border-light bg-surface/60 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              <th className="px-3 py-2 font-bold">Company</th><th className="px-3 py-2 font-bold">Role in the opportunity</th><th className="px-3 py-2 font-bold">How they feel</th>{editing && <th className="w-10 px-3 py-2" aria-label="Actions" />}
            </tr></thead>
            <tbody>{draft.thirdParties.map((party) => {
              const mood = sentimentMeta(party.sentiment);
              return <tr key={party.id} className="border-b border-border-light last:border-b-0 transition-colors hover:bg-surface/50">
                <td className="px-3 py-2.5">
                  {editing
                    ? <button type="button" onClick={() => openParty(party)} className="flex min-w-0 cursor-pointer items-center gap-2 text-left" aria-label={`Edit ${party.company || "this third party"}`}><CompanyLogo name={party.company || "?"} className="h-6 w-6 shrink-0 text-[8px]" /><span className="truncate text-[12.5px] font-semibold text-text-primary">{party.company || "Unnamed"}</span></button>
                    : <CompanyLink name={party.company} customerId={party.customerId} logoClassName="h-6 w-6 shrink-0 text-[8px]" nameClassName="text-[12.5px] font-semibold text-text-primary" />}
                </td>
                <td className="px-3 py-2.5 text-[12.5px] text-text-secondary">{party.role || "Not recorded"}</td>
                <td className="px-3 py-2.5">{mood ? <MetaChip meta={mood} size="xs" /> : <span className="text-[11.5px] text-text-tertiary">Not said yet</span>}</td>
                {editing && <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => update({ thirdParties: draft.thirdParties.filter((item) => item.id !== party.id) })} aria-label={`Remove ${party.company || "this third party"}`} className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-[color:var(--status-red)]/10 hover:text-[color:var(--status-red)]"><Trash2 size={14} /></button></td>}
              </tr>;
            })}</tbody>
          </table>
        </div>}
        {!draft.thirdParties.length && <EmptyBox onAdd={editing ? openNewParty : undefined} addLabel="Add the first one.">No third parties recorded yet.</EmptyBox>}
      </div>
    </FormRoom>

    <FormRoom icon={ListChecks} title="Agreed actions" summary={actionsSummary}>
      <div className="mb-3 flex items-center gap-2"><p className="text-[12px] text-text-secondary">Actions agreed during the review. Every action needs an owner and a deadline.</p>{editing && <button type="button" onClick={openNewAction} aria-label="Add an action" title="Add an action" className="ml-auto inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-opacity hover:opacity-90"><Plus size={15} strokeWidth={2.8} /></button>}</div>
      {draft.actions.length > 0 ? <div className="overflow-hidden rounded-xl border border-border-light bg-white">
        <table className="w-full text-left">
          <thead><tr className="border-b border-border-light bg-surface/60 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
            <th className="px-3 py-2 font-bold">Action</th><th className="px-3 py-2 font-bold">Owner</th><th className="px-3 py-2 font-bold">Deadline</th>{editing && <th className="w-10 px-3 py-2" aria-label="Actions" />}
          </tr></thead>
          <tbody>{draft.actions.map((action) => <tr key={action.id} className="border-b border-border-light last:border-b-0 transition-colors hover:bg-surface/50">
            <td className="px-3 py-2.5">
              {editing
                ? <button type="button" onClick={() => openAction(action)} aria-label={`Edit ${action.action || "this action"}`} className="cursor-pointer text-left text-[12.5px] font-semibold text-text-primary hover:text-blue-primary">{action.action || "Untitled action"}</button>
                : <span className="text-[12.5px] font-semibold text-text-primary">{action.action || "Untitled action"}</span>}
            </td>
            <td className="px-3 py-2.5">{action.owner ? <PersonLink name={action.owner} avatarClassName="h-6 w-6 shrink-0 text-[8px]" className="gap-2" nameClassName="text-[12.5px] text-text-secondary" /> : <span className="text-[12.5px] text-text-tertiary">Nobody yet</span>}</td>
            <td className="px-3 py-2.5 text-[12.5px] text-text-secondary tnum">{action.deadline ? formatDayLabel(action.deadline, "en-US") : "No date"}</td>
            {editing && <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => update({ actions: draft.actions.filter((item) => item.id !== action.id) })} aria-label={`Remove ${action.action || "this action"}`} className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-[color:var(--status-red)]/10 hover:text-[color:var(--status-red)]"><Trash2 size={14} /></button></td>}
          </tr>)}</tbody>
        </table>
      </div> : <EmptyBox onAdd={editing ? openNewAction : undefined} addLabel="Add the first one.">No actions agreed yet.</EmptyBox>}
    </FormRoom>
    {/* WHERE A PERSON IS ENTERED. One room, the same fields the map draws,
        and Save puts them in the square they belong to. */}
    {personDraft && <Modal open onClose={closePerson} title={personIsNew ? "Add someone to the map" : `Edit ${personDraft.name || "this person"}`} size="workflow" tall>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField label="Who" required hint="Pick one of this account’s contacts. If they are not recorded yet, type the name and choose Add new contact.">
            <RecordPicker choices={contactChoices} name={personDraft.name} id={personDraft.contactId}
              placeholder={contactChoices.length ? "Search this account’s contacts" : "Type their name"}
              emptyLabel={contactChoices.length ? "No contact by that name" : "This account has no contacts yet. Type a name to add one."}
              onPick={(choice) => { const contact = options?.contacts.find((item) => item.id === choice.id); patchDraftPerson({ name: choice.label, contactId: contact?.id, title: contact?.title || personDraft.title, linkedin: contact?.linkedin || personDraft.linkedin }); }}
              onCreate={(name) => patchDraftPerson({ name, contactId: undefined })} />
          </UiField>
          <UiField label="Title"><Input value={personDraft.title} onChange={(e) => patchDraftPerson({ title: e.target.value })} placeholder="Head of Regulatory Affairs" aria-label="Title" /></UiField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField label="Decision role" hint={ROLE_HINT}>
            <ColorSelect fill collapsible={false} inlineDescription value={personDraft.role} ariaLabel="Decision role" onChange={(value) => patchDraftPerson({ role: value })}
              options={[{ value: "", label: "Not set yet", color: "var(--ink-neutral)", icon: CircleHelp, description: "Decide later." }, ...ROLES.map((role) => ({ value: role.value, label: role.value, color: role.color, icon: role.icon, description: role.description }))]} />
          </UiField>
          <UiField label="How they feel about Freyr">
            <ColorSelect fill collapsible={false} inlineDescription value={personDraft.sentiment} ariaLabel="How they feel about Freyr" onChange={(value) => patchDraftPerson({ sentiment: value as OpportunityReviewPerson["sentiment"] })}
              options={[NOT_CHOSEN, ...SENTIMENTS.map((item) => ({ value: item.value, label: item.value, color: item.color, icon: item.icon, description: item.description }))]} />
          </UiField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField label="How senior they are" requirement="none" hint="The row of the map they sit in.">
            <ColorSelect fill collapsible={false} value={personDraft.seniority} ariaLabel="How senior they are" onChange={(value) => patchDraftPerson({ seniority: value as OpportunityReviewPerson["seniority"] })}
              options={SENIORITY.map((item) => ({ value: item.key, label: item.label, color: "var(--ink-blue)", icon: item.Icon }))} />
          </UiField>
          <UiField label="Part of the business" requirement="none" hint="The column of the map they sit in.">
            <ColorSelect fill collapsible={false} value={personDraft.function} ariaLabel="Part of the business" onChange={(value) => patchDraftPerson({ function: value as OpportunityReviewPerson["function"] })}
              options={FUNCTIONS.map((item) => ({ value: item.key, label: item.label, color: "var(--ink-teal-deep)", icon: item.Icon }))} />
          </UiField>
        </div>
        <UiField label="LinkedIn" hint="Optional. Filled in for you when the contact has one.">
          <Input value={personDraft.linkedin} onChange={(e) => patchDraftPerson({ linkedin: e.target.value })} placeholder="https://www.linkedin.com/in/…" aria-label="LinkedIn URL" />
        </UiField>
        {personError && <p role="alert" className="text-[12.5px] font-medium text-[color:var(--status-red)]">{personError}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
          <button type="button" onClick={closePerson} className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface">Cancel</button>
          <button type="button" onClick={savePerson} disabled={!personDraft.name.trim()} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><Check size={14} />{personIsNew ? "Add to the map" : "Save changes"}</button>
        </div>
      </div>
    </Modal>}

    {partyDraft && <Modal open onClose={closeParty} title={partyIsNew ? "Add a third party" : `Edit ${partyDraft.company || "this third party"}`} size="workflow" tall>
      <div className="space-y-4">
        <UiField label="Company" required hint="An organization outside the customer that influences the same decision, such as a consultancy or an independent advisor.">
          <RecordPicker choices={companyChoices} name={partyDraft.company} id={partyDraft.customerId} company placeholder="Search companies" emptyLabel="No company by that name. Type one to add it."
            onPick={(choice) => setPartyDraft((current) => current ? { ...current, company: choice.label, customerId: options?.companies.find((company) => company.id === choice.id)?.id } : current)}
            onCreate={(name) => setPartyDraft((current) => current ? { ...current, company: name, customerId: undefined } : current)} />
        </UiField>
        <UiField label="Role in the opportunity" hint="What they are doing here: running the evaluation, advising the board, writing the specification.">
          <Input value={partyDraft.role} onChange={(e) => setPartyDraft((current) => current ? { ...current, role: e.target.value } : current)} placeholder="Advising on vendor selection" aria-label="Role in the opportunity" />
        </UiField>
        <UiField label="How they feel about Freyr">
          <ColorSelect fill collapsible={false} inlineDescription value={partyDraft.sentiment} ariaLabel="How they feel about Freyr" onChange={(value) => setPartyDraft((current) => current ? { ...current, sentiment: value as typeof current.sentiment } : current)}
            options={[NOT_CHOSEN, ...SENTIMENTS.map((item) => ({ value: item.value, label: item.value, color: item.color, icon: item.icon, description: item.description }))]} />
        </UiField>
        {partyError && <p role="alert" className="text-[12.5px] font-medium text-[color:var(--status-red)]">{partyError}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
          <button type="button" onClick={closeParty} className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface">Cancel</button>
          <button type="button" onClick={saveParty} disabled={!partyDraft.company.trim()} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><Check size={14} />{partyIsNew ? "Add third party" : "Save changes"}</button>
        </div>
      </div>
    </Modal>}

    {competitorOpen && <Modal open onClose={() => setCompetitorOpen(false)} title="Add a confirmed competitor">
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-border-light bg-surface px-3 focus-within:border-blue-primary focus-within:shadow-input-focus">
          <Search size={16} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          <input
            autoFocus
            value={competitorQuery}
            onChange={(event) => setCompetitorQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !competitorQuery.trim()) return;
              event.preventDefault();
              const choice = exactCompetitor ?? matchingCompetitors[0];
              saveCompetitor(choice?.label ?? competitorQuery, choice?.id);
            }}
            placeholder="Search competitors…"
            aria-label="Search competitors"
            className="min-h-[42px] min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
        <div className="max-h-[min(360px,50vh)] space-y-0.5 overflow-y-auto" role="group" aria-label="Tracked competitors">
          {matchingCompetitors.map((competitor) => (
            <button key={competitor.id} type="button" onClick={() => saveCompetitor(competitor.label, competitor.id)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-blue-light focus-visible:bg-blue-light focus-visible:outline-none">
              <CompanyLogo name={competitor.label} src={competitor.logoSrc} className="h-6 w-6 shrink-0 text-[8px]" />
              <span className="min-w-0 flex-1 truncate">{competitor.label}</span>
              <Plus size={15} className="shrink-0 text-blue-primary" aria-hidden="true" />
            </button>
          ))}
          {competitorQuery.trim().length > 1 && !exactCompetitor && (
            <button type="button" onClick={() => saveCompetitor(competitorQuery)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-blue-primary transition-colors hover:bg-blue-light focus-visible:bg-blue-light focus-visible:outline-none">
              <Plus size={15} aria-hidden="true" /> Add “{competitorQuery.trim()}”
            </button>
          )}
          {matchingCompetitors.length === 0 && !competitorQuery.trim() && (
            <p className="px-2.5 py-3 text-[12px] text-text-tertiary">All tracked competitors have been added.</p>
          )}
          {matchingCompetitors.length === 0 && competitorQuery.trim().length === 1 && (
            <p className="px-2.5 py-3 text-[12px] text-text-tertiary">Keep typing to add a new competitor.</p>
          )}
        </div>
        <p className="text-[11.5px] text-text-tertiary">Only add competitors confirmed by the customer or another reliable source.</p>
      </div>
    </Modal>}

    {actionDraft && <Modal open onClose={closeAction} title={actionIsNew ? "Add an agreed action" : "Edit this action"} size="workflow" tall>
      <div className="space-y-4">
        <UiField label="What was agreed" required>
          <Input value={actionDraft.action} onChange={(e) => setActionDraft((current) => current ? { ...current, action: e.target.value } : current)} placeholder="Send the revised scope to the customer" aria-label="What was agreed" />
        </UiField>
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField label="Owner" required hint="The teammate who will do it.">
            <RecordPicker choices={teammateChoices} name={actionDraft.owner} id={actionDraft.ownerId} placeholder="Search teammates" emptyLabel="No teammate by that name"
              onPick={(choice) => setActionDraft((current) => current ? { ...current, owner: choice.label, ownerId: options?.teammates.find((teammate) => teammate.id === choice.id)?.id } : current)} />
          </UiField>
          <UiField label="Deadline" required>
            <DateField value={actionDraft.deadline} onChange={(value) => setActionDraft((current) => current ? { ...current, deadline: value } : current)} ariaLabel="Action deadline" />
          </UiField>
        </div>
        {actionError && <p role="alert" className="text-[12.5px] font-medium text-[color:var(--status-red)]">{actionError}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
          <button type="button" onClick={closeAction} className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface">Cancel</button>
          <button type="button" onClick={saveAction} disabled={!actionDraft.action.trim() || !actionDraft.owner.trim() || !actionDraft.deadline} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><Check size={14} />{actionIsNew ? "Add action" : "Save changes"}</button>
        </div>
      </div>
    </Modal>}

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
