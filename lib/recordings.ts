// Mock call-recording data for the Recordings / Call Coach surface.
// Not part of the Supabase schema (a demo intelligence layer), so it lives here.

// Dates are relative to today (not pinned) so the call log stays current as time
// passes — matching the rest of the seeded data. Formatted in UTC by hand so the
// string is identical on the server and the client (no hydration mismatch) and
// independent of the viewer's timezone.
const _MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return `${_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export interface KeyMoment {
  at: string; // mm:ss
  label: string;
  quote: string;
  tone: "good" | "warn" | "neutral";
}
export interface QualityScore {
  label: string;
  score: number; // 0-100
}
export interface Recording {
  id: string;
  company: string;
  contact: string;
  contactTitle: string;
  rep: string;
  title: string;
  date: string;
  duration: string;
  score: number; // 0-100
  outcome: string;
  summary: string;
  didWell: string[];
  needsImprovement: string[];
  coaching: string[];
  keyMoments: KeyMoment[];
  quality: QualityScore[];
}

export const RECORDINGS: Recording[] = [
  {
    id: "rec-001",
    company: "BioNex Therapeutics",
    contact: "Dr. Priya Mehta",
    contactTitle: "VP Regulatory Affairs",
    rep: "Suren Dheen",
    title: "Discovery — BioNex NDA",
    date: daysAgo(1),
    duration: "24:18",
    score: 88,
    outcome: "Meeting Booked",
    summary:
      "Strong discovery call. Suren Dheen opened by referencing Dr. Mehta's FDA background and tied the conversation to the upcoming NDA timeline. Surfaced a clear pain around CTD dossier throughput and booked a follow-up with the NDA owner.",
    didWell: [
      "Opened with a relevant, researched hook (FDA CDER background) instead of a generic intro.",
      "Quantified the pain — asked how the team is currently handling CTD dossier prep.",
      "Earned the next step with a specific, low-friction ask (20 minutes with the NDA owner).",
    ],
    needsImprovement: [
      "Talk-to-listen ratio was 64% — let the prospect carry more of the conversation.",
      "Mentioned pricing too early; defer until value is established.",
    ],
    coaching: [
      "Use a 70/30 listen ratio on discovery — ask one more layer of 'why' before proposing.",
      "When asked about price, bridge to value: 'It depends on scope — can I show you how we'd approach your NDA first?'",
    ],
    keyMoments: [
      { at: "01:12", label: "Strong opener", quote: "I noticed your time at FDA CDER — I'll skip the basics.", tone: "good" },
      { at: "08:40", label: "Pain identified", quote: "We're seeing a 12% lag in CMC technical writing right now.", tone: "good" },
      { at: "15:03", label: "Pricing raised early", quote: "Ballpark, what does something like this run?", tone: "warn" },
      { at: "22:50", label: "Next step secured", quote: "Let's get the NDA owner on a call next Thursday.", tone: "good" },
    ],
    quality: [
      { label: "Discovery", score: 90 },
      { label: "Rapport", score: 85 },
      { label: "Objection Handling", score: 78 },
      { label: "Next Steps", score: 95 },
    ],
  },
  {
    id: "rec-002",
    company: "Helix Biologics",
    contact: "Dr. Lena Vogt",
    contactTitle: "SVP Global Regulatory",
    rep: "Mark Miller",
    title: "Exec Briefing — Helix Global Labeling",
    date: daysAgo(2),
    duration: "31:42",
    score: 74,
    outcome: "In Progress",
    summary:
      "Executive briefing with a former EMA assessor. Good domain credibility but the value story ran long and the close was soft.",
    didWell: [
      "Established credibility quickly with former-reviewer references.",
      "Tailored the labeling story to a multi-market (FDA/EMA/PMDA) program.",
    ],
    needsImprovement: [
      "Monologued for ~4 minutes on capabilities — lost engagement mid-call.",
      "No firm next step; ended with 'we'll follow up'.",
    ],
    coaching: [
      "Break capability pitches into 60-second chunks with a check-in question.",
      "Always leave with a calendar hold, not an open-ended follow-up.",
    ],
    keyMoments: [
      { at: "02:30", label: "Credibility built", quote: "Our team includes former EMA assessors.", tone: "good" },
      { at: "12:15", label: "Lost momentum", quote: "(4-minute capability monologue)", tone: "warn" },
      { at: "29:00", label: "Soft close", quote: "We'll follow up with some materials.", tone: "warn" },
    ],
    quality: [
      { label: "Discovery", score: 70 },
      { label: "Rapport", score: 82 },
      { label: "Objection Handling", score: 72 },
      { label: "Next Steps", score: 60 },
    ],
  },
  {
    id: "rec-003",
    company: "Cortexa Biopharma",
    contact: "Marcus Thorne",
    contactTitle: "Head of CMC",
    rep: "Suren Dheen",
    title: "Cold Call — Cortexa CMC",
    date: daysAgo(3),
    duration: "06:54",
    score: 81,
    outcome: "Interested",
    summary:
      "Tight cold call. Earned permission fast and booked a discovery slot. Could have asked one more qualifying question before the ask.",
    didWell: [
      "Excellent 90-second permission-based opener.",
      "Respected the prospect's time and got to the point.",
    ],
    needsImprovement: ["Booked the meeting without confirming budget authority."],
    coaching: ["Add a single qualifier on authority before booking: 'Are you the right person for CMC sourcing, or should we loop someone in?'"],
    keyMoments: [
      { at: "00:18", label: "Permission earned", quote: "Do you have 90 seconds, or is this a terrible time?", tone: "good" },
      { at: "05:40", label: "Meeting booked", quote: "Let's grab 20 minutes Thursday.", tone: "good" },
    ],
    quality: [
      { label: "Discovery", score: 75 },
      { label: "Rapport", score: 80 },
      { label: "Objection Handling", score: 84 },
      { label: "Next Steps", score: 88 },
    ],
  },
  {
    id: "rec-004",
    company: "Indavel Pharma",
    contact: "Dr. Lisa Chen",
    contactTitle: "Director, Labeling",
    rep: "Mark Miller",
    title: "Follow-up — Indavel 483 Remediation",
    date: daysAgo(4),
    duration: "18:07",
    score: 67,
    outcome: "In Progress",
    summary:
      "Follow-up on a 483 remediation. Rapport was warm but discovery was thin and the rep talked past two buying signals.",
    didWell: ["Warm, personable rapport throughout."],
    needsImprovement: [
      "Missed two explicit buying signals about timeline urgency.",
      "Did not quantify the cost of the open 483 finding.",
    ],
    coaching: [
      "Listen for and name buying signals out loud: 'It sounds like timing is critical — let's move fast.'",
      "Quantify risk: tie the open finding to potential delay/cost.",
    ],
    keyMoments: [
      { at: "04:20", label: "Buying signal missed", quote: "We really need this resolved before the audit.", tone: "warn" },
      { at: "11:55", label: "Buying signal missed", quote: "Our timeline is honestly pretty tight.", tone: "warn" },
    ],
    quality: [
      { label: "Discovery", score: 58 },
      { label: "Rapport", score: 86 },
      { label: "Objection Handling", score: 64 },
      { label: "Next Steps", score: 60 },
    ],
  },
  {
    id: "rec-005",
    company: "Quantum Oncology",
    contact: "Dr. Arun Pillai",
    contactTitle: "Chief Medical Officer",
    rep: "Suren Dheen",
    title: "Discovery — Quantum Trial Regulatory",
    date: daysAgo(5),
    duration: "27:31",
    score: 92,
    outcome: "Meeting Booked",
    summary:
      "Best call of the week. Physician-level conversation, strong mutual action plan, multi-threaded into the regulatory lead.",
    didWell: [
      "Spoke the CMO's language on trial de-risking.",
      "Built a mutual action plan with dates.",
      "Multi-threaded — asked to include the regulatory lead.",
    ],
    needsImprovement: ["Slightly rushed the recap at the end."],
    coaching: ["Always close discovery with a 30-second recap to confirm alignment."],
    keyMoments: [
      { at: "03:10", label: "Domain credibility", quote: "Let's talk about de-risking your pivotal trials.", tone: "good" },
      { at: "20:45", label: "Multi-threading", quote: "Can we bring your regulatory lead into the next one?", tone: "good" },
      { at: "26:00", label: "Mutual action plan", quote: "I'll send a plan with dates by Friday.", tone: "good" },
    ],
    quality: [
      { label: "Discovery", score: 94 },
      { label: "Rapport", score: 90 },
      { label: "Objection Handling", score: 88 },
      { label: "Next Steps", score: 96 },
    ],
  },
  {
    id: "rec-006",
    company: "Meridian Pharmaceuticals",
    contact: "Claudia Hofmann",
    contactTitle: "Global Head, Reg Submissions",
    rep: "Mark Miller",
    title: "Intro — Meridian Submissions",
    date: daysAgo(7),
    duration: "09:38",
    score: 54,
    outcome: "Not Interested",
    summary:
      "Intro call that stalled on an incumbent-vendor objection the rep wasn't prepared for.",
    didWell: ["Polite and professional throughout."],
    needsImprovement: [
      "No plan for the 'we already have a vendor' objection.",
      "Gave up after the first 'no' instead of exploring the contract timeline.",
    ],
    coaching: [
      "Prepare an incumbent-displacement track: ask what's working / not working and when the contract renews.",
      "Treat the first 'no' as 'not yet' — book a check-in near renewal.",
    ],
    keyMoments: [
      { at: "03:45", label: "Objection mishandled", quote: "We already work with someone for this.", tone: "warn" },
    ],
    quality: [
      { label: "Discovery", score: 50 },
      { label: "Rapport", score: 70 },
      { label: "Objection Handling", score: 42 },
      { label: "Next Steps", score: 48 },
    ],
  },
  {
    id: "rec-007",
    company: "Orion Vaccines",
    contact: "Dr. Hana Kim",
    contactTitle: "VP Regulatory Strategy",
    rep: "Suren Dheen",
    title: "Discovery — Orion Reg Intelligence",
    date: daysAgo(8),
    duration: "21:09",
    score: 79,
    outcome: "Interested",
    summary:
      "Solid discovery on global guidance monitoring. Good questions, value landed; close could have been tighter.",
    didWell: [
      "Connected reg-intelligence value to her EUA experience.",
      "Asked layered discovery questions.",
    ],
    needsImprovement: ["Next step was a bit vague on timing."],
    coaching: ["Propose two concrete time options to make the next step frictionless."],
    keyMoments: [
      { at: "06:30", label: "Value landed", quote: "Monitoring 120+ agencies in one place would save us hours.", tone: "good" },
      { at: "19:20", label: "Vague next step", quote: "Let's find some time soon.", tone: "warn" },
    ],
    quality: [
      { label: "Discovery", score: 82 },
      { label: "Rapport", score: 80 },
      { label: "Objection Handling", score: 76 },
      { label: "Next Steps", score: 70 },
    ],
  },
];

export interface TranscriptLine {
  sec: number;
  at: string;
  speaker: "Rep" | "Prospect";
  text: string;
  key?: boolean;
  tone?: "good" | "warn" | "neutral";
}

function tSec(d: string) {
  const [m, s] = d.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
function tFmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const FILLER_REP = [
  "Before I dive in — what's actually driving the timeline on your side?",
  "Got it. A lot of teams at your stage hit exactly that wall.",
  "Here's specifically how we'd approach it for you.",
  "We've run this play for similar biologics programs recently.",
  "Let me make sure I understand the constraint correctly.",
  "Totally fair — I'll keep this tight and respect your time.",
];
const FILLER_PROSPECT = [
  "Sure, that makes sense.",
  "Honestly, we're feeling that pain right now.",
  "How would that work for a team our size?",
  "What kind of timeline are we realistically talking about?",
  "And how do you handle multi-market submissions?",
  "That's helpful context, thank you.",
];

// Builds a coherent, time-locked transcript per recording, weaving the real
// key-moments in at their actual timestamps.
export function transcriptFor(rec: Recording): TranscriptLine[] {
  const total = tSec(rec.duration);
  const out: Omit<TranscriptLine, "at">[] = [
    { sec: 2, speaker: "Rep", text: "Hi — thanks for taking the time today. I'll keep this focused." },
    { sec: 13, speaker: "Prospect", text: "Sounds good, I've got a few minutes." },
  ];
  const kms = [...rec.keyMoments].sort((a, b) => tSec(a.at) - tSec(b.at));
  kms.forEach((m, idx) => {
    const sec = tSec(m.at);
    out.push({
      sec: Math.max(20, sec - 18),
      speaker: idx % 2 ? "Prospect" : "Rep",
      text: (idx % 2 ? FILLER_PROSPECT : FILLER_REP)[idx % 6],
    });
    const isQ = /\?$/.test(m.quote);
    out.push({
      sec,
      speaker: isQ ? "Prospect" : "Rep",
      text: m.quote,
      key: true,
      tone: m.tone,
    });
  });
  out.push({
    sec: Math.max(total - 10, Math.floor(total * 0.9)),
    speaker: "Rep",
    text:
      rec.outcome.includes("Meeting") || rec.outcome === "Interested"
        ? "Appreciate it — I'll send a recap and we'll lock the next step."
        : "Thanks for the candor — I'll follow up with something genuinely useful.",
  });

  const seen = new Set<number>();
  return out
    .filter((l) => l.sec >= 0 && l.sec <= total)
    .sort((a, b) => a.sec - b.sec)
    .filter((l) => (seen.has(l.sec) ? false : (seen.add(l.sec), true)))
    .map((l) => ({ ...l, at: tFmt(l.sec) }));
}

export interface TalkSegment {
  start: number;
  end: number;
  speaker: "Rep" | "Prospect";
}

// Derive who-was-talking spans across the call from the time-locked transcript.
export function talkSegments(rec: Recording): TalkSegment[] {
  const total = tSec(rec.duration);
  const lines = transcriptFor(rec);
  return lines.map((l, i) => ({
    start: l.sec,
    end: i < lines.length - 1 ? lines[i + 1].sec : total,
    speaker: l.speaker,
  }));
}

export function talkRatio(rec: Recording): {
  repSec: number;
  prospectSec: number;
  repPct: number;
  prospectPct: number;
} {
  let rep = 0;
  let prospect = 0;
  for (const s of talkSegments(rec)) {
    const d = Math.max(0, s.end - s.start);
    if (s.speaker === "Rep") rep += d;
    else prospect += d;
  }
  const total = rep + prospect || 1;
  return {
    repSec: Math.round(rep),
    prospectSec: Math.round(prospect),
    repPct: Math.round((rep / total) * 100),
    prospectPct: Math.round((prospect / total) * 100),
  };
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#1A7A35";
  if (score >= 65) return "#7A4A00";
  return "#B02020";
}
export function scoreBg(score: number): string {
  if (score >= 80) return "rgba(52,199,89,0.12)";
  if (score >= 65) return "rgba(255,159,10,0.12)";
  return "rgba(255,59,48,0.12)";
}
