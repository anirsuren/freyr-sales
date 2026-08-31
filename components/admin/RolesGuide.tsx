"use client";

import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  ACCESS_META,
  GROUP_TYPE_META,
  PRIVILEGE_MODULES,
  privilegeColor,
  type Access,
  type PrivilegeState,
} from "@/lib/privileges";

/**
 * WHAT EACH ROLE ACTUALLY GETS.
 *
 * Anir, Aug 30: "we have new roles now, I need a guide for these roles. It
 * should be a question or something. When I click it, it should have a pop-up
 * that explains the roles."
 *
 * IT READS THE LIVE MATRIX, never a written description of it. A guide that
 * lists what somebody once decided is a guide that is wrong the first time an
 * admin edits a cell — and that table is edited from Admin, by design. Every
 * row here is rendered from the same state the app enforces, so the page
 * cannot say one thing while the app does another.
 *
 * The four words down the side are the ones the map already uses: no access,
 * view, edit, create — where create is an owner and edit is a member, which is
 * how Suren described it on Aug 29.
 */

const ORDER = [
  "bd_owner",
  "bd_member",
  "bo_owner",
  "bo_member",
  "sol_owner",
  "sol_member",
  "delivery_owner",
  "delivery_member",
  "admin",
  "view_all",
] as const;

export function RolesGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PrivilegeState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || state) return;
    fetch("/api/privileges", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d?.state ? setState(d.state as PrivilegeState) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [open, state]);

  const privileges = state
    ? [...state.privileges].sort(
        (a, b) =>
          (ORDER.indexOf(a.id as (typeof ORDER)[number]) + 1 || 99) -
          (ORDER.indexOf(b.id as (typeof ORDER)[number]) + 1 || 99)
      )
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="What each role can do"
        title="What each role can do"
        className={cn(
          "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary",
          className
        )}
      >
        <HelpCircle size={16} strokeWidth={2} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="What each role can do"
        size="wide"
        tall
        dialogClassName="!max-w-[min(1100px,calc(100vw-3rem))] !h-[min(760px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <p className="mb-4 max-w-[70ch] text-[13px] leading-relaxed text-text-secondary">
            A person holds one or more of these. What they may do in a module is
            the most generous of everything they hold, so extra privileges never
            take access away. <b className="font-semibold">Create</b> is an
            owner, <b className="font-semibold">Edit</b> is a member, and
            whoever can create is the only one who can delete.
          </p>

          {/* The four groups, in his words, with the privileges that belong to
              each — so somebody reading this knows why BD and BO differ before
              they read a single cell. */}
          <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {Object.entries(GROUP_TYPE_META).map(([key, meta]) => (
              <div
                key={key}
                className="rounded-lg border border-border-light p-3"
                style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
              >
                <p
                  className="text-[12.5px] font-bold"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                  {meta.blurb}
                </p>
              </div>
            ))}
          </div>

          {failed && (
            <p className="rounded-lg bg-surface px-4 py-3 text-[12.5px] text-text-secondary">
              The privilege table could not be read just now. Refresh and try
              again.
            </p>
          )}

          {state && (
            <div className="overflow-x-auto rounded-xl border border-border-light">
              <table className="w-full border-collapse bg-white text-left">
                <thead>
                  <tr className="border-b border-border-light bg-surface">
                    <th className="sticky left-0 z-[2] whitespace-nowrap bg-surface px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                      Module
                    </th>
                    {privileges.map((p) => (
                      <th
                        key={p.id}
                        className="whitespace-nowrap px-3 py-2 text-center text-[11px] font-bold"
                        style={{ color: privilegeColor(p.id) }}
                        title={p.blurb}
                      >
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRIVILEGE_MODULES.map((m) => (
                    <tr
                      key={m.key}
                      className="border-b border-border-light last:border-b-0 hover:bg-surface/50"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] whitespace-nowrap bg-white px-3 py-2 text-left text-[12.5px] font-semibold text-text-primary"
                      >
                        {m.label}
                      </th>
                      {privileges.map((p) => {
                        const level = (state.matrix[p.id]?.[m.key] ??
                          "none") as Access;
                        const meta = ACCESS_META[level];
                        return (
                          <td key={p.id} className="px-3 py-2 text-center">
                            {level === "none" ? (
                              <span className="text-[12px] text-text-tertiary/60">
                                ·
                              </span>
                            ) : (
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{
                                  background: `${meta.color}14`,
                                  color: meta.color,
                                }}
                              >
                                {meta.label}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11.5px] text-text-tertiary">
            This is the live table, not a description of it — an admin changing
            a cell in Privileges changes what this guide says.
          </p>
        </div>
      </Modal>
    </>
  );
}
