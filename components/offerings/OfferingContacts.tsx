"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  Crown,
  GraduationCap,
  LifeBuoy,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  UserRound,
  X,
  ChevronDown,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AttributeTag } from "@/components/ui/AttributeTag";
import { ContactChips } from "@/components/ui/ContactChips";
import { SectionCard } from "@/components/ui/SectionCard";
import { PersonHoverCard } from "@/components/ui/PersonHoverCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import type { PickablePerson } from "@/components/ui/PeoplePicker";
import type { OwnerRow } from "@/components/offerings/OfferingOwners";
import { cn } from "@/lib/utils";
import type { OfferingContact } from "@/lib/offerings";

// What a person DOES on an offering. A colour and an icon each, like every
// other picker in the app.
/** Sentinel: not a role, a request to type one. */
const CUSTOM_ROLE = "__custom__";

const ROLE_OPTIONS: ColorOption[] = [
  { value: "Subject matter expert", label: "Subject matter expert", color: "#7C3AED", icon: GraduationCap },
  { value: "Commercial lead", label: "Commercial lead", color: "#0F766E", icon: Briefcase },
  { value: "Product owner", label: "Product owner", color: "#C2410C", icon: Package },
  { value: "Escalation contact", label: "Escalation contact", color: "#4338CA", icon: LifeBuoy },
  // The five above are the common cases, not every case. Choosing this reveals
  // a text field so a team can name a role we never thought of (Anir, Jul 29:
  // "there should be an option to add another rule, like custom").
  // "Custom role…" named the mechanism, not the choice ("custom role doesn't
  // mean anything" — Anir). This says what happens next: you type it in.
  { value: CUSTOM_ROLE, label: "Something else — type it in", color: "#0F766E", icon: Pencil },
];

/**
 * THE PEOPLE BEHIND AN OFFERING, as records you can change.
 *
 * These used to be text parsed out of a spreadsheet cell, so there was no way
 * to add anyone or take anyone off (Anir, Jul 28: "obviously, there has to be
 * the ability to remove and add contacts for this offering"). Now each person
 * is a row with a name, role, email and phone, and the card writes through the
 * contacts API, which is gated on OWNERSHIP exactly like the Edit button.
 *
 * Someone who does not own the offering still sees everybody, they just get no
 * add or remove controls.
 */

/** The app's standard "add" affordance: a SOLID blue button with a white plus
 *  in the card header, the same treatment "New offering" gets at the top of
 *  the offerings page (Anir, Jul 28: "a proper blue button with a white plus,
 *  kind of like how it is on the offering page"). A pale tinted plus read as a
 *  disabled control next to it. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-primary text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
    >
      <Plus size={15} strokeWidth={2.6} />
    </button>
  );
}

export function OfferingContacts({
  offeringId,
  offeringName,
  contacts: contactsProp,
  canEdit,
  people,
  owners = [],
  title = "Contacts for this offering",
  defaultOpen = false,
}: {
  offeringId: string;
  offeringName: string;
  contacts: OfferingContact[];
  canEdit: boolean;
  /** Everyone assignable, with their account details. */
  people: PickablePerson[];
  /**
   * WHO OWNS **THIS** OFFERING.
   *
   * Required, because the roster's `role` field comes from a workspace-wide
   * list that takes the first label it finds for a person across ALL offerings.
   * So Eswar, who owns Freya.Register, was labelled "Offering owner" on every
   * other offering's picker — while Anir, who owns the one he was looking at,
   * showed nothing at all (Anir, Jul 29: "he's not the owner; I'm the owner").
   * Ownership is a fact about one offering, so it is read from that offering.
   */
  owners?: OwnerRow[];
  title?: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  // NEVER trust the array from a persisted record: a catalog stored before
  // `contacts` existed hands this component undefined, and `.map` on it
  // white-screened the offering page in prod (Jul 29). Degrade to empty.
  const contacts = useMemo(() => contactsProp ?? [], [contactsProp]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * REFUSAL SHOWN ON THE BUTTON THAT REFUSED.
   *
   * Pressing Next with nobody chosen used to append a red sentence under the
   * footer, which pushed the whole dialog up and read as a layout glitch (Anir,
   * Jul 29: "it looks kind of awkward, it moves everything up"). Flashing the
   * button itself red says the same thing where the click happened, costs no
   * height, and settles back on its own.
   */
  const [reject, setReject] = useState(false);
  /** Taking a contact off an offering asks first: it is a real record. */
  const [confirmRemove, setConfirmRemove] = useState<OfferingContact | null>(
    null
  );
  useEffect(() => {
    if (!reject) return;
    const t = setTimeout(() => setReject(false), 900);
    return () => clearTimeout(t);
  }, [reject]);
  // You PICK a person and PICK their role. You do not type their email or
  // phone: those belong to their account and are carried across automatically
  // (Anir, Jul 28: "why would I want to enter their email and phone? That
  // should automatically be tied to that account").
  const [pick, setPick] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  // Step 1 picks the people, step 2 gives each of them their own role. One
  // shared role would have meant adding a team in as many passes as it has
  // jobs (Anir, Jul 28: "each person can have a different role... maybe there
  // are two screens: you choose everyone, you assign the roles").
  const [step, setStep] = useState<1 | 2>(1);
  const [roles, setRoles] = useState<Record<string, string>>({});
  /**
   * WHAT THEY TYPED WHEN THEY CHOSE "SOMETHING ELSE".
   *
   * "Custom role" was a dropdown entry and nothing else — no field appeared, so
   * choosing it would have written the literal sentinel `__custom__` into the
   * record as somebody's job title (Anir, Jul 29: "custom role doesn't mean
   * anything. When I press it, it should ask me for some input"). Keyed by
   * person, because step 2 gives each of them their own role.
   */
  const [customRole, setCustomRole] = useState<Record<string, string>>({});
  const [editCustomRole, setEditCustomRole] = useState("");
  /** The role that will actually be saved for one person in step 2. */
  const roleToSave = (name: string) => {
    const picked = roles[name] || ROLE_OPTIONS[0].value;
    return picked === CUSTOM_ROLE ? (customRole[name] || "").trim() : picked;
  };
  /** Everyone who chose "custom" and hasn't said what it is yet. */
  const missingCustom = pick.filter(
    (n) => (roles[n] || "") === CUSTOM_ROLE && !(customRole[n] || "").trim()
  );
  // The contact whose role is being edited, in its own dialog.
  const [editing, setEditing] = useState<OfferingContact | null>(null);
  const [editRole, setEditRole] = useState(ROLE_OPTIONS[0].value);
  const editedRoleValue =
    editRole === CUSTOM_ROLE ? editCustomRole.trim() : editRole;
  const editingRoleValue = editing
    ? generalRole(editing.role) ?? ROLE_OPTIONS[0].value
    : "";
  const hasEditedRole = Boolean(
    editing && editedRoleValue && editedRoleValue !== editingRoleValue
  );

  /** Granted owners of THIS offering, by name. Pending requests are not owners. */
  const ownerNames = useMemo(
    () =>
      new Set(
        owners
          .filter((o) => o.status === "owner")
          .map((o) => o.name.trim().toLowerCase())
      ),
    [owners]
  );
  const ownsThis = (name: string) => ownerNames.has(name.trim().toLowerCase());
  /**
   * A workspace role worth showing. "Offering owner" arriving from the shared
   * roster is discarded outright: on this page it is either true (and the crown
   * says so) or it belongs to a different offering, which makes it a lie.
   */
  function generalRole(role?: string) {
    const value = (role || "").trim();
    const normalized = value.toLowerCase();
    if (!value || normalized === "offering owner" || normalized === "service delivery poc")
      return undefined;
    return value;
  }

  // Nobody who is already a contact should show up as addable.
  const roster = useMemo(() => {
    const taken = new Set(contacts.map((c) => c.name.toLowerCase()));
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !taken.has(p.name.toLowerCase()))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.role || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, contacts, query]);

  async function send(key: string, fn: () => Promise<Response>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "That did not go through.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("That did not go through.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (pick.length === 0) {
      setError("Pick who you're adding");
      return;
    }
    // One request per person, in order, so a name that clashes reports itself
    // instead of silently taking the whole batch down.
    setBusy("add");
    setError(null);
    try {
      for (const name of pick) {
        const account = people.find(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );
        const res = await fetch(`/api/offerings/${offeringId}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            role: roleToSave(name),
            // Straight off their account when they have one.
            email: account?.email || "",
            phone: "",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Could not add ${name}.`);
          router.refresh();
          return;
        }
      }
      setPick([]);
      setQuery("");
      setRoles({});
      setStep(1);
      setAdding(false);
      router.refresh();
    } catch {
      setError("That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  const setRoleFor = (c: OfferingContact, next: string) =>
    send(c.id, () =>
      fetch(`/api/offerings/${offeringId}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: c.id, role: next }),
      })
    );

  const remove = (c: OfferingContact) =>
    send(c.id, () =>
      fetch(
        `/api/offerings/${offeringId}/contacts?contactId=${encodeURIComponent(c.id)}`,
        { method: "DELETE" }
      )
    );

  const [railOpen, setRailOpen] = useState(defaultOpen);

  return (
    <SectionCard
      title={title}
      icon={UserRound}
      // Collapsed by default alongside the owners card — both make way for the
      // offering chat above them (Suren, Jul 30: "they can be collapsible
      // gadgets. The gadgets don't have to expand").
      // The whole header band toggles, not just the chevron.
      onHeaderClick={() => setRailOpen((v) => !v)}
      expanded={railOpen}
      bodyClassName={railOpen ? undefined : "hidden"}
      action={
        // Chevron at the rightmost edge, add tucked inside it and only while
        // the card is open — same fix as the owners card above.
        <span className="flex items-center gap-1.5">
          {railOpen && canEdit && (
            <AddButton
              label="Add a contact"
              onClick={() => {
                setStep(1);
                setPick([]);
                setQuery("");
                setError(null);
                setAdding(true);
              }}
            />
          )}
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Collapse contacts" : "Expand contacts"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <ChevronDown
              size={15}
              strokeWidth={2.2}
              className={cn("transition-transform", railOpen && "rotate-180")}
            />
          </button>
        </span>
      }
    >
      {contacts.length === 0 && !adding && (
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          Nobody is listed yet. Add the person a rep should call when a customer
          asks something the deck does not answer.
        </p>
      )}

      {/* ONE representation, not two. The fan used to sit above this list,
          showing the same faces twice on the same card (Anir, Jul 28: "why are
          you showing me the people's names and the profile pictures? It's
          redundant"). The list stays, and scrolls once it outgrows the card so
          a long roster never stretches the rail. */}
      <ul className="max-h-[268px] space-y-2.5 overflow-y-auto pr-0.5">
        {contacts.map((c) => (
          <li
            key={c.id}
            // Same bubble as the picker, so the person you chose looks like the
            // person you now see. A bare flex row on white made a roster read as
            // a paragraph of names.
            className="flex items-start gap-3 rounded-xl border border-border-light bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-blue-primary/40 hover:shadow-card"
          >
            {/* Hover a face for who they are and every way to reach them. */}
            <PersonHoverCard
              name={c.name}
              role={generalRole(c.role) || ""}
              context={offeringName}
              email={c.email}
              phone={c.phone}
            >
              <Avatar name={c.name} className="h-10 w-10 shrink-0 text-[14px]" />
            </PersonHoverCard>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[14px] font-semibold text-text-primary">
                {c.name}
              </p>
              {/* An owner can change what someone does here without removing
                  and re-adding them. Everyone else just reads it. Role is a
                  coloured tag and the channels are chips, because "Commercial
                  lead · someone@freyrsolutions.com" in one gray line is the
                  thing Anir keeps calling not clearly defined. */}
              {(ownsThis(c.name) || generalRole(c.role)) && (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {ownsThis(c.name) && (
                    <AttributeTag
                      value="Offering owner"
                      icon={Crown}
                      label="Owns this offering"
                      color="#7C3AED"
                      className="!px-2 !py-[3px] !text-[11px]"
                    />
                  )}
                  {generalRole(c.role) && (
                    <AttributeTag
                      value={generalRole(c.role) as string}
                      icon={Briefcase}
                      label="Role"
                      className="!px-2 !py-[3px] !text-[11px]"
                    />
                  )}
                </span>
              )}
              <ContactChips
                className="mt-1.5"
                email={c.email}
                phone={c.phone}
                teams={Boolean(c.email)}
              />
            </div>
            {canEdit && (
              <button
                onClick={() => {
                  const visibleRole = generalRole(c.role);
                  const known = ROLE_OPTIONS.some((o) => o.value === visibleRole);
                  setEditRole(
                    !visibleRole
                      ? ROLE_OPTIONS[0].value
                      : known
                        ? visibleRole
                        : CUSTOM_ROLE
                  );
                  setEditCustomRole(visibleRole && !known ? visibleRole : "");
                  setEditing(c);
                }}
                aria-label={`Edit ${c.name}`}
                className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
              >
                <Pencil size={15} strokeWidth={2} />
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setConfirmRemove(c)}
                disabled={busy === c.id}
                aria-label={`Remove ${c.name} from this offering`}
                className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-[color:#B02020]/10 hover:text-[color:#B02020] disabled:opacity-50"
              >
                {busy === c.id ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                ) : (
                  <X size={15} strokeWidth={2} />
                )}
              </button>
            )}
          </li>
        ))}
      </ul>


      {/* Pick as many people as you like, in one pass. The dialog is a fixed
          height with THREE zones: a search that never moves, a roster that
          scrolls inside its own box, and a footer that is always on screen.
          Nothing here scrolls the dialog itself (Anir, Jul 28: "I have to
          scroll in order to choose the role... I can scroll within the
          container of the people, but I shouldn't have to scroll the entire
          thing"). */}
      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          const target = confirmRemove;
          setConfirmRemove(null);
          if (target) void remove(target);
        }}
        busy={!!confirmRemove && busy === confirmRemove.id}
        title={`Remove ${confirmRemove?.name || "this contact"}?`}
        confirmLabel="Remove contact"
        body={
          <>
            <strong>{confirmRemove?.name}</strong> will no longer be listed as
            a contact for <strong>{offeringName}</strong>.
          </>
        }
        detail="Their account is untouched. You can add them again at any time."
      />

      <Modal
        open={canEdit && adding}
        onClose={() => setAdding(false)}
        title="Add contacts"
        size="workflow"
      >
        <div className="flex h-[min(66vh,540px)] flex-col">
          {step === 1 && (
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2">
              <Search size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, role or email…"
                className="w-full bg-transparent text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
            <span className="shrink-0 text-[12px] text-text-tertiary">
              {roster.length} available
            </span>
          </div>
          )}

          {/* SCREEN 2: one row per chosen person, each with their own role. */}
          {step === 2 && (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border-light p-2">
              {pick.map((name) => (
                <div
                  key={name}
                  className="rounded-lg bg-[var(--surface)] px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={name} className="h-10 w-10 shrink-0 text-[12px]" />
                  <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold text-text-primary">
                    {name}
                  </span>
                  <div className="w-[268px] shrink-0">
                    <ColorSelect
                      value={roles[name] || ROLE_OPTIONS[0].value}
                      options={ROLE_OPTIONS}
                      onChange={(v) => setRoles((r) => ({ ...r, [name]: v }))}
                      ariaLabel={`${name}'s role on this offering`}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => setPick((l) => l.filter((n) => n !== name))}
                    className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:text-[color:#B02020]"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                  </div>
                  {/* Choosing "Something else" opens the box that asks what it
                      is. Nothing saves until it's filled, so a custom role is
                      always a real job title. */}
                  {(roles[name] || "") === CUSTOM_ROLE && (
                    <div className="mt-2 pl-[52px]">
                      <input
                        autoFocus
                        value={customRole[name] || ""}
                        onChange={(e) =>
                          setCustomRole((c) => ({ ...c, [name]: e.target.value }))
                        }
                        placeholder={`What does ${name.split(" ")[0]} do here? e.g. Regulatory strategy lead`}
                        aria-label={`${name}'s custom role`}
                        maxLength={60}
                        className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:border-blue-primary focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SCREEN 1: the roster. The only thing that scrolls. */}
          {step === 1 && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-light p-1.5">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {roster.map((p) => {
                const on = pick.includes(p.name);
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() =>
                      setPick((l) =>
                        on ? l.filter((n) => n !== p.name) : [...l, p.name]
                      )
                    }
                    className={cn(
                      // EACH PERSON IS A CARD, NOT A LINE (Anir, Jul 29: "each
                      // person should have their own blurb, like a bubble
                      // almost"). Borderless rows on white left the modal
                      // reading as one undifferentiated block; a real edge,
                      // shadow and lift make the unit obvious before you read a
                      // word of it, matching the offering tiles he pointed at.
                      "group flex items-start gap-3 rounded-xl border bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all",
                      on
                        ? "border-blue-primary bg-blue-light ring-1 ring-blue-primary/30"
                        : "border-border-light hover:-translate-y-[1px] hover:border-blue-primary/40 hover:shadow-card"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                        on
                          ? "border-blue-primary bg-blue-primary text-white"
                          : "border-border-light"
                      )}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                    </span>
                    <Avatar name={p.name} className="h-11 w-11 shrink-0 text-[13px]" />
                    {/* Name, then the role as a coloured tag, then every way to
                        reach them as its own floating chip — logos where a logo
                        exists (Anir, Jul 29: "just have the logo"). Only real
                        values render: an invented address on a real colleague
                        is how somebody emails a stranger. */}
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block break-words text-[14px] font-semibold text-text-primary">
                        {p.name}
                      </span>
                      {(ownsThis(p.name) || generalRole(p.role)) && (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {/* THE CROWN MEANS OWNER (Anir: "it should be the
                              crown emoji, like a crown icon"). Violet, not
                              gold: yellow is banned and green/red/amber are
                              reserved for status in this app. */}
                          {ownsThis(p.name) && (
                            <AttributeTag
                              value="Offering owner"
                              icon={Crown}
                              label="Owns this offering"
                              color="#7C3AED"
                              className="!px-2 !py-[3px] !text-[11px]"
                            />
                          )}
                          {generalRole(p.role) && (
                            <AttributeTag
                              value={generalRole(p.role) as string}
                              icon={Briefcase}
                              label="Role"
                              className="!px-2 !py-[3px] !text-[11px]"
                            />
                          )}
                        </span>
                      )}
                      <ContactChips
                        className="mt-1.5"
                        email={p.email}
                        phone={p.phone}
                        linkedin={p.linkedin}
                        // Everyone in this roster is a Freyr colleague, so Teams
                        // is real for all of them; client contacts get phone and
                        // email only (his rule from the Team page).
                        teams={Boolean(p.email)}
                      />
                    </span>
                  </button>
                );
              })}
              {roster.length === 0 && (
                <p className="col-span-full px-3 py-6 text-center text-[13px] text-text-secondary">
                  Nobody matches that.
                </p>
              )}
            </div>
          </div>
          )}

          {/* Always on screen: the step dots, and the way forward. */}
          <div className="mt-3 shrink-0 space-y-2.5 border-t border-border-light pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                {[1, 2].map((n) => (
                  <span
                    key={n}
                    aria-label={n === 1 ? "Step 1, choose people" : "Step 2, assign roles"}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      step === n ? "w-5 bg-blue-primary" : "w-2 bg-border-light"
                    )}
                  />
                ))}
              </span>
              <span className="text-[12.5px] text-text-tertiary">
                {step === 1
                  ? pick.length === 0
                    ? "Choose who to add"
                    : `${pick.length} selected`
                  : "Give each of them a role"}
              </span>
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[13px] font-semibold text-text-secondary hover:text-text-primary"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              {step === 1 ? (
                <Button
                  onClick={() => {
                    if (pick.length === 0) {
                      setReject(true);
                      return;
                    }
                    setError(null);
                    setRoles((r) => {
                      const next = { ...r };
                      for (const n of pick)
                        if (!next[n]) next[n] = ROLE_OPTIONS[0].value;
                      return next;
                    });
                    setStep(2);
                  }}
                  className={
                    reject
                      ? "!bg-[color:#B02020] hover:!bg-[color:#B02020]"
                      : undefined
                  }
                >
                  {reject ? "Choose someone first" : "Next: assign roles"}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    // An unfilled custom role would save an empty job title.
                    // Same refusal-on-the-button treatment as step 1.
                    if (missingCustom.length > 0) {
                      setReject(true);
                      return;
                    }
                    void add();
                  }}
                  loading={busy === "add"}
                  className={
                    reject
                      ? "!bg-[color:#B02020] hover:!bg-[color:#B02020]"
                      : undefined
                  }
                >
                  {reject
                    ? "Name the custom role first"
                    : pick.length > 1
                      ? `Add ${pick.length} contacts`
                      : "Add contact"}
                </Button>
              )}
            </div>
            {error && (
              <p className="text-[12.5px] font-medium text-[color:#B02020]">{error}</p>
            )}
          </div>
        </div>
      </Modal>



      {/* Changing what someone does is a decision you commit to, not a
          dropdown that fires the moment it closes (Anir, Jul 28: "there should
          be a definitive edit button on the contacts. It should be another
          popup, and then I can press Save"). */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit contact"}
      >
        {editing && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={editing.name} className="h-12 w-12 shrink-0 text-[14px]" />
              <span className="min-w-0 leading-tight">
                <span className="block break-words text-[14.5px] font-semibold text-text-primary">
                  {editing.name}
                </span>
                <span className="block break-words text-[12px] text-text-tertiary">
                  {editing.email || "No email on their account"}
                </span>
              </span>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                What they do here
              </p>
              {/* The modal's ONE decision, shown as a flat option list. A
                  dropdown here opened PAST the bottom of this short modal and
                  hung over the page (Anir, Aug 6: "it's poking out"). */}
              <div
                role="radiogroup"
                aria-label={`${editing.name}'s role on this offering`}
                className="space-y-1.5"
              >
                {ROLE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = option.value === editRole;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setEditRole(option.value)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-blue-primary bg-blue-light/50"
                          : "border-border-light bg-white hover:border-blue-subtle"
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: option.color }}
                      >
                        {Icon && <Icon size={14} strokeWidth={2} />}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-[13.5px] ${
                          selected
                            ? "font-semibold text-text-primary"
                            : "font-medium text-text-secondary"
                        }`}
                      >
                        {option.label}
                      </span>
                      {selected && (
                        <Check
                          size={16}
                          strokeWidth={2.4}
                          className="shrink-0 text-blue-primary"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Same box as the add flow: picking "Something else" has to ask
                  what it is, or Save would write the sentinel as a job title. */}
              {editRole === CUSTOM_ROLE && (
                <input
                  autoFocus
                  value={editCustomRole}
                  onChange={(e) => setEditCustomRole(e.target.value)}
                  placeholder="e.g. Regulatory strategy lead"
                  aria-label="Custom role"
                  maxLength={60}
                  className="mt-2 w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:border-blue-primary focus:outline-none"
                />
              )}
            </div>
            {error && (
              <p className="text-[12.5px] font-medium text-[color:#B02020]">{error}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  const target = editing;
                  setEditing(null);
                  remove(target);
                }}
                className="text-[13px] font-semibold text-[color:#B02020] hover:underline"
              >
                Remove from this offering
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              {hasEditedRole && (
                <Button
                  loading={busy === editing.id}
                  onClick={async () => {
                    const ok = await setRoleFor(editing, editedRoleValue);
                    if (ok) setEditing(null);
                  }}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {error && !adding && !editing && (
        <p className="text-[12px] font-medium text-[color:#B02020]">{error}</p>
      )}
    </SectionCard>
  );
}
