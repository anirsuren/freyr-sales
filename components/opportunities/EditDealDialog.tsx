"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Plus, Save } from "lucide-react";
import Link from "next/link";
import type { Customer360Band } from "@/components/customers/Customer360";
import { NewContractDialog } from "./NewContractDialog";
import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";
import { NewMeetingDialog } from "@/components/meetings/NewMeetingDialog";
import { FormSection } from "@/components/ui/FormSection";
import { Briefcase, CalendarDays, FileSignature, Presentation as PresentationIcon, Send, Users } from "lucide-react";
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

/** Each area gets its own tile, the way every offerings section does. */
const BAND_ICON: Record<string, typeof Briefcase> = {
  contracts: FileSignature,
  submissions: Send,
  presentations: PresentationIcon,
  meetings: CalendarDays,
  solutionRequests: Briefcase,
  meetingRequests: Users,
};

/** What each section is for, in one line, because the offerings cards carry
 *  a hint and a bare title next to a count reads as a stat, not a place. */
const BAND_HINT: Record<string, string> = {
  contracts: "Signed paper and the revenue schedule behind it.",
  submissions: "Proposals and RFP responses sent to this customer.",
  presentations: "Decks built and shown for this deal.",
  meetings: "Calls and visits held on it.",
  solutionRequests: "Work asked of the solutioning team.",
  meetingRequests: "Meetings asked of the solutioning team.",
};

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

export function EditDealDialog({
  asPage = false,
  deal,
  bands = [],
  createOptions = null,
  onAdd,
  onClose,
  onCreated,
  onSave,
}: {
  /**
   * RENDER AS A PAGE, NOT A DIALOG.
   *
   * Anir, Sep 1: "the edit deal is actually not supposed to be a pop-up...
   * it should be like the offerings page. Whatever you have is fine. We look
   * at the offerings pages, just copy that, and then, if I want to create a
   * new contract, etc., within the edit deal, then it can be a pop-up."
   *
   * So the hierarchy inverts. Editing a deal is a place you go, with room for
   * six sections; creating a contract inside it is the interruption, and an
   * interruption is what a modal is FOR. The dialog form is kept because the
   * customer screen still opens it inline.
   */
  asPage?: boolean;
  deal: Opportunity;
  /** Everything hanging off this deal, so each area is a section you can open
   *  and add to without leaving the screen. */
  bands?: Customer360Band[];
  /** What the solutioning form needs. Null hides those pages rather than
   *  opening one that cannot save. */
  createOptions?: {
    customers: { id: string; name: string }[];
    opportunities: {
      id: string;
      label: string;
      customer: string;
      customerId: string | null;
    }[];
    members: string[];
    /** Customer-side people, for the meeting form's attendee picker. */
    contacts: { id: string; name: string; customerId: string | null; title: string }[];
    meName: string;
  } | null;
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

  /**
   * WHICH SECTIONS ARE OPEN, HELD HERE RATHER THAN BY THE BROWSER.
   *
   * Anir, Aug 31: "when I click on Add, Create New Presentation, and then I go
   * back, it just disappears, like whatever I was on, so that's kind of
   * annoying."
   *
   * The folds were plain <details>, which own their own open/closed state. The
   * create form replaces this whole block while it is showing, so every one of
   * them was destroyed on the way in and rebuilt closed on the way out — you
   * came back to six shut strips and had to find your place again. Holding it
   * up here means the sections outlive the form, so Back returns you to the
   * page you left, with the thing you just made sitting in it.
   */
  const [open, setOpen] = useState<Set<string>>(new Set());
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

  /* The eleven deal fields, written once and shown in whichever shell
     is asking for them. */
  const fields = (
        <div className="space-y-4">
          <Field label="What is this deal called?">
            <input
              autoFocus
              value={name}
              maxLength={200}
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
              /* Stored as nextSteps, which lib/opportunities trims to 600.
                 Paste a couple of paragraphs about a call and the tail went
                 without a word. */
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              placeholder="Whatever needs saying about this deal."
            />
          </Field>
        </div>
  );

  /* THE THING BEING CREATED, WHICHEVER SHELL WE ARE IN. On a page it is a
     modal on top; inside the dialog it is the dialog's second page. */
  const creating =
    adding === "meetings" && createOptions ? (
      <NewMeetingDialog
        chromeless={!asPage}
        onBack={asPage ? undefined : () => setAdding(null)}
        meName={createOptions.meName}
        members={createOptions.members}
        customers={createOptions.customers}
        contacts={createOptions.contacts}
        opportunities={createOptions.opportunities}
        prefillOpportunityId={deal.id}
        /* THE ACCOUNT COMES WITH THE DEAL.
           Found in the loop, Sep 1: on the GSK deal, "Who it is with" read
           "No account picked" and Create meeting stayed disabled even with a
           title and a date filled in — because `customerId` is required and
           nothing supplied it.

           The prop existed and the OLD dialog branch below passed it; the page
           branch, written later, did not. Two call sites, one of them wrong,
           and the wrong one is the one the Edit deal PAGE renders. */
        prefillCustomerName={deal.customer}
        onClose={() => setAdding(null)}
        onCreate={async (input) => {
          const res = await fetch("/api/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "create", ...input }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.error) return false;
          setAdding(null);
          onCreated?.();
          return true;
        }}
      />
    ) : adding === "contracts" ? (
      <NewContractDialog
        chromeless={!asPage}
        deal={deal}
        onBack={asPage ? undefined : () => setAdding(null)}
        onClose={() => setAdding(null)}
        onCreated={() => {
          setAdding(null);
          onCreated?.();
        }}
      />
    ) : adding && createOptions ? (
      <NewRequestDialog
        chromeless={!asPage}
        onBack={asPage ? undefined : () => setAdding(null)}
        room={
          adding === "submissions"
            ? "submissions"
            : adding === "presentations"
              ? "presentations"
              : "requests"
        }
        customers={createOptions.customers}
        opportunities={createOptions.opportunities}
        members={createOptions.members}
        prefillCustomerId={deal.customerId ?? null}
        prefillOpportunityId={deal.id}
        prefillCompany={deal.customer}
        prefillLead={null}
        onClose={() => setAdding(null)}
        onCreate={async (input) => {
          const type =
            adding === "submissions"
              ? "submission"
              : adding === "presentations"
                ? "presentation"
                : "request";
          const res = await fetch("/api/solutioning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "create", type, ...input }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.request) return false;
          setAdding(null);
          onCreated?.();
          return true;
        }}
      />
    ) : null;

  /* One list, one way of drawing it, so the page and the dialog cannot end up
     showing different things in their sections. */
  const bandBody = (b: (typeof bands)[number]) => {
    const one = b.label.replace(/s$/, "").toLowerCase();
    const start = () => {
      setOpen((cur) => new Set(cur).add(b.key));
      if (b.key === "meetings" && !createOptions) {
        onAdd?.(b.key);
        return;
      }
      setAdding(b.key);
    };
    const canAdd = b.key === "meetings" ? !!createOptions || !!onAdd : true;
    return { one, start, canAdd };
  };

  /**
   * THE PAGE (Anir, Sep 1: "it should be like the offerings page... just copy
   * that, and then, if I want to create a new contract, etc., within the edit
   * deal, then it can be a pop-up").
   *
   * Same section card the offerings editor uses, imported rather than
   * imitated. Creating something is a modal ON this page, which is the one
   * place a modal belongs: it interrupts, you finish it, you are back where
   * you were with the section still open.
   */
  if (asPage) {
    return (
      <div className="pb-6">
        <div className="space-y-4">
          <FormSection
            icon={Briefcase}
            title="Deal details"
            hint="What this deal is, what it is worth, and when it is expected to sign."
            defaultOpen
          >
            {fields}
          </FormSection>

          {bands.map((b) => {
            const { one, start, canAdd } = bandBody(b);
            return (
              <FormSection
                key={b.key}
                icon={BAND_ICON[b.key] ?? Briefcase}
                title={b.label}
                hint={BAND_HINT[b.key] ?? `Everything on this deal's ${b.label.toLowerCase()}.`}
                count={b.count}
                alwaysShowAction
                action={
                  canAdd ? (
                    <button
                      type="button"
                      onClick={start}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <Plus size={13} strokeWidth={2.4} />
                      Create new {one}
                    </button>
                  ) : undefined
                }
              >
                {b.items.length > 0 ? (
                  <ul className="space-y-1.5">
                    {b.items.map((it) => (
                      <li key={it.id}>
                        <Link
                          href={it.href ?? "#"}
                          className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-border-light transition-colors hover:ring-blue-subtle"
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
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
                    <p className="text-[12.5px] text-text-secondary">{b.empty}</p>
                    {canAdd && (
                      <button
                        type="button"
                        onClick={start}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        <Plus size={14} strokeWidth={2.4} />
                        Create new {one}
                      </button>
                    )}
                  </div>
                )}
              </FormSection>
            );
          })}
        </div>

        {/* SAVE STAYS REACHABLE, AND STAYS PART OF THE PAGE.
            Six open sections are taller than the window, so the bar has to
            follow you down. It was `fixed` to the WINDOW, which centred it on
            the window rather than on the content and ran the strip in behind
            the sidebar — so the buttons sat off to the right of the cards they
            belong to and the whole thing read as floating debris (Anir, Sep 1:
            "I don't know why the Save Changes button looks like that. It's in
            a weird spot... I like how it's sticky, but it just looks a little
            odd").

            Sticky inside the content column instead: same width as the cards,
            same left and right edges, and it lifts off the page as a card of
            its own rather than a full-bleed rule across the app. */}
        <div className="sticky bottom-4 z-30 mt-4 rounded-2xl border border-border-light bg-white/95 px-5 py-3 shadow-[0_6px_24px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
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

        {/* The pop-up he DID ask for: creating a thing, on top of the page. */}
        {adding && creating && (
          <Modal
            open
            onClose={() => setAdding(null)}
            title={
              adding === "meetings"
                ? "New meeting"
                : adding === "contracts"
                  ? "New contract"
                  : adding === "submissions"
                    ? "New submission"
                    : adding === "presentations"
                      ? "New presentation"
                      : "New request"
            }
            size="workflow"
          >
            {creating}
          </Modal>
        )}
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      /* THE FRAME DOES NOT MOVE (Anir, Aug 31: "stop changing the dimensions
         whenever I click on them. It has to stay the same").
         `tall` pins the height, so a short page and a long page occupy the
         same box and the content scrolls inside it. Without it the dialog was
         sized by whatever page was showing, and every Add and Back resized and
         re-centred the whole thing under the cursor. */
      tall
      /* A FIXED height, not a floor. `tall` alone still let a short page
         shrink the box — the contract page came in 19px shorter and 10px
         further down the screen, which is exactly the jump he is describing.
         An explicit height means every page occupies the same rectangle and
         the content scrolls inside it. */
      dialogClassName="h-[min(820px,calc(100vh-2rem))]"
      title={
        adding === "meetings"
          ? "New meeting"
          : adding === "contracts"
          ? "New contract"
          : adding === "submissions"
            ? "New submission"
            : adding === "presentations"
              ? "New presentation"
              : adding
                ? "New request"
                : `Edit ${deal.name}`
      }
      size="workflow"
    >
      {adding ? (
        /* A PAGE OF THIS DIALOG, NOT A SECOND ONE. Same frame, same width, a
           back arrow where the fields were — so it reads as going deeper into
           the deal rather than as a new thing landing on top of it. */
        <div className="flex min-h-full flex-col">
          {adding === "meetings" && createOptions ? (
            /* THE LAST ONE THAT HANDED YOU OFF (Anir, Aug 31: "Why is there
               nothing for meetings?"). Every other band opened a page of this
               dialog; Meetings alone bounced to the Meetings module, because
               its form was welded to that page's data. It takes the same
               prefills and the same back arrow as the rest now. */
            <NewMeetingDialog
              chromeless
              onBack={() => setAdding(null)}
              meName={createOptions.meName}
              members={createOptions.members}
              customers={createOptions.customers}
              contacts={createOptions.contacts}
              opportunities={createOptions.opportunities}
              prefillOpportunityId={deal.id}
              prefillCustomerName={deal.customer}
              onClose={() => setAdding(null)}
              onCreate={async (input) => {
                const res = await fetch("/api/meetings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ op: "create", ...input }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data?.error) return false;
                setAdding(null);
                onCreated?.();
                return true;
              }}
            />
          ) : adding === "contracts" ? (
            <NewContractDialog
              chromeless
              deal={deal}
              onBack={() => setAdding(null)}
              onClose={() => setAdding(null)}
              onCreated={() => {
                setAdding(null);
                onCreated?.();
              }}
            />
          ) : createOptions ? (
            <NewRequestDialog
              chromeless
              onBack={() => setAdding(null)}
              room={
                adding === "submissions"
                  ? "submissions"
                  : adding === "presentations"
                    ? "presentations"
                    : "requests"
              }
              customers={createOptions.customers}
              opportunities={createOptions.opportunities}
              members={createOptions.members}
              prefillCustomerId={deal.customerId ?? null}
              prefillOpportunityId={deal.id}
              prefillCompany={deal.customer}
              prefillLead={null}
              onClose={() => setAdding(null)}
              onCreate={async (input) => {
                const type =
                  adding === "submissions"
                    ? "submission"
                    : adding === "presentations"
                      ? "presentation"
                      : "request";
                const res = await fetch("/api/solutioning", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ op: "create", type, ...input }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.request) return false;
                setAdding(null);
                onCreated?.();
                return true;
              }}
            />
          ) : null}
        </div>
      ) : (
      /* A FIXED FLOOR, so the frame does not jump when the error line
          appears or a picker opens under a field. */
      <div className="flex min-h-full flex-col">
        {fields}

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
            {bands.map((b) => {
              /* One word for one thing: the band labels are plural because
                 they are counts, and you are making a single one. */
              const one = b.label.replace(/s$/, "").toLowerCase();
              const start = () => {
                /* Opening the form marks the band open, so coming back from it
                   lands you on the section you left rather than on a wall of
                   closed strips (Anir, Aug 31: "when I click on Add, Create
                   New Presentation, and then I go back, it just disappears,
                   like whatever I was on"). */
                setOpen((cur) => new Set(cur).add(b.key));
                if (b.key === "meetings" && !createOptions) {
                  /* No create options means this person may not make one here;
                     the old hand-off to the Meetings page is the fallback. */
                  onAdd?.(b.key);
                  return;
                }
                setAdding(b.key);
              };
              const canAdd =
                b.key === "meetings" ? !!createOptions || !!onAdd : true;
              const isOpen = open.has(b.key);
              return (
              <details
                key={b.key}
                open={isOpen}
                className="group rounded-xl border border-border-light bg-white"
              >
                <summary
                  /* preventDefault so the browser's own toggle never runs:
                     with `open` driven from state, letting both fight leaves
                     the strip and the state disagreeing after a re-render. */
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen((cur) => {
                      const next = new Set(cur);
                      if (next.has(b.key)) next.delete(b.key);
                      else next.add(b.key);
                      return next;
                    });
                  }}
                  className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden"
                >
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
                  {/* QUICK ADD, WITHOUT OPENING THE SECTION (Anir, Aug 31:
                      "maybe also have a blue square with the white plus on it
                      for each of those sections so I can quickly create one
                      just like that"). Someone who already knows they want a
                      new submission should not have to unfold a list of the
                      ones that exist to find the way to make one.

                      preventDefault, because this button lives inside the
                      summary and a click there would otherwise toggle the
                      fold underneath it. */}
                  {canAdd && (
                    <button
                      type="button"
                      aria-label={`Create new ${one}`}
                      title={`Create new ${one}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        start();
                      }}
                      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-primary text-white transition-opacity hover:opacity-90"
                    >
                      <Plus size={13} strokeWidth={2.6} />
                    </button>
                  )}
                </summary>
                <div className="border-t border-border-light px-4 py-3">
                  {b.items.length > 0 ? (
                    <>
                      <ul className="space-y-1.5">
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
                      {/* With a list above it the button is a footer action,
                          left-aligned under the rows it adds to. */}
                      {canAdd && (
                        <button
                          type="button"
                          onClick={start}
                          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
                        >
                          <Plus size={13} strokeWidth={2.4} />
                          Create new {one}
                        </button>
                      )}
                    </>
                  ) : (
                    /* EMPTY IS A STATE, NOT A LEFTOVER (Anir, Aug 31:
                        "Shouldn't that be centered, like the text that says
                        'No submissions on this deal yet' and then the
                        button?"). Nothing to align to on the left when there
                        is nothing there, so the sentence and the one thing you
                        can do about it sit together in the middle. */
                    <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
                      <p className="text-[12.5px] text-text-secondary">{b.empty}</p>
                      {canAdd && (
                        <button
                          type="button"
                          onClick={start}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          <Plus size={13} strokeWidth={2.4} />
                          Create new {one}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </details>
              );
            })}
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
