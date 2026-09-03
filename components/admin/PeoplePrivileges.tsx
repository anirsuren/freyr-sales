"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  VIEW_ALL,
  privilegeColor,
  privilegesForPerson,
  type PrivilegeState,
} from "@/lib/privileges";

/**
 * WHICH PRIVILEGES EACH PERSON HOLDS.
 *
 * Suren, Aug 29, sorting out which screen is which: "Team members, that's where
 * all the username and their privilege. But the table should come for them...
 * That table is better, right? So no drop down — there is no way you can see
 * which role he has."
 *
 * So it lives beside the member directory rather than under the module grid.
 * The two screens answer different questions and he named both: this one is
 * users and their privileges; the Privileges tab is module privileges, "in
 * which module what role has what privilege".
 *
 * A TABLE AND NOT A PICKER, for the reason he gives. A dropdown per person
 * shows one answer at a time, so "who can create a customer" means opening
 * forty menus. Ticks in a column answer it at a glance — and a person holds as
 * many as they like (Anir: "user can play mult roles"; Suren's own example is
 * User 1 holding BD Owner and BO Owner), which a single-select cannot express
 * at all.
 */

type Person = {
  id: string;
  name: string;
  email: string;
  active?: boolean;
};

export function PeoplePrivileges() {
  const { toast } = useToast();
  const [state, setState] = useState<PrivilegeState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState(false);
  /* Asked before, not recovered from after: nothing on any page says "this
     person lost BD Owner yesterday". */
  const [pending, setPending] = useState<{
    person: string;
    privId: string;
    privLabel: string;
    to: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/privileges", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.state) {
        setFailed(true);
        return;
      }
      setState(data.state as PrivilegeState);
    } catch {
      setFailed(true);
    }
  }, []);

  /* The same directory the roles list above reads. Suspended people are left
     out: a badge on somebody who cannot sign in explains nothing. */
  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/access", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.members)) {
        setPeopleFailed(true);
        return;
      }
      setPeopleFailed(false);
      setPeople(
        (data.members as Person[])
          .filter((m) => m.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      setPeopleFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPeople();
  }, [load, loadPeople]);

  const save = useCallback(
    async (next: PrivilegeState) => {
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
    },
    [load, toast]
  );

  if (failed || peopleFailed)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Could not load who holds what. Refresh and try again.
      </p>
    );

  if (!state || people === null)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-surface px-4 py-4 text-[12.5px] text-text-secondary">
        <Loader2 size={13} className="animate-spin text-blue-primary" />
        Loading privileges…
      </p>
    );

  if (people.length === 0)
    return (
      <p className="rounded-xl bg-surface px-4 py-4 text-center text-[12.5px] text-text-secondary">
        Nobody in the workspace yet.
      </p>
    );

  const applyPending = () => {
    if (!pending) return;
    const { person, privId, to } = pending;
    setPending(null);
    /* Reuse an existing key that differs only in case, so one person cannot
       end up with two rows in the store. */
    const key =
      Object.keys(state.peoplePrivileges).find(
        (n) => n.trim().toLowerCase() === person.trim().toLowerCase()
      ) ?? person;
    const current = new Set(state.peoplePrivileges[key] ?? []);
    if (to) current.add(privId);
    else current.delete(privId);

    const next = { ...state.peoplePrivileges };
    if (current.size) next[key] = [...current];
    else delete next[key];
    void save({ ...state, peoplePrivileges: next });
  };

  const privColor = (id: string) => privilegeColor(id);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-text-tertiary">
          A person can hold more than one. If two of them give different
          access to the same module, they get the higher one. Every change asks
          first and emails the admins.
        </p>
        {saving && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 align-bottom">
                Person
              </th>
              {state.privileges.map((p) => (
                <th key={p.id} className="px-3 py-3 text-center align-bottom">
                  <span className="whitespace-nowrap">{p.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {people.map((person) => {
              const held = new Set(privilegesForPerson(state, person.name));
              return (
                <tr key={person.id}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5 align-middle">
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        name={person.name}
                        className="h-7 w-7 shrink-0 text-[9px]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {person.name}
                        </span>
                        <span className="block truncate text-[11px] text-text-secondary">
                          {person.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  {state.privileges.map((p) => {
                    const on = held.has(p.id);
                    return (
                      <td key={p.id} className="px-3 py-2.5 text-center align-middle">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${p.label} for ${person.name}`}
                          onClick={() =>
                            setPending({
                              person: person.name,
                              privId: p.id,
                              privLabel: p.label,
                              to: !on,
                            })
                          }
                          /* Held is drawn solid here too, so the table and
                             the split say "yes" the same way. */
                          style={
                            on
                              ? {
                                  borderColor: privColor(p.id),
                                  backgroundColor: privColor(p.id),
                                  color: "#FFFFFF",
                                }
                              : undefined
                          }
                          className={cn(
                            "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition-colors",
                            on
                              ? "font-bold"
                              : "border-border-light bg-white text-transparent hover:border-blue-primary"
                          )}
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={applyPending}
        title={pending?.to ? "Give this privilege?" : "Take this privilege away?"}
        body={
          pending && (
            <>
              <b>{pending.person}</b> {pending.to ? "gets" : "loses"}{" "}
              <b>{pending.privLabel}</b>.
            </>
          )
        }
        detail={
          pending?.privId === VIEW_ALL && pending.to
            ? "View all lets them see every record in a module, including ones nobody assigned them. It never lets them change one. The admins are emailed."
            : "This changes what they can do as soon as you confirm. The admins are emailed."
        }
        confirmLabel={pending?.to ? "Give it" : "Take it away"}
        /* Giving is affirmative; only taking away is destructive (Anir, Aug
           29: "when I'm giving a privilege the red doesn't make sense"). */
        tone={pending?.to ? "primary" : "destructive"}
        busy={saving}
      />
    </div>
  );
}
