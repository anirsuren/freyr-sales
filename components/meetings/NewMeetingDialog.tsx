"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FormRoom } from "@/components/ui/FormRoom";
import { Field, Input } from "@/components/ui/Input";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MultiPicker } from "@/components/ui/MultiPicker";
import { MEETING_TYPES } from "@/lib/meetings";
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
 */
export function NewMeetingDialog({
  meName,
  members,
  customers,
  contacts,
  opportunities,
  onClose,
  onCreate,
}: {
  meName: string;
  members: string[];
  customers: CustomerOption[];
  contacts: ContactOption[];
  opportunities: OpportunityOption[];
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>(MEETING_TYPES[0]);
  const [meetingAt, setMeetingAt] = useState("");
  const [materialsBy, setMaterialsBy] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<string[]>([meName]);
  const [presenters, setPresenters] = useState<string[]>([]);
  const [opportunityIds, setOpportunityIds] = useState<string[]>([]);
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
    <Modal open onClose={onClose} title="New meeting" size="wide">
      <div className="space-y-3">
        <FormRoom icon={CalendarDays} title="The meeting" defaultOpen summary={title || "Not named yet"}>
          <Field label="What is this meeting about">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Initial meeting with GSK regulatory affairs"
            />
          </Field>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Type of meeting">
              <ColorSelect
                value={type}
                ariaLabel="Type of meeting"
                collapsible={false}
                dense
                className="w-full"
                onChange={setType}
                options={MEETING_TYPES.map((t) => ({
                  value: t,
                  label: t,
                  color: "#0071E3",
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
            {/* "as part of a meeting you can ask for materials needed by" */}
            <Field label="Materials needed by">
              <Input
                type="date"
                value={materialsBy}
                onChange={(e) => setMaterialsBy(e.target.value)}
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
              className="w-full"
              onChange={(v) => {
                setCustomerId(v);
                /* Their people and their deals both change with the account,
                   so a leftover pick from the previous one is never carried
                   into a meeting it does not belong to. */
                setContactIds([]);
                setOpportunityIds([]);
              }}
              options={customers.map((c) => ({
                value: c.id,
                label: c.name,
                logoName: c.name,
                color: "#0071E3",
              }))}
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
          {/* "who is the primary presenter of the meeting" */}
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
          <p className="mt-2 text-[11.5px] text-text-tertiary">
            You own this meeting because you are creating it.
          </p>
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
                materialsBy: materialsBy || undefined,
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
              });
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create meeting"}
        </button>
      </div>
    </Modal>
  );
}
