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
  owner_user_id: string | null;
  workspace_id: string | null;
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
    owner: "Walter Hensley",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email: submission-timeline angle" },
      { day: 2, channel: "email", label: "Follow-up email: share a relevant reviewer credential" },
      { day: 4, channel: "call", label: "First call attempt + voicemail" },
      { day: 7, channel: "email", label: "Value email: FDA/EMA reviewer credibility" },
      { day: 10, channel: "call", label: "Second call attempt" },
      { day: 14, channel: "email", label: "Case study: similar biologics program" },
      { day: 18, channel: "email", label: "Breakup email" },
    ],
  },
  {
    id: "reengage",
    name: "Re-engagement",
    description: "Revive a stalled account after no response.",
    status: "active",
    owner: "Walter Hensley",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Pattern-interrupt email: new regulatory signal" },
      { day: 3, channel: "email", label: "Share a relevant regulatory guidance update" },
      { day: 6, channel: "call", label: "Check-in call" },
      { day: 10, channel: "email", label: "Soft breakup: leave the door open" },
    ],
  },
  {
    id: "post-meeting",
    name: "Post-meeting follow-up",
    description: "After a booked meeting, drive to the next concrete step.",
    status: "active",
    owner: "Walter Hensley",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Recap + proposed next step" },
      { day: 2, channel: "email", label: "Send account brief / scope doc" },
      { day: 5, channel: "call", label: "Confirm timeline + stakeholders" },
    ],
  },
  // ---------------------------------------------------------------------
  // THE REST OF THE CADENCE LIBRARY.
  //
  // Three sequences read as a starter kit rather than a team's playbook: the
  // list was three rows, the step editor only ever had one shape to show and
  // the enrollment timeline had nowhere to spread (Anir, Aug 31: "every
  // rabbit hole needs to have a shit ton of data"). These cover the segments
  // and motions the rest of the showroom already has accounts for, so a
  // reviewer can see the library, the editor and the enrolment view working
  // against something that looks like a real book.
  // ---------------------------------------------------------------------
  {
    id: "device-mdr",
    name: "Device makers: MDR remediation",
    description:
      "For device regulatory and quality leads still working through technical documentation debt.",
    status: "active",
    owner: "Margaret Whitfield",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email: technical file as a data problem" },
      { day: 3, channel: "email", label: "Share the MDR recertification timeline benchmark" },
      { day: 6, channel: "call", label: "First call attempt + voicemail" },
      { day: 9, channel: "email", label: "Notified-body capacity angle" },
      { day: 13, channel: "call", label: "Second call attempt" },
      { day: 18, channel: "email", label: "Breakup email" },
    ],
  },
  {
    id: "first-filer",
    name: "First-time filers",
    description:
      "Pre-revenue biotech twelve to twenty-four months from a first submission.",
    status: "active",
    owner: "Eleanor Rutherford",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email: what delays a first filing" },
      { day: 4, channel: "email", label: "Share the pre-submission meeting checklist" },
      { day: 8, channel: "call", label: "Discovery call attempt" },
      { day: 12, channel: "email", label: "Case study: 60-person company, three regions" },
      { day: 17, channel: "email", label: "Offer a free readiness read" },
    ],
  },
  {
    id: "renewal-expansion",
    name: "Renewal and expansion",
    description:
      "Existing accounts inside ninety days of renewal, with a second offering to land.",
    status: "active",
    owner: "Gordon Ashby",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Usage recap and what changed this year" },
      { day: 3, channel: "call", label: "Renewal conversation with the owner" },
      { day: 7, channel: "email", label: "Propose the adjacent offering" },
      { day: 12, channel: "call", label: "Commercial walkthrough" },
      { day: 16, channel: "email", label: "Send the renewal paperwork" },
    ],
  },
  {
    id: "generics-variation",
    name: "Generics: variation volume",
    description: "Generic and specialty filers carrying a heavy post-approval change load.",
    status: "active",
    owner: "Marcus Bramwell",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email: what 300 variations a year costs" },
      { day: 3, channel: "email", label: "Worksharing and grouping angle" },
      { day: 7, channel: "call", label: "First call attempt" },
      { day: 11, channel: "email", label: "Share the market requirement comparison" },
      { day: 15, channel: "call", label: "Second call attempt" },
      { day: 20, channel: "email", label: "Breakup email" },
    ],
  },
  {
    id: "labeling-artwork",
    name: "Labeling and artwork",
    description: "Label and artwork owners, usually reached after a rework or a recall.",
    status: "active",
    owner: "Sylvia Ashcroft",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro email: the cost of one artwork error" },
      { day: 4, channel: "email", label: "Core data sheet and market deviation angle" },
      { day: 8, channel: "call", label: "Call attempt with the artwork lead" },
      { day: 14, channel: "email", label: "Offer a proofing workflow walkthrough" },
    ],
  },
  {
    id: "intelligence-pilot",
    name: "Intelligence pilot invite",
    description: "Invite a regulatory intelligence team into the quarterly pilot cohort.",
    status: "active",
    owner: "Mark Miller",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Pilot invitation with the coverage list" },
      { day: 3, channel: "email", label: "Send a sample impact assessment" },
      { day: 6, channel: "call", label: "Scoping call" },
      { day: 10, channel: "email", label: "Confirm the cohort start date" },
    ],
  },
  {
    id: "platform-eval",
    name: "Platform evaluation",
    description:
      "Large accounts running a formal selection, where the shortlist is still open.",
    status: "active",
    owner: "Walter Hensley",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Intro to the evaluation owner" },
      { day: 2, channel: "email", label: "Send the platform architecture brief" },
      { day: 5, channel: "call", label: "Technical discovery call" },
      { day: 9, channel: "email", label: "Answer the security and residency questions" },
      { day: 14, channel: "call", label: "Reference call with a comparable account" },
      { day: 19, channel: "email", label: "Submit the written response" },
      { day: 25, channel: "call", label: "Shortlist follow-up" },
    ],
  },
  {
    id: "conference-followup",
    name: "Conference follow-up",
    description: "Worked immediately after a booth or session conversation, while it is warm.",
    status: "active",
    owner: "Nancy Caldwell",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "Same-day thank you with the one thing they asked for" },
      { day: 2, channel: "email", label: "Send the session slides" },
      { day: 5, channel: "call", label: "Call attempt while it is still warm" },
      { day: 9, channel: "email", label: "Propose a twenty-minute follow-up" },
    ],
  },
  {
    id: "dormant-winback",
    name: "Dormant account win-back",
    description:
      "Accounts that went quiet more than six months ago. Paused while the messaging is rewritten.",
    status: "paused",
    owner: "Russell Pemberton",
    owner_user_id: null,
    workspace_id: null,
    created_at: CREATED,
    steps: [
      { day: 0, channel: "email", label: "What has changed since we last spoke" },
      { day: 5, channel: "email", label: "Share the product roadmap summary" },
      { day: 10, channel: "call", label: "Single call attempt" },
      { day: 15, channel: "email", label: "Close the loop and archive" },
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
  owner_user_id?: string | null;
  workspace_id?: string | null;
}) {
  const sequence: Sequence = {
    id: `seq-${Date.now().toString(36)}-${nextId++}`,
    name: data.name.trim(),
    description: data.description.trim(),
    steps: data.steps.map((step) => ({ ...step })),
    status: "active",
    owner: data.owner?.trim() || "Unassigned",
    owner_user_id: data.owner_user_id || null,
    workspace_id: data.workspace_id || null,
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
