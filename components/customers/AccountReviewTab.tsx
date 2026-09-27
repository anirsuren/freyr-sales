"use client";
import { DateField } from "@/components/ui/DateField";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Copy, Plus, Trash2 } from "lucide-react";
import type { AccountReviewContent, AccountReviewRecord } from "@/lib/accountReviews";
import { formatDayLabel } from "@/lib/utils";

const emptyReview = (): AccountReviewContent => ({
  attendees: "", accountStatus: "", progress: "", relationships: "", opportunities: "",
  risks: "", strategy: "", nextSteps: [],
});
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const field = "w-full rounded-xl border border-border-light bg-white px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10";

function ReviewField({ title, value, onChange, hint }: { title: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="block rounded-2xl border border-border-light bg-white p-5"><span className="text-[12px] font-semibold text-text-primary">{title}</span>{hint && <span className="mt-1 block text-[11.5px] text-text-secondary">{hint}</span>}<textarea className={`${field} mt-3 min-h-24 resize-y`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ReadField({ title, value }: { title: string; value: string }) {
  return <section className="rounded-2xl border border-border-light bg-white p-5"><h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-secondary">{title}</h4><p className={`mt-3 whitespace-pre-wrap text-[13.5px] leading-6 ${value ? "text-text-primary" : "text-text-tertiary"}`}>{value || "Not recorded in this review."}</p></section>;
}

export function AccountReviewTab({ customerId, initialReviews, mayEdit }: { customerId: string; initialReviews: AccountReviewRecord[]; mayEdit: boolean }) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copiedFromId, setCopiedFromId] = useState<string | undefined>();
  const [reviewedOn, setReviewedOn] = useState(localDay);
  const [draft, setDraft] = useState<AccountReviewContent>(emptyReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setReviews(initialReviews);
    setSelectedId(null);
    setEditing(false);
    setError("");
  }, [customerId, initialReviews]);
  const selected = reviews.find((item) => item.id === selectedId) ?? reviews[reviews.length - 1];
  const update = (patch: Partial<AccountReviewContent>) => setDraft((current) => ({ ...current, ...patch }));

  function start(copy?: AccountReviewRecord) {
    setCopiedFromId(copy?.id);
    setDraft(copy ? { ...structuredClone(copy.content), nextSteps: copy.content.nextSteps.map((step) => ({ ...step, id: crypto.randomUUID() })) } : emptyReview());
    setReviewedOn(localDay());
    setError("");
    setEditing(true);
  }

  async function save() {
    if (!reviewedOn) { setError("Choose the review date."); return; }
    if (![draft.accountStatus, draft.progress, draft.relationships, draft.opportunities, draft.risks, draft.strategy].some((value) => value.trim()) && !draft.nextSteps.length) {
      setError("Record the discussion or an agreed next step before saving."); return;
    }
    if (draft.nextSteps.some((step) => !step.action.trim() || !step.owner.trim() || !step.deadline)) {
      setError("Every agreed action needs a description, owner and deadline."); return;
    }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedOn, copiedFromId, content: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That review didn't save.");
      const next = data.review as AccountReviewRecord;
      setReviews((current) => [...current, next]);
      setSelectedId(next.id);
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That review didn't save.");
    } finally { setSaving(false); }
  }

  return <div className="space-y-5 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[19px] font-semibold text-text-primary">Account reviews</h2><p className="mt-1 text-[12.5px] text-text-secondary">Save each account discussion as a dated record. Copy the last one to plan the next move.</p></div>{mayEdit && !editing && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => start()} className="inline-flex items-center gap-2 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Plus size={14} /> New review</button>{selected && <button type="button" onClick={() => start(selected)} className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary"><Copy size={14} /> Copy into new review</button>}</div>}</div>
    {!editing && reviews.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved account reviews">{[...reviews].reverse().map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id} className={`rounded-xl border px-3 py-2 text-left text-[12.5px] ${selected?.id === item.id ? "border-blue-primary bg-blue-light text-blue-primary" : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"}`}><span className="block font-semibold">{formatDayLabel(item.reviewedOn, "en-US")}</span><span className="text-[11px]">{item.recordedBy || "Saved review"}</span></button>)}</div>}
    {!editing && !selected && <div className="rounded-2xl border border-dashed border-border-light bg-white p-8 text-center text-[13px] text-text-secondary">No account reviews yet.</div>}
    {!editing && selected && <div className="space-y-5"><div className="flex items-center gap-2 text-[13px] text-text-secondary"><CalendarDays size={15} /> Reviewed {formatDayLabel(selected.reviewedOn, "en-US")}{selected.recordedBy && ` · Saved by ${selected.recordedBy}`}</div><ReadField title="People in the discussion" value={selected.content.attendees} /><div className="grid gap-4 lg:grid-cols-2"><ReadField title="Account status" value={selected.content.accountStatus} /><ReadField title="Progress since last review" value={selected.content.progress} /><ReadField title="Key relationships" value={selected.content.relationships} /><ReadField title="Opportunities in the account" value={selected.content.opportunities} /><ReadField title="Risks and blockers" value={selected.content.risks} /><ReadField title="Account strategy" value={selected.content.strategy} /></div><section className="rounded-2xl border border-border-light bg-white p-5"><h3 className="text-[14px] font-semibold text-text-primary">Agreed next steps</h3>{selected.content.nextSteps.length ? <div className="mt-3 divide-y divide-border-light">{selected.content.nextSteps.map((step) => <div key={step.id} className="py-3 text-[13px]"><strong className="text-text-primary">{step.action}</strong><p className="mt-1 text-text-secondary">{step.owner} · {formatDayLabel(step.deadline, "en-US")}</p></div>)}</div> : <p className="mt-3 text-[13px] text-text-tertiary">No actions recorded.</p>}</section></div>}
    {editing && <div className="space-y-4"><div className="rounded-2xl border border-blue-subtle bg-blue-light/40 p-5"><label className="block max-w-[240px]"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Review date</span><DateField className={field} value={reviewedOn} onChange={(event) => setReviewedOn(event)} /></label><p className="mt-3 text-[12px] text-text-secondary">{copiedFromId ? "Copied from an earlier review. Saving creates a new record and preserves the original." : "A new account review. Saving will preserve this discussion for the next review."}</p></div><ReviewField title="People in the discussion" value={draft.attendees} onChange={(value) => update({ attendees: value })} hint="Who joined this review?" /><div className="grid gap-4 lg:grid-cols-2"><ReviewField title="Account status" value={draft.accountStatus} onChange={(value) => update({ accountStatus: value })} hint="Where does the relationship stand today?" /><ReviewField title="Progress since last review" value={draft.progress} onChange={(value) => update({ progress: value })} hint="What worked, and what did not?" /><ReviewField title="Key relationships" value={draft.relationships} onChange={(value) => update({ relationships: value })} /><ReviewField title="Opportunities in the account" value={draft.opportunities} onChange={(value) => update({ opportunities: value })} /><ReviewField title="Risks and blockers" value={draft.risks} onChange={(value) => update({ risks: value })} /><ReviewField title="Account strategy" value={draft.strategy} onChange={(value) => update({ strategy: value })} /></div><section className="rounded-2xl border border-border-light bg-white p-5"><h3 className="text-[14px] font-semibold text-text-primary">Agreed next steps</h3><div className="mt-3 space-y-3">{draft.nextSteps.map((step) => <div key={step.id} className="grid gap-2 rounded-xl border border-border-light p-3 sm:grid-cols-[minmax(0,1fr)_180px_170px_auto]"><input className={field} aria-label="Agreed action" placeholder="Action" value={step.action} onChange={(event) => update({ nextSteps: draft.nextSteps.map((item) => item.id === step.id ? { ...item, action: event.target.value } : item) })} /><input className={field} aria-label="Action owner" placeholder="Owner" value={step.owner} onChange={(event) => update({ nextSteps: draft.nextSteps.map((item) => item.id === step.id ? { ...item, owner: event.target.value } : item) })} /><DateField className={field} ariaLabel="Action deadline" value={step.deadline} onChange={(event) => update({ nextSteps: draft.nextSteps.map((item) => item.id === step.id ? { ...item, deadline: event } : item) })} /><button type="button" aria-label="Remove action" onClick={() => update({ nextSteps: draft.nextSteps.filter((item) => item.id !== step.id) })} className="px-2 text-text-tertiary hover:text-red-600"><Trash2 size={16} /></button></div>)}<button type="button" onClick={() => update({ nextSteps: [...draft.nextSteps, { id: crypto.randomUUID(), action: "", owner: "", deadline: "" }] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary"><Plus size={15} /> Add action</button></div></section><div data-agent-dock-clearance className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-blue-subtle bg-canvas/95 px-4 py-3 shadow-[0_-2px_18px_-6px_rgba(16,22,30,0.22)] backdrop-blur">{error && <p role="alert" className="text-[12.5px] font-medium text-red-600">{error}</p>}<div className="ml-auto flex gap-2"><button type="button" onClick={() => { setEditing(false); setError(""); }} disabled={saving} className="rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-primary px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"><Check size={14} />{saving ? "Saving…" : "Save review"}</button></div></div></div>}
  </div>;
}
