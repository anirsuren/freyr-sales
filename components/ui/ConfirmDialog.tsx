"use client";

import { AlertTriangle, BriefcaseBusiness, Building2, CalendarDays, FileSignature, FileText, HelpCircle, MessageSquare, Newspaper, Package, Target, UserRound, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { cn } from "@/lib/utils";

type ConfirmSubject = {
  name: string;
  kind: "company" | "person" | "offering" | "story" | "document" | "goal" | "contract" | "opportunity" | "meeting" | "record";
  imageUrl?: string | null;
};

function recordIcon(title: string): LucideIcon {
  if (/person|contact|owner|contributor|member/i.test(title)) return UserRound;
  if (/compan|account|customer|competitor/i.test(title)) return Building2;
  if (/stor|article/i.test(title)) return Newspaper;
  if (/offering|product/i.test(title)) return Package;
  if (/opportunit|deal/i.test(title)) return BriefcaseBusiness;
  if (/document|material|file|snippet|version|component|feature/i.test(title)) return FileText;
  if (/goal|target|milestone/i.test(title)) return Target;
  if (/contract/i.test(title)) return FileSignature;
  if (/meeting/i.test(title)) return CalendarDays;
  if (/chat|sequence/i.test(title)) return MessageSquare;
  return AlertTriangle;
}

function subjectIcon(kind: ConfirmSubject["kind"]): LucideIcon {
  return {
    company: Building2,
    person: UserRound,
    offering: Package,
    story: Newspaper,
    document: FileText,
    goal: Target,
    contract: FileSignature,
    opportunity: BriefcaseBusiness,
    meeting: CalendarDays,
    record: FileText,
  }[kind];
}

/**
 * ASKING "ARE YOU SURE" IN THE APP'S OWN VOICE.
 *
 * The browser's confirm() was standing in for this, and it announces itself as
 * "localhost:3001 says" in a system dialog that belongs to no product (Anir,
 * Jul 29: "can you please make a proper pop-up, these pop-ups are not proper").
 * It also cannot say what the consequence is, cannot show the name of the thing
 * being destroyed, and cannot colour its own dangerous button red.
 *
 * This can do all three, so a destructive action states exactly what will
 * happen before it happens.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  detail,
  subject,
  person,
  personPhoto,
  confirmLabel = "Remove",
  busy = false,
  tone = "destructive",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** The sentence a person reads to decide. */
  body: React.ReactNode;
  /** The consequence they might not have thought about. Optional. */
  detail?: React.ReactNode;
  /** The record affected by this confirmation, with its actual visual when available. */
  subject?: ConfirmSubject | null;
  /** The person this decision affects. Their photo replaces the generic icon. */
  person?: string | null;
  personPhoto?: string | null;
  confirmLabel?: string;
  busy?: boolean;
  /**
   * RED MEANS DESTRUCTIVE, AND ONLY DESTRUCTIVE (Anir, Aug 21, on the
   * make-this-current confirmation: "Why is that a red button?").
   *
   * This dialog was written for deletes and hardwired the whole vocabulary of
   * one — red button, warning triangle, "Removing…" — so the first
   * non-destructive thing to ask a question through it announced itself as
   * damage. Red is a reserved colour in this app; a confirmation that nothing
   * gets destroyed by wears the ordinary primary blue.
   */
  tone?: "destructive" | "primary";
}) {
  const affected = subject ?? (person ? { name: person, kind: "person" as const, imageUrl: personPhoto } : null);
  const ContextIcon = affected ? subjectIcon(affected.kind) : recordIcon(title);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3.5">
        <span aria-hidden="true" className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-white shadow-sm">
          {affected?.kind === "company" ? (
            <MiLogo name={affected.name} logoUrl={affected.imageUrl} className="h-10 w-10 rounded-xl" />
          ) : affected?.kind === "person" ? (
            <Avatar name={affected.name} src={affected.imageUrl} className="h-10 w-10 rounded-xl text-[13px]" />
          ) : affected ? (
            <ContextIcon size={19} strokeWidth={2} className="text-blue-primary" />
          ) : tone === "primary" && ContextIcon === AlertTriangle ? (
            <HelpCircle size={19} strokeWidth={2} className="text-blue-primary" />
          ) : (
            <ContextIcon size={19} strokeWidth={2} className={tone === "primary" ? "text-blue-primary" : "text-[#B02020]"} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 text-[13.5px] leading-relaxed text-text-primary">
              {body}
            </p>
          </div>
          {detail && (
            <p
              className={cn(
                "mt-1.5 text-[12.5px] leading-relaxed text-text-secondary"
              )}
            >
              {detail}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {/* Red when the action destroys something, and the button says so
            before the click rather than after. Blue when it does not. */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            "inline-flex items-center justify-center rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50",
            tone === "primary"
              ? "bg-blue-primary hover:bg-[color:#0062C4]"
              : "bg-[color:#B02020] hover:bg-[color:#8F1A1A]"
          )}
        >
          {busy ? (tone === "primary" ? "Saving…" : "Removing…") : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
