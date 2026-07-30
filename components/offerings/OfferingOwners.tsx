"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Clock3,
  UserPlus,
  X,
  Check,
  Search,
  Plus,
  UserRound,
  Mail,
  Phone,
  ChevronDown,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { teamsChatUrl, repEmail, repLinkedIn } from "@/lib/team";
import { SectionCard } from "@/components/ui/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";

export type OwnerRow = {
  memberId: string;
  name: string;
  email: string | null;
  status: "requested" | "owner";
  /** Only ever a REAL number the account carries; never generated. */
  phone?: string | null;
  claimed_at: string;
  granted_by: string;
};

/**
 * WHO CAN EDIT THIS OFFERING, and how someone joins that list.
 *
 * Owners are shown as real people. A member who is not an owner can ASK for it;
 * the ask is recorded and grants nothing until an admin approves it, because
 * self-service ownership would let anyone give themselves write access (Anir,
 * Jul 28: "only a select amount of people should be able to edit the offering").
 * Admins see pending requests inline with approve / decline.
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


/**
 * The person behind an owner row: who they are, the address their account is
 * registered under, when they were granted it and by whom, and the usual ways
 * to reach them. Everything here is a RECORD, never derived — the email shown
 * is the one ownership is actually keyed to.
 */
function OwnerHoverCard({
  owner,
  isYou,
  children,
}: {
  owner: OwnerRow;
  isYou: boolean;
  children: React.ReactNode;
}) {
  const email = (owner.email || "").trim() || repEmail(owner.name);
  // The phone is shown ONLY when the account actually carries one. repPhone()
  // invents a realistic-looking number for the demo roster, and printing a
  // made-up number against a real colleague in a real app is how somebody ends
  // up dialling a stranger. No number on file says so.
  const phone = (owner.phone || "").trim();
  const first = owner.name.split(" ")[0];
  return (
    <HoverCard
      side="left"
      width={360}
      content={
        <div className="w-[360px] p-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar name={owner.name} className="h-11 w-11 shrink-0 text-[14px]" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-text-primary">
                {owner.name}
                {isYou && (
                  <span className="ml-1.5 text-[11px] font-medium text-text-tertiary">
                    (you)
                  </span>
                )}
              </p>
              {/* Two lines on purpose: the sentence, then the whole date.
                  Cramming both into one wrapped it mid-date. */}
              <p className="text-[11.5px] leading-tight text-text-secondary">
                {owner.status === "owner" ? "Owns this offering" : "Asked to own this"}
              </p>
              <p className="whitespace-nowrap text-[11.5px] leading-tight text-text-tertiary">
                {formatDate(owner.claimed_at)}
              </p>
            </div>
          </div>

          {/* How you actually reach them. A salesperson wants the phone and the
              address, and nothing else — the internal account id that used to
              sit here was a debugging detail with no business meaning
              (Anir, Jul 29: "why is the account even important? Put the phone
              number there. This is a user-facing application"). */}
          <div className="mt-3 space-y-2 border-t border-border-light pt-2.5">
            {phone ? (
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-2 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
              >
                <Phone size={13.5} strokeWidth={1.9} className="shrink-0 text-text-tertiary" />
                <span className="font-medium">{phone}</span>
              </a>
            ) : (
              <span className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
                <Phone size={13.5} strokeWidth={1.9} className="shrink-0" />
                No direct number on file
              </span>
            )}
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-2 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
            >
              <Mail size={13.5} strokeWidth={1.9} className="shrink-0 text-text-tertiary" />
              {/* One line, always. A wrapped address splits mid-domain and reads as
                  two broken strings (Anir, Jul 29: "it has to be on one line").
                  The full value stays available on hover and on copy. */}
              <span
                title={email}
                className="min-w-0 flex-1 truncate font-medium"
              >
                {email}
              </span>
            </a>
            <a
              href={teamsChatUrl(owner.name, email)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
            >
              <TeamsIcon size={13.5} />
              <span className="font-medium">Message {first} on Teams</span>
            </a>
            <a
              href={repLinkedIn(owner.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
            >
              <LinkedInIcon size={13.5} />
              <span className="font-medium">{first} on LinkedIn</span>
            </a>
          </div>
        </div>
      }
    >
      {children}
    </HoverCard>
  );
}

export function OfferingOwners({
  offeringId,
  offeringName,
  owners,
  isAdmin,
  myMemberId,
  people = [],
  canEdit,
}: {
  offeringId: string;
  /** Named in the confirmation, so it is obvious what access is being lost. */
  offeringName: string;
  owners: OwnerRow[];
  isAdmin: boolean;
  /** Null when the session carries no verified workspace account. */
  myMemberId: string | null;
  /** Everyone with a real account, so an admin can hand ownership to them. */
  people?: { name: string; email?: string; memberId?: string; role?: string }[];
  /** Does the signed-in account own this offering? Only owners grant ownership. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * REMOVING EDIT ACCESS ASKS FIRST.
   *
   * The X and "Give up ownership" both revoked immediately, so one stray click
   * silently took away a person's ability to edit the offering, with no undo
   * (Anir, Jul 29: "I pressed the X, it didn't even ask me for a confirmation").
   * Losing a permission is exactly the kind of thing that must be deliberate.
   */
  const [confirmOwner, setConfirmOwner] = useState<OwnerRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  // AN OFFERING CAN HAVE SEVERAL OWNERS. Anyone already on the list is not
  // offered again, which is also what stops you handing yourself an offering
  // you already own. Only people with a real ACCOUNT can be granted: ownership
  // decides who may edit, and a name off a spreadsheet is not something
  // permissions can be keyed to.
  const grantable = useMemo(() => {
    const held = new Set(owners.map((o) => o.memberId));
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.memberId && !held.has(p.memberId))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, owners, query]);

  async function grant() {
    if (chosen.length === 0) {
      setError("Pick who you're making an owner");
      return;
    }
    setBusy("grant");
    setError(null);
    try {
      for (const id of chosen) {
        const person = grantable.find((p) => p.memberId === id);
        if (!person) continue;
        const res = await fetch(`/api/offerings/${offeringId}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: person.memberId,
            name: person.name,
            email: person.email ?? null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Could not make ${person.name} an owner.`);
          router.refresh();
          return;
        }
      }
      setChosen([]);
      setQuery("");
      setGranting(false);
      router.refresh();
    } catch {
      setError("That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  const granted = owners.filter((o) => o.status === "owner");
  const pending = owners.filter((o) => o.status === "requested");
  const mine = myMemberId ? owners.find((o) => o.memberId === myMemberId) : null;

  async function send(
    action: string,
    fn: () => Promise<Response>
  ): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "That did not go through.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  const request = () =>
    send("self", () =>
      fetch(`/api/offerings/${offeringId}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    );

  const release = (memberId: string) =>
    send(memberId, () =>
      fetch(
        `/api/offerings/${offeringId}/owners?memberId=${encodeURIComponent(memberId)}`,
        { method: "DELETE" }
      )
    );

  const approve = (row: OwnerRow) =>
    send(row.memberId, () =>
      fetch(`/api/offerings/${offeringId}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: row.memberId,
          name: row.name,
          email: row.email,
        }),
      })
    );

  const [railOpen, setRailOpen] = useState(false);

  return (
    <SectionCard
      title="Who can edit this"
      icon={UserRound}
      // COLLAPSED BY DEFAULT — this is the room the offering chat needed.
      // Suren, Jul 30: "who can edit this, contacts for this offering… they can
      // be collapsible gadgets. The gadgets don't have to expand."
      // The whole header band toggles, not just the chevron.
      onHeaderClick={() => setRailOpen((v) => !v)}
      expanded={railOpen}
      bodyClassName={railOpen ? "space-y-3" : "hidden"}
      action={
        // THE CHEVRON OWNS THE RIGHT EDGE. It sat left of the blue +, so the
        // control in the spot everyone reaches for to open a collapsed card was
        // the one that ADDS an owner (Anir, Jul 30: "the plus button is in the
        // exact spot I would assume the dropdown to be"). Add is also hidden
        // while the card is shut — you should only be able to add to a list you
        // can see.
        <span className="flex items-center gap-1.5">
          {/* ONLY AN OWNER HANDS OUT OWNERSHIP. Being a workspace admin is not
              enough: an admin who has not taken this offering cannot quietly
              grant it to somebody either (Anir, Jul 28: "make sure I can only
              actually add a contact or even an owner if I am an owner").
              Bootstrapping an unowned offering still runs through the admin's
              own claim below. */}
          {railOpen && canEdit && (
            <AddButton
              label="Add an owner"
              onClick={() => {
                setChosen([]);
                setQuery("");
                setError(null);
                setGranting(true);
              }}
            />
          )}
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Collapse owners" : "Expand owners"}
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
      {granted.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          Nobody owns this offering yet. An admin assigns an owner, and that
          person can then keep its content and sales materials up to date.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {granted.map((o) => (
            <li key={o.memberId} className="flex items-center gap-2.5">
              {/* HOVER A NAME, SEE WHO IT ACTUALLY IS — address included
                  (Anir, Jul 29: "I want to be able to see email addresses
                  here when I hover over the person... I think there's a
                  duplicate of me"). Two colleagues can share a display name;
                  the address is the only thing that tells them apart, so it
                  should never take a database query to find out which account
                  is on the list. */}
              <OwnerHoverCard owner={o} isYou={o.memberId === myMemberId}>
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar
                    name={o.name}
                    className="h-8 w-8 shrink-0 text-[11px]"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words text-[13px] font-semibold text-text-primary">
                        {o.name}
                      </span>
                      {/* Which row is ME. Two colleagues can share a first
                          name, and the list is the thing you scan before
                          removing somebody (Anir, Jul 29: "put a nice little
                          blue tag that says You so I know that's me"). */}
                      {o.memberId === myMemberId && (
                        <span className="rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                          You
                        </span>
                      )}
                    </span>
                    <span className="text-[11.5px] text-text-secondary">
                      Owner since {formatDate(o.claimed_at)}
                    </span>
                  </span>
                </span>
              </OwnerHoverCard>
              <Tooltip label="Can edit this offering" side="top">
                <span
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ color: "#0F766E", background: "rgba(15,118,110,0.12)" }}
                >
                  <ShieldCheck size={11} strokeWidth={2.2} />
                  Can edit
                </span>
              </Tooltip>
              {/* YOU CAN ONLY TAKE AWAY YOUR OWN ACCESS.
                  This used to appear on every row for an admin, so one stray
                  click could strip a colleague's edit rights without them ever
                  knowing (Anir, Jul 29: "I shouldn't be able to remove other
                  owners, like only myself"). Ownership is now given by an
                  admin and surrendered by the person holding it, which means a
                  permission never disappears behind someone's back. */}
              {o.memberId === myMemberId && (
                <button
                  onClick={() => setConfirmOwner(o)}
                  disabled={busy === o.memberId}
                  className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-[color:#B02020] disabled:opacity-50"
                  aria-label="Give up your ownership"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pending asks. Only an admin can act on them, so only an admin sees the
          controls; a requester still sees their own row so they know it landed. */}
      {pending
        .filter((o) => isAdmin || o.memberId === myMemberId)
        .map((o) => (
          <div
            key={o.memberId}
            className="flex items-center gap-2.5 rounded-lg border border-border-light bg-[var(--surface)] px-2.5 py-2"
          >
            <Avatar name={o.name} className="h-7 w-7 shrink-0 text-[10px]" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="break-words text-[12.5px] font-semibold text-text-primary">
                {o.name}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:#C2410C]">
                <Clock3 size={10} strokeWidth={2.2} />
                Asked {formatDate(o.claimed_at)}, waiting on an admin
              </span>
            </span>
            {isAdmin && (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  onClick={() => approve(o)}
                  disabled={busy === o.memberId}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-light disabled:opacity-50"
                >
                  <Check size={12} strokeWidth={2.4} />
                  Approve
                </button>
                <button
                  onClick={() => setConfirmOwner(o)}
                  disabled={busy === o.memberId}
                  className="rounded-md p-1 text-text-tertiary transition-colors hover:text-[color:#B02020] disabled:opacity-50"
                  aria-label={`Decline ${o.name}`}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </span>
            )}
          </div>
        ))}

      {/* Taking it is the primary action on this card, so it looks like one:
          a real blue button, not a text link (Anir, Jul 28: "the Take
          Ownership button should be better looking, probably like a blue
          button"). */}
      {myMemberId && !mine && (
        <button
          onClick={request}
          disabled={busy === "self"}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white shadow-card transition-colors hover:bg-blue-hover disabled:opacity-50"
        >
          <UserPlus size={14} strokeWidth={2.1} />
          {isAdmin ? "Take ownership" : "Ask to own this"}
        </button>
      )}

      {/* When it IS yours, say so plainly before offering the way out, and make
          giving it up read as the destructive action it is: red. */}
      {/* Just the way out. The person is already listed above with a "You"
          badge; repeating their face and name in a second panel underneath
          said nothing new (Anir, Jul 28: "why does it say my name twice? It's
          so redundant"). */}
      {mine?.status === "owner" && (
        <button
          onClick={() => setConfirmOwner(mine)}
          disabled={busy === mine.memberId}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[color:#B02020]/30 px-3.5 py-2 text-[13px] font-semibold text-[color:#B02020] transition-colors hover:bg-[color:#B02020]/10 disabled:opacity-50"
        >
          <X size={14} strokeWidth={2.2} />
          Give up ownership
        </button>
      )}

      {/* Asking before a permission disappears. Wording differs for yourself
          versus a teammate, because the consequences differ: you lose your own
          access, they lose theirs without being told. */}
      <ConfirmDialog
        open={!!confirmOwner}
        onClose={() => setConfirmOwner(null)}
        onConfirm={() => {
          const target = confirmOwner;
          setConfirmOwner(null);
          if (target) void release(target.memberId);
        }}
        busy={!!confirmOwner && busy === confirmOwner.memberId}
        title={
          confirmOwner?.memberId === mine?.memberId
            ? "Give up ownership?"
            : `Remove ${confirmOwner?.name || "this owner"}?`
        }
        confirmLabel={
          confirmOwner?.memberId === mine?.memberId
            ? "Give up ownership"
            : "Remove access"
        }
        body={
          confirmOwner?.memberId === mine?.memberId ? (
            <>
              You will no longer be able to edit{" "}
              <strong>{offeringName}</strong>, including its sales materials.
            </>
          ) : (
            <>
              <strong>{confirmOwner?.name}</strong> will no longer be able to
              edit <strong>{offeringName}</strong> or its sales materials.
            </>
          )
        }
        detail={
          confirmOwner?.memberId === mine?.memberId
            ? "An admin, or another owner, has to grant it back."
            : "They are not notified. You can add them again at any time."
        }
      />

      {/* AN OFFERING CAN HAVE SEVERAL OWNERS, and an admin hands them out.
          Only people with a real account are offered, because ownership is
          what grants edit rights and permissions cannot key off a name from a
          spreadsheet. Anyone already on the list is filtered out, which is
          also what stops you granting yourself something you already own. */}

      <Modal
        open={granting}
        onClose={() => setGranting(false)}
        title="Add an owner"
        size="workflow"
      >
        <div className="flex h-[min(60vh,480px)] flex-col">
          <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2">
            <Search size={15} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people with an account…"
              className="w-full bg-transparent text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-light p-1.5">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {grantable.map((p) => {
                const on = chosen.includes(p.memberId!);
                return (
                  <button
                    key={p.memberId}
                    type="button"
                    onClick={() =>
                      setChosen((l) =>
                        on
                          ? l.filter((id) => id !== p.memberId)
                          : [...l, p.memberId!]
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
              {grantable.length === 0 && (
                <p className="col-span-full px-3 py-6 text-center text-[13px] text-text-secondary">
                  Everyone with an account already owns this offering.
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-3 border-t border-border-light pt-3">
            <span className="text-[12.5px] text-text-tertiary">
              An owner can edit this offering&apos;s content, materials and
              contacts.
            </span>
            <button
              type="button"
              onClick={() => setGranting(false)}
              className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <Button onClick={grant} loading={busy === "grant"}>
              {chosen.length > 1 ? `Add ${chosen.length} owners` : "Add owner"}
            </Button>
          </div>
        </div>
      </Modal>

      {error && !granting && (
        <p className="text-[12px] font-medium text-[color:#B02020]">{error}</p>
      )}
    </SectionCard>
  );
}
