"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FormRoom } from "@/components/ui/FormRoom";
import { Field, Input } from "@/components/ui/Input";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MultiPicker } from "@/components/ui/MultiPicker";
import { MEETING_TYPES, type Meeting } from "@/lib/meetings";
import { meetingTypeMeta } from "@/components/meetings/meetingTypeMeta";
import type {
  ContactOption,
  CustomerOption,
  OpportunityOption,
} from "@/components/meetings/MeetingsModule";

/**
 * PLANNING A MEETING (Suren, Aug 28): "when I click on the new meeting they
 * say that what is this meeting about and against what... when is the meeting
 * date... you can also provide the contacts who are going to be part of that
 * particular meeting and you can also provide the people who are going to
 * attend from our side, from Freyr side."
 *
 * Three rooms rather than one long form, the same shape the contract and deal
 * forms use: what and when, who is in the room, and what it hangs off.
 *
 * ONE FORM DOES BOTH JOBS. Suren, Aug 28: "the only thing is you need to allow
 * people to edit. It's not there" — and then, on the first attempt at it: "no
 * no, the edit should be like offering". Offerings edits a material by
 * reopening the form that made it, prefilled, behind a pencil, with a Save at
 * the bottom. Not a mode that turns a read page into a grid of live inputs
 * writing on every keystroke.
 *
 * So `meeting` decides which job this is. Passing one prefills every field and
 * turns the footer into "Save changes"; leaving it out is a blank new meeting.
 * Create and edit cannot drift apart, because they are the same form.
 */
export function NewMeetingDialog({
  meName,
  members,
  customers,
  contacts,
  opportunities,
  meeting,
  onClose,
  onCreate,
}: {
  meName: string;
  members: string[];
  customers: CustomerOption[];
  contacts: ContactOption[];
  opportunities: OpportunityOption[];
  /** Prefill and save back onto this meeting instead of creating one. */
  meeting?: Meeting;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const editing = !!meeting;
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [type, setType] = useState<string>(
    meeting ? String(meeting.type) : MEETING_TYPES[0]
  );
  const [meetingAt, setMeetingAt] = useState(meeting?.meetingAt ?? "");
  const [customerId, setCustomerId] = useState(
    meeting?.customerId ??
      customers.find((c) => c.name === meeting?.customer)?.id ??
      ""
  );
  const [contactIds, setContactIds] = useState<string[]>(
    meeting?.contactIds ?? []
  );
  const [attendees, setAttendees] = useState<string[]>(
    meeting?.attendees ?? [meName]
  );
  const [presenters, setPresenters] = useState<string[]>(
    meeting?.presenters ?? []
  );
  const [owner, setOwner] = useState(meeting?.owner ?? meName);
  const [opportunityIds, setOpportunityIds] = useState<string[]>(
    meeting?.opportunityIds ?? []
  );
  const [busy, setBusy] = useState(false);

  const customer = customers.find((c) => c.id === customerId);

  /* Only this account's people and deals: a meeting with GSK has no use for
     Takeda's contacts, and a picker holding every contact in the book is a
     picker nobody can find anything in. */
  const theirContacts = useMemo(
    () => contacts.filter((c) => !customerId || c.customerId === customerId),
    [contacts, customerId]
  );
  const theirDeals = useMemo(
    () => opportunities.filter((o) => !customerId || o.customerId === customerId),
    [opportunities, customerId]
  );

  const ready = title.trim() && customerId && meetingAt;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit meeting" : "New meeting"}
      /* THE BIG STANDARD SIZE, the one every other workflow dialog uses
         (Anir, Aug 28: "make the popup a standard size, the bigger size").
         At 640px the three rooms squeezed two-up fields into half-columns;
         980px is what Solutioning's new-request dialog runs at, so a form of
         this weight now opens at the size the app already established for
         forms of this weight. */
      size="workflow"
    >
      {/* THE DIALOG HOLDS ITS SIZE (Anir, Aug 28: "again, but these pop-ups,
          bro. Stop. the dimensions have to stay the same" — and on the accrual
          dialog before it: "why is the pop-up so small? It looks bad, but once
          I pick a deal, it looks good. Keep the size").

          Four collapsible rooms mean the form's natural height changes every
          time one is opened, so the whole dialog grew and shrank under the
          cursor and, with all of them open, ran off the bottom of the screen.
          A fixed working height with the rooms scrolling inside it: opening a
          room fills space that was already there instead of taking more. */}
      <div className="h-[min(64vh,560px)] space-y-3 overflow-y-auto pr-1">
        <FormRoom icon={CalendarDays} title="The meeting" defaultOpen summary={title || "Not named yet"}>
          <Field label="What is this meeting about">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Initial meeting with GSK regulatory affairs"
            />
          </Field>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type of meeting">
              <ColorSelect
                value={type}
                ariaLabel="Type of meeting"
                collapsible={false}
                dense
                className="w-full"
                onChange={setType}
                /* Colour AND icon per type, the standing chip rule (Anir,
                   Aug 28: "why all the same"). */
                options={MEETING_TYPES.map((t) => ({
                  value: t,
                  label: t,
                  color: meetingTypeMeta(t).color,
                  icon: meetingTypeMeta(t).icon,
                }))}
              />
            </Field>
            <Field label="When is it">
              <Input
                type="date"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
              />
            </Field>
          </div>
        </FormRoom>

        <FormRoom
          icon={Building2}
          title="Who it is with"
          summary={customer ? customer.name : "No account picked"}
        >
          <Field label="Customer">
            <ColorSelect
              value={customerId}
              ariaLabel="Customer"
              collapsible={false}
              dense
              searchable
              inlineDescription
              className="w-full"
              onChange={(v) => {
                setCustomerId(v);
                /* Their people and their deals both change with the account,
                   so a leftover pick from the previous one is never carried
                   into a meeting it does not belong to. */
                setContactIds([]);
                setOpportunityIds([]);
              }}
              /* SAY WHAT IS BEHIND EACH ONE BEFORE IT IS PICKED (Suren,
                 Aug 28: "if I click on a company and I want to see how many
                 deals before even clicking, so do that there and everywhere
                 else this could be helpful where the next step is dependent
                 on the first dropdown having data").
                 
                 The two pickers under this one are filtered BY this choice,
                 so picking an account with no contacts and no deals leads to
                 two empty boxes and no explanation. The count belongs on the
                 row that causes it. */
              options={customers.map((c) => {
                const deals = opportunities.filter(
                  (o) => o.customerId === c.id
                ).length;
                const people = contacts.filter(
                  (x) => x.customerId === c.id
                ).length;
                const parts = [
                  deals ? `${deals} ${deals === 1 ? "deal" : "deals"}` : null,
                  people
                    ? `${people} ${people === 1 ? "contact" : "contacts"}`
                    : null,
                ].filter(Boolean);
                return {
                  value: c.id,
                  label: c.name,
                  logoName: c.name,
                  color: "#0071E3",
                  description: parts.length ? parts.join(" · ") : "nothing yet",
                  descriptionAccent: parts.length > 0,
                };
              })}
            />
          </Field>
          <div className="mt-3">
            <Field label="Their people in the room">
              {theirContacts.length === 0 ? (
                <p className="text-[12.5px] text-text-secondary">
                  {customerId
                    ? "Nobody is on file at this account yet. Add contacts on the customer page."
                    : "Pick the account first."}
                </p>
              ) : (
                <MultiPicker
                  variant="dropdown"
                  options={theirContacts.map((c) => ({
                    id: c.id,
                    label: c.name,
                    sub: c.title,
                    avatarName: c.name,
                  }))}
                  selected={contactIds}
                  onToggle={(id) =>
                    setContactIds((cur) =>
                      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                    )
                  }
                  placeholder="Pick their attendees…"
                  emptyLabel="Nobody on file."
                />
              )}
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Which deals this is against">
              {theirDeals.length === 0 ? (
                <p className="text-[12.5px] text-text-secondary">
                  {customerId
                    ? "No open deals on this account. The meeting can still stand on its own."
                    : "Pick the account first."}
                </p>
              ) : (
                <MultiPicker
                  variant="dropdown"
                  options={theirDeals.map((o) => ({
                    id: o.id,
                    label: o.label,
                    sub: o.customer,
                    logoName: o.customer,
                  }))}
                  selected={opportunityIds}
                  onToggle={(id) =>
                    setOpportunityIds((cur) =>
                      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                    )
                  }
                  placeholder="Pick the deals…"
                  emptyLabel="No deals."
                />
              )}
            </Field>
          </div>
        </FormRoom>

        <FormRoom
          icon={Users}
          title="Our side"
          summary={
            presenters.length
              ? `${presenters.length} presenting`
              : `${attendees.length} attending`
          }
        >
          {/* WHO RAN IT IS ITS OWN QUESTION.
              Suren, Aug 28: "there is something called meeting owner: who was
              running the meeting?" It defaults to you, because usually you are
              booking your own meeting — but somebody booking on a director's
              behalf should not have to hand the meeting over afterwards. */}
          <Field label="Ran the meeting">
            <ColorSelect
              value={owner}
              ariaLabel="Who ran the meeting"
              collapsible={false}
              dense
              className="w-full"
              onChange={setOwner}
              options={[...new Set([meName, ...members])]
                .filter(Boolean)
                .map((n) => ({ value: n, label: n, avatarName: n }))}
            />
          </Field>
          {/* "who is the primary presenter of the meeting" */}
          <div className="mt-3">
          <Field label="Presenting">
            <MultiPicker
              variant="dropdown"
              options={members.map((m) => ({ id: m, label: m, avatarName: m }))}
              selected={presenters}
              onToggle={(id) =>
                setPresenters((cur) =>
                  cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                )
              }
              placeholder="Who is presenting…"
              emptyLabel="Nobody in the directory yet."
            />
          </Field>
          </div>
          <div className="mt-3">
            <Field label="Also attending from Freyr">
              <MultiPicker
                variant="dropdown"
                options={members.map((m) => ({ id: m, label: m, avatarName: m }))}
                selected={attendees}
                onToggle={(id) =>
                  setAttendees((cur) =>
                    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                  )
                }
                placeholder="Who else is going…"
                emptyLabel="Nobody in the directory yet."
              />
            </Field>
          </div>
        </FormRoom>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={async () => {
            if (!ready) return;
            setBusy(true);
            try {
              await onCreate({
                title,
                type,
                meetingAt,
                customerId,
                customer: customer?.name ?? "",
                contactIds,
                contactNames: contactIds
                  .map((id) => contacts.find((c) => c.id === id)?.name)
                  .filter(Boolean),
                opportunityIds,
                opportunityLabels: opportunityIds
                  .map((id) => opportunities.find((o) => o.id === id)?.label)
                  .filter(Boolean),
                attendees,
                presenters,
                owner,
              });
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create meeting"}
        </button>
      </div>
    </Modal>
  );
}
