// Each voice agent is a PERSON on the team, not a category label (Anir,
// Jul 4: "they should all have different names… different icons… visibly
// look different"). One persona per offering category — name, color, icon,
// and a plain-English line about what they handle. The ElevenLabs agents'
// greetings use the same names, so what you see here is who answers.

import {
  ShieldCheck,
  Database,
  Radar,
  Palette,
  FileStack,
  Cpu,
  type LucideIcon,
} from "lucide-react";

export interface VoicePersona {
  name: string;
  slug: string;
  category: string;
  tagline: string;
  color: string; // avatar / accent
  icon: LucideIcon;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  {
    name: "Maya",
    slug: "maya-regulatory-affairs",
    category: "Regulatory Affairs",
    tagline: "Talks strategy, agency questions and end-to-end regulatory support.",
    color: "#0071E3",
    icon: ShieldCheck,
  },
  {
    name: "Arjun",
    slug: "arjun-regulatory-information",
    category: "Regulatory Information Management",
    tagline: "Pitches Freya.Register and keeping every registration in one place.",
    color: "#5E5CE6",
    icon: Database,
  },
  {
    name: "Nina",
    slug: "nina-regulatory-intelligence",
    category: "Global Regulatory Intelligence",
    tagline: "Covers guidance monitoring and intelligence subscriptions.",
    color: "#19C3B1",
    icon: Radar,
  },
  {
    name: "Leo",
    slug: "leo-labeling-artwork",
    category: "Labeling and Artwork",
    tagline: "Handles label change, artwork and multi-market compliance calls.",
    color: "#FF9F0A",
    icon: Palette,
  },
  {
    name: "Sofia",
    slug: "sofia-submissions",
    category: "Submissions and Document Operations",
    tagline: "Talks eCTD publishing, submission planning and document ops.",
    color: "#34C759",
    icon: FileStack,
  },
  {
    name: "Kai",
    slug: "kai-freya-fusion",
    category: "Freya Fusion Platform and Agents",
    tagline: "Demos the Freya AI platform — agents, modules and automation.",
    color: "#E0338E",
    icon: Cpu,
  },
];

export function personaFor(category: string): VoicePersona | null {
  return VOICE_PERSONAS.find((p) => p.category === category) || null;
}

export function personaBySlug(slug: string): VoicePersona | null {
  return VOICE_PERSONAS.find((p) => p.slug === slug) || null;
}

// The line each persona opens with when a prospect CALLS IN. Outbound calls
// override this with a personalized opener (see lib/voice.ts).
export function inboundOpener(p: VoicePersona): string {
  return `Hi, this is ${p.name} with Freyr Solutions — thanks for calling! Can I get your name, and what can I help you with today?`;
}
