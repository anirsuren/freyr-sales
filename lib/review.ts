// Compliance review states — shared by the session workspace, the sessions
// list, and anywhere else a pitch's review standing shows. One source of
// truth for the chip AND the plain-English "what this means" line (Anir,
// Jul 5: "What is Submit for Review supposed to do?" — the UI now answers).
import {
  PencilLine,
  Clock,
  CircleCheck,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { ReviewStatus } from "./types";

export const REVIEW_META: Record<
  ReviewStatus,
  { label: string; bg: string; color: string; icon: LucideIcon; explain: string }
> = {
  draft: {
    label: "Draft",
    // Slate, not flat gray — every status chip is a deliberate colour + icon
    // (Suren's chip rule), and draft still stays the calmest of the four.
    bg: "rgba(71,85,105,0.12)",
    color: "#475569",
    icon: PencilLine,
    explain:
      "Compliance gate: submit this pitch for review — Send email and Send to CRM stay locked until it's approved, so nothing unvetted reaches a customer.",
  },
  in_review: {
    label: "In review",
    bg: "rgba(255,159,10,0.14)",
    color: "#7A4A00",
    icon: Clock,
    explain:
      "Waiting on compliance sign-off. In this workspace you're also the reviewer — Approve it or send it back with changes.",
  },
  approved: {
    label: "Approved",
    bg: "rgba(52,199,89,0.14)",
    color: "#1A7A35",
    icon: CircleCheck,
    explain:
      "Cleared by compliance — Send email and Send to CRM are unlocked for this pitch.",
  },
  changes_requested: {
    label: "Changes requested",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
    icon: RotateCcw,
    explain:
      "Compliance sent this back. Edit the pitch, then resubmit for review.",
  },
};
