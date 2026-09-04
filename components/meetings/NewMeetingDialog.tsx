"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, CircleDashed, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DocumentDrop, landedDocs, type StagedDoc } from "@/components/ui/DocumentDrop";
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
  chromeless = false,
  onBack,
  prefillOpportunityId,
  prefillCustomerName,
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
  /** Rendered as a page of the deal's Edit dialog rather than as its own
   *  window: same frame, same size, back arrow instead of a second close. */
  chromeless?: boolean;
  onBack?: () => void;
  /** Opened from a deal, so it arrives already attached to that deal — the
   *  link the deal's Meetings tab reads. */
  prefillOpportunityId?: string;
  /** The deal's own account. Deals imported from the pipeline sheet carry a
   *  customer NAME and no customer id, so this is the only handle on it. */
  prefillCustomerName?: string;
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
      /* Opened from a deal: that deal's account is the answer, so it starts
         chosen rather than making you find it in a list of sixty. */
      (prefillCustomerName
        ? (customers.find(
            (c) =>
              c.name.trim().toLowerCase() === prefillCustomerName.trim().toLowerCase()
          )?.id ?? `name:${prefillCustomerName}`)
        : "")
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
    meeting?.opportunityIds ?? (prefillOpportunityId ? [prefillOpportunityId] : [])
  );
  /* ALL OF THEM NEED ATTACHMENTS (Anir, Aug 31). A meeting has always had a
     `docs` field and an upload endpoint; what it did not have was any way to
     reach either from the form that makes one, so the brief you were holding
     could only be attached after the fact, from a different screen. */
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * THE DEAL'S OWN ACCOUNT IS ALWAYS PICKABLE.
   *
   * Found testing, Aug 31: opening this from the BMS deal and searching the
   * account picker for "BMS" returned "Nothing matches that", so Create
   * meeting stayed disabled and no meeting could be made from that deal at
   * all — nor from any of the hundred others, because deals imported from the
   * pipeline sheet carry a customer NAME and no id, and this picker only ever
   * listed rows from the customers table.
   *
   * A deal naming its customer IS the account for this purpose. It is offered
   * under a `name:` id, and the save sends the name rather than a made-up
   * customer id, so nothing here invents a customer record.
   */
  const NAME_ID = "name:";
  const pickableCustomers = useMemo(() => {
    if (!prefillCustomerName?.trim()) return customers;
    const has = customers.some(
      (c) => c.name.trim().toLowerCase() === prefillCustomerName.trim().toLowerCase()
    );
    if (has) return customers;
    return [
      { id: `${NAME_ID}${prefillCustomerName}`, name: prefillCustomerName },
      ...customers,
    ];
  }, [customers, prefillCustomerName]);

  const customer = pickableCustomers.find((c) => c.id === customerId);

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

  const body = (
    /* Fills the frame it is given rather than floating at the top of it: as a
       page of the deal's dialog the rooms start collapsed, so a footer that
       sat at its natural height left a third of the window empty under the
       buttons (the standing no-dead-space rule). */
    <div className={chromeless ? "flex min-h-full flex-col" : undefined}>
      {/* THE DIALOG HOLDS ITS SIZE (Anir, Aug 28: "again, but these pop-ups,
          bro. Stop. the dimensions have to stay the same" — and on the accrual
          dialog before it: "why is the pop-up so small? It looks bad, but once
          I pick a deal, it looks good. Keep the size").

          Four collapsible rooms mean the form's natural height changes every
          time one is opened, so the whole dialog grew and shrank under the
          cursor and, with all of them open, ran off the bottom of the screen.
          A fixed working height with the rooms scrolling inside it: opening a
          room fills space that was already there instead of taking more. */}
      <div className={chromeless ? "flex-1 space-y-3" : "h-[min(64vh,560px)] space-y-3 overflow-y-auto pr-1"}>
        {/* A PAGE OF THE DEAL'S DIALOG, NOT A SECOND WINDOW (Anir, Aug 31:
            "it has to be clear that it's just a subpage, and then you can go
            back to this main Edit... You can't open up a new pop-up"). Inside
            Edit deal the frame already scrolls and already has its height, so
            a second scroller here would put a box inside a box. */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-1 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            Back
          </button>
        )}
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
              maxLength={200}
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
                ...pickableCustomers.map((c) => {
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
                  color: "var(--ink-bright-blue)",
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
                        sub: "Not a saved contact",
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
                    
                    emptyLabel="Nobody saved here yet. Type a name to add them."
                  />
                  {theirContacts.length === 0 && (
                    <p className="mt-1 text-[11.5px] text-text-tertiary">
                      Nobody is saved against this account yet. Type a name to
                      add them to this meeting.
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

        {/* ALL OF THEM NEED ATTACHMENTS (Anir, Aug 31). The agenda, the brief,
            the deck you are walking in with — attached while you are booking
            the meeting, not on a second trip to its page afterwards. */}
        <DocumentDrop
          docs={stagedDocs}
          setDocs={setStagedDocs}
          uploadUrl="/api/meetings/upload-draft"
          hint="The agenda, a brief, the deck, whatever belongs with it."
        />
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
                /* A `name:` id is this dialog's own handle on a deal's
                   account, not a customer record — so it never leaves here.
                   The name does. */
                ...(customerId.startsWith(NAME_ID) ? {} : { customerId }),
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
                /* Only the ones that landed. A row that failed is still on
                   screen saying so, and carrying it would attach a document
                   with nothing behind it. */
                docs: landedDocs(stagedDocs, "md"),
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
    </div>
  );

  /* Inside Edit deal it is a page of that dialog; on its own it is the dialog.
     Same form, same width, so moving between them does not resize the frame. */
  if (chromeless) return body;
  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit meeting" : "New meeting"}
      /* THE BIG STANDARD SIZE, the one every other workflow dialog uses
         (Anir, Aug 28: "make the popup a standard size, the bigger size"). */
      size="workflow"
    >
      {body}
    </Modal>
  );
}
