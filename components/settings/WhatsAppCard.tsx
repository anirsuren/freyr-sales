"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";

/**
 * YOUR PHONE, CONNECTED TO YOUR AGENT (Anir, Sep 26: "every user to have a
 * number that they can text ... it's like their own personal agent").
 *
 * Nobody types a phone number. Freyr shows a six-digit code; the person texts
 * it to the workspace's WhatsApp number from their own phone, and the number
 * the text came from is the one that gets connected. Proof of possession, no
 * formatting arguments, no wrong digits.
 */

type Status = {
  configured: boolean;
  canSend: boolean;
  businessNumber: string;
  link: { number: string; linkedAt: string; name: string } | null;
  pending: { code: string; expires: string; waMe: string | null } | null;
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

export function WhatsAppCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  /* While a code is out there, watch for the text to arrive so the card flips
     to Connected on its own; the phone is in the other hand. */
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
        toast(`WhatsApp connected: ${next.link.number}.`);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status?.pending, load, toast]);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/whatsapp", { method: "POST" });
      const data = (await response.json().catch(() => null)) as (Status & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error || "Could not start.");
      setStatus(data);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not start the link.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/whatsapp", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as Status | null;
      if (!response.ok || !data) throw new Error("Could not disconnect.");
      setStatus(data);
      setConfirmOpen(false);
      toast("WhatsApp disconnected.");
    } catch {
      toast("Could not disconnect. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const configured = !!status?.configured;
  const startBlockedBecause = !status
    ? "Loading."
    : unavailable
      ? "WhatsApp settings are not reachable right now."
      : !configured
        ? "Freyr's WhatsApp number is not set up yet. An admin adds Meta's keys on the server."
        : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
          <MessageCircle size={15} strokeWidth={1.9} className="text-blue-primary" aria-hidden="true" />
          WhatsApp
          <InfoHint text="Text your Freyr agent from your own phone. It answers with your access, nothing more, and every WhatsApp chat also appears on the Agent page. Connecting takes one text: send the code shown here to Freyr's WhatsApp number from the phone you want to use." />
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
      ) : status?.pending ? (
        <div className="mt-2.5 rounded-xl border border-blue-primary/30 bg-blue-light/60 p-4">
          <p className="text-[12.5px] text-text-secondary">
            From your phone, text this code to{" "}
            <span className="font-medium tabular-nums text-text-primary">
              {status.businessNumber || "Freyr's WhatsApp number"}
            </span>
            . It works for 15 minutes.
          </p>
          <p className="mt-2 font-mono text-[30px] font-semibold tracking-[0.18em] tabular-nums text-text-primary">
            {fmtCode(status.pending.code)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status.pending.waMe ? (
              <a
                href={status.pending.waMe}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-hover"
              >
                Open WhatsApp with the code
              </a>
            ) : null}
            <Button type="button" variant="ghost" className="px-3 py-2 text-[13px]" onClick={() => void start()} disabled={busy}>
              <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
              New code
            </Button>
            <span className="text-[11.5px] text-text-tertiary">Waiting for your text…</span>
          </div>
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
            onClick={() => void start()}
            disabled={busy || !!startBlockedBecause}
            title={startBlockedBecause ?? undefined}
            loading={busy}
          >
            Connect my phone
          </Button>
        </div>
      )}

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
