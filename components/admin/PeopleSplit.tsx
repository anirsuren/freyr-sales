"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Loader2, Search } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { PrivilegeCards } from "./PrivilegeCards";
import {
  ROLE_PRIVILEGE,
  VIEW_ALL,
  privilegeColor,
  privilegeShort,
  privilegesForPerson,
  type PrivilegeState,
} from "@/lib/privileges";
import { tint } from "@/lib/tint";
import { AccessHistory } from "@/components/admin/AccessHistory";

/**
 * ONE PERSON AT A TIME: names down the left, everything about them on the right.
 *
 * Anir, Aug 29, having asked for this shape on User groups: "here also, as I
 * said, I would like the same concept... this has too much information, it's
 * just confusing." And on what goes where: "on the left side, just a name. The
 * right-side details, which is where I need more information."
 *
 * The wide table answers "who can do what" across forty people at once. This
 * answers "what can THIS person do" without forty rows of other people's ticks
 * in the way. Both ship; the toggle above picks.
 */

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  accountType?: string;
  /* ALREADY IN THE RESPONSE. /api/settings/access has always returned these;
     this screen simply did not declare them. */
  lastSeenAt?: string | null;
  joinedAt?: string | null;
};

/**
 * WHEN THEY JOINED AND WHEN THEY WERE LAST HERE.
 *
 * Saras, Sep 2: "can you shift user joining date info from the 'Team' module
 * to 'Admin' module > 'Team members' tab... No one other than Admin users need
 * to see this info. Also add a column on 'Last Seen' showing the date / how
 * many hours ago they were last online."
 *
 * These were built as columns on the Team members TABLE, and then the table
 * was deleted (Anir, Sep 3: "the table view sucks"), which took her two facts
 * with it. He asked for them here instead: "I don't want the table. I like this
 * more. Just put it on the split view."
 *
 * The wording is lifted verbatim from that table, which had lifted it from the
 * Settings directory this screen absorbed, so the same fact is never phrased
 * three ways.
 */
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

/** Online is "seen inside the last five minutes", the same rule everywhere. */
function isOnline(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < 5 * 60 * 1000;
}

function joinedLabel(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * SUSPENDED, IN THE COLOUR THIS APP RESERVES FOR IT.
 *
 * Red is a status colour here and this is exactly a status: the person cannot
 * sign in. It rides the right edge of the row and the right of the name in the
 * pane, so it is where the eye lands last on both.
 */
function SuspendedPill() {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-[rgba(220,38,38,0.10)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[color:var(--status-red)]">
      Suspended
    </span>
  );
}

/** Least power to most, so a demotion can be told from a promotion. */

export function PeopleSplit() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [state, setState] = useState<PrivilegeState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* Search over the roster. Declared with the other hooks: this component has
     early returns below, and a hook after one of them runs conditionally. */
  const [listQuery, setListQuery] = useState("");
  const [pendingPriv, setPendingPriv] = useState<{
    person: string;
    privId: string;
    privLabel: string;
    to: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch("/api/settings/access", { cache: "no-store" }),
        fetch("/api/privileges", { cache: "no-store" }),
      ]);
      const mData = await mRes.json().catch(() => null);
      const pData = await pRes.json().catch(() => null);
      if (!mRes.ok || !Array.isArray(mData?.members) || !pData?.state) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setMembers(
        (mData.members as Member[])
          .filter((m) => m.accountType !== "demo")
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setState(pData.state as PrivilegeState);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Could not load the directory. Refresh and try again.
      </p>
    );

  if (!members || !state)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-surface px-4 py-4 text-[12.5px] text-text-secondary">
        <Loader2 size={13} className="animate-spin text-blue-primary" /> Loading…
      </p>
    );

  if (members.length === 0)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Nobody in the workspace yet.
      </p>
    );

  const selected =
    members.find((m) => m.id === selectedId) ?? members[0];

  async function savePrivileges(next: PrivilegeState) {
    setState(next);
    setSaving(true);
    try {
      const res = await fetch("/api/privileges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        void load();
        return;
      }
      setState(data.state as PrivilegeState);
    } catch {
      toast("That didn't save.", "error");
      void load();
    } finally {
      setSaving(false);
    }
  }

  /**
   * EVERY PRIVILEGE A PERSON HOLDS, IN THE TABLE'S OWN ORDER.
   *
   * Their role's badge counts: it is a privilege they hold, it is simply not
   * one you can untick here. The two-letter mark is built from the label so a
   * renamed privilege renames its badge with it — "BD Owner" reads BO... no:
   * initials of the words, so BD Owner is "BD" and Solutioning Member is "SM".
   */
  /* Name or email: an admin looking for somebody has one or the other. */
  const lq = listQuery.trim().toLowerCase();
  const shownMembers = lq
    ? (members ?? []).filter(
        (m) =>
          m.name.toLowerCase().includes(lq) ||
          (m.email ?? "").toLowerCase().includes(lq)
      )
    : (members ?? []);

  function privilegesOf(name: string) {
    if (!state) return [];
    const key = Object.keys(state.peoplePrivileges).find(
      (n) => n.trim().toLowerCase() === name.trim().toLowerCase()
    );
    const direct = new Set(key ? state.peoplePrivileges[key] : []);
    const member = (members ?? []).find((x) => x.name === name);
    const viaRole = member ? ROLE_PRIVILEGE[member.role] : undefined;
    if (viaRole) direct.add(viaRole);
    return state.privileges
      .filter((p) => direct.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        short: privilegeShort(p.id),
      }));
  }

  function applyPendingPriv() {
    if (!pendingPriv || !state) return;
    const { person, privId, to } = pendingPriv;
    setPendingPriv(null);
    const key =
      Object.keys(state.peoplePrivileges).find(
        (n) => n.trim().toLowerCase() === person.trim().toLowerCase()
      ) ?? person;
    const held = new Set(state.peoplePrivileges[key] ?? []);
    if (to) held.add(privId);
    else held.delete(privId);
    const nextMap = { ...state.peoplePrivileges };
    if (held.size) nextMap[key] = [...held];
    else delete nextMap[key];
    void savePrivileges({ ...state, peoplePrivileges: nextMap });
  }

  const held = new Set(privilegesForPerson(state, selected.name));
  const fromRole = ROLE_PRIVILEGE[selected.role];

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        {saving && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* THE LIST PANE FITS AN EMAIL ADDRESS (Anir, Sep 3: "you don't
          have to shorten it, bro. You genuinely don't have to shorten it.
          Just put them all there"). 260px cut every freyrsolutions.com
          address mid-word, so the column showed a name and half a fact. The
          right pane still takes the rest, and it holds two columns of
          privilege cards, which need far less width than the table used to. */}
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* LEFT: the roster. A search box on top, because forty-one people is
            already past the point of scrolling to find somebody (Anir, Aug 31:
            "why is there no search bar here to search for users"). */}
        <div className="flex max-h-[640px] flex-col rounded-xl border border-border-light">
          <div className="relative shrink-0 border-b border-border-light p-2">
            <Search
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="h-9 w-full rounded-lg border border-border-light bg-white pl-8 pr-2.5 text-[12.5px] outline-none focus:border-blue-primary"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
          {shownMembers.length === 0 && (
            <p className="px-3.5 py-6 text-center text-[12.5px] text-text-secondary">
              Nobody matches “{listQuery}”.
            </p>
          )}
          {shownMembers.map((m) => {
            const on = m.id === selected.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-b-0",
                  on
                    ? "bg-blue-light/50 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                    : "hover:bg-surface"
                )}
              >
                <Avatar name={m.name} className="h-7 w-7 shrink-0 text-[9px]" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-semibold",
                      on ? "text-blue-primary" : "text-text-primary"
                    )}
                  >
                    {m.name}
                  </span>
                  {/* THE EMAIL, UNDER THE NAME (Anir, Aug 31: "I probably want
                      the email to show up here as well"). Two people share a
                      first name long before a workspace gets large, and the
                      address is the only thing that never collides. */}
                  {m.email && (
                    <span className="block break-all text-[11px] leading-snug text-text-tertiary">
                      {m.email}
                    </span>
                  )}
                  {/* A THIRD LINE, NOT A THIRD COLUMN (Anir, Aug 31: "just put
                      the roles in a third line... you can't be doing this where
                      you're cutting off stuff"). Beside the name they fought the
                      email for width and truncated it mid-address. */}
                  {(() => {
                    const theirs = privilegesOf(m.name);
                    if (!theirs.length) return null;
                    return (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {theirs.map((p) => (
                          <span
                            key={p.id}
                            title={p.label}
                            aria-label={p.label}
                            style={{
                              backgroundColor: tint(privilegeColor(p.id), 12),
                              color: privilegeColor(p.id),
                            }}
                            className="rounded px-1.5 py-[1px] text-[9.5px] font-bold"
                          >
                            {p.short}
                          </span>
                        ))}
                      </span>
                    );
                  })()}
                </span>

                {/* LAST SEEN, ON THE RIGHT OF THE ROW. It is the one fact
                    you scan a list of people FOR — who is around — so it goes
                    where the eye finishes rather than as a fourth line under
                    the name. The dot is the same five-minute rule the rest of
                    the app uses; the words say how long ago for everyone else. */}
                {m.active && (
                  <span
                    title={`Last seen ${lastSeenLabel(m.lastSeenAt)}`}
                    className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px]"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
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
                      {isOnline(m.lastSeenAt) ? "Online" : lastSeenLabel(m.lastSeenAt)}
                    </span>
                  </span>
                )}

                {/* SAY IT IN RED, ON THE RIGHT (Anir, Aug 30: "if it's
                    suspended it should be more clear that it's suspended, but
                    like a red thing here, and it has to stay on the right side
                    too"). It was grey uppercase text tucked under the name,
                    which is how this app writes a subtitle, not a warning —
                    and it sat where the eye had already moved on. */}
                {!m.active && <SuspendedPill />}
              </button>
            );
          })}
          </div>
        </div>

        {/* RIGHT: everything about the one person picked. Keyed on them, so
            clicking a different name replays the entrance instead of silently
            rewriting the pane (Anir, Aug 29: "and of course when I click on
            these things too"). */}
        <div
          key={selected.id}
          className="tab-panel min-w-0 rounded-xl border border-border-light p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={selected.name} className="h-11 w-11 shrink-0 text-[13px]" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                {selected.name}
                {/* The same pill as the list, so opening a suspended person
                    does not lose the one fact that changes what you can do. */}
                {!selected.active && <SuspendedPill />}
              </p>
              <p className="truncate text-[12.5px] text-text-secondary">
                {selected.email}
              </p>
              {/* SPELLED OUT HERE, ABBREVIATED IN THE LIST. The row has to fit
                  forty of these so it says "3h ago"; the pane is about one
                  person, so it can afford the whole sentence and the date they
                  joined with it. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-tertiary">
                <span>Joined {joinedLabel(selected.joinedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Last seen{" "}
                  {isOnline(selected.lastSeenAt) ? (
                    <b className="font-semibold text-success">just now</b>
                  ) : (
                    /* NOT lower-cased. It reads as a sentence, so the
                       instinct is to fold the label into it, but the label is
                       a date as often as it is a duration and "Last seen aug
                       20" is just wrong. */
                    lastSeenLabel(selected.lastSeenAt)
                  )}
                </span>
              </p>
            </div>
            {/* NO BASE ROLE CONTROL (Anir, Sep 1: "you can remove the base
                role part itself, and you can just retain the privileges... I
                just want to give privileges thatS IT"; again Sep 3: "I thought
                you removed this. Why do we still have these four
                categories?").

                It came out of the Team members TABLE on Sep 1 and survived
                here, so the four roles were still assignable from the pane on
                the right of the same page. The privilege ticks below are the
                whole of what an admin sets now.

                The stored role is untouched and still read: it is what
                `ROLE_PRIVILEGE` turns into the "From role" ticks, and it is
                what the module-access resolver falls back to. Nothing is
                revoked by removing the way to change it, and every person was
                backfilled with the privileges their role implied before the
                control went away. */}
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              Privileges
            </p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              {selected.active ? (
                <>
                  Tick as many as they need. If two of these give different
                  access to the same module, they get the higher one.
                </>
              ) : (
                /* WHY IT IS LOCKED, not just that it is. */
                <>
                  <b className="font-semibold text-[color:var(--status-red)]">
                    {selected.name} is suspended
                  </b>{" "}
                  and cannot sign in, so what they hold is frozen. Bring them
                  back before changing it.
                </>
              )}
            </p>
            <PrivilegeCards
              className="mt-2.5"
              privileges={state.privileges}
              held={held}
              fromRole={fromRole}
              active={selected.active}
              personName={selected.name}
              onToggle={({ privId, privLabel, to }) =>
                setPendingPriv({ person: selected.name, privId, privLabel, to })
              }
            />
            {/* WHO GAVE THEM THIS, AND WHEN (Anir, Sep 4). Under the ticks,
                because the question it answers is about the ticks. */}
            <AccessHistory subject={selected.name} />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingPriv !== null}
        onClose={() => setPendingPriv(null)}
        onConfirm={applyPendingPriv}
        title={pendingPriv?.to ? "Give this privilege?" : "Take this privilege away?"}
        body={
          pendingPriv && (
            <>
              <b>{pendingPriv.person}</b> {pendingPriv.to ? "gets" : "loses"}{" "}
              <b>{pendingPriv.privLabel}</b>.
            </>
          )
        }
        detail={
          pendingPriv?.privId === VIEW_ALL && pendingPriv.to
            ? "View all lets them see every record in a module, including ones nobody assigned them. It never lets them change one. The admins are emailed."
            : "This changes what they can do as soon as you confirm. The admins are emailed."
        }
        confirmLabel={pendingPriv?.to ? "Give it" : "Take it away"}
        /* RED MEANS SOMETHING IS BEING TAKEN (Anir, Aug 29: "I don't like the
           colors here, when I'm giving a privilege the red doesn't make sense,
           it feels like I'm taking away privilege"). Handing somebody a
           privilege is an ordinary affirmative action; only the removal earns
           the destructive treatment. Same rule the app already keeps for
           delete controls. */
        tone={pendingPriv?.to ? "primary" : "destructive"}
        busy={saving}
      />

    </div>
  );
}
