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

const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

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
  const [pick, setPick] = useState("");
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
    const name = pick;
    if (!name) {
      setError("Pick who you're adding");
      return;
    }
    const account = people.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    const ok = await send("add", () =>
      fetch(`/api/offerings/${offeringId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          // Straight off their account when they have one.
          email: account?.email || "",
          phone: "",
        }),
      })
    );
    if (ok) {
      setPick("");
      setQuery("");
      setRole(ROLE_OPTIONS[0].value);
      setAdding(false);
    }
  }

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
              <p className="break-words text-[12.5px] text-text-secondary">
                {[c.role, c.email, c.phone].filter(Boolean).join(" · ")}
              </p>
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

      {/* A dialog you can actually pick someone in. The first pass put a
          collapsed dropdown inside a narrow modal, so choosing a colleague
          meant squinting at three rows through a slot (Anir, Jul 28: "look at
          the dropdown. I can barely see. The pop-up should be a lot bigger so
          I can actually see people"). The roster is open on the page now, two
          columns, faces at a readable size, with the search above it. */}
      <Modal
        open={canEdit && adding}
        onClose={() => setAdding(false)}
        title="Add a contact"
        size="workflow"
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className={LABEL + " mb-0"}>Who</label>
              <span className="text-[12px] text-text-tertiary">
                {roster.length} {roster.length === 1 ? "person" : "people"} in your
                workspace
              </span>
            </div>
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2">
              <Search size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, role or email…"
                className="w-full bg-transparent text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
            <div className="max-h-[340px] overflow-y-auto rounded-xl border border-border-light p-1.5">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {roster.map((p) => {
                  const on = pick === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setPick(on ? "" : p.name)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors",
                        on
                          ? "border-blue-primary bg-blue-light"
                          : "border-transparent hover:bg-[var(--surface)]"
                      )}
                    >
                      <Avatar name={p.name} className="h-11 w-11 shrink-0 text-[13px]" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block break-words text-[13.5px] font-semibold text-text-primary">
                          {p.name}
                        </span>
                        <span className="block break-words text-[11.5px] text-text-tertiary">
                          {p.role || p.email || "Workspace member"}
                        </span>
                      </span>
                      {on && (
                        <Check
                          size={17}
                          strokeWidth={2.6}
                          className="shrink-0 text-blue-primary"
                        />
                      )}
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
          </div>

          <div className="max-w-[380px]">
            <label className={LABEL}>What they do here</label>
            <ColorSelect
              value={role}
              options={ROLE_OPTIONS}
              onChange={setRole}
              ariaLabel="Role on this offering"
            />
          </div>

          {error && (
            <p className="text-[12.5px] font-medium text-[color:#B02020]">{error}</p>
          )}

          <div className="flex items-center gap-3 border-t border-border-light pt-3">
            <span className="text-[12.5px] text-text-tertiary">
              {pick
                ? `${pick} joins as ${role}. Their email and phone come from their account.`
                : "Their email and phone come from their account."}
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <Button onClick={add} loading={busy === "add"}>
              Add contact
            </Button>
          </div>
        </div>
      </Modal>


      {error && (
        <p className="text-[12px] font-medium text-[color:#B02020]">{error}</p>
      )}
    </div>
  );
}
