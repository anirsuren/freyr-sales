"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Loader2,
  Headset,
  GraduationCap,
  Briefcase,
  Package,
  LifeBuoy,
  Search,
  Check,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonHoverCard } from "@/components/ui/PersonHoverCard";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import type { PickablePerson } from "@/components/ui/PeoplePicker";
import { cn } from "@/lib/utils";
import type { OfferingContact } from "@/lib/offerings";

// What a person DOES on an offering. A colour and an icon each, like every
// other picker in the app.
const ROLE_OPTIONS: ColorOption[] = [
  { value: "Service delivery POC", label: "Service delivery POC", color: "#0071E3", icon: Headset },
  { value: "Subject matter expert", label: "Subject matter expert", color: "#7C3AED", icon: GraduationCap },
  { value: "Commercial lead", label: "Commercial lead", color: "#0F766E", icon: Briefcase },
  { value: "Product owner", label: "Product owner", color: "#C2410C", icon: Package },
  { value: "Escalation contact", label: "Escalation contact", color: "#4338CA", icon: LifeBuoy },
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
export function OfferingContacts({
  offeringId,
  offeringName,
  contacts,
  canEdit,
  people,
}: {
  offeringId: string;
  offeringName: string;
  contacts: OfferingContact[];
  canEdit: boolean;
  /** Everyone assignable, with their account details. */
  people: PickablePerson[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // You PICK a person and PICK their role. You do not type their email or
  // phone: those belong to their account and are carried across automatically
  // (Anir, Jul 28: "why would I want to enter their email and phone? That
  // should automatically be tied to that account").
  const [pick, setPick] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(ROLE_OPTIONS[0].value);

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
            role,
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
      setRole(ROLE_OPTIONS[0].value);
      setAdding(false);
      router.refresh();
    } catch {
      setError("That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  // A stored role that predates the picker (or came off the sheet) still has to
  // select something, so anything unrecognised shows as the default.
  const roleValue = (r: string) =>
    ROLE_OPTIONS.some((o) => o.value === r) ? r : ROLE_OPTIONS[0].value;

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

  return (
    <div className="space-y-3">
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
          <li key={c.id} className="flex items-center gap-3">
            {/* Hover a face for who they are and every way to reach them. */}
            <PersonHoverCard
              name={c.name}
              role={c.role}
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
                  and re-adding them. Everyone else just reads it. */}
              {canEdit ? (
                <div className="mt-1 max-w-[240px]">
                  <ColorSelect
                    value={roleValue(c.role)}
                    options={ROLE_OPTIONS}
                    onChange={(v) => setRoleFor(c, v)}
                    ariaLabel={`${c.name}'s role on this offering`}
                  />
                </div>
              ) : (
                <p className="break-words text-[12.5px] text-text-secondary">
                  {[c.role, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => remove(c)}
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

      {canEdit && !adding && (
        <button
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
        >
          <Plus size={14} strokeWidth={2.1} />
          Add a contact
        </button>
      )}

      {/* Pick as many people as you like, in one pass. The dialog is a fixed
          height with THREE zones: a search that never moves, a roster that
          scrolls inside its own box, and a footer that is always on screen.
          Nothing here scrolls the dialog itself (Anir, Jul 28: "I have to
          scroll in order to choose the role... I can scroll within the
          container of the people, but I shouldn't have to scroll the entire
          thing"). */}
      <Modal
        open={canEdit && adding}
        onClose={() => setAdding(false)}
        title="Add contacts"
        size="workflow"
      >
        <div className="flex h-[min(66vh,540px)] flex-col">
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

          {/* The only thing that scrolls. */}
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
                      "flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      on
                        ? "border-blue-primary bg-blue-light"
                        : "border-transparent hover:bg-[var(--surface)]"
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
                    <Avatar name={p.name} className="h-10 w-10 shrink-0 text-[12px]" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block break-words text-[13.5px] font-semibold text-text-primary">
                        {p.name}
                      </span>
                      <span className="block break-words text-[11.5px] text-text-tertiary">
                        {p.role || p.email || "Workspace member"}
                      </span>
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

          {/* Always on screen: who you picked, what they'll do, and the button. */}
          <div className="mt-3 shrink-0 space-y-2.5 border-t border-border-light pt-3">
            {pick.length > 0 && (
              <div className="flex max-h-[68px] flex-wrap gap-1.5 overflow-y-auto">
                {pick.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-light py-0.5 pl-0.5 pr-1.5"
                  >
                    <Avatar name={name} className="h-6 w-6 text-[8px]" />
                    <span className="text-[12.5px] font-semibold text-text-primary">
                      {name}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${name}`}
                      onClick={() => setPick((l) => l.filter((n) => n !== name))}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        setPick((l) => l.filter((n) => n !== name))
                      }
                      className="cursor-pointer rounded p-0.5 text-blue-primary hover:text-[color:#B02020]"
                    >
                      <X size={12} strokeWidth={2.4} />
                    </span>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Role
              </span>
              <div className="w-[280px]">
                <ColorSelect
                  value={role}
                  options={ROLE_OPTIONS}
                  onChange={setRole}
                  ariaLabel="Role on this offering"
                />
              </div>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <Button onClick={add} loading={busy === "add"}>
                {pick.length > 1 ? `Add ${pick.length} contacts` : "Add contact"}
              </Button>
            </div>
            {error && (
              <p className="text-[12.5px] font-medium text-[color:#B02020]">{error}</p>
            )}
          </div>
        </div>
      </Modal>



      {error && (
        <p className="text-[12px] font-medium text-[color:#B02020]">{error}</p>
      )}
    </div>
  );
}
