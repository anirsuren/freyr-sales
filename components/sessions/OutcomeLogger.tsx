"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { Interaction } from "@/lib/types";

const OUTCOMES = [
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not Interested" },
  { key: "in_progress", label: "In Progress" },
  { key: "no_response", label: "No Response" },
  { key: "meeting_booked", label: "Meeting Booked" },
];

export function OutcomeLogger({
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
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [interactions, setInteractions] =
    useState<Interaction[]>(initialInteractions);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function save() {
    if (!outcome) {
      setError("Select an outcome first.");
      return;
    }
    setError("");
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
      if (data?.interaction) {
        setInteractions([data.interaction, ...interactions]);
      }
      setOutcome("");
      setNotes("");
      setFollowUp("");
      toast("Outcome logged");
    } catch {
      setError("Failed to save. Try again.");
      toast("Failed to save outcome", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-[17px] font-semibold text-text-primary mb-4">
        Log Interaction
      </h2>

      <div className="bg-white border border-border-light rounded-lg p-6 shadow-card">
        <div className="flex flex-wrap gap-2 mb-4">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => setOutcome(o.key)}
              className={cn(
                "text-[13px] font-medium px-4 py-2 rounded-full border transition-colors",
                outcome === o.key
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <span className="block text-[13px] font-medium text-text-primary mb-1.5">
            Notes
          </span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened on this interaction?"
            className="min-h-[100px]"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="block text-[13px] font-medium text-text-primary mb-1.5">
              Follow-up date
            </span>
            <Input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="w-auto"
            />
          </div>
          <Button onClick={save} loading={saving}>
            Save Outcome
          </Button>
          {error && <span className="text-[13px] text-error">{error}</span>}
        </div>
      </div>

      <h3 className="text-[15px] font-semibold text-text-primary mt-8 mb-3">
        Previous Interactions
      </h3>
      <InteractionTimeline interactions={interactions} />
    </div>
  );
}
