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
        "BioNex has an NDA targeted for later this year and a multi-compound biologics pipeline across FDA and EMA — exactly the high-stakes submission workload Freyr's dossier teams are built for.",
      why_this_contact:
        "Dr. Mehta is a former FDA CDER reviewer who has led 12 NDA/MAA approvals; she will value submission expertise from former agency reviewers over generic outsourcing.",
      pitch_angle:
        "Accelerate the upcoming NDA with CTD dossier preparation handled by former FDA/EMA reviewers, cutting prep time 30–40%.",
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
  pitch_5min_script: `Hi Dr. Mehta, I'm Suren Dheen from Freyr Solutions — I noticed your background includes time at FDA CDER before moving into industry, so I'll skip the basics and get straight to what I think matters for BioNex right now.

With your NDA submission coming up later this year and two compounds in Phase 2, you're entering the period where regulatory execution either accelerates or stalls your timeline. Freyr has completed over 5,000 regulatory submissions globally, and our team includes former FDA and EMA reviewers — people who know exactly what the agency expects to see.

Specifically for BioNex, I think two things are worth a conversation: first, our CTD dossier preparation service where we've consistently cut submission prep time by 30-40% for companies your size. Second, our Regulatory Intelligence service — given that you're working across FDA and EMA simultaneously, having automated monitoring across 120+ agencies in one place would remove a lot of manual tracking burden from your team.

I'm not here to sell you a contract today — I'd love 20 minutes with you and whoever owns the NDA prep to show you specifically how we've handled submissions for similar biologics pipelines. Would next week work?`,
  pitch_email: {
    subject_lines: [
      "Freyr + BioNex — regulatory support for your upcoming NDA",
      "Former FDA reviewer perspective on your upcoming submission",
      "How we helped 3 similar biologics companies cut submission time by 35%",
    ],
    body: `Dr. Mehta,

Your background at FDA CDER caught my attention — you know better than most what makes a submission succeed or stall.

With BioNex's NDA filing targeted for later this year, I wanted to reach out now rather than when timelines get tight. Freyr Solutions has supported 5,000+ regulatory submissions globally, and our team includes former FDA and EMA reviewers who work directly on dossier preparation.

For companies at BioNex's stage — mid-size, multi-compound pipeline, working across FDA and EMA — we typically find the highest value in two areas:

1. CTD dossier preparation and submission management, where we've consistently reduced prep time for similar biologics by 30-40%

2. Regulatory Intelligence monitoring across 120+ agencies so your team isn't manually tracking guideline changes across jurisdictions

Happy to show you a quick example of how we've handled similar NDA submissions for biologics-focused companies your size.

Would a 20-minute call next week make sense?

Suren Dheen
Freyr Solutions`,
  },
  pitch_call_script: {
    opener:
      "Hi, is this Dr. Priya Mehta? Great — this is Suren Dheen from Freyr Solutions. I know you're not expecting my call, so I'll be brief.",
    value_prop:
      "We support pharmaceutical and biotech companies with regulatory submissions globally — FDA, EMA, and 120+ other agencies. We've completed over 5,000 submissions and our team includes former FDA CDER reviewers.",
    permission_question:
      "I noticed BioNex has an NDA coming up later this year and I had a specific thought about how we might be able to help — do you have 90 seconds or is this a genuinely terrible time?",
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

// A tool the agent can call. Plain shape so route code doesn't depend on the SDK.
export interface AgentToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Real tool-using agent (V14). This is the production brain: Claude reasons over
// the full pipeline (provided in `system`) and DECIDES when to call a tool —
// reading deeper account detail or taking a real, human-led action — instead of
// us pattern-matching the message. It answers anything, in any language, because
// the model is in control. `runTool` executes the side effect and returns a
// result the model folds into its reply. Returns null without a key or on any
// error so the deterministic brain takes over and the chat never goes dark.
export async function agentConverseAgentic(
  system: string,
  turns: { role: "user" | "assistant"; content: string }[],
  tools: AgentToolDef[],
  runTool: (name: string, input: any) => Promise<{ content: string; did?: string }>,
  maxSteps = 6
): Promise<{ text: string; dids: string[] } | null> {
  if (!client) return null;
  // Claude requires the first message from the user with alternating roles —
  // collapse same-role runs so a malformed history can't 400 the call.
  const messages: Anthropic.MessageParam[] = [];
  for (const t of turns) {
    if (!t.content?.trim()) continue;
    if (messages.length === 0 && t.role !== "user") continue;
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role && typeof prev.content === "string") {
      prev.content += `\n\n${t.content}`;
    } else {
      messages.push({ role: t.role, content: t.content });
    }
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;

  const dids: string[] = [];
  try {
    for (let step = 0; step < maxSteps; step++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        system,
        tools: tools as unknown as Anthropic.Tool[],
        messages,
      });
      if (response.stop_reason !== "tool_use") {
        return { text: textFrom(response).trim(), dids };
      }
      // Carry the assistant's tool-call turn, then answer each tool call.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let out: { content: string; did?: string };
        try {
          out = await runTool(block.name, block.input);
        } catch {
          out = { content: `Couldn't run ${block.name} right now.` };
        }
        if (out.did) dids.push(out.did);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: out.content,
        });
      }
      messages.push({ role: "user", content: results });
    }
    // Used up the tool budget — make one final pass with no tools so the model
    // has to produce a written answer rather than another tool call.
    const final = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system,
      messages,
    });
    return { text: textFrom(final).trim(), dids };
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
// Customer-type qualification (Suren's Jun 27 ask) — reconcile gathered web
// data against HIS dynamic customer-type definitions and decide the type,
// ownership, and revenue. The definitions are passed in so it always classifies
// against the current master list (he keeps adding types). Returns null when no
// key, so the caller falls back to the deterministic engine.
// ---------------------------------------------------------------------------
export interface CustomerTypeDef {
  name: string;
  family: string;
  size: string;
  revenue: string;
  employees: string;
  product_type: string;
  operational_focus: string;
}
export async function qualifyCustomerType(
  companyName: string,
  webText: string,
  definitions: CustomerTypeDef[]
): Promise<{
  customer_type: string;
  ownership: "Public" | "Private";
  revenue: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
} | null> {
  if (!client) return null;
  const defs = definitions
    .map(
      (d) =>
        `- "${d.name}" → family ${d.family}, size ${d.size}; revenue ${d.revenue}; employees ${d.employees}; ${d.product_type}`
    )
    .join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      "You qualify a company for a regulatory-affairs firm by matching it to ONE of the provided customer-type definitions, using real web data. Pick the definition whose family AND size band best fit the company's actual revenue, employee count, and product focus. Return ONLY valid JSON.",
    messages: [
      {
        role: "user",
        content: `Company: ${companyName}

Web research (search results + site content):
${(webText || "").slice(0, 14000)}

Customer-type definitions to choose from (pick exactly one "name"):
${defs}

Return JSON:
{
  "customer_type": "<must be one of the definition names above>",
  "ownership": "Public" | "Private",
  "revenue": "<annual revenue with units, e.g. $8.2B; best estimate, or empty string if a private company with no figure>",
  "rationale": "<one sentence citing the evidence (revenue/employees/what they do) behind the match>",
  "confidence": "high" | "medium" | "low"
}`,
      },
    ],
  });
  try {
    const out = parseJson(textFrom(response)) as {
      customer_type: string;
      ownership: "Public" | "Private";
      revenue: string;
      rationale: string;
      confidence: "high" | "medium" | "low";
    };
    // Guard the type to a real definition name; otherwise signal a fallback.
    if (!out || !definitions.some((d) => d.name === out.customer_type))
      return null;
    if (out.ownership !== "Public" && out.ownership !== "Private")
      out.ownership = "Private";
    return out;
  } catch {
    return null;
  }
}

// Same qualification, but Claude does the web research itself via its native
// web-search tool — so it works with just the Anthropic key (no Firecrawl
// needed). Returns the verdict + the source URLs Claude actually cited.
export async function qualifyCustomerTypeWithSearch(
  companyName: string,
  definitions: CustomerTypeDef[],
  websiteUrl?: string | null
): Promise<{
  customer_type: string;
  ownership: "Public" | "Private";
  revenue: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
} | null> {
  if (!client) return null;
  const defs = definitions
    .map(
      (d) =>
        `- "${d.name}" → family ${d.family}, size ${d.size}; revenue ${d.revenue}; employees ${d.employees}; ${d.product_type}`
    )
    .join("\n");
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      tools: [
        // Anthropic server-side web search — Claude searches, reads, and cites.
        { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
      ],
      system:
        "You are a B2B account-qualification analyst for a regulatory-affairs firm. Search the web to find the company's real annual revenue, employee count, whether it is publicly traded or private, and what it does. Then match it to ONE of the provided customer-type definitions by family AND size band. End your turn with ONLY a JSON object (no prose around it).",
      messages: [
        {
          role: "user",
          content: `Research this company and qualify it: ${companyName}${
            websiteUrl ? ` (${websiteUrl})` : ""
          }

Customer-type definitions (choose exactly one "name"):
${defs}

After researching, reply with ONLY this JSON:
{
  "customer_type": "<one of the definition names>",
  "ownership": "Public" | "Private",
  "revenue": "<annual revenue with units e.g. $8.2B, or empty string if private with no figure>",
  "rationale": "<one sentence citing the evidence found>",
  "confidence": "high" | "medium" | "low"
}`,
        },
      ],
    });

    // Pull every text block (the JSON answer is the last one) + the cited URLs.
    const text = response.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("\n");
    const sources: string[] = [];
    for (const b of response.content as any[]) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.url) sources.push(r.url);
      }
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const out = JSON.parse(match[0]) as {
      customer_type: string;
      ownership: "Public" | "Private";
      revenue: string;
      rationale: string;
      confidence: "high" | "medium" | "low";
    };
    if (!out || !definitions.some((d) => d.name === out.customer_type))
      return null;
    if (out.ownership !== "Public" && out.ownership !== "Private")
      out.ownership = "Private";
    return { ...out, sources: Array.from(new Set(sources)).slice(0, 5) };
  } catch {
    return null;
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

// On-demand outreach drafts (Suren, Jul 3): a LinkedIn note or email grounded
// in the SELECTED offering + the contact's profile + the Freyr/Freya context.
// Returns null when no live client — the caller falls back to its template.
export async function generateOutreachWithClaude(input: {
  kind: "linkedin" | "email";
  contactName: string;
  contactTitle: string;
  company: string;
  offeringName: string;
  offeringCategory: string;
  offeringDescription: string;
  materials: string[];
  freyrContext: string;
  extra: string;
  linkedinLimit: number;
}): Promise<{ subject?: string; message: string } | null> {
  if (!client) return null;
  const isLi = input.kind === "linkedin";
  const prompt = `You write outreach for a Freyr Solutions sales rep. Context about Freyr: ${input.freyrContext}

Write a ${isLi ? `LinkedIn connection note (HARD LIMIT ${input.linkedinLimit} characters)` : "short sales email (subject + 120-170 word body)"} to:
- ${input.contactName}, ${input.contactTitle} at ${input.company}

Pitching this offering (use its substance, don't just name-drop):
- ${input.offeringName} (${input.offeringCategory})
- What it is: ${input.offeringDescription || "(description pending — lean on the category)"}
${input.materials.length ? `- Supporting materials we can share: ${input.materials.join("; ")}` : ""}
${input.extra ? `Rep's added context: ${input.extra}` : ""}

Rules: personal to their role, no fluff, one clear ask, no placeholder brackets, sign as "Suren Dheen, Freyr Solutions"${isLi ? `, and the whole note MUST be under ${input.linkedinLimit} characters` : ""}.
Return ONLY JSON: {"subject": ${isLi ? "null" : '"..."'}, "message": "..."}`;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const out = parseJson<{ subject?: string | null; message: string }>(
      textFrom(response)
    );
    if (!out?.message) return null;
    let message = out.message.trim();
    if (isLi && message.length > input.linkedinLimit) {
      message = message.slice(0, input.linkedinLimit - 1) + "…";
    }
    return { subject: out.subject || undefined, message };
  } catch {
    return null;
  }
}
