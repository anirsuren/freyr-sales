"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import type { Opportunity } from "@/lib/opportunitiesShared";

/**
 * A CONTRACT, MADE WHERE THE DEAL IS.
 *
 * Anir, Aug 31: "why are you fucking taking me to the page? ... I can add it
 * from the edit page, or I can add it by actually going to that tab and then
 * adding it. Both ways have to be there... Pretty simple, just a pop-up, and I
 * can obviously create new ones there."
 *
 * So this is a dialog and nothing else — no route, no page, no losing what you
 * were doing. It is opened from the deal's Contracts tab AND from the Contracts
 * section inside Edit deal, and it behaves identically from both, because they
 * are the same component opened by the same state.
 *
 * WHY A FORM OF ITS OWN. The full contract form lives inside ContractsModule,
 * welded to that page's state across four hundred lines. What a deal needs is
 * the half of it that identifies the contract; the money schedule and the
 * delivery hand-off belong on the contract's own page, where there is room for
 * them. This creates a real contract through the same endpoint and leaves the
 * rest to be filled in there.
 */

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] font-semibold text-text-primary">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export function NewContractDialog({
  deal,
  onClose,
  onCreated,
}: {
  deal: Opportunity;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(deal.name ?? "");
  const [value, setValue] = useState(String(deal.value ?? ""));
  const [status, setStatus] = useState("Draft");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [owner, setOwner] = useState(deal.owner ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) {
      setError("Give the contract a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          contract: {
            name: name.trim(),
            customer: deal.customer,
            ...(deal.customerId ? { customerId: deal.customerId } : {}),
            /* The whole point of making it here: it arrives already attached
               to this deal, which is the link the Contracts tab reads. */
            opportunityId: deal.id,
            opportunityName: deal.name,
            value: Math.round(Number(value.replace(/[^0-9.]/g, "")) || 0),
            status,
            ...(start ? { startDate: start } : {}),
            ...(end ? { endDate: end } : {}),
            ...(owner.trim() ? { owner: owner.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            schedule: [],
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        setError(data?.error || "That did not save.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onCreated();
      onClose();
    } catch {
      setError("That did not save.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New contract" size="wide">
      <div className="space-y-4">
        <Field label="What is the contract called?">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder={deal.name}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Value">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              className={INPUT}
              placeholder="180000"
            />
          </Field>
          <Field label="Status">
            <ColorSelect
              value={status}
              onChange={setStatus}
              ariaLabel="Contract status"
              minWidth={190}
              options={[
                { value: "Draft", label: "Draft", color: "#64748B" },
                {
                  value: "Ready for delivery",
                  label: "Ready for delivery",
                  color: "#0071E3",
                },
                { value: "Signed", label: "Signed", color: "#1A7A35" },
                { value: "Cancelled", label: "Cancelled", color: "#B42318" },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Ends">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Owner">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className={INPUT}
            placeholder="Nobody yet"
          />
        </Field>

        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            placeholder="Anything worth saying about this contract."
          />
        </Field>

        {/* It is FOR this deal, and says so rather than making you trust that
            it worked out which one. */}
        <p className="rounded-lg border border-border-light bg-surface/60 px-3 py-2.5 text-[12.5px] text-text-secondary">
          Created against <b>{deal.name}</b> for <b>{deal.customer}</b>, so it
          lands on this deal&apos;s Contracts tab.
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="min-w-0 text-[12.5px] text-error">{error}</span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={create}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} strokeWidth={2.4} />
              )}
              {busy ? "Creating…" : "Create the contract"}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
