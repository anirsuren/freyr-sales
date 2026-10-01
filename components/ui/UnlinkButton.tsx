"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * TAKE IT OUT RIGHT WHERE IT WAS ADDED (Anir, Oct 1: "if i add offering here
 * i cant delete it quickly u know? like when i hover i should have a delete
 * button showing up... extrapolate this out"). Adding a link is one click;
 * undoing a wrong one used to mean finding the form it was made in.
 *
 * A small red X that stays out of sight until its chip or row is hovered, or
 * it takes keyboard focus, so a list of links still reads as a list of links.
 * The wrapper says which: a chip carries `group/unlink`, a row or card
 * carries `group/unlinkrow`. Two names, so an X on a chip inside a row does
 * not appear the moment the row is hovered. `corner` is the chip version for
 * rows of chips that must not grow (the wrapper is also `relative`): the X
 * floats on the chip's corner instead of taking room beside it.
 *
 * Never put it inside a Link: render it beside the link, in the same wrapper.
 */
export function UnlinkX({
  label,
  onClick,
  within = "chip",
  icon = "x",
  disabled = false,
  className,
}: {
  /** What it does, naming both records: "Take AI Hub out of Agent.Fia". */
  label: string;
  onClick: () => void;
  within?: "chip" | "corner" | "row";
  icon?: "x" | "bin";
  disabled?: boolean;
  className?: string;
}) {
  const row = within === "row";
  const Icon = icon === "bin" ? Trash2 : X;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center text-[color:var(--status-red)] opacity-0 transition-opacity hover:bg-[rgba(220,38,38,0.08)] focus-visible:opacity-100 disabled:cursor-not-allowed",
        row
          ? "h-7 w-7 rounded-lg group-hover/unlinkrow:opacity-100"
          : within === "corner"
            ? "absolute -right-1.5 -top-1.5 z-10 h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-[rgba(220,38,38,0.3)] hover:bg-[#FEF2F2] group-hover/unlink:opacity-100"
            : "ml-0.5 h-5 w-5 rounded-full group-hover/unlink:opacity-100",
        className
      )}
    >
      <Icon size={row ? 14 : within === "corner" ? 10 : 12} strokeWidth={row ? 2.2 : 2.6} />
    </button>
  );
}

/**
 * The same X with its whole undo built in, for a server-rendered page that
 * cannot hold the confirm's state itself. It asks first, sends the request
 * the add flow already uses in reverse, says what happened, and refreshes.
 * Render it only for people the server would let make that change.
 */
export function UnlinkAction({
  label,
  within = "chip",
  icon = "x",
  request,
  confirm,
  done,
  className,
}: {
  label: string;
  within?: "chip" | "corner" | "row";
  icon?: "x" | "bin";
  request: { url: string; method: "PATCH" | "PUT" | "POST" | "DELETE"; body?: unknown };
  confirm: {
    title: string;
    body: ReactNode;
    detail?: ReactNode;
    confirmLabel: string;
    subject?: ComponentProps<typeof ConfirmDialog>["subject"];
  };
  /** The toast once it is done: "AI Hub is no longer part of Agent.Fia." */
  done: string;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(request.url, {
        method: request.method,
        ...(request.body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.body),
            }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not take it out.");
      }
      toast(done);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not take it out.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <UnlinkX
        label={label}
        within={within}
        icon={icon}
        onClick={() => setOpen(true)}
        disabled={busy}
        className={className}
      />
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void run()}
        title={confirm.title}
        body={confirm.body}
        detail={confirm.detail}
        subject={confirm.subject}
        confirmLabel={confirm.confirmLabel}
        busy={busy}
      />
    </>
  );
}
