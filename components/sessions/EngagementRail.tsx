"use client";

import { useState } from "react";
import { Send, Sparkles, Plus, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/InfoHint";
import { OUTCOME_META, formatDateTime, cn } from "@/lib/utils";
import type { Interaction } from "@/lib/types";

const DISPOSITIONS = [
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "interested", label: "Interested" },
  { value: "in_progress", label: "In Progress" },
  { value: "no_response", label: "No Response" },
  { value: "not_interested", label: "Not Interested" },
];

export function EngagementRail({
  sessionId,
  customerId,
  contactId,
  initialInteractions,
}: {
  sessionId: string;
  customerId: string;
  contactId: string;
  initialInteractions: Interaction[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [interactions, setInteractions] =
    useState<Interaction[]>(initialInteractions);

  async function log() {
    if (!outcome) {
      toast("Pick an outcome first", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          contact_id: contactId,
          outcome,
          notes,
          follow_up_date: followUp || null,
        }),
      });
      const data = await res.json();
      if (data?.interaction) setInteractions([data.interaction, ...interactions]);
      setOutcome("");
      setNotes("");
      setFollowUp("");
      setOpen(false);
      toast("Interaction logged");
    } catch {
      toast("Failed to log interaction", "error");
    } finally {
      setSaving(false);
    }
  }

  const labelCls =
    "block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5";
  const fieldCls =
    "w-full bg-white border border-border rounded-lg p-2 text-[14px] text-text-primary outline-none focus:border-blue-primary focus:shadow-focus transition";

  return (
    <section className="hidden lg:flex w-[300px] shrink-0 bg-white border-l border-border-light overflow-y-auto flex-col">
      <div className="p-4 border-b border-border-light">
        <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
          Engagement
          <InfoHint text="The timeline of every touch with this contact — calls, emails, meetings. The full history is below; log a new one only when something actually happens." />
        </h2>
      </div>

      {/* Logging is opt-in — not every visit records an outcome, so the form
          stays tucked behind one button and the timeline leads (Suren). */}
      <div className="p-4 border-b border-border-light">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border text-[13px] font-semibold text-text-primary hover:bg-surface transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Plus size={15} strokeWidth={2} className="text-blue-primary" />
            Log an interaction
          </span>
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={cn(
              "text-text-tertiary transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls}>Outcome</label>
              <select
                className={fieldCls}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Select outcome…</option>
                {DISPOSITIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Next step</label>
              <input
                type="date"
                className={fieldCls}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                rows={3}
                className={`${fieldCls} resize-none`}
                placeholder="Discussed EMA Module 3 concerns…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              onClick={log}
              disabled={saving}
              className="w-full bg-text-primary text-white py-2.5 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send size={16} strokeWidth={1.75} />
              {saving ? "Logging…" : "Log Interaction"}
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-4">
          History
        </h3>
        <div className="relative pl-6 space-y-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border-light">
          <div className="relative">
            <span className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-blue-primary ring-4 ring-white flex items-center justify-center" />
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-blue-primary flex items-center gap-1">
              <Sparkles size={12} strokeWidth={2} /> Generated
            </p>
            <p className="text-[14px] font-semibold text-text-primary">
              Pitch materials created
            </p>
            <p className="text-[13px] text-text-secondary">
              Matched against the Freyr knowledge base
            </p>
          </div>
          {interactions.map((it) => {
            const m = OUTCOME_META[it.outcome];
            return (
              <div key={it.id} className="relative">
                <span className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-text-tertiary ring-4 ring-white" />
                <p className="text-[11px] uppercase tracking-[0.04em] text-text-tertiary tnum">
                  {formatDateTime(it.created_at)}
                </p>
                <p className="text-[14px] font-medium text-text-primary">
                  {m?.label || it.outcome}
                </p>
                {it.notes && (
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    {it.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
