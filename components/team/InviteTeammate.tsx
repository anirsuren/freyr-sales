"use client";

import { FULL_NAME_HINT, isFullName } from "@/lib/fullName";
import { useState } from "react";
import { UserPlus, UserRound, UsersRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";

/* INVITING BELONGS WITH THE TEAM (Anir, Aug 12: "this should not be in the
   settings page. This should be in the team page. to invite someone… It should
   just be like a button to invite someone. It shouldn't take up a lot of
   space."). Settings had a four-column form permanently open on a page nobody
   visits to hire. Here it is one button in the header, and the form only
   exists once you have decided to use it. */

const ROLE_OPTIONS: ColorOption[] = [
  { value: "Rep", label: "Rep", color: "#0071E3", icon: UserRound },
  { value: "Manager", label: "Manager", color: "#7C3AED", icon: UsersRound },
  { value: "Admin", label: "Admin", color: "#0F766E", icon: ShieldCheck },
];

const ACCESS_ROLE: Record<string, string> = {
  Rep: "rep",
  Manager: "manager",
  Admin: "admin",
};

export function InviteTeammate({
  canInvite,
  workspaceDomain,
}: {
  canInvite: boolean;
  workspaceDomain: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Rep");
  /** Optional line the admin adds to the invitation email. */
  const [note, setNote] = useState("");

  function close() {
    if (busy) return;
    setOpen(false);
    setName("");
    setEmail("");
    setRole("Rep");
    setNote("");
  }

  async function send() {
    if (!name.trim() || !email.trim()) {
      toast("Full name and work email are both needed", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          name: name.trim(),
          email: email.trim(),
          role: ACCESS_ROLE[role] ?? "rep",
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That invite didn't go out.");
      // Say what actually happened to the email, never just "sent" — the
      // invitation row and the delivery are two different outcomes.
      const delivery = data.invitationDelivery?.emailResult as
        | { ok?: boolean; skipped?: boolean; error?: string }
        | undefined;
      if (delivery?.ok && !delivery.skipped) {
        toast(`Invitation emailed to ${email.trim()}`);
      } else {
        toast(
          delivery?.error
            ? `Invitation created, but the email failed: ${delivery.error}`
            : "Invitation created, but email delivery is not configured",
          "error"
        );
      }
      setOpen(false);
      setName("");
      setEmail("");
      setRole("Rep");
      setNote("");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "That invite didn't go out.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canInvite) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={14} strokeWidth={2.2} /> Invite
      </Button>
      {/* Same shape as New user group: wide, tall enough that the role
          dropdown does not fight the bottom edge, and the commit button
          bottom-right where every other dialog in the app puts it. */}
      <Modal open={open} onClose={close} title="Invite a teammate" size="wide" tall>
        <p className="text-[12.5px] text-text-secondary">
          They get an email with a link that signs them in. The link expires
          after 14 days, and you can change their role any time from Settings.
        </p>
        {/* ROLE FIRST, THEN WHO, THEN THE NOTE (Anir, Aug 13: "The drop down
            should be at the top, and then their full name and then their work
            email" … "a custom note too. That should be the last field").
            It reads the way the decision is actually made: what kind of access
            am I handing out, to whom, and anything I want to say about it. */}
        <div className="mt-4 space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
              Starting role
            </span>
            <ColorSelect
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS}
              ariaLabel="Starting role"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
              Full name
            </span>
            <Input
              autoComplete="name"
              placeholder="First and last name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name.trim() !== "" && !isFullName(name) && (
              <span className="mt-1 block text-[11px] text-[color:#B45309]">
                {FULL_NAME_HINT}
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
              Work email
            </span>
            <Input
              type="email"
              placeholder={`name@${workspaceDomain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
              Note <span className="font-normal text-text-tertiary">Optional</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="A line that goes in the invitation email: why you're bringing them in, what to look at first."
              className="w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary focus:shadow-input-focus"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end">
          <Button
            onClick={send}
            loading={busy}
            disabled={!isFullName(name) || !email.trim()}
          >
            Send invitation
          </Button>
        </div>
      </Modal>
    </>
  );
}
