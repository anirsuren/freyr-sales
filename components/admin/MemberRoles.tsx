"use client";

import { RolesGuide } from "@/components/admin/RolesGuide";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PrivilegeCards } from "./PrivilegeCards";
import {
  privilegeColor,
  privilegeShort,
  ROLE_PRIVILEGE,
  type PrivilegeState,
} from "@/lib/privileges";
import { KeyRound, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { tint } from "@/lib/tint";
import { AccessHistory } from "@/components/admin/AccessHistory";


type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  accountType?: string;
  /* ALREADY IN THE RESPONSE, NEVER RENDERED HERE. /api/settings/access has
     always returned these; this screen simply did not declare them, so the
     same facts were only readable on the Settings > Team page. */
  lastSeenAt?: string | null;
  joinedAt?: string | null;
};

/** "Just now", "3h ago", "Yesterday", then a date. Lifted verbatim from the
 *  Settings page this screen absorbed, so the two never phrase it differently. */
function lastSeenLabel(iso: string | null | undefined): string {
  if (!iso) return "Not yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not yet";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Online is "seen inside the last five minutes", the same rule the Settings
 *  directory used. */
function isOnline(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < 5 * 60 * 1000;
}

export function MemberRoles() {
  const { toast } = useToast();
  const me = useCurrentUserOrNull();

  /* Email first because it is the one thing that is unique — two people can
     share a name, and this list has several Anirs on it. */
  const isMe = (m: Member) => {
    if (!me) return false;
    const mine = (me.email ?? "").trim().toLowerCase();
    if (mine && m.email.trim().toLowerCase() === mine) return true;
    return !mine && m.name.trim().toLowerCase() === me.name.trim().toLowerCase();
  };
  const [members, setMembers] = useState<Member[] | null>(null);
  /* A SEARCH BOX, BECAUSE THIS IS A DIRECTORY (Anir, Aug 31: "why is there no
     search bar here to search for users"). Forty-one people today and every
     new hire adds one; finding somebody by scrolling stops working long before
     anybody decides to fix it. */
  const [query, setQuery] = useState("");
  /* THE PRIVILEGES, EDITABLE FROM HERE TOO. Table view could only set the
     four-value role, so the ten privileges were reachable only from Split. */
  const [privState, setPrivState] = useState<PrivilegeState | null>(null);
  const [privFor, setPrivFor] = useState<Member | null>(null);
  const [pendingPriv, setPendingPriv] = useState<{
    person: string;
    privId: string;
    privLabel: string;
    to: boolean;
  } | null>(null);
  /** null when the last load worked; otherwise why it did not. */
  const [failed, setFailed] = useState<null | "forbidden" | "error">(null);

  /**
   * A DIRECTORY THAT FAILED TO LOAD IS NOT AN EMPTY WORKSPACE (found Aug 16,
   * opening Admin with no access grant). Every failure — a 403 from an expired
   * grant, a 500, a dropped connection — used to land in the same setMembers([])
   * as a genuinely empty list, and the page then announced "Nobody in the
   * workspace yet." On the one screen whose job is showing who has access,
   * that reads as everybody being gone.
   */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/access", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.members)) {
        /* 403 IS NOT A BROKEN PAGE (Anir, Aug 16: "Can you ever stop this?",
           on the Admin screen telling him his sign-in may have expired). The
           endpoint answers 403 to anyone who is not a workspace owner, which
           is a normal, permanent answer for most people — saying "your sign-in
           expired" sent them to log in again to fix something logging in
           cannot fix. */
        setFailed(res.status === 403 ? "forbidden" : "error");
        setMembers(null);
        return;
      }
      setFailed(null);
      setMembers(data.members);
    } catch {
      setFailed("error");
      setMembers(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);


  useEffect(() => {
    let alive = true;
    fetch("/api/privileges", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.state) setPrivState(d.state as PrivilegeState);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** Write the whole table back, the way the Privileges screen does. */
  async function savePrivileges(next: PrivilegeState) {
    const before = privState;
    setPrivState(next);
    try {
      const res = await fetch("/api/privileges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "That did not save.");
      if (data.state) setPrivState(data.state as PrivilegeState);
    } catch (error) {
      setPrivState(before);
      toast(
        error instanceof Error ? error.message : "Could not change the privilege",
        "error"
      );
    }
  }

  function applyPendingPriv() {
    if (!pendingPriv || !privState) return;
    const { person, privId, to } = pendingPriv;
    setPendingPriv(null);
    const key =
      Object.keys(privState.peoplePrivileges).find(
        (n) => n.trim().toLowerCase() === person.trim().toLowerCase()
      ) ?? person;
    const held = new Set(privState.peoplePrivileges[key] ?? []);
    if (to) held.add(privId);
    else held.delete(privId);
    const nextMap = { ...privState.peoplePrivileges };
    if (held.size) nextMap[key] = [...held];
    else delete nextMap[key];
    void savePrivileges({ ...privState, peoplePrivileges: nextMap });
  }

  /**
   * EVERY PRIVILEGE A PERSON HOLDS, FOR THE ROW BADGES (Anir, Aug 31: "without
   * even clicking on it, I want icons... for these 10 roles"). Their role's
   * badge counts — it is held, it simply cannot be unticked here. The mark is
   * the initials of the label, so a rename carries through on its own.
   */
  function badgesFor(m: Member) {
    if (!privState) return [];
    const direct = heldFor(m.name);
    const viaRole = ROLE_PRIVILEGE[m.role];
    if (viaRole) direct.add(viaRole);
    return privState.privileges
      .filter((p) => direct.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        short: privilegeShort(p.id),
      }));
  }

  /** What one person holds by direct grant. */
  function heldFor(name: string): Set<string> {
    const key = Object.keys(privState?.peoplePrivileges ?? {}).find(
      (n) => n.trim().toLowerCase() === name.trim().toLowerCase()
    );
    return new Set(key ? privState!.peoplePrivileges[key] : []);
  }

  const all = (members ?? []).filter((m) => m.accountType !== "demo");
  /* Name or email, because an admin looking for somebody has one or the other
     and rarely both. */
  const q = query.trim().toLowerCase();
  const people = q
    ? all.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q)
      )
    : all;

  return (
    <div className="rounded-2xl border border-border-light bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-text-primary">
          <ShieldCheck size={16} strokeWidth={2} className="text-blue-primary" />
          {/* NOT "BASE ROLE" ANY MORE. There is no base role control on this
              screen: Anir, Sep 2, "you can remove the base role part itself
              and just retain the privileges". What this list now shows is the
              people and what each of them holds, so that is what it is
              called. */}
          Team members
          {/* One hint, not two. The second explained a dropdown that no longer
              exists, and two question marks side by side is the sort of thing
              that makes a screen look unfinished. */}
          <RolesGuide />
        </p>
        {members && (
          <span className="text-[11.5px] text-text-tertiary tnum">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        )}
      </div>

      {failed === "forbidden" ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Only a workspace owner can see who has access. Everything else on
          this page still works.
        </p>
      ) : failed === "error" ? (
        <div className="mt-3 rounded-lg bg-surface px-4 py-4 text-center">
          <p className="text-[12.5px] text-text-secondary">
            The member directory could not be loaded, so this is not a list of
            who has access.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
          >
            Try again
          </button>
        </div>
      ) : members === null ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Loading the directory…
        </p>
      ) : people.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
          Nobody in the workspace yet.
        </p>
      ) : (
        <div className="mt-3">
          {/* SEARCH, BECAUSE THIS IS A DIRECTORY (Anir, Aug 31). */}
          <div className="relative mb-2.5">
            <Search
              size={15}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name or email…"
              aria-label="Search people"
              className="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
          {q && (
            <p className="mb-2 text-[12px] text-text-tertiary">
              {people.length} of {all.length} people
            </p>
          )}
          {people.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
              Nobody matches “{query}”.
            </p>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-border-light bg-white">
            {/* AN ACTUAL TABLE (Anir, Sep 3: "it's so ugly. It should be like
                an actual table. Why are you stuffing everything to the
                right?").

                It was a stack of cards with the facts flexed to the right
                edge, which is why nothing lined up: every row's dates sat
                wherever that row's name happened to end, and each pair of
                dates had to carry its own little label because there was no
                header to carry it. A table has one header, one set of column
                edges, and forty rows that agree with them. */}
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
              <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <tr>
                  <th className="w-[34%] px-4 py-2.5">Person</th>
                  <th className="w-[16%] px-4 py-2.5">Privileges</th>
                  <th className="w-[13%] px-4 py-2.5">Status</th>
                  <th className="w-[13%] px-4 py-2.5">Last seen</th>
                  <th className="w-[14%] px-4 py-2.5">Joined</th>
                  {/* The button says what it does; a header over it would be
                      a second label for one control. */}
                  <th className="w-[10%] px-4 py-2.5">
                    <span className="sr-only">Open privileges</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {people.map((m) => (
                  <tr key={m.id} className="align-middle transition-colors hover:bg-surface/60">
                    <td className="px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={m.name} className="h-8 w-8 shrink-0 text-[10px]" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold text-text-primary">
                              {m.name}
                            </span>
                            {/* WHICH ONE OF THESE IS ME (Anir, Aug 29:
                                "whoever I am needs to have a proper label on
                                this page, like it should say You"). */}
                            {isMe(m) && (
                              <span className="shrink-0 rounded-full bg-blue-light px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                                You
                              </span>
                            )}
                            {!m.active && (
                              <span className="shrink-0 rounded-full bg-[rgba(220,38,38,0.10)] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--status-red)]">
                                Suspended
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-text-secondary">
                            {m.email}
                          </span>
                        </span>
                      </span>
                    </td>
                    {/* WHAT THEY HOLD, AT A GLANCE. Same badges the split
                        roster draws, so a person reads the same on both
                        screens. Each chip sizes to its own text: a fixed 20px
                        box cut "BDm" and "ADM" in half. */}
                    <td className="px-4 py-2.5">
                      {(() => {
                        const b = badgesFor(m);
                        if (!b.length)
                          return <span className="text-[11.5px] text-text-tertiary">None</span>;
                        const shown = b.slice(0, 4);
                        return (
                          <span className="flex flex-wrap items-center gap-1">
                            {shown.map((p) => (
                              <span
                                key={p.id}
                                title={p.label}
                                aria-label={p.label}
                                style={{
                                  backgroundColor: tint(privilegeColor(p.id), 12),
                                  color: privilegeColor(p.id),
                                }}
                                className="flex h-5 min-w-5 items-center justify-center whitespace-nowrap rounded-md px-1 text-[9px] font-bold"
                              >
                                {p.short}
                              </span>
                            ))}
                            {b.length > shown.length && (
                              <span className="text-[10px] font-semibold text-text-tertiary">
                                +{b.length - shown.length}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-[11.5px]">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isOnline(m.lastSeenAt) ? "bg-success" : "bg-border"
                          )}
                        />
                        <span
                          className={
                            isOnline(m.lastSeenAt)
                              ? "font-semibold text-success"
                              : "text-text-tertiary"
                          }
                        >
                          {isOnline(m.lastSeenAt) ? "Online" : "Offline"}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-text-tertiary">
                      {lastSeenLabel(m.lastSeenAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-text-tertiary">
                      {m.joinedAt
                        ? new Date(m.joinedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Not recorded"}
                    </td>
                    {/* THE SAME POWER SPLIT VIEW HAS (Anir, Aug 31: "why in
                        split view is it different from the table view? That's
                        a huge problem"). This opens the ten privileges, which
                        is where BO Owner, the one an offering owner actually
                        needs, lives. */}
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setPrivFor(m)}
                        aria-label={`Privileges for ${m.name}`}
                        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
                      >
                        <KeyRound size={13} strokeWidth={2.2} />
                        {(() => {
                          const n = heldFor(m.name).size;
                          return n ? `${n}` : "Set";
                        })()}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* ONE PERSON'S PRIVILEGES, THE SAME GRID SPLIT VIEW DRAWS. */}
      <Modal
        open={privFor !== null}
        onClose={() => setPrivFor(null)}
        title={privFor ? `Privileges for ${privFor.name}` : "Privileges"}
        size="wide"
        tall
        dialogClassName="!h-[min(560px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        {privFor && privState && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-[12.5px] text-text-secondary">
              Tick as many as they need. If two of these give different access
              to the same module, they get the higher one.
            </p>
            <PrivilegeCards
              privileges={privState.privileges}
              held={heldFor(privFor.name)}
              fromRole={ROLE_PRIVILEGE[privFor.role] ?? null}
              active={privFor.active}
              personName={privFor.name}
              onToggle={({ privId, privLabel, to }) =>
                setPendingPriv({ person: privFor.name, privId, privLabel, to })
              }
            />
            {/* Same trail as the split view — one component, so the two ways
                into a person's privileges cannot disagree about their past. */}
            <AccessHistory subject={privFor.name} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingPriv !== null}
        onClose={() => setPendingPriv(null)}
        onConfirm={applyPendingPriv}
        title={pendingPriv?.to ? "Give this privilege?" : "Take this privilege away?"}
        body={
          pendingPriv && (
            <>
              <b>{pendingPriv.person}</b> {pendingPriv.to ? "gets" : "loses"}{" "}
              <b>{pendingPriv.privLabel}</b>. It changes what they can do the next
              time they load a page.
            </>
          )
        }
        confirmLabel={pendingPriv?.to ? "Give it" : "Take it away"}
        /* Red is for what cannot be taken back. Giving a privilege is an
           ordinary change, so only taking one away wears the red. */
        tone={pendingPriv?.to ? "primary" : "destructive"}
      />

      {/* The role-change confirm dialog went with the dropdown that opened
          it. Nothing writes a base role from this screen any more; privileges
          are the system. */}
    </div>
  );
}

