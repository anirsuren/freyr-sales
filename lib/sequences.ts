// Outbound cadence library. The seeded templates are editable working records,
// and user-created sequences live in the same runtime store as campaigns.
import { getDataMode } from "./dataMode";

export type SequenceChannel = "email" | "call" | "wait";

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
  status: "active" | "paused";
  owner: string;
  created_at: string;
}

const CREATED = "2026-06-01T12:00:00.000Z";

export const SEQUENCES: Sequence[] = [
  {
    id: "reg-exec",
    name: "Regulatory Exec Outreach",
    description:
      "7-step outreach for a VP / Head of Regulatory at clinical-stage biopharma.",
    status: "active",
    owner: "Suren Dheen",
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email — submission-timeline angle" },
      { day: 2, channel: "email", label: "Follow-up email — share a relevant reviewer credential" },
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
    status: "active",
    owner: "Suren Dheen",
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Pattern-interrupt email — new regulatory signal" },
      { day: 3, channel: "email", label: "Share a relevant regulatory guidance update" },
      { day: 6, channel: "call", label: "Check-in call" },
      { day: 10, channel: "email", label: "Soft breakup — leave the door open" },
    ],
  },
  {
    id: "post-meeting",
    name: "Post-meeting follow-up",
    description: "After a booked meeting, drive to the next concrete step.",
    status: "active",
    owner: "Suren Dheen",
    created_at: CREATED,
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
  wait: "Wait",
};

type SequenceStore = { sequences: Sequence[] };

function cloneDefaults() {
  return SEQUENCES.map((sequence) => ({
    ...sequence,
    steps: sequence.steps.map((step) => ({ ...step })),
  }));
}

function store(): SequenceStore {
  const globalStore = globalThis as typeof globalThis & {
    __freyrSequences?: SequenceStore;
    __freyrLiveSequences?: SequenceStore;
  };
  if (getDataMode() === "live") {
    if (!globalStore.__freyrLiveSequences) {
      globalStore.__freyrLiveSequences = { sequences: [] };
    }
    return globalStore.__freyrLiveSequences;
  }
  if (!globalStore.__freyrSequences) {
    globalStore.__freyrSequences = { sequences: cloneDefaults() };
  }
  return globalStore.__freyrSequences;
}

let nextId = 0;

export function listSequences() {
  return store().sequences;
}

export function getSequence(id: string) {
  return store().sequences.find((sequence) => sequence.id === id) || null;
}

export function createSequence(data: {
  name: string;
  description: string;
  steps: SequenceStep[];
  owner?: string;
}) {
  const sequence: Sequence = {
    id: `seq-${Date.now().toString(36)}-${nextId++}`,
    name: data.name.trim(),
    description: data.description.trim(),
    steps: data.steps.map((step) => ({ ...step })),
    status: "active",
    owner: data.owner || "Suren Dheen",
    created_at: new Date().toISOString(),
  };
  store().sequences.unshift(sequence);
  return sequence;
}

export function updateSequence(
  id: string,
  patch: Partial<Pick<Sequence, "name" | "description" | "steps" | "status">>
) {
  const sequence = getSequence(id);
  if (!sequence) return null;
  if (typeof patch.name === "string" && patch.name.trim()) sequence.name = patch.name.trim();
  if (typeof patch.description === "string") sequence.description = patch.description.trim();
  if (Array.isArray(patch.steps) && patch.steps.length) {
    sequence.steps = patch.steps.map((step) => ({ ...step }));
  }
  if (patch.status === "active" || patch.status === "paused") {
    sequence.status = patch.status;
  }
  return sequence;
}

export function removeSequence(id: string) {
  const before = store().sequences.length;
  store().sequences = store().sequences.filter((sequence) => sequence.id !== id);
  return store().sequences.length < before;
}
