// Team roster helpers — contact details for the Freyr sales floor. The Teams
// chat deep-link is INTERNAL ONLY (reps talk to reps); clients/contacts never
// get a Teams link, only phone/email. Kept deterministic so a rep's email,
// phone, and title never change between renders.

function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function repSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function repEmail(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${clean}@freyrsolutions.com`;
}

// A realistic, stable US number per rep — same shape as the voice-agent lines.
export function repPhone(name: string): string {
  const h = hashName(name);
  const area = 200 + (h % 700);
  const mid = 200 + ((h >>> 9) % 700);
  const last = (h >>> 18) % 10000;
  return `+1 (${area}) ${mid}-${String(last).padStart(4, "0")}`;
}

// Deep-link straight into a Microsoft Teams chat with this teammate.
export function teamsChatUrl(name: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(
    repEmail(name)
  )}`;
}

const TITLES = [
  "Account Executive",
  "Senior Account Executive",
  "Enterprise AE",
  "Regional Sales Rep",
  "Strategic Account Manager",
  "Senior Sales Rep",
];

// Suren shows as "Senior Sales Rep" in the sidebar; Mark Miller is the manager
// (matches Settings › Team). Everyone else gets a stable sales title.
export function repTitle(name: string): string {
  if (name === "Suren Dheen") return "Senior Sales Rep";
  if (name === "Mark Miller") return "Regional Sales Manager";
  return TITLES[hashName(name) % TITLES.length];
}

export function repRole(name: string): "Admin" | "Manager" | "Rep" {
  if (name === "Suren Dheen") return "Admin";
  if (name === "Mark Miller") return "Manager";
  return "Rep";
}

const REGIONS = [
  "EMEA", "NA East", "NA West", "LATAM", "Japan", "Nordics", "DACH",
  "MEA", "China", "Korea", "India", "UK & Ireland", "Southern EU", "APAC",
];
export function repRegion(name: string): string {
  return REGIONS[hashName(name) % REGIONS.length];
}

// Deterministic quota ($600K–$900K) and won-to-date, so a rep's attainment
// bar is stable across renders (no Math.random in a server component).
export function repQuota(name: string): number {
  return 600000 + ((hashName(name) >>> 4) % 7) * 50000;
}
export function repWonFY(name: string): number {
  const q = repQuota(name);
  const attain = 0.18 + ((hashName(name) >>> 9) % 30) / 100; // 18%–47%
  return Math.round((q * attain) / 5000) * 5000;
}

// A deterministic weekly-activity trend (touches per week) so every team card
// can show a real-looking line chart without per-rep history to draw from.
export function repTrend(name: string, weeks = 10): number[] {
  const h = hashName(name);
  const base = 4 + (h % 5);
  return Array.from({ length: weeks }, (_, i) => {
    const wobble =
      Math.sin((i + (h % 7)) * 0.85) * 2.4 + Math.cos(i * 0.55 + (h % 3)) * 1.6;
    return Math.max(1, Math.round(base + wobble + ((h >>> (i % 16)) % 3)));
  });
}
