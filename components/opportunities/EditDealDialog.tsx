"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, Plus, Save } from "lucide-react";
import Link from "next/link";
import type { Customer360Band } from "@/components/customers/Customer360";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  DEAL_TYPES,
  OPPORTUNITY_LEVELS,
  OPPORTUNITY_STATUSES,
  REVENUE_TYPES,
  type Opportunity,
} from "@/lib/opportunitiesShared";

/**
 * THE WHOLE DEAL, ON ONE SCREEN, AS CONTROLS.
 *
 * Anir, Aug 31: "saying i can edit this doesnt help me at all... if i can edit
 * it show me the fucking button."
 *
 * Every fact on this page was already editable — you had to hover the exact
 * line to find out, because the pencil was drawn at opacity zero until then.
 * So the page told you that you could edit it and then showed you nothing to
 * press. A badge is not an affordance.
 *
 * This is the button's destination: every field the deal has, at once, as real
 * inputs. It also answers the other half of what he asked for — "only if you
 * give me edit screen I can give you lot of details" — because you cannot say
 * which fields are missing while you are looking at ten read-only lines.
 *
 * ONE SAVE, NOT ELEVEN. The inline fields each post their own key on purpose,
 * so two people editing different facts never clobber each other. A form is a
 * different promise: you looked at all of it together, so it posts what you
 * changed together. Only touched keys go, so the merge still leaves everything
 * else alone.
 */

/* Each type gets its own colour, by the standing rule that a category chip is
   never plain grey. Deliberately none of red/amber/green: those mean health
   here, and a renewal is not a warning. */
const DEAL_TONE: Record<string, string> = {
  "New business": "#0071E3",
  "Existing business": "#0F766E",
  Renewal: "#7C3AED",
};

const LEVEL_TONE: Record<string, string> = {
  "Go get": "#0F766E",
  "High confidence": "#0071E3",
  Pipeline: "#7C3AED",
  Future: "#B4318F",
};

/** Digits only, and empty stays empty: a blank ACV means nobody has said it
 *  yet, which is not the same claim as zero. */
function num(v: string): number | null {
  const t = v.replace(/[^0-9.]/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] font-semibold text-text-primary">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-text-secondary">{hint}</span>
        )}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

export function EditDealDialog({
  deal,
  bands = [],
  onAdd,
  onClose,
  onCreated,
  onSave,
}: {
  deal: Opportunity;
  /** Everything hanging off this deal, so each area is a section you can open
   *  and add to without leaving the screen. */
  bands?: Customer360Band[];
  /** Start a new record in that area. The parent owns the dialog, because a
   *  modal opened inside a modal is a trap with two close buttons. */
  onAdd?: (bandKey: string) => void;
  onClose: () => void;
  /** Called after something is created from inside here, so the page behind
   *  can refresh its counts. */
  onCreated?: () => void;
  /** Returns null on success, or a message to show. */
  onSave: (patch: Record<string, unknown>) => Promise<string | null>;
}) {
  const [name, setName] = useState(deal.name ?? "");
  const [level, setLevel] = useState<string>(deal.level ?? "Pipeline");
  const [status, setStatus] = useState<string>(deal.status ?? "");
  const [revenueType, setRevenueType] = useState<string>(deal.revenueType ?? "");
  const [dealType, setDealType] = useState<string>(deal.dealType ?? "");
  const [value, setValue] = useState(
    deal.value === undefined ? "" : String(deal.value)
  );
  const [acv, setAcv] = useState(
    deal.estimatedAcv === undefined ? "" : String(deal.estimatedAcv)
  );
  const [tcv, setTcv] = useState(
    deal.estimatedTcv === undefined ? "" : String(deal.estimatedTcv)
  );
  const [confidence, setConfidence] = useState(
    deal.confidence === undefined ? "" : String(deal.confidence)
  );
  const [signs, setSigns] = useState(deal.estSignDate ?? "");
  const [owner, setOwner] = useState(deal.owner ?? "");
  const [note, setNote] = useState(deal.nextSteps ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * THE SECOND PAGE OF THIS DIALOG.
   *
   * Anir, Aug 31: "If I need to create a contract, I should be able to just
   * click the button, and it opens up to create a contract... it's like
   * another pop-up page, but then I can press the back arrow to go back... I
   * need to be able to create the thing here, not just add existing ones."
   *
   * So Add does not send you somewhere else and lose the deal you were
   * editing. The dialog turns into the form for the thing you are adding, with
   * a back arrow to the deal — one frame, two pages, and the deal is still
   * open behind you when you return.
   */
  const [adding, setAdding] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cValue, setCValue] = useState("");
  const [cStatus, setCStatus] = useState("Draft");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cOwner, setCOwner] = useState("");
  const [cNote, setCNote] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  function resetContract() {
    setCName(`${deal.name}`);
    setCValue(String(deal.value ?? ""));
    setCStatus("Draft");
    setCStart("");
    setCEnd("");
    setCOwner(deal.owner ?? "");
    setCNote("");
    setCError(null);
  }

  async function createContract() {
    if (!cName.trim()) {
      setCError("Give the contract a name.");
      return;
    }
    setCBusy(true);
    setCError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          contract: {
            name: cName.trim(),
            customer: deal.customer,
            ...(deal.customerId ? { customerId: deal.customerId } : {}),
            /* The whole point of creating it from here: it arrives already
               attached to this deal, which is the link the Contracts tab
               reads. */
            opportunityId: deal.id,
            opportunityName: deal.name,
            value: Math.round(Number(cValue.replace(/[^0-9.]/g, "")) || 0),
            status: cStatus,
            ...(cStart ? { startDate: cStart } : {}),
            ...(cEnd ? { endDate: cEnd } : {}),
            ...(cOwner.trim() ? { owner: cOwner.trim() } : {}),
            ...(cNote.trim() ? { note: cNote.trim() } : {}),
            schedule: [],
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        setCError(data?.error || "That did not save.");
        setCBusy(false);
        return;
      }
      setCBusy(false);
      setAdding(null);
      onCreated?.();
    } catch {
      setCError("That did not save.");
      setCBusy(false);
    }
  }

  const canSave = name.trim().length > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    /* Only what actually moved. Sending every key would overwrite a field a
       colleague changed while this dialog was open, which is the exact thing
       the per-field saves were built to avoid. */
    const patch: Record<string, unknown> = {};
    const put = (key: string, next: unknown, before: unknown) => {
      if (JSON.stringify(next) !== JSON.stringify(before)) patch[key] = next;
    };
    put("name", name.trim(), deal.name ?? "");
    put("level", level, deal.level ?? "");
    put("status", status, deal.status ?? "");
    put("revenueType", revenueType, deal.revenueType ?? "");
    put("dealType", dealType, deal.dealType ?? "");
    put("value", num(value) ?? 0, deal.value ?? 0);
    put("estimatedAcv", num(acv), deal.estimatedAcv ?? null);
    put("estimatedTcv", num(tcv), deal.estimatedTcv ?? null);
    put("confidence", num(confidence), deal.confidence ?? null);
    put("estSignDate", signs, deal.estSignDate ?? "");
    put("owner", owner.trim(), deal.owner ?? "");
    put("nextSteps", note.trim(), deal.nextSteps ?? "");

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const message = await onSave(patch);
    if (message) {
      setError(message);
      setSaving(false);
      return;
    }
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={adding === "contracts" ? "New contract" : `Edit ${deal.name}`}
      size="workflow"
    >
      {adding === "contracts" ? (
        /* PAGE TWO. The back arrow is the whole promise: nothing you typed on
           the deal is lost, because the deal form is still mounted behind
           this one. */
        <div className="flex min-h-[420px] flex-col">
          <button
            type="button"
            onClick={() => setAdding(null)}
            className="mb-4 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            Back to {deal.name}
          </button>

          <div className="space-y-4">
            <Field label="What is the contract called?">
              <input
                autoFocus
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className={INPUT}
                placeholder={deal.name}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Value">
                <input
                  value={cValue}
                  onChange={(e) => setCValue(e.target.value)}
                  inputMode="numeric"
                  className={INPUT}
                  placeholder="180000"
                />
              </Field>
              <Field label="Status">
                <ColorSelect
                  value={cStatus}
                  onChange={setCStatus}
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
              <Field label="Owner">
                <input
                  value={cOwner}
                  onChange={(e) => setCOwner(e.target.value)}
                  className={INPUT}
                  placeholder="Nobody yet"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  type="date"
                  value={cStart}
                  onChange={(e) => setCStart(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="date"
                  value={cEnd}
                  onChange={(e) => setCEnd(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
            <Field label="Note">
              <textarea
                value={cNote}
                onChange={(e) => setCNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                placeholder="Anything worth saying about this contract."
              />
            </Field>
            {/* It is FOR this deal, and says so rather than making you trust
                that it worked out which one. */}
            <p className="rounded-lg border border-border-light bg-surface/60 px-3 py-2.5 text-[12.5px] text-text-secondary">
              This contract is created against <b>{deal.name}</b> for{" "}
              <b>{deal.customer}</b>, so it lands on this deal&apos;s Contracts
              tab.
            </p>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="min-w-0 text-[12.5px] text-error">{cError}</span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(null)}
                className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cBusy || !cName.trim()}
                onClick={createContract}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} strokeWidth={2.4} />
                )}
                {cBusy ? "Creating…" : "Create the contract"}
              </button>
            </span>
          </div>
        </div>
      ) : (
      /* A FIXED FLOOR, so the frame does not jump when the error line
          appears or a picker opens under a field. */
      <div className="flex min-h-[420px] flex-col">
        <div className="space-y-4">
          <Field label="What is this deal called?">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="GRI — Fortrea"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {/* WHERE THE MONEY COMES FROM, first of the four, because it is
                the one Suren said was missing outright. */}
            <Field label="Type of opportunity">
              <ColorSelect
                value={dealType}
                onChange={setDealType}
                ariaLabel="Type of opportunity"
                minWidth={190}
                options={[
                  { value: "", label: "Not set", color: "#0071E3" },
                  ...DEAL_TYPES.map((d) => ({
                    value: d,
                    label: d,
                    color: DEAL_TONE[d],
                  })),
                ]}
              />
            </Field>
            <Field label="Level">
              <ColorSelect
                value={level}
                onChange={setLevel}
                ariaLabel="Level"
                minWidth={180}
                options={OPPORTUNITY_LEVELS.map((l) => ({
                  value: l,
                  label: l,
                  color: LEVEL_TONE[l] ?? "#7C3AED",
                }))}
              />
            </Field>
            <Field label="Status">
              <ColorSelect
                value={status}
                onChange={setStatus}
                ariaLabel="Status"
                minWidth={180}
                options={[
                  { value: "", label: "Not set", color: "#0071E3" },
                  ...OPPORTUNITY_STATUSES.map((s) => ({
                    value: s,
                    label: s,
                    color: "#0071E3",
                  })),
                ]}
              />
            </Field>
            <Field label="Revenue type">
              <ColorSelect
                value={revenueType}
                onChange={setRevenueType}
                ariaLabel="Revenue type"
                minWidth={180}
                options={[
                  { value: "", label: "Not set", color: "#0071E3" },
                  ...REVENUE_TYPES.map((r) => ({
                    value: r,
                    label: r,
                    color: r === "ARR" ? "#0F766E" : "#B4318F",
                  })),
                ]}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Value">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="numeric"
                className={INPUT}
                placeholder="50000"
              />
            </Field>
            {/* BOTH START EMPTY AND STAY EMPTY UNTIL SOMEBODY SAYS THEM. A
                zero here is a claim that the deal is worth nothing; blank is
                the truth, which is that it has not been entered. */}
            <Field label="Estimated ACV">
              <input
                value={acv}
                onChange={(e) => setAcv(e.target.value)}
                inputMode="numeric"
                className={INPUT}
                placeholder="one year of it"
              />
            </Field>
            <Field label="Estimated TCV">
              <input
                value={tcv}
                onChange={(e) => setTcv(e.target.value)}
                inputMode="numeric"
                className={INPUT}
                placeholder="the whole signed number"
              />
            </Field>
            <Field label="Confidence" hint="%">
              <input
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                inputMode="numeric"
                className={INPUT}
                placeholder="50"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Expected to sign">
              <input
                type="date"
                value={signs}
                onChange={(e) => setSigns(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Owner">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className={INPUT}
                placeholder="Nobody yet"
              />
            </Field>
          </div>

          <Field label="Note from the sheet">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              placeholder="Whatever needs saying about this deal."
            />
          </Field>
        </div>

        {/* EVERYTHING ELSE ON THE DEAL, SECTION BY SECTION.
            Anir, Aug 31: "kind of like the edit offering screen, where you
            have it separated into sections... overview, contracts,
            submissions, presentations, etc. Each section, you can obviously
            close them or open them" — and then, plainly: "where the fuck can
            I add shit?"

            The answer used to be nowhere. This dialog edited eleven fields
            and stopped, and the tabs behind it could show you a deal had no
            presentations without offering any way to make one. Each area is
            a fold now: what is in it, and the button that adds to it. */}
        {bands.length > 0 && (
          <div className="mt-6 space-y-1.5 border-t border-border-light pt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              What is on this deal
            </p>
            {bands.map((b) => (
              <details key={b.key} className="group rounded-xl border border-border-light bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    size={14}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180"
                  />
                  <span className="flex-1 text-[13.5px] font-semibold text-text-primary">
                    {b.label}
                  </span>
                  <span
                    className="tnum rounded-full px-2 py-0.5 text-[11.5px] font-bold"
                    style={{ background: `${b.color}14`, color: b.color }}
                  >
                    {b.count}
                  </span>
                </summary>
                <div className="border-t border-border-light px-4 py-3">
                  {b.items.length > 0 ? (
                    <ul className="mb-3 space-y-1.5">
                      {b.items.slice(0, 6).map((it) => (
                        <li key={it.id}>
                          <Link
                            href={it.href ?? "#"}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-medium text-text-primary">
                                {it.title}
                              </span>
                              {it.sub && (
                                <span className="block truncate text-[11px] text-text-tertiary">
                                  {it.sub}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {b.items.length > 6 && (
                        <li className="px-2 text-[11.5px] text-text-tertiary">
                          and {b.items.length - 6} more
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mb-3 text-[12.5px] text-text-secondary">{b.empty}</p>
                  )}
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => {
                        if (b.key === "contracts") {
                          resetContract();
                          setAdding("contracts");
                          return;
                        }
                        onAdd(b.key);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
                    >
                      <Plus size={13} strokeWidth={2.4} />
                      Add to {b.label.toLowerCase()}
                    </button>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
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
              disabled={!canSave}
              onClick={submit}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} strokeWidth={2.4} />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </span>
        </div>
      </div>
      )}
    </Modal>
  );
}
