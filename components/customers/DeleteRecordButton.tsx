"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * DELETE IT FROM THE PAGE IT IS SHOWN ON.
 *
 * Anir, Oct 1: "It's really easy to add them, but if I do something wrong,
 * it's a huge problem. It should just be super easy to delete."
 *
 * An account could only be deleted from /customers/[id]/edit, a page nothing
 * links to any more, and a contact only from its account's Contacts tab. Both
 * record pages render on the server, so this is the one small client piece
 * their headers need: the red button, the app's own confirmation, the DELETE,
 * and the trip to somewhere that still exists once the record does not.
 *
 * The page decides whether to draw it, asking the question its route asks, so
 * nobody is handed a control that would only be refused. A refusal that still
 * comes back is shown as the route words it, because it names what is in the
 * way: an account with live deals says how many, and to move them first.
 */
export function DeleteRecordButton({
  endpoint,
  label,
  subject,
  title,
  body,
  detail,
  confirmLabel,
  done,
  then,
  compact = false,
}: {
  /** The record's own DELETE route, e.g. /api/customers/{id}. */
  endpoint: string;
  /** What the button says. */
  label: string;
  /** The record going, with its logo or face in the confirmation. */
  subject: { name: string; kind: "company" | "person" };
  title: string;
  body: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel: string;
  /** The toast once it is gone. */
  done: string;
  /** Where to land. The page this sits on stops existing the moment it works. */
  then: string;
  /** The contact header's smaller chips, so it sits level with them. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error || "That did not delete.", "error");
        setBusy(false);
        setOpen(false);
        return;
      }
      toast(done, "success");
      /* Stays on "Removing…" until the next page arrives. Closing first would
         flash the record back up as though nothing had happened. */
      router.push(then);
      router.refresh();
    } catch {
      toast("That did not delete. Check your connection and try again.", "error");
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      {/* Red at rest, not only on hover, like every delete in the app: it
          should read as the dangerous one before the pointer gets there. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-1.5 border border-[rgba(220,38,38,0.35)] bg-white font-medium text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)]",
          compact
            ? "rounded-lg px-2.5 py-1.5 text-[12.5px]"
            : "rounded-md px-3 py-2 text-[13px]"
        )}
      >
        <Trash2 size={compact ? 13 : 15} strokeWidth={compact ? 2 : 1.7} />
        {label}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void remove()}
        busy={busy}
        subject={subject}
        title={title}
        body={body}
        detail={detail}
        confirmLabel={confirmLabel}
      />
    </>
  );
}
