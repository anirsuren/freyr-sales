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
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SectionCard } from "@/components/ui/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export type OwnerRow = {
  memberId: string;
  name: string;
  email: string | null;
  status: "requested" | "owner";
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

export function OfferingOwners({
  offeringId,
  owners,
  isAdmin,
  myMemberId,
  people = [],
  canEdit,
}: {
  offeringId: string;
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

  return (
    <SectionCard
      title="Who can edit this"
      icon={UserRound}
      action={
        // ONLY AN OWNER HANDS OUT OWNERSHIP. Being a workspace admin is not
        // enough: an admin who has not taken this offering cannot quietly
        // grant it to somebody either (Anir, Jul 28: "make sure I can only
        // actually add a contact or even an owner if I am an owner. That's the
        // only way I have these permissions"). Bootstrapping an unowned
        // offering still runs through the admin's own claim below.
        canEdit ? (
          <AddButton
            label="Add an owner"
            onClick={() => {
              setChosen([]);
              setQuery("");
              setError(null);
              setGranting(true);
            }}
          />
        ) : undefined
      }
      bodyClassName="space-y-3"
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
              <Avatar name={o.name} className="h-8 w-8 shrink-0 text-[11px]" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="break-words text-[13px] font-semibold text-text-primary">
                    {o.name}
                  </span>
                </span>
                <span className="text-[11.5px] text-text-secondary">
                  Owner since {formatDate(o.claimed_at)}
                </span>
              </span>
              <Tooltip label="Can edit this offering" side="top">
                <span
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ color: "#0F766E", background: "rgba(15,118,110,0.12)" }}
                >
                  <ShieldCheck size={11} strokeWidth={2.2} />
                  Can edit
                </span>
              </Tooltip>
              {isAdmin && (
                <button
                  onClick={() => release(o.memberId)}
                  disabled={busy === o.memberId}
                  className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-[var(--surface)] hover:text-[color:#B02020] disabled:opacity-50"
                  aria-label={`Remove ${o.name} as an owner`}
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
                  onClick={() => release(o.memberId)}
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
          onClick={() => release(mine.memberId)}
          disabled={busy === mine.memberId}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[color:#B02020]/30 px-3.5 py-2 text-[13px] font-semibold text-[color:#B02020] transition-colors hover:bg-[color:#B02020]/10 disabled:opacity-50"
        >
          <X size={14} strokeWidth={2.2} />
          Give up ownership
        </button>
      )}

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
