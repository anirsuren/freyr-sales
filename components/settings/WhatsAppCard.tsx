"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * YOUR PHONE, CONNECTED TO YOUR AGENT (Anir, Sep 26: "every user to have a
 * number that they can text ... it's like their own personal agent").
 *
 * Nobody types a phone number. Freyr shows a six-digit code; the person texts
 * it to the workspace's WhatsApp number from their own phone, and the number
 * the text came from is the one that gets connected. Proof of possession, no
 * formatting arguments, no wrong digits.
 *
 * The code lives in a POP-UP, not on the card (Anir, Sep 27, on prod: "this
 * is ugly... it should be like a pop-up"): Connect opens a fixed-size dialog
 * with the QR on one side and the code on the other, and the dialog turns
 * into "Connected" on its own when the text lands. The card only ever says
 * connected or not.
 */

type Status = {
  configured: boolean;
  canSend: boolean;
  businessNumber: string;
  link: { number: string; linkedAt: string; name: string } | null;
  pending: { code: string; expires: string; waMe: string | null; qr: string | null } | null;
};

const POLL_MS = 4_000;

function fmtCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** mm:ss until the code stops working; "0:00" once it has. */
function remaining(expires: string, now: number) {
  const left = Math.max(0, Math.floor((Date.parse(expires) - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export function WhatsAppCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  /* The dialog keeps showing "Connected" after the text lands, until Done. */
  const [linkedInDialog, setLinkedInDialog] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const hadPending = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/whatsapp", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as Status;
      setStatus(next);
      setUnavailable(false);
      return next;
    } catch {
      setUnavailable(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* While a code is out there, watch for the text to arrive so the dialog and
     the card flip to Connected on their own; the phone is in the other hand. */
  useEffect(() => {
    if (!status?.pending) {
      hadPending.current = false;
      return;
    }
    hadPending.current = true;
    const timer = setInterval(async () => {
      const next = await load();
      if (next?.link && hadPending.current) {
        hadPending.current = false;
        setLinkedInDialog(true);
        toast(`WhatsApp connected: ${next.link.number}.`);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status?.pending, load, toast]);

  /* The countdown only ticks while the dialog shows a code. */
  useEffect(() => {
    if (!dialogOpen || !status?.pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [dialogOpen, status?.pending]);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/whatsapp", { method: "POST" });
      const data = (await response.json().catch(() => null)) as (Status & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error || "Could not start.");
      setStatus(data);
      setNow(Date.now());
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not start the link.", "error");
      setDialogOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function openConnect() {
    setLinkedInDialog(false);
    setDialogOpen(true);
    if (!status?.pending || Date.parse(status.pending.expires) <= Date.now()) void start();
  }

  async function disconnect(quiet = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/whatsapp", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as Status | null;
      if (!response.ok || !data) throw new Error("Could not disconnect.");
      setStatus(data);
      setConfirmOpen(false);
      if (!quiet) toast("WhatsApp disconnected.");
    } catch {
      toast("Could not disconnect. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* Closing the dialog while a code is still out there withdraws the code, so
     nothing is left waiting for a text nobody will send. */
  function closeDialog() {
    setDialogOpen(false);
    if (status?.pending && !status.link) void disconnect(true);
  }

  const configured = !!status?.configured;
  const startBlockedBecause = !status
    ? "Loading."
    : unavailable
      ? "WhatsApp settings are not reachable right now."
      : !configured
        ? "Freyr's WhatsApp number is not set up yet. An admin adds Meta's keys on the server."
        : null;
  const pending = status?.pending ?? null;
  const expired = !!pending && Date.parse(pending.expires) <= now;
  const showConnected = !!status?.link && (linkedInDialog || !pending);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
          <MessageCircle size={15} strokeWidth={1.9} className="text-blue-primary" aria-hidden="true" />
          WhatsApp
          <InfoHint text="Text your Freyr agent from your own phone. It answers with your access, nothing more, and every WhatsApp chat also appears on the Agent page. Connecting takes one text: scan the code shown when you press Connect, or type it, from the phone you want to use." />
        </span>
        <span className="text-[12px] font-medium text-text-secondary">
          {!status ? "" : status.link ? "Connected" : configured ? "Not connected" : "Not set up"}
        </span>
      </div>

      {status?.link ? (
        <div className="mt-2.5 flex items-center justify-between gap-4">
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            <span className="font-medium tabular-nums text-text-primary">{status.link.number}</span>
            {status.link.linkedAt ? ` since ${fmtDay(status.link.linkedAt)}` : ""}
            {status.businessNumber ? `. Text ${status.businessNumber} and the agent answers.` : ". Text Freyr's number and the agent answers."}
            {!status.canSend ? " Replies are switched off on the server until the Meta access token is added." : ""}
          </p>
          <Button
            type="button"
            variant="destructive"
            className="shrink-0 px-3.5 py-2 text-[13px]"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-between gap-4">
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            {startBlockedBecause ?? "Connect your phone and ask the agent from WhatsApp. Chats show up on the Agent page too."}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 px-3.5 py-2 text-[13px]"
            onClick={openConnect}
            disabled={busy || !!startBlockedBecause}
            title={startBlockedBecause ?? undefined}
          >
            Connect my phone
          </Button>
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={showConnected ? () => setDialogOpen(false) : closeDialog}
        title={showConnected ? "WhatsApp connected" : "Connect your phone"}
        size="wide"
        bodyClassName="h-[360px]"
      >
        {showConnected && status?.link ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <CheckCircle2 size={44} strokeWidth={1.6} className="text-success" aria-hidden="true" />
            <p className="mt-4 text-[17px] font-semibold text-text-primary">
              Connected as {status.link.name || status.link.number}
            </p>
            <p className="mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-text-secondary">
              Text {status.businessNumber || "Freyr's number"} from{" "}
              <span className="font-medium tabular-nums text-text-primary">{status.link.number}</span> and your agent answers.
              Every chat also shows up on the Agent page.
            </p>
            <Button type="button" variant="primary" className="mt-6 px-5 py-2 text-[13px]" onClick={() => setDialogOpen(false)}>
              Done
            </Button>
          </div>
        ) : !pending ? (
          <div className="flex h-full items-center justify-center text-[13px] text-text-secondary">Getting your code…</div>
        ) : (
          <div className="flex h-full flex-col">
            <p className="text-[13px] leading-relaxed text-text-secondary">
              One text from the phone you want to use connects it. Scan the code with your phone, or type it into WhatsApp yourself.
            </p>
            <div className="mt-4 grid flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-6">
              <section className="flex flex-col items-center justify-center text-center">
                {pending.qr ? (
                  <img
                    src={pending.qr}
                    alt="QR code that opens WhatsApp with the code filled in"
                    width={184}
                    height={184}
                    className="rounded-xl border border-border-light bg-white p-1.5"
                  />
                ) : null}
                <p className="mt-3 text-[13px] font-medium text-text-primary">Scan with your phone</p>
                <p className="mt-0.5 max-w-[220px] text-[12px] leading-snug text-text-secondary">
                  WhatsApp opens with the code typed in. Press send.
                </p>
              </section>
              <div className="bg-border-light" aria-hidden="true" />
              <section className="flex flex-col items-center justify-center text-center">
                <p className="text-[13px] font-medium text-text-primary">Or text this code</p>
                <p className="mt-0.5 text-[12px] text-text-secondary">
                  to <span className="font-medium tabular-nums text-text-primary">{status?.businessNumber || "Freyr's WhatsApp number"}</span>
                </p>
                <p
                  className={`mt-3 font-mono text-[34px] font-semibold tracking-[0.2em] tabular-nums ${expired ? "text-text-tertiary line-through" : "text-text-primary"}`}
                >
                  {fmtCode(pending.code)}
                </p>
                {pending.waMe ? (
                  <a
                    href={pending.waMe}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center justify-center rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-hover"
                  >
                    Open WhatsApp with the code
                  </a>
                ) : null}
              </section>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border-light pt-3 text-[12px] text-text-tertiary">
              <span className="flex items-center gap-2">
                {expired ? (
                  "This code has expired."
                ) : (
                  <>
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-primary" aria-hidden="true" />
                    Waiting for your text… this flips to Connected on its own.
                  </>
                )}
              </span>
              <span className="flex items-center gap-3">
                {!expired ? <span className="tabular-nums">Code works for {remaining(pending.expires, now)}</span> : null}
                <Button type="button" variant="ghost" className="px-2.5 py-1.5 text-[12px]" onClick={() => void start()} disabled={busy}>
                  <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
                  New code
                </Button>
              </span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void disconnect()}
        title="Disconnect WhatsApp?"
        body={
          <>
            Texts from <span className="font-medium tabular-nums">{status?.link?.number}</span> will no longer reach your agent.
          </>
        }
        detail="The chats already on the Agent page stay there."
        confirmLabel="Disconnect"
        busy={busy}
      />
    </div>
  );
}
