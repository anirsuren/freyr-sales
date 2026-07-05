// Compliance review states — shared by the session workspace, the sessions
// list, and anywhere else a pitch's review standing shows. One source of
// truth for the chip AND the plain-English "what this means" line (Anir,
// Jul 5: "What is Submit for Review supposed to do?" — the UI now answers).
import type { ReviewStatus } from "./types";

export const REVIEW_META: Record<
  ReviewStatus,
  { label: string; bg: string; color: string; explain: string }
> = {
  draft: {
    label: "Draft",
    bg: "#F3F4F6",
    color: "#6E6E73",
    explain:
      "Compliance gate: submit this pitch for review — Send email and Send to CRM stay locked until it's approved, so nothing unvetted reaches a customer.",
  },
  in_review: {
    label: "In review",
    bg: "rgba(255,159,10,0.14)",
    color: "#7A4A00",
    explain:
      "Waiting on compliance sign-off. In this workspace you're also the reviewer — Approve it or send it back with changes.",
  },
  approved: {
    label: "Approved",
    bg: "rgba(52,199,89,0.14)",
    color: "#1A7A35",
    explain:
      "Cleared by compliance — Send email and Send to CRM are unlocked for this pitch.",
  },
  changes_requested: {
    label: "Changes requested",
    bg: "rgba(255,59,48,0.12)",
    color: "#B02020",
    explain:
      "Compliance sent this back. Edit the pitch, then resubmit for review.",
  },
};
