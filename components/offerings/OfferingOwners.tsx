"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Clock3, UserPlus, X, Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils";

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
export function OfferingOwners({
  offeringId,
  owners,
  isAdmin,
  myMemberId,
}: {
  offeringId: string;
  owners: OwnerRow[];
  isAdmin: boolean;
  /** Null when the session carries no verified workspace account. */
  myMemberId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-3">
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
                  {o.memberId === myMemberId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color: "#0071E3", background: "rgba(0,113,227,0.14)" }}
                    >
                      You
                    </span>
                  )}
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

      {error && (
        <p className="text-[12px] font-medium text-[color:#B02020]">{error}</p>
      )}
    </div>
  );
}
