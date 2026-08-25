"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FileText, FolderOpen, Loader2 } from "lucide-react";
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

export function OwnerDigestPicker({
  onLoad,
}: {
  onLoad: (draft: { to: string; subject: string; html: string }) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OwnerRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
      >
        <FileText size={13} strokeWidth={2.2} />
        Start from a draft: remind an offering owner
        <ChevronDown
          size={13}
          strokeWidth={2.3}
          className={cn("transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="tab-panel mt-2 overflow-hidden rounded-xl border border-border-light">
          <p className="border-b border-border-light bg-surface/60 px-3.5 py-2 text-[12px] text-text-secondary">
            Each draft carries the date they became owner, every folder on that
            offering&apos;s shelf with when it was last added to, and a reminder
            to refresh what has aged.
          </p>
          {rows === null ? (
            <p className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-text-tertiary">
              <Loader2 size={13} className="animate-spin" /> Reading the shelves…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-text-secondary">
              No offering has an owner yet, so there is nobody to remind.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {rows.map((r) => {
                const key = `${r.offeringId}:${r.ownerName}`;
                /* Amber, not red: a stale folder is a nudge, and red in this
                   app means somebody rejected something. */
                const needsIt =
                  r.emptyFolders > 0 || (r.stalestDays ?? 0) >= 90;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy === key}
                    onClick={() => pick(r)}
                    className="flex w-full cursor-pointer items-center gap-2.5 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-surface disabled:opacity-60"
                  >
                    <Avatar name={r.ownerName} className="h-7 w-7 shrink-0 text-[9px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-text-primary">
                        {r.ownerName}
                      </span>
                      <span className="block truncate text-[12px] text-text-secondary">
                        {r.offeringName}
                        {r.ownerSince && ` · owner since ${formatDate(r.ownerSince)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] tnum">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-semibold text-text-secondary">
                        <FolderOpen size={10} strokeWidth={2.2} />
                        {r.totalFiles}
                      </span>
                      {needsIt && (
                        <span className="whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 font-bold text-[color:#B45309]">
                          {r.emptyFolders > 0
                            ? `${r.emptyFolders} empty`
                            : `${r.stalestDays}d old`}
                        </span>
                      )}
                    </span>
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
