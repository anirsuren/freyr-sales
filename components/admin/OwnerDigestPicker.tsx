"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, FolderOpen, Loader2 } from "lucide-react";
import { emailTemplates } from "@/lib/emailTemplates";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

/**
 * PICKING AN OFFERING OWNER TO REMIND (Saras, Aug 25: "an automated email draft
 * for offering owners... the date that they were made Offering Owner, a table
 * of when they last uploaded files in each of the 12 folders, and a general
 * reminder to check and update their sales material content").
 *
 * The list leads with the facts that decide WHO needs the reminder — how many
 * files they hold, how many folders are still empty, how stale the stalest one
 * is — because "email every owner" is rarely the right answer and a list with
 * no numbers on it forces you to guess.
 *
 * Loading a draft only fills the composer. Nothing sends until an admin presses
 * Send, twice, like any other mail.
 */

type OwnerRow = {
  offeringId: string;
  offeringName: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerSince: string | null;
  totalFiles: number;
  emptyFolders: number;
  folderCount: number;
  stalestDays: number | null;
};

const TEMPLATES = emailTemplates();

export function OwnerDigestPicker({
  onLoad,
}: {
  onLoad: (draft: { to: string; subject: string; html: string }) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  /** THE TEMPLATE YOU PICKED, HELD SO IT CAN BE SHOWN (Anir, Aug 30: "when I
   *  click on an option, it should show me at the top. If I click into Remind
   *  an offering owner, it should show me at the top that I picked that, and
   *  then I click on the person and then I click on the offering").
   *
   *  It used to be a bare boolean, so the second step was a list of names with
   *  nothing saying what you were in the middle of. */
  const [picking, setPicking] = useState<{ id: string; name: string } | null>(
    null
  );
  /** Step two of that template: the person, then their offering. A person can
   *  own several, and the old list flattened person x offering into one row —
   *  the same face four times, which is not a list of people. */
  const [person, setPerson] = useState<string | null>(null);
  const [rows, setRows] = useState<OwnerRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /* CLICK AWAY SHUTS IT (Anir, Aug 26: "when I click outside these dropdowns
     it's supposed to toggle off, but it's not doing that"). Every other menu
     in the app closes itself from a native document listener; this one was
     built without it and stayed open until its own button was pressed again.
     mousedown, not click, so it matches the rest and beats any handler that
     stops click from bubbling. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (boxRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPicking(null);
      setPerson(null);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      setOpen(false);
      setPicking(null);
      setPerson(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email/owner-digest", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok) setRows(data.owners ?? []);
      else setRows([]);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (open && rows === null) void load();
  }, [open, rows, load]);

  async function pick(row: OwnerRow) {
    if (!row.ownerEmail) {
      toast(`${row.ownerName} has no email address on file.`, "error");
      return;
    }
    const key = `${row.offeringId}:${row.ownerName}`;
    setBusy(key);
    try {
      const res = await fetch(
        `/api/admin/email/owner-digest?offering=${encodeURIComponent(row.offeringId)}&owner=${encodeURIComponent(row.ownerName)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!data?.ok) {
        toast(data?.error || "Could not build that draft.", "error");
        return;
      }
      onLoad({ to: data.to, subject: data.subject, html: data.html });
      setOpen(false);
      toast(`Draft loaded for ${row.ownerName}. Edit it, then send.`);
    } catch {
      toast("Could not build that draft.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    /* TUCKED AWAY (Anir, Aug 26: "you can keep start from a draft but I need it
       hidden, tucked up away somewhere"). One small button on the title line
       rather than a labelled block above the To field, and the list drops as a
       popover so it never pushes the form down the page. */
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setPicking(null);
          setPerson(null);
        }}
        aria-expanded={open}
        aria-label="Start from a template"
        title="Start from a template"
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold transition-colors",
          open
            ? "border-blue-subtle bg-blue-light text-blue-primary"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        <FileText size={13} strokeWidth={2.2} />
        Templates
        <ChevronDown
          size={12}
          strokeWidth={2.3}
          className={cn("transition-transform duration-200", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="tab-panel absolute right-0 z-40 mt-1.5 w-[420px] max-w-[86vw] overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]">
          {/* WHAT YOU PICKED, AT THE TOP (Anir, Aug 30: "when I click on an
              option, it should show me at the top... it should show me at the
              top that I picked that, and then I click on the person and then I
              click on the offering"). The second step used to be a bare list of
              names with nothing above it naming the template you were inside,
              so a menu two levels deep looked like a menu one level deep. */}
          <div className="border-b border-border-light bg-surface/60 px-3.5 py-2">
            {picking && (
              <span className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-light px-2 py-0.5 font-semibold text-blue-primary">
                  <FileText size={11} strokeWidth={2.3} />
                  {picking.name}
                </span>
                {person && (
                  <>
                    <ChevronDown
                      size={11}
                      strokeWidth={2.4}
                      className="-rotate-90 text-text-tertiary"
                    />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2 font-semibold text-text-primary">
                      <Avatar name={person} className="h-4 w-4 shrink-0 text-[6px]" />
                      {person}
                    </span>
                  </>
                )}
              </span>
            )}
            <p className="text-[12px] text-text-secondary">
              {!picking
                ? "Pick one and it loads the subject and the message. Everything stays editable, and nothing sends until you press Send."
                : person
                  ? "Now pick which of their offerings the reminder is about."
                  : "Pick the owner. The message is built from their offering's shelf: every folder, when it was last added to, and what has aged."}
            </p>
          </div>

          {!picking && (
            <ul className="max-h-[340px] overflow-y-auto py-1">
              {TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (tpl.perOwner) {
                          setPicking({ id: tpl.id, name: tpl.name });
                          setPerson(null);
                          return;
                        }
                        onLoad({ to: "", subject: tpl.subject, html: tpl.body });
                        setOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${tpl.color}1F`, color: tpl.color }}
                      >
                        <Icon size={14} strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-text-primary">
                          {tpl.name}
                        </span>
                        <span className="block text-[11.5px] leading-snug text-text-tertiary">
                          {tpl.hint}
                        </span>
                      </span>
                      {tpl.perOwner && (
                        <ChevronDown
                          size={13}
                          strokeWidth={2.2}
                          className="mt-1.5 shrink-0 -rotate-90 text-text-tertiary"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {picking && (
            <button
              type="button"
              /* Back one step, not out: from an owner's offerings you go back
                 to the owners, and only from there to the templates. */
              onClick={() => (person ? setPerson(null) : setPicking(null))}
              className="flex w-full cursor-pointer items-center gap-1.5 border-b border-border-light px-3.5 py-2 text-left text-[12px] font-semibold text-blue-primary transition-colors hover:bg-surface"
            >
              <ChevronDown size={12} strokeWidth={2.4} className="rotate-90" />
              {person ? "All owners" : "All templates"}
            </button>
          )}
          {!picking ? null : rows === null ? (
            <p className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-text-tertiary">
              <Loader2 size={13} className="animate-spin" /> Reading the shelves…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-text-secondary">
              No offering has an owner yet, so there is nobody to remind.
            </p>
          ) : !person ? (
            /* STEP ONE: THE PEOPLE. One row per person, not per person-and-
               offering — the old list drew the same face four times because it
               flattened the pair, which is a list of offerings wearing faces
               rather than a list of owners. */
            <div className="max-h-[320px] overflow-y-auto">
              {[...new Map(rows.map((r) => [r.ownerName, r])).values()].map(
                (r) => {
                  const mine = rows.filter((x) => x.ownerName === r.ownerName);
                  const empties = mine.reduce((n, x) => n + x.emptyFolders, 0);
                  return (
                    <button
                      key={r.ownerName}
                      type="button"
                      onClick={() => {
                        /* One offering means no second list: a menu with a
                           single row in it is a click that decides nothing. */
                        if (mine.length === 1) void pick(mine[0]);
                        else setPerson(r.ownerName);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-surface"
                    >
                      <Avatar name={r.ownerName} className="h-7 w-7 shrink-0 text-[9px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {r.ownerName}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {mine.length === 1
                            ? mine[0].offeringName
                            : `${mine.length} offerings`}
                        </span>
                      </span>
                      {empties > 0 && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11.5px] font-bold text-[color:#B45309] tnum">
                          {empties} empty
                        </span>
                      )}
                      <ChevronDown
                        size={13}
                        strokeWidth={2.2}
                        className="shrink-0 -rotate-90 text-text-tertiary"
                      />
                    </button>
                  );
                }
              )}
            </div>
          ) : (
            /* STEP TWO: WHICH OF THEIRS. */
            <div className="max-h-[320px] overflow-y-auto">
              {rows
                .filter((r) => r.ownerName === person)
                .map((r) => {
                  const key = `${r.offeringId}:${r.ownerName}`;
                  /* Amber, not red: a stale folder is a nudge, and red in this
                     app means somebody rejected something. */
                  const needsIt = r.emptyFolders > 0 || (r.stalestDays ?? 0) >= 90;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy === key}
                      onClick={() => pick(r)}
                      className="flex w-full cursor-pointer items-center gap-2.5 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-surface disabled:opacity-60"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-light text-blue-primary">
                        <FolderOpen size={13} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {r.offeringName}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {r.totalFiles} {r.totalFiles === 1 ? "file" : "files"}
                          {r.ownerSince && ` · owner since ${formatDate(r.ownerSince)}`}
                        </span>
                      </span>
                      {needsIt && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11.5px] font-bold text-[color:#B45309] tnum">
                          {r.emptyFolders > 0
                            ? `${r.emptyFolders} empty`
                            : `${r.stalestDays}d old`}
                        </span>
                      )}
                      {busy === key && (
                        <Loader2 size={13} className="shrink-0 animate-spin text-blue-primary" />
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
