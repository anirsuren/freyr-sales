"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/InfoHint";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  ACCESS_META,
  PRIVILEGE_MODULES,
  type Access,
  type PrivilegeState,
} from "@/lib/privileges";

/**
 * PRIVILEGE MANAGEMENT — the grid off Suren's sheet, editable.
 *
 * Suren, Aug 29: "What is privilege management? These are the modules and
 * these are the privileges… If anybody has this privilege in this module, they
 * can write. For example, in a customer module, the BO owner privileged guy
 * cannot write, can only read."
 *
 * Modules down, privileges across, exactly as he drew it. Every cell is a
 * three-way toggle, saved the moment it changes — a grid with a Save button is
 * a grid somebody edits and then loses.
 *
 * EVERY ROW IS A DECISION, NOT A QUESTION. Suren's sheet covers eight of the
 * eighteen modules and he asked for the rest to be filled in; the ten I filled
 * in used to carry a "proposed" tag. Anir cut it: a permissions screen where
 * half the rows are marked as unconfirmed is asking the reader to re-decide it
 * every time they open it. The reasoning behind each of those ten lives in
 * defaultMatrix, and a cell that is wrong is one dropdown away from right.
 */
export function PrivilegesAdmin() {
  const { toast } = useToast();
  const [state, setState] = useState<PrivilegeState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  /* WHAT IS ABOUT TO CHANGE, held until it is confirmed (Suren, Aug 29: "when
     I change something it HAS to ask confirmation"). Permissions are the one
     table where a misclick is not visible afterwards — nothing on any page
     says "this person lost Write yesterday" — so the question is asked before
     the change, not recovered from after it. */
  const [pending, setPending] = useState<{
    privId: string;
    privLabel: string;
    moduleKey: string;
    moduleLabel: string;
    from: Access;
    to: Access;
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

  useEffect(() => {
    void load();
  }, [load]);

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


  if (failed)
    return (
      <p className="text-[13px] text-text-secondary">
        Could not load the privilege table. Refresh and try again.
      </p>
    );

  if (!state)
    return (
      <p className="flex items-center gap-2 text-[13px] text-text-secondary">
        <Loader2 size={14} className="animate-spin text-blue-primary" />
        Loading privileges…
      </p>
    );

  const applyPending = () => {
    if (!pending) return;
    const { privId, moduleKey, to } = pending;
    setPending(null);
    void save({
      ...state,
      matrix: {
        ...state.matrix,
        [privId]: { ...(state.matrix[privId] ?? {}), [moduleKey]: to },
      },
    });
  };

  return (
    <div>
      {/* The tab strip above already states what this page is; a second
          sentence saying it again is the thing he keeps cutting. Only the
          instruction the header does not carry stays. */}
      {/* NO SECOND PARAGRAPH (Anir, Aug 29: "why so much text, tuck this
          somewhere"). The tab already carries one line and a hint; a second
          sentence under it explaining the same screen was the wall he was
          pointing at. What it said — a change lands immediately, asks first,
          emails the admins — the confirm dialog says at the moment it matters,
          which is where it is actually read. */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {saving && (
          <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* NO ENFORCEMENT BANNER, AND NO SWITCH UNDER IT (Anir, Aug 29: "why the
          fuck would they stop enforcing it? Use your fucking brain. Remove
          that."). The table always decides, so a bar announcing that it does
          was a permanent green stripe saying nothing, and the button beside it
          was a way to turn the company's permissions off by accident. What the
          bar actually needed to say — that a change lands immediately — is one
          clause in the line above the grid. */}

      <div className="overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 align-bottom">
                Module
              </th>
              {state.privileges.map((p) => (
                <th key={p.id} className="px-3 py-3 align-bottom">
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    {p.label}
                    {p.blurb && <InfoHint text={p.blurb} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {/* EVERY ROW READS THE SAME (Anir, Aug 29: "remove the proposed
                stuff... use your head, what the fuck would we need? Don't say
                Proposed"). Ten of these eighteen were mine rather than off
                Suren's sheet and each carried a Proposed tag saying so, which
                turned a control panel into a document with footnotes and put
                the question back on him on every row. The answer for each one
                is settled in defaultMatrix; a cell that is wrong gets changed
                in the dropdown like any other. */}
            {PRIVILEGE_MODULES.map((m) => {
              return (
                <tr key={m.key}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 align-middle">
                    <span className="block whitespace-nowrap text-[13px] font-semibold text-text-primary">
                      {m.label}
                    </span>
                  </td>
                  {state.privileges.map((p) => {
                    const value: Access = state.matrix[p.id]?.[m.key] ?? "none";
                    return (
                      <td key={p.id} className="px-3 py-3 align-middle">
                        {/* ONE WIDTH FOR EVERY CELL (Anir, Aug 29: "I don't
                            like the way the pills look, some of them are long,
                            some of them are short, maybe just center it").
                            Sized to the longest word so Read, Write and No
                            access share an edge down the column, and a
                            dropdown rather than a click-to-cycle so the choice
                            is visible before it is made. */}
                        {/* FULL COLOUR, AND STILL A DROPDOWN (Anir, Aug 29:
                            "I like the colors you had before, like full
                            colors"). The tint and the ink ride in as CSS
                            variables — the hue is per-cell and Tailwind cannot
                            generate a class for a value it does not know at
                            build time — and the arbitrary selector paints the
                            TRIGGER only, never the options inside the menu. */}
                        <span
                          /* The pill keeps an edge in its own hue. Without one,
                             two tinted cells side by side ran together into a
                             single coloured band and the row stopped reading as
                             cells at all (found in the browser). */
                          /* THE TRIGGER HAS TO FIT ITS CELL. ColorSelect sizes
                             its button to its widest OPTION, not to the box it
                             is put in — 170px of button inside a 124px wrapper,
                             spilling over the next column, which is what read
                             as everything bleeding into everything (Anir, Aug
                             29: "why is it all bleeding?"). min-w-0 lets it
                             shrink, w-full pins it to the cell, and the
                             wrapper clips whatever still will not fit. */
                          className="block w-full min-w-0 overflow-hidden rounded-lg [&_button[aria-haspopup]]:!min-w-0 [&_button[aria-haspopup]]:!w-full [&_button[aria-haspopup]]:!border-[color:var(--cell-edge)] [&_button[aria-haspopup]]:!bg-[var(--cell-tint)] [&_button[aria-haspopup]]:!font-semibold [&_button[aria-haspopup]]:!text-[color:var(--cell-ink)]"
                          style={{
                            ["--cell-tint" as string]:
                              value === "none"
                                ? "transparent"
                                : `${ACCESS_META[value].color}14`,
                            ["--cell-edge" as string]: `${ACCESS_META[value].color}59`,
                            ["--cell-ink" as string]: ACCESS_META[value].color,
                          }}
                        >
                        <ColorSelect
                          value={value}
                          ariaLabel={`${p.label} on ${m.label}`}
                          collapsible={false}
                          dense
                          className="w-full min-w-0"
                          onChange={(next) => {
                            if (next === value) return;
                            setPending({
                              privId: p.id,
                              privLabel: p.label,
                              moduleKey: m.key,
                              moduleLabel: m.label,
                              from: value,
                              to: next as Access,
                            });
                          }}
                          options={(
                            /* The four Suren named, weakest first, so the menu
                               reads as an escalation rather than a set. Built
                               from ACCESS_LEVELS rather than written out here,
                               because the last time this list was a literal it
                               went stale the moment Access changed and took the
                               whole page down with it. */
                            ACCESS_LEVELS
                          ).map((a) => ({
                            value: a,
                            label: ACCESS_META[a].label,
                            color: ACCESS_META[a].color,
                          }))}
                        />
                        </span>
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
        title="Change this privilege?"
        body={
          pending && (
            <>
              <b>{pending.privLabel}</b> on <b>{pending.moduleLabel}</b> goes
              from <b>{ACCESS_META[pending.from].label}</b> to{" "}
              <b>{ACCESS_META[pending.to].label}</b>.
            </>
          )
        }
        detail="This changes what those people can do as soon as you confirm. The admins are emailed."
        confirmLabel="Change it"
        tone="destructive"
        busy={saving}
      />
    </div>
  );
}
