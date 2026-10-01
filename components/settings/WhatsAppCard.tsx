"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { PhoneSetupDialog, WHATSAPP_CHANGED_EVENT, type PhoneSetupOutcome } from "@/components/onboarding/PhoneSetupDialog";

/**
 * YOUR PHONE, CONNECTED TO YOUR AGENT (Anir, Sep 26: "every user to have a
 * number that they can text ... it's like their own personal agent").
 *
 * Nobody types a phone number. Freyr shows a six-digit code; the person texts
 * it to the workspace's WhatsApp number from their own phone, and the number
 * the text came from is the one that gets connected. Proof of possession, no
 * formatting arguments, no wrong digits.
 *
 * Connect opens THE phone-setup pop-up, the same one a new account sees at
 * sign-up (Anir, Oct 1: "In settings, I should be able to bring this pop-up
 * back to set it up"): QR on the left, the agent at work on the right, and it
 * turns to "connected" on its own when the text lands. The card only ever
 * says connected or not.
 */

type Status = {
  configured: boolean;
  canSend: boolean;
  businessNumber: string;
  link: { number: string; linkedAt: string; name: string } | null;
  pending: { code: string; expires: string; waMe: string | null; qr: string | null } | null;
};

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
  const [dialogOpen, setDialogOpen] = useState(false);

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
    // A phone connected from the pop-up anywhere in the app shows here at once.
    const refresh = () => void load();
    window.addEventListener(WHATSAPP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WHATSAPP_CHANGED_EVENT, refresh);
  }, [load]);

  function closeDialog(outcome: PhoneSetupOutcome) {
    setDialogOpen(false);
    void load().then((next) => {
      if (outcome === "connected" && next?.link) toast(`WhatsApp connected: ${next.link.number}.`);
    });
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
          <InfoHint text="Text your Freyr agent from your own phone. It answers with your access, nothing more, and every WhatsApp chat also appears on the Agent page. Connecting takes one text: scan the QR code that Connect shows, or type the code, from the phone you want to use." />
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
            onClick={() => setDialogOpen(true)}
            disabled={busy || !!startBlockedBecause}
            title={startBlockedBecause ?? undefined}
          >
            Connect my phone
          </Button>
        </div>
      )}

      {dialogOpen && <PhoneSetupDialog mode="settings" onClose={closeDialog} />}

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
