import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { agentAnswer } from "@/lib/claude";
import type { RecommendedService } from "@/lib/types";

export const dynamic = "force-dynamic";

// Agent draft (V9). Generates the actual outreach the rep approves at the
// compliance gate — Claude when ANTHROPIC_API_KEY is set (grounded in the
// account), a deterministic template otherwise. Mock-first; the human still
// approves before anything sends.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "");
  const variant = Math.max(0, Number(body.variant) || 0);
  const db = getDb();
  const customer = await db.customers.get(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  // Tone: explicit request wins; otherwise fall back to the rep's pinned default.
  const prefs = await db.agentPrefs.get();
  const tone = ["formal", "warm", "brief"].includes(String(body.tone))
    ? String(body.tone)
    : prefs?.draft_tone || "warm";
  const contacts = await db.contacts.list(customerId);
  const sessions = await db.pitchSessions.list(customerId);
  const contact = contacts[0];
  const services = (sessions[0]?.recommended_services || []) as RecommendedService[];
  const service = services[0]?.service_name || "Regulatory Submission Services";
  const co = customer.company_name;
  const firstName =
    (contact?.full_name || "there")
      .replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "")
      .split(/\s+/)[0] || "there";

  const industry = customer.industry || "life sciences";
  // The angle (cycled by "Rewrite") sets the subject + core value sentence …
  const ANGLES = [
    {
      subject: `${co} × Freyr — ${service}`,
      value: `I've been following ${co}'s regulatory work and wanted to reconnect — Freyr's ${service} helps teams like yours hit submission timelines across FDA, EMA, and 120+ agencies without adding headcount.`,
    },
    {
      subject: `Former FDA/EMA reviewers — ${service} for ${co}`,
      value: `Our ${service} team includes former FDA and EMA reviewers, so we tend to de-risk ${industry} submissions before they become bottlenecks.`,
    },
    {
      subject: `Should I close the loop, ${firstName}?`,
      value: `Totally fine if the timing isn't right for ${service} — but if it's worth a quick look for ${co}, I'll make it easy.`,
    },
  ];
  // … and the tone sets the greeting, CTA, and sign-off.
  const TONES: Record<
    string,
    { greet: string; cta: string; signoff: string }
  > = {
    warm: {
      greet: `Hi ${firstName},`,
      cta: `Worth a 20-minute call to see if it fits your near-term milestones?`,
      signoff: `Best,\nSuren Dheen · Freyr`,
    },
    formal: {
      greet: `Dear ${firstName},`,
      cta: `Would you be open to a 20-minute call to assess fit against ${co}'s upcoming milestones?`,
      signoff: `Kind regards,\nSuren Dheen\nFreyr`,
    },
    brief: {
      greet: `Hi ${firstName},`,
      cta: `Worth 20 minutes this week?`,
      signoff: `— Suren Dheen, Freyr`,
    },
  };
  const angle = ANGLES[variant % ANGLES.length];
  const t = TONES[tone];
  const composedBody = `${t.greet}\n\n${angle.value}\n\n${t.cta}\n\n${t.signoff}`;

  // Claude path (when keyed) — grounded ONLY in these facts; the variant nudges
  // a fresh angle on each rewrite.
  const toneHint =
    tone === "formal"
      ? "Tone: formal and professional."
      : tone === "brief"
      ? "Tone: brief — 2-3 sentences, punchy."
      : "Tone: warm and personable.";
  const facts = [
    `Company: ${co}`,
    `Industry: ${industry}`,
    contact ? `Contact: ${contact.full_name}, ${contact.job_title}` : null,
    `Lead service: ${service}`,
    customer.competitor ? `Incumbent/competitor: ${customer.competitor}` : null,
    toneHint,
    variant > 0 ? `This is rewrite #${variant} — take a clearly different angle.` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const llm = await agentAnswer(
    "You are Freyr's AI sales agent writing a concise re-engagement email (under " +
      "110 words) from Suren Dheen. Match the requested tone. Ground it ONLY in " +
      "the facts. Return exactly:\nSubject: <subject>\n<blank line>\n<body>. No preamble.",
    facts
  );

  let outSubject = angle.subject;
  let outBody = composedBody;
  let source: "claude" | "mock" = "mock";
  if (llm) {
    const m = llm.match(/^\s*subject:\s*(.+?)\s*\n([\s\S]*)$/i);
    if (m && m[2].trim()) {
      outSubject = m[1].trim();
      outBody = m[2].trim();
      source = "claude";
    }
  }

  return NextResponse.json({ subject: outSubject, body: outBody, source, tone });
}
