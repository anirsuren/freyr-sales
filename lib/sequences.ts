// Outbound cadence library (V2 #6). Static templates — the "execution loop"
// surface shows steps + which accounts are enrolled and where they are.

export type SequenceChannel = "email" | "call" | "linkedin" | "wait";

export interface SequenceStep {
  day: number;
  channel: SequenceChannel;
  label: string;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
}

export const SEQUENCES: Sequence[] = [
  {
    id: "reg-exec",
    name: "Regulatory Exec Outreach",
    description:
      "7-touch cadence for VP / Head of Regulatory at clinical-stage biopharma.",
    steps: [
      { day: 0, channel: "email", label: "Intro email — submission-timeline angle" },
      { day: 2, channel: "linkedin", label: "LinkedIn connect + light touch" },
      { day: 4, channel: "call", label: "First call attempt + voicemail" },
      { day: 7, channel: "email", label: "Value email — FDA/EMA reviewer credibility" },
      { day: 10, channel: "call", label: "Second call attempt" },
      { day: 14, channel: "email", label: "Case study — similar biologics program" },
      { day: 18, channel: "email", label: "Breakup email" },
    ],
  },
  {
    id: "reengage",
    name: "Re-engagement",
    description: "Revive a stalled account after no response.",
    steps: [
      { day: 0, channel: "email", label: "Pattern-interrupt email — new regulatory signal" },
      { day: 3, channel: "linkedin", label: "Share relevant guidance update" },
      { day: 6, channel: "call", label: "Check-in call" },
      { day: 10, channel: "email", label: "Soft breakup — leave the door open" },
    ],
  },
  {
    id: "post-meeting",
    name: "Post-meeting follow-up",
    description: "After a booked meeting, drive to the next concrete step.",
    steps: [
      { day: 0, channel: "email", label: "Recap + proposed next step" },
      { day: 2, channel: "email", label: "Send account brief / scope doc" },
      { day: 5, channel: "call", label: "Confirm timeline + stakeholders" },
    ],
  },
];

export const CHANNEL_LABEL: Record<SequenceChannel, string> = {
  email: "Email",
  call: "Call",
  linkedin: "LinkedIn",
  wait: "Wait",
};
