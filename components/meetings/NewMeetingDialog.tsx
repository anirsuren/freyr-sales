"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, CircleDashed, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FormRoom } from "@/components/ui/FormRoom";
import { Field, Input } from "@/components/ui/Input";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";
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
  const { toast } = useToast();
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
  /**
   * PEOPLE WHO ARE NOT ON FILE (Anir, Aug 31: "the head of RA might bring in a
   * couple of members from his team into the meeting").
   *
   * The picker only offered contacts already recorded on the account, so the
   * most ordinary case — somebody brings two colleagues you have never met —
   * had no answer but "go and create two contact records first", and on an
   * account with nobody on file the field was a dead end entirely.
   *
   * These are guests on THIS meeting, not contacts on the account: the person
   * who came once should not quietly become a permanent contact record nobody
   * chose to create. They ride along in contactNames, which is where the
   * meeting already keeps the names it displays.
   */
  /** Contacts created from inside this dialog, appended to the picker. */
  const [addedContacts, setAddedContacts] = useState<
    { id: string; name: string; title?: string }[]
  >([]);
  const [addingContact, setAddingContact] = useState(false);

  /**
   * ADD THE PERSON WITHOUT LEAVING (Anir, Aug 31: "instead of making the user
   * go back to Contacts, add a contact, and then come back here to add a
   * meeting, there should be a quicker way to add it directly").
   *
   * The name goes to the account as a real contact, so the person is on file
   * for next time rather than being a label that only this meeting remembers.
   * Everything else about them — title, email, LinkedIn — can be filled in on
   * the customer page later; a name is the only thing the endpoint requires,
   * and the only thing somebody has to hand mid-meeting.
   */
  async function addContact(name: string) {
    if (!customerId || addingContact) return;
    setAddingContact(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.contact?.id) {
        toast(data?.error || "Could not add that contact.", "error");
        return;
      }
      const c = data.contact;
      setAddedContacts((cur) => [
        ...cur,
        { id: c.id, name: c.full_name ?? name, title: c.job_title ?? undefined },
      ]);
      setContactIds((cur) => [...cur, c.id]);
      toast(`${c.full_name ?? name} added to this account.`);
    } catch {
      toast("Could not add that contact.", "error");
    } finally {
      setAddingContact(false);
    }
  }

  const [guestNames, setGuestNames] = useState<string[]>(() => {
    const known = new Set(
      (meeting?.contactIds ?? [])
        .map((id) => contacts.find((c) => c.id === id)?.name)
        .filter(Boolean) as string[]
    );
    return (meeting?.contactNames ?? []).filter((n) => !known.has(n));
  });
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
        {/* EDITING OPENS EVERYTHING (found in the browser, Aug 28: with the
            rooms collapsed the dialog held 200px of white under three closed
            strips). Creating is a sequence — you fill the first room, then the
            next — so one room open is right. Editing is not: you came to change
            one specific thing and you do not know which room it lives in, so
            closing them makes you hunt, and the fixed height turns the hunt
            into dead space. */}
        <FormRoom
          icon={CalendarDays}
          title="The meeting"
          defaultOpen
          summary={title || "Not named yet"}
        >
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
          defaultOpen={editing}
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
              options={[
                /* A PICKER WITH NOTHING CHOSEN MUST NOT NAME A COMPANY.
                   ColorSelect falls back to options[0] when the value matches
                   nothing, so an untouched customer field displayed "CuraTeQ"
                   — first alphabetically — while Create stayed disabled and
                   the contacts list underneath said "pick the account first".
                   Found in the browser, Aug 28, opening the form for the first
                   time. Every other picker in the app that can start empty
                   carries this row; this one did not. */
                ...(customerId
                  ? []
                  : [
                      {
                        value: "",
                        label: "Pick the account",
                        color: "#64748B",
                        icon: CircleDashed,
                      },
                    ]),
                ...customers.map((c) => {
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
                }),
              ]}
            />
          </Field>
          <div className="mt-3">
            <Field label="Their people in the room">
              {!customerId ? (
                <p className="text-[12.5px] text-text-secondary">
                  Pick the account first.
                </p>
              ) : (
                <>
                  <MultiPicker
                    variant="dropdown"
                    options={[
                      ...[...theirContacts, ...addedContacts].map((c) => ({
                        id: c.id,
                        label: c.name,
                        sub: c.title,
                        avatarName: c.name,
                      })),
                      /* Guests sit in the same list so the field reads as one
                         set of people, not contacts-plus-an-afterthought. */
                      ...guestNames.map((n) => ({
                        id: `guest:${n}`,
                        label: n,
                        sub: "Not on file",
                        avatarName: n,
                      })),
                    ]}
                    selected={[
                      ...contactIds,
                      ...guestNames.map((n) => `guest:${n}`),
                    ]}
                    onToggle={(id) => {
                      if (id.startsWith("guest:")) {
                        const name = id.slice(6);
                        setGuestNames((cur) => cur.filter((n) => n !== name));
                        return;
                      }
                      setContactIds((cur) =>
                        cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                      );
                    }}
                    onCreate={(name) => void addContact(name)}
                    placeholder="Pick or type their attendees…"
                    
                    emptyLabel="Nobody on file yet — type a name to add them."
                  />
                  {theirContacts.length === 0 && (
                    <p className="mt-1 text-[11.5px] text-text-tertiary">
                      Nobody is on file at this account. Type a name to add them
                      to this meeting.
                    </p>
                  )}
                </>
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
          defaultOpen={editing}
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
                contactNames: [
                  ...contactIds
                    .map((id) => contacts.find((c) => c.id === id)?.name)
                    .filter(Boolean),
                  ...guestNames,
                ],
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
