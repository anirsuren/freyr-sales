import Anthropic from "@anthropic-ai/sdk";
import type { MatchingOutput, PitchOutput } from "./types";
import type { AgentDigestData, WeeklyReview, AccountBriefing } from "./agent";

const MODEL = "claude-sonnet-4-6";

// AGENT_FORCE_MOCK=1 disables every live Claude call so the app runs on its
// deterministic fallbacks — used by the test suite so assertions stay stable
// regardless of whether a real key is present. The user's normal dev server
// (without this var) uses real Claude.
const client =
  process.env.ANTHROPIC_API_KEY && process.env.AGENT_FORCE_MOCK !== "1"
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

// ---------------------------------------------------------------------------
// Mock knowledge base (Section 5.4) — based on publicly known info about Freyr
// ---------------------------------------------------------------------------
export const MOCK_FREYR_KB = {
  services: [
    {
      name: "Regulatory Submission Services",
      description:
        "End-to-end management of regulatory dossier preparation and submission to global health authorities including FDA, EMA, CDSCO, and others. Covers INDs, NDAs, ANDAs, MAAs, CTDs.",
      target_roles: ["Regulatory Affairs", "Executive"],
      target_company_types: ["pharma", "biotech", "generic drug"],
      target_industries: ["pharmaceutical", "biotechnology"],
      pain_points: [
        "slow submission timelines",
        "complex dossier requirements",
        "multi-market submissions",
      ],
      differentiators: [
        "global submission coverage",
        "faster turnaround",
        "dedicated RA experts per market",
      ],
      freyr_language: [
        "accelerate your regulatory journey",
        "global dossier expertise",
      ],
    },
    {
      name: "Labeling and Artwork Management",
      description:
        "Complete lifecycle management of pharmaceutical labeling — from artwork creation and revision through regulatory review, compliance checking, and print-ready output. Covers global labeling requirements.",
      target_roles: ["Labeling", "Regulatory Affairs", "Quality Assurance"],
      target_company_types: ["pharma", "medical device", "consumer health"],
      target_industries: ["pharmaceutical", "medical device"],
      pain_points: [
        "labeling errors causing recalls",
        "multi-country labeling compliance",
        "artwork revision cycles",
      ],
      differentiators: [
        "end-to-end labeling workflow",
        "regulatory compliance built in",
        "global labeling database",
      ],
      freyr_language: ["zero-error labeling", "compliant by design"],
    },
    {
      name: "Pharmacovigilance Services",
      description:
        "Comprehensive drug safety and pharmacovigilance services including Individual Case Safety Report (ICSR) processing, signal detection, aggregate reports (PSUR, PBRER), and regulatory submissions.",
      target_roles: ["Pharmacovigilance", "Drug Safety", "Regulatory Affairs"],
      target_company_types: ["pharma", "biotech", "CRO"],
      target_industries: ["pharmaceutical", "biotechnology"],
      pain_points: [
        "ICSR backlog",
        "signal detection",
        "aggregate report timelines",
        "safety database management",
      ],
      differentiators: [
        "24/7 case processing",
        "validated safety databases",
        "global ICSR coverage",
      ],
      freyr_language: ["patient safety first", "compliant vigilance"],
    },
    {
      name: "Regulatory Intelligence",
      description:
        "Real-time monitoring and analysis of global regulatory changes, guidance documents, and agency updates. Delivers curated intelligence to keep compliance teams ahead of regulatory shifts.",
      target_roles: ["Regulatory Affairs", "Compliance", "Executive"],
      target_company_types: ["pharma", "biotech", "medical device"],
      target_industries: [
        "pharmaceutical",
        "medical device",
        "biotechnology",
      ],
      pain_points: [
        "missing regulatory updates",
        "manual tracking of guidelines",
        "compliance gaps",
      ],
      differentiators: [
        "automated monitoring across 120+ agencies",
        "expert analysis not just alerts",
        "actionable intelligence",
      ],
      freyr_language: [
        "stay ahead of regulation",
        "intelligence that drives decisions",
      ],
    },
    {
      name: "Clinical Trial Regulatory Support",
      description:
        "Regulatory strategy and submission support for clinical trials including IND/CTA preparation, protocol review, IRB/EC interactions, and ongoing trial compliance.",
      target_roles: [
        "Regulatory Affairs",
        "Clinical Affairs",
        "Medical Affairs",
      ],
      target_company_types: ["biotech", "pharma", "CRO"],
      target_industries: ["biotechnology", "pharmaceutical"],
      pain_points: [
        "IND preparation complexity",
        "global CTA submissions",
        "trial compliance management",
      ],
      differentiators: [
        "integrated regulatory and clinical expertise",
        "global CTA filing capabilities",
      ],
      freyr_language: [
        "from IND to NDA",
        "end-to-end clinical regulatory support",
      ],
    },
  ],
  solutions: [],
  industries: [
    {
      name: "Pharmaceutical",
      regulatory_needs:
        "FDA/EMA submissions, GMP compliance, labeling, pharmacovigilance",
      freyr_positioning:
        "Freyr's core market — deepest expertise and largest team",
    },
    {
      name: "Biotechnology",
      regulatory_needs:
        "Biologics submissions, biosimilar pathways, clinical regulatory",
      freyr_positioning:
        "Growing focus with dedicated biotech regulatory experts",
    },
    {
      name: "Medical Device",
      regulatory_needs: "EU MDR/IVDR, 510(k), PMA, UDI compliance",
      freyr_positioning: "Full medical device regulatory lifecycle",
    },
    {
      name: "Consumer Health",
      regulatory_needs:
        "OTC labeling, ingredient compliance, market-specific requirements",
      freyr_positioning:
        "Labeling and compliance services for consumer brands",
    },
  ],
  geographies: [
    {
      market: "United States",
      agencies: ["FDA"],
      freyr_coverage: "Full FDA submission support, 21 CFR expertise",
    },
    {
      market: "European Union",
      agencies: ["EMA", "national competent authorities"],
      freyr_coverage: "MAA, IMPD, EU labeling, MDR/IVDR",
    },
    {
      market: "India",
      agencies: ["CDSCO"],
      freyr_coverage: "CDSCO submissions, local regulatory strategy",
    },
    {
      market: "Rest of World",
      agencies: ["Health Canada", "TGA", "ANVISA", "PMDA"],
      freyr_coverage: "Multi-market simultaneous submissions",
    },
  ],
  differentiators: [
    "One-stop regulatory services partner across all major global markets",
    "Technology-enabled regulatory workflows reducing manual effort",
    "Deep domain expertise with 1000+ regulatory professionals",
    "Proven track record across 5000+ regulatory submissions globally",
  ],
  proof_points: [
    "5000+ regulatory submissions completed",
    "120+ regulatory agencies monitored",
    "20+ years of regulatory expertise",
    "Clients in 50+ countries",
  ],
  regulatory_frameworks: [
    "ICH CTD/eCTD",
    "21 CFR",
    "EU MDR/IVDR",
    "GxP",
    "ICH guidelines",
  ],
  tone_and_language: {
    taglines: ["Accelerating Regulatory Success", "Your Regulatory Partner"],
    value_props: [
      "speed to market",
      "compliance confidence",
      "global reach with local expertise",
    ],
    key_phrases: [
      "regulatory excellence",
      "compliant by design",
      "accelerate your journey",
      "end-to-end regulatory support",
    ],
  },
};

// ---------------------------------------------------------------------------
// Mock matching output (Section 8.1 fallback)
// ---------------------------------------------------------------------------
export const MOCK_MATCHING_OUTPUT: MatchingOutput = {
  recommended_services: [
    {
      service_name: "Regulatory Submission Services",
      relevance_score: 9,
      why_this_customer:
        "BioNex has an NDA targeted for 2025 and a multi-compound biologics pipeline across FDA and EMA — exactly the high-stakes submission workload Freyr's dossier teams are built for.",
      why_this_contact:
        "Dr. Mehta is a former FDA CDER reviewer who has led 12 NDA/MAA approvals; she will value submission expertise from former agency reviewers over generic outsourcing.",
      pitch_angle:
        "Accelerate the 2025 NDA with CTD dossier preparation handled by former FDA/EMA reviewers, cutting prep time 30–40%.",
      freyr_language_to_use: [
        "accelerate your regulatory journey",
        "global dossier expertise",
      ],
    },
    {
      service_name: "Regulatory Intelligence",
      relevance_score: 8,
      why_this_customer:
        "Filing simultaneously across FDA and EMA means tracking guidance changes in multiple jurisdictions — a manual burden Freyr's monitoring across 120+ agencies removes.",
      why_this_contact:
        "A lean RA team under NDA-timeline pressure benefits from curated intelligence rather than another alert feed.",
      pitch_angle:
        "Single-pane monitoring across FDA, EMA and 120+ agencies so the team isn't manually tracking guideline shifts during the filing window.",
      freyr_language_to_use: [
        "stay ahead of regulation",
        "intelligence that drives decisions",
      ],
    },
  ],
  customer_summary:
    "Mid-size clinical-stage biopharma with a biologics pipeline (3 Phase 2 + 1 NDA-ready) operating across FDA and EMA, expanding from Princeton with London and Singapore offices.",
  contact_summary:
    "Senior regulatory decision-maker with an FDA insider background; responds to peer-level, data-driven conversation and dislikes overselling.",
  recommended_tone:
    "Professional, peer-to-peer, evidence-led. Acknowledge her FDA background and skip the basics.",
  things_to_avoid: [
    "Generic outsourcing pitch language",
    "Overselling or hard closing on a first touch",
    "Explaining basic regulatory concepts she already knows",
  ],
};

// ---------------------------------------------------------------------------
// Mock pitches (Section 8.3 fallback)
// ---------------------------------------------------------------------------
export const MOCK_PITCHES: PitchOutput = {
  pitch_5min_script: `Hi Dr. Mehta, I'm [Name] from Freyr Solutions — I noticed your background includes time at FDA CDER before moving into industry, so I'll skip the basics and get straight to what I think matters for BioNex right now.

With your NDA submission coming up in 2025 and two compounds in Phase 2, you're entering the period where regulatory execution either accelerates or stalls your timeline. Freyr has completed over 5,000 regulatory submissions globally, and our team includes former FDA and EMA reviewers — people who know exactly what the agency expects to see.

Specifically for BioNex, I think two things are worth a conversation: first, our CTD dossier preparation service where we've consistently cut submission prep time by 30-40% for companies your size. Second, our Regulatory Intelligence service — given that you're working across FDA and EMA simultaneously, having automated monitoring across 120+ agencies in one place would remove a lot of manual tracking burden from your team.

I'm not here to sell you a contract today — I'd love 20 minutes with you and whoever owns the NDA prep to show you specifically how we've handled submissions for similar biologics pipelines. Would next week work?`,
  pitch_email: {
    subject_lines: [
      "Freyr + BioNex — regulatory support for your 2025 NDA",
      "Former FDA reviewer perspective on your upcoming submission",
      "How we helped 3 similar biologics companies cut submission time by 35%",
    ],
    body: `Dr. Mehta,

Your background at FDA CDER caught my attention — you know better than most what makes a submission succeed or stall.

With BioNex's NDA filing targeted for 2025, I wanted to reach out now rather than when timelines get tight. Freyr Solutions has supported 5,000+ regulatory submissions globally, and our team includes former FDA and EMA reviewers who work directly on dossier preparation.

For companies at BioNex's stage — mid-size, multi-compound pipeline, working across FDA and EMA — we typically find the highest value in two areas:

1. CTD dossier preparation and submission management, where we've consistently reduced prep time for similar biologics by 30-40%

2. Regulatory Intelligence monitoring across 120+ agencies so your team isn't manually tracking guideline changes across jurisdictions

Happy to show you a quick example of how we've handled similar NDA submissions for biologics-focused companies your size.

Would a 20-minute call next week make sense?

[Name]
Freyr Solutions`,
  },
  pitch_call_script: {
    opener:
      "Hi, is this Dr. Priya Mehta? Great — this is [Name] from Freyr Solutions. I know you're not expecting my call, so I'll be brief.",
    value_prop:
      "We support pharmaceutical and biotech companies with regulatory submissions globally — FDA, EMA, and 120+ other agencies. We've completed over 5,000 submissions and our team includes former FDA CDER reviewers.",
    permission_question:
      "I noticed BioNex has an NDA coming up in 2025 and I had a specific thought about how we might be able to help — do you have 90 seconds or is this a genuinely terrible time?",
    if_bad_time_voicemail:
      "No problem at all. I'll send you a brief email — just wanted to mention we've helped several similar biologics companies significantly cut their NDA prep timeline. If that's relevant, worth a look. Have a good day.",
    if_good_time_continue:
      "Appreciate it. Given your background at FDA and the NDA timeline, I wanted to ask — how is your team currently handling the CTD dossier preparation? Are you doing that fully in-house or working with any external support?",
    qualifying_questions: [
      "How is your team currently managing the CTD dossier preparation — fully in-house?",
      "Are you filing simultaneously with FDA and EMA, or sequencing the submissions?",
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

function textFrom(response: Anthropic.Message): string {
  const block = response.content[0];
  return block && block.type === "text" ? block.text : "";
}

// Generic short-form agent completion (V9). Used by agent surfaces (e.g. the
// per-account "Ask the agent" chat) to get a real Claude answer when a key is
// set. Returns null when there's no key OR on any error, so callers fall back to
// the deterministic mock answer — the agent never goes dark.
export async function agentAnswer(
  system: string,
  user: string
): Promise<string | null> {
  if (!client) return null;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = textFrom(response).trim();
    return text || null;
  } catch {
    return null;
  }
}

// Real multi-turn agent conversation (V11). The chat route uses this as the
// PRIMARY brain when ANTHROPIC_API_KEY is set: Claude gets the live pipeline
// facts (in the system prompt) plus the full conversation history as proper
// message turns, so it reasons like an AI agent rather than reciting a template.
// Returns null without a key OR on any error, so the deterministic brain takes
// over and the chat never goes dark.
export async function agentConverse(
  system: string,
  turns: { role: "user" | "assistant"; content: string }[]
): Promise<string | null> {
  if (!client) return null;
  // Claude requires the first message to be from the user and roles to
  // alternate — sanitize so a malformed history can't 400 the call.
  const clean: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    if (!t.content?.trim()) continue;
    if (clean.length === 0 && t.role !== "user") continue;
    if (clean.length && clean[clean.length - 1].role === t.role) {
      clean[clean.length - 1].content += `\n\n${t.content}`;
    } else {
      clean.push({ role: t.role, content: t.content });
    }
  }
  if (!clean.length || clean[clean.length - 1].role !== "user") return null;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: clean,
    });
    const text = textFrom(response).trim();
    return text || null;
  } catch {
    return null;
  }
}

// Narrate the agent's daily digest in one warm, specific line (V9). Returns null
// without a key (or on error) so the console uses the deterministic didSummary.
export async function narrateDigest(d: AgentDigestData): Promise<string | null> {
  const facts =
    `Runs summary: ${d.didSummary}\n` +
    `Awaiting your approval: ${d.needsApproval}\n` +
    `I can auto-handle: ${d.canHandle}\n` +
    `Cooling deals: ${d.cooling}\nAt-risk accounts: ${d.atRisk}`;
  return agentAnswer(
    "You are Freyr's AI sales agent giving the rep a one-line morning standup. " +
      "Warm, specific, ONE sentence, grounded ONLY in these facts. No greeting, no emoji.",
    facts
  );
}

// Narrate the weekly review in 1-2 grounded sentences (V9 #40). Null without a
// key so the page uses its deterministic summary.
export async function narrateReview(
  r: WeeklyReview,
  openMoney: string
): Promise<string | null> {
  const facts =
    `Agent actions this week: ${r.runsThisWeek}\n` +
    `Deals cooling: ${r.cooling}\nAt-risk accounts: ${r.atRisk}\n` +
    `Open pipeline at stake: ${openMoney}\n` +
    `Top deal: ${r.topDeals[0]?.company || "n/a"}`;
  return agentAnswer(
    "You are Freyr's AI sales agent writing the rep's Monday weekly review intro. " +
      "1-2 sentences: what changed and what's at stake. Grounded ONLY in these " +
      "facts. No greeting, no emoji.",
    facts
  );
}

// Narrate an account briefing in 2 grounded sentences (V9 #71). Null without a
// key so the card uses its deterministic narrative.
export async function narrateBriefing(b: AccountBriefing): Promise<string | null> {
  const facts =
    `${b.headline}\n` +
    b.reads.map((r) => `${r.label}: ${r.text}`).join("\n") +
    `\nRecommended move: ${b.recommendation}`;
  return agentAnswer(
    "You are Freyr's AI sales agent briefing the rep on an account before they " +
      "engage. Write 2 crisp sentences: the situation, then the recommended move. " +
      "Grounded ONLY in these facts. No greeting, no emoji.",
    facts
  );
}

// ---------------------------------------------------------------------------
// Knowledge base extraction (Section 5.3)
// ---------------------------------------------------------------------------
export async function extractKnowledgeBase(pages: string[]): Promise<any> {
  if (!client) return MOCK_FREYR_KB;

  const content = pages.join("\n\n---PAGE---\n\n").slice(0, 180000);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You are extracting structured knowledge from Freyr Solutions' website content.
Freyr Solutions is a regulatory affairs and compliance services company serving
pharmaceutical, biotech, medical device, and life sciences companies globally.

From the provided website content, extract and structure:
1. Every service and solution Freyr offers (name, full description, who it's for, what problem it solves)
2. Every industry vertical Freyr serves and their specific regulatory needs
3. Every geographic market and regulatory agency Freyr covers (FDA, EMA, CDSCO, etc.)
4. Freyr's key differentiators and value propositions (use their exact language)
5. Any statistics, certifications, client counts, or proof points mentioned
6. The specific regulatory frameworks, guidelines, and standards Freyr works with
7. Technology platforms or software Freyr offers or uses

Return ONLY valid JSON matching this schema:
{
  "services": [{ "name": "", "description": "", "target_roles": [], "target_company_types": [], "target_industries": [], "pain_points": [], "differentiators": [], "freyr_language": [] }],
  "solutions": [{ "name": "", "description": "", "target_roles": [], "use_cases": [] }],
  "industries": [{ "name": "", "regulatory_needs": "", "freyr_positioning": "" }],
  "geographies": [{ "market": "", "agencies": [], "freyr_coverage": "" }],
  "differentiators": [],
  "proof_points": [],
  "regulatory_frameworks": [],
  "tone_and_language": { "taglines": [], "value_props": [], "key_phrases": [] }
}`,
    messages: [{ role: "user", content }],
  });

  try {
    return parseJson(textFrom(response));
  } catch {
    return MOCK_FREYR_KB;
  }
}

// ---------------------------------------------------------------------------
// Customer classification from website scrape
// ---------------------------------------------------------------------------
export async function classifyCustomer(
  companyName: string,
  scrapeText: string
): Promise<{
  size_tier: "small" | "mid" | "large";
  industry: string;
  geography: string;
  enrichment_summary: string;
}> {
  if (!client) {
    return {
      size_tier: "mid",
      industry: "Biotechnology",
      geography: "United States",
      enrichment_summary: `${companyName} is a life sciences company operating across regulatory jurisdictions. (Demo enrichment — add ANTHROPIC_API_KEY for live analysis.)`,
    };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `You classify a prospective customer for a regulatory-affairs services firm. Return ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Company: ${companyName}

Website content:
${scrapeText.slice(0, 12000)}

Return JSON:
{
  "size_tier": "small" | "mid" | "large",
  "industry": "",
  "geography": "",
  "enrichment_summary": "2-3 sentence summary of who they are and their regulatory situation"
}`,
      },
    ],
  });

  try {
    return parseJson(textFrom(response));
  } catch {
    return {
      size_tier: "mid",
      industry: "Life Sciences",
      geography: "Unknown",
      enrichment_summary: scrapeText.slice(0, 280),
    };
  }
}

// ---------------------------------------------------------------------------
// Contact classification from LinkedIn data
// ---------------------------------------------------------------------------
export async function classifyContact(profile: any): Promise<{
  job_title: string;
  role_bucket: string;
  career_summary: string;
  enrichment_summary: string;
}> {
  const fallback = {
    job_title: profile?.currentTitle || profile?.headline || "Unknown",
    role_bucket: "Regulatory Affairs",
    career_summary: profile?.about?.slice(0, 280) || "Experienced professional.",
    enrichment_summary:
      "Senior decision-maker. Engage with a data-driven, peer-level conversation.",
  };

  if (!client) return fallback;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `You classify a sales contact for a regulatory-affairs services firm. Return ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: `LinkedIn profile:
${JSON.stringify(profile, null, 2).slice(0, 12000)}

Return JSON:
{
  "job_title": "",
  "role_bucket": "e.g. Regulatory Affairs, Quality Assurance, Executive, Clinical Affairs",
  "career_summary": "1-2 sentence career highlight",
  "enrichment_summary": "how to approach this person in a sales conversation"
}`,
      },
    ],
  });

  try {
    return parseJson(textFrom(response));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Matching engine (Section 8.1)
// ---------------------------------------------------------------------------
export interface MatchingInput {
  freyrKb: any;
  customerSummary: string;
  contactProfile: any;
  additionalContext?: string;
}

export async function runMatchingEngine(
  input: MatchingInput
): Promise<MatchingOutput> {
  if (!client) return MOCK_MATCHING_OUTPUT;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You are a senior sales strategist at Freyr Solutions with deep knowledge of every
service and solution Freyr offers. Given a customer and contact profile, identify the 2-3 most
relevant Freyr offerings. Be specific about why each is a fit. Do not recommend services that
are clearly mismatched. Use Freyr's own language and positioning where relevant.
Return ONLY valid JSON — no markdown, no explanation outside the JSON.`,
    messages: [
      {
        role: "user",
        content: `FREYR KNOWLEDGE BASE:
${JSON.stringify(input.freyrKb, null, 2)}

CUSTOMER PROFILE:
${input.customerSummary}

CONTACT PROFILE:
${JSON.stringify(input.contactProfile, null, 2)}

ADDITIONAL CONTEXT FROM SALES REP:
${input.additionalContext || "None provided"}

Return JSON matching this schema:
{
  "recommended_services": [{
    "service_name": "",
    "relevance_score": 0,
    "why_this_customer": "",
    "why_this_contact": "",
    "pitch_angle": "",
    "freyr_language_to_use": []
  }],
  "customer_summary": "",
  "contact_summary": "",
  "recommended_tone": "",
  "things_to_avoid": []
}`,
      },
    ],
  });

  try {
    return parseJson<MatchingOutput>(textFrom(response));
  } catch {
    return MOCK_MATCHING_OUTPUT;
  }
}

// ---------------------------------------------------------------------------
// Pitch generation (Section 8.2)
// ---------------------------------------------------------------------------
export interface PitchInput {
  matchingOutput: MatchingOutput;
  contactProfile: any;
  customerSummary: string;
  freyrKb: any;
}

export async function generatePitches(
  input: PitchInput
): Promise<PitchOutput> {
  if (!client) return MOCK_PITCHES;

  const c = input.contactProfile || {};
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You are writing sales pitch materials for a Freyr Solutions sales representative.
Write in a professional but human voice. Be specific to this customer and contact —
no generic phrases. Use Freyr's own language and proof points where relevant.
Return ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: `MATCHING ANALYSIS:
${JSON.stringify(input.matchingOutput, null, 2)}

CONTACT: ${c.fullName || c.full_name || "the contact"}, ${
          c.currentTitle || c.job_title || ""
        } at ${c.currentCompany || ""}
CONTACT BACKGROUND: ${c.about || c.career_summary || ""}

CUSTOMER SUMMARY: ${input.customerSummary}

Generate three pitch formats. Return JSON:
{
  "pitch_5min_script": "full script text here",
  "pitch_email": {
    "subject_lines": ["option1", "option2", "option3"],
    "body": "full email body here"
  },
  "pitch_call_script": {
    "opener": "",
    "value_prop": "",
    "permission_question": "",
    "if_bad_time_voicemail": "",
    "if_good_time_continue": "",
    "qualifying_questions": []
  }
}`,
      },
    ],
  });

  try {
    return parseJson<PitchOutput>(textFrom(response));
  } catch {
    return MOCK_PITCHES;
  }
}
