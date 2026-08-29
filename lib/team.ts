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

// Demo LinkedIn profile per SYNTHETIC rep — same generated-identity spirit as
// repEmail/repPhone (slug straight from the name, deterministic across
// renders). The REAL signed-in member never gets one of these: their row shows
// the LinkedIn URL they pasted in Settings › Profile, or no chip at all.
export function repLinkedIn(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `https://www.linkedin.com/in/${slug}`;
}

// Deep-link straight into a Microsoft Teams chat with this teammate.
export function teamsChatUrl(name: string, verifiedEmail?: string | null): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(
    verifiedEmail?.trim() || repEmail(name)
  )}`;
}

/* Job titles, not access. The access vocabulary is BD Member / Owner / Admin
   (Suren, Aug 29) and no title may borrow the words it retired. */
const TITLES = [
  "Account Executive",
  "Senior Account Executive",
  "Enterprise AE",
  "Regional Business Development Lead",
  "Strategic Account Manager",
  "Senior Business Development Lead",
];

// Walter Hensley shows as a senior BD lead in the sidebar; Mark Miller runs a
// group (matches Settings › Team). Everyone else gets a stable title.
export function repTitle(name: string): string {
  if (name === "Walter Hensley") return "Senior Business Development Lead";
  if (name === "Mark Miller") return "Regional Business Development Manager";
  return TITLES[hashName(name) % TITLES.length];
}

export function repRole(name: string): "Admin" | "Owner" | "BD Member" {
  if (name === "Walter Hensley") return "Admin";
  if (name === "Mark Miller") return "Owner";
  return "BD Member";
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
