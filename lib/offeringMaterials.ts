import {
  BookOpen,
  DollarSign,
  File,
  FileText,
  Handshake,
  Lightbulb,
  Lock,
  Presentation,
  Quote,
  Scale,
  Swords,
  Table2,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export type MaterialKind =
  | "video" | "presentation" | "whitepaper" | "pricing" | "competition"
  | "case_study" | "reference" | "one_pager" | "datasheet";

// Where in the buyer's journey a material is meant to be used (CR-3).
export type JourneyStage = "awareness" | "evaluation" | "decision";
// Who a material may be shown to (CR-3). Internal-only assets (battle cards,
// playbooks) must never reach a client.
export type AccessLevel = "client_facing" | "internal_only";

export interface OfferingMaterial {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string;
  // Optional so legacy/imported materials without tags keep working — the UI
  // renders nothing for a missing tag instead of a broken pill.
  journeyStage?: JourneyStage;
  accessLevel?: AccessLevel;
}

export const MATERIAL_META: Record<MaterialKind, { label: string; plural: string }> = {
  video: { label: "Video", plural: "Videos" },
  presentation: { label: "Sales presentation", plural: "Sales presentations" },
  whitepaper: { label: "Whitepaper / thought leadership", plural: "Whitepapers & thought leadership" },
  pricing: { label: "Pricing", plural: "Pricing" },
  competition: { label: "Competition", plural: "Competition" },
  case_study: { label: "Case study", plural: "Case studies" },
  reference: { label: "Customer reference", plural: "Customer references" },
  one_pager: { label: "One-pager", plural: "One-pagers" },
  datasheet: { label: "Datasheet", plural: "Datasheets" },
};

// One glyph + colour per material kind, shared by every surface that lists
// materials (the offering page and the customer's Offerings tab). Lives here so
// the two can't drift — the customer tab had lost its icons entirely and was
// printing the kind as bare text (Anir, Jul 26: "I don't know what happened to
// the icons. You had icons before that had, like, if it was a video").
export const MATERIAL_ICON: Record<MaterialKind, LucideIcon> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
  competition: Swords,
  case_study: BookOpen,
  reference: Quote,
  one_pager: File,
  datasheet: Table2,
};

// Colour follows the file-format bucket a kind rolls up into, so a deck, a
// video and a written doc are instantly distinguishable in a list.
export const MATERIAL_COLOR: Record<MaterialKind, string> = {
  presentation: "#0071E3", // deck — blue
  video: "#E11D48", // video — rose
  whitepaper: "#7C3AED", // written — violet
  case_study: "#7C3AED",
  one_pager: "#7C3AED",
  datasheet: "#7C3AED",
  pricing: "#059669", // commercial — green
  competition: "#D97706", // battle card — amber
  reference: "#0891B2", // customer voice — cyan
};

// Narrow an untrusted string (legacy/imported rows) to a MaterialKind.
export function asMaterialKind(v: string | undefined): MaterialKind | null {
  return v && v in MATERIAL_META ? (v as MaterialKind) : null;
}

// Every tag pill is colour + icon (standing rule: no plain gray chips). `label`
// is the full name for rows and dropdowns; `short` fits compact inline chips.
export const JOURNEY_STAGES: JourneyStage[] = ["awareness", "evaluation", "decision"];
export const JOURNEY_STAGE_META: Record<
  JourneyStage,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  awareness: { label: "Awareness Stage", short: "Awareness", color: "#0284C7", icon: Lightbulb }, // sky
  evaluation: { label: "Evaluation Stage", short: "Evaluation", color: "#7C3AED", icon: Scale }, // violet
  decision: { label: "Decision Stage", short: "Decision", color: "#059669", icon: Handshake }, // green
};

export const ACCESS_LEVELS: AccessLevel[] = ["client_facing", "internal_only"];
export const ACCESS_LEVEL_META: Record<
  AccessLevel,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  client_facing: { label: "Client Facing", short: "Client facing", color: "#0F766E", icon: Users }, // teal
  internal_only: { label: "Internal Only", short: "Internal only", color: "#B45309", icon: Lock }, // amber
};

// Safe narrowing for values that arrive as plain strings (serialized props,
// legacy runtime data) — unknown values render as untagged, never a broken pill.
export function asJourneyStage(v: unknown): JourneyStage | null {
  return v === "awareness" || v === "evaluation" || v === "decision" ? v : null;
}
export function asAccessLevel(v: unknown): AccessLevel | null {
  return v === "client_facing" || v === "internal_only" ? v : null;
}
