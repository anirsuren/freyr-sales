// Deterministic, per-account pitch generator. The app is mock-first but should
// read as production-real: every account gets its OWN tailored pitch (email +
// 5-min script + cold-call script) built from its real specifics — company,
// contact, recommended service, and situation — instead of one canned pitch
// reused everywhere. Stable for the same inputs, no API call needed. When a real
// ANTHROPIC_API_KEY + CRM are wired later, generatePitches() in lib/claude takes
// over; this keeps the demo fully populated and believable in the meantime.

export interface AccountPitch {
  subject_lines: string[];
  body: string;
  pitch_5min_script: string;
  pitch_call_script: {
    opener: string;
    value_prop: string;
    permission_question: string;
    if_bad_time_voicemail: string;
    if_good_time_continue: string;
    qualifying_questions: string[];
  };
}

function firstName(full: string): string {
  return (full || "").replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").split(/\s+/)[0] || "there";
}

// First sentence of the account context, lightly cleaned, for a natural opener.
function situation(context?: string): string {
  if (!context) return "";
  const first = context.split(/(?<=\.)\s/)[0].trim();
  return first.replace(/\.$/, "");
}

// What Freyr does, phrased per recommended service.
const SERVICE_HOOK: Record<string, string> = {
  "NDA/MAA CMC Writing":
    "author submission-ready CMC and CTD modules so your filing never bottlenecks on technical writing",
  "Global Labeling Strategy":
    "run global labeling end to end so launches aren't held up by artwork and compliance cycles",
  "Regulatory Submission Services":
    "take submission operations and eCTD publishing off your plate across FDA, EMA and 120+ agencies",
  "Clinical Trial Regulatory Support":
    "de-risk your IND/CTA work and keep trial submissions on schedule",
  "Regulatory Intelligence":
    "monitor guidance changes across 120+ agencies so nothing catches your team off guard",
  "Labeling and Artwork Management":
    "manage multi-market labeling and artwork so you ship compliant SKUs faster",
};

function hookFor(service: string): string {
  return SERVICE_HOOK[service] || "accelerate your regulatory submissions without adding headcount";
}

export function buildAccountPitch(p: {
  company: string;
  contactName: string;
  contactTitle?: string;
  service: string;
  context?: string;
}): AccountPitch {
  const { company, contactName, service } = p;
  const fn = firstName(contactName);
  const hook = hookFor(service);
  const sit = situation(p.context);
  const role = p.contactTitle ? p.contactTitle.toLowerCase() : "regulatory leader";

  const subject_lines = [
    `${service} for ${company}`,
    `${company}: a faster path on your submissions`,
    `Supporting ${company}'s regulatory milestones`,
  ];

  const body =
    `Dear ${contactName || "there"},\n\n` +
    `${sit ? `I've been following ${company} — ${sit.charAt(0).toLowerCase()}${sit.slice(1)}.` : `I've been following ${company}'s regulatory work.`} ` +
    `Freyr can ${hook}.\n\n` +
    `For a team at ${company}'s stage that usually means faster, lower-risk submissions and less load on your internal RA group. ` +
    `We've supported 5,000+ regulatory submissions globally, with former FDA and EMA reviewers on the team.\n\n` +
    `Would a 20-minute call next week make sense to see if it fits your near-term milestones?\n\n` +
    `Best,\nSuren Dheen · Freyr`;

  const pitch_5min_script =
    `Hi ${fn}, thanks for taking a few minutes. I'll be quick.\n\n` +
    `I reached out because ${sit ? `${sit.charAt(0).toLowerCase()}${sit.slice(1)}` : `${company} is at a stage where regulatory execution can accelerate or stall the timeline`}, ` +
    `and that's exactly where Freyr helps. In short, we ${hook}.\n\n` +
    `For companies like ${company}, the value usually shows up in two places: speed to submission, and taking routine regulatory load off your team so they can focus on strategy. ` +
    `We've done this across 5,000+ submissions globally, and our people include former FDA and EMA reviewers.\n\n` +
    `I'm not trying to sell you anything today — I'd just like 20 minutes to show you how we've handled ${service.toLowerCase()} for teams in a similar spot. Would next week work?`;

  const pitch_call_script = {
    opener: `Hi, is this ${contactName || "the regulatory lead"}? Great — this is Suren from Freyr. I know I'm catching you cold, so I'll be brief.`,
    value_prop: `We help pharma and biotech teams with regulatory submissions globally — FDA, EMA, and 120+ agencies. Specifically, we ${hook}.`,
    permission_question: `I had a specific thought about ${company}'s ${service.toLowerCase()} — do you have 90 seconds, or is this a bad time?`,
    if_bad_time_voicemail: `No problem — I'll send a short email. We've helped similar teams move submissions faster without adding headcount; if that's useful, worth a look. Thanks ${fn}.`,
    if_good_time_continue: `Appreciate it. Given where ${company} is, how are you handling ${service.toLowerCase()} today — fully in-house, or with outside support?`,
    qualifying_questions: [
      `How is your team handling ${service.toLowerCase()} right now?`,
      `What's the next regulatory milestone on the calendar, and how tight is it?`,
    ],
  };

  return { subject_lines, body, pitch_5min_script, pitch_call_script };
}
