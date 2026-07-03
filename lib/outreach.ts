// Contact⇄offering matching + on-demand outreach messages (Suren, Jul 3).
//
// 1) rankOfferingsForContact — a contact inherits the customer's applicable
//    offerings by default; their LinkedIn title / role / skills keywords are
//    matched against each offering's name + category + description to flag the
//    STRONG matches for that person ("use AI very efficiently" — this layer is
//    deterministic and explainable today; Claude re-ranking can be added the
//    same way analysis was).
// 2) generateMessage — a LinkedIn (≤300 chars) or email draft grounded in the
//    selected offering + the contact's profile + basic Freyr/Freya context.
//    Generated ON DEMAND (never auto-sent): the rep copies it into LinkedIn /
//    email themselves. Uses live Claude when a key is present; otherwise a
//    deterministic template — Suren: "first prompting will not get a good job,
//    give me the framework and we'll keep enhancing."

import type { Contact, Customer } from "./types";
import type { Offering } from "./offerings";
import { hasAnthropic } from "./env";

// What Freyr/Freya IS — the "basic information the system should have access
// to by default" (Suren). Kept short; the real KB grows via sales materials.
export const FREYR_CONTEXT =
  "Freyr is a global regulatory solutions partner to 400+ life-sciences companies. Freya is Freyr's AI-powered regulatory platform — modules for product registration, submissions, labeling, artwork and regulatory intelligence, with AI agents that automate the work around them.";

const STOPWORDS = new Set([
  "and", "the", "for", "with", "head", "lead", "senior", "chief", "global",
  "director", "manager", "officer", "president", "vice", "affairs", "team",
]);

// "global" and "affairs" are stopworded above because they'd match almost
// every offering — but "regulatory", "labeling", "submissions", "intelligence",
// "artwork", "quality", "clinical", "medical", "safety", "pharmacovigilance"
// etc. are exactly the signals Suren described.
function tokens(s: string): string[] {
  return Array.from(
    new Set(
      (s || "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    )
  );
}

export interface RankedOffering {
  offering: Offering;
  score: number;
  matched: string[]; // the contact's keywords that hit this offering (the "why")
}

export function rankOfferingsForContact(
  contact: Contact,
  offerings: Offering[]
): RankedOffering[] {
  const skills = Array.isArray(contact.raw_linkedin_data?.skills)
    ? (contact.raw_linkedin_data!.skills as string[]).join(" ")
    : "";
  const kw = tokens(
    `${contact.job_title || ""} ${contact.role_bucket || ""} ${skills}`
  );
  const ranked = offerings.map((offering) => {
    const hay = `${offering.offering_name} ${offering.offering_category} ${offering.offering_type} ${offering.offering_description}`.toLowerCase();
    const matched = kw.filter((k) => hay.includes(k));
    return { offering, score: matched.length, matched };
  });
  // Strong matches first, otherwise keep the catalog order (stable sort).
  return ranked.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

export type MessageKind = "linkedin" | "email";

export interface OutreachInput {
  kind: MessageKind;
  contact: Contact;
  customer: Customer | null;
  offering: Offering;
  extra?: string; // anything the rep adds ("met at DIA", "focus the EU angle")
}

export interface OutreachDraft {
  kind: MessageKind;
  subject?: string; // email only
  message: string;
  source: "claude" | "template";
  limit?: number; // LinkedIn character budget, for the UI counter
}

const LINKEDIN_LIMIT = 300; // connection-note budget — keep it copy-paste safe

function firstName(full: string): string {
  return (full || "").replace(/^(dr|mr|ms|mrs)\.?\s+/i, "").split(/\s+/)[0] || "there";
}

// One readable line from an offering description (they're long MPR write-ups).
// Prose descriptions → first sentence(s); bullet-only descriptions → the first
// few items joined naturally ("A, B, C, and more") instead of a run-on flatten.
export function descSnippet(o: Offering, max = 180): string {
  const raw = (o.offering_description || "").trim();
  if (!raw) return "";
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const firstIsBullet = /^[•–-]/.test(lines[0] || "");
  if (firstIsBullet || lines.every((l) => /^[•–-]/.test(l))) {
    const items = lines
      .filter((l) => /^[•–-]/.test(l))
      .map((l) => l.replace(/^[•–-]\s*/, "").replace(/[.;,]+$/, "").trim())
      .filter(Boolean);
    const shown = items.slice(0, 3);
    return `it covers ${shown.join(", ")}${items.length > 3 ? ", and more" : ""}`;
  }
  const flat = lines.join(" ").replace(/[•–]\s*/g, "").replace(/\s{2,}/g, " ");
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > 60) return cut.slice(0, stop + 1).trim();
  // no sentence boundary — cut at a word boundary, never mid-word
  const space = cut.lastIndexOf(" ");
  return (space > 60 ? cut.slice(0, space) + "…" : cut).trim();
}

export function generateMessageTemplate(input: OutreachInput): OutreachDraft {
  const { contact, customer, offering, kind } = input;
  const first = firstName(contact.full_name);
  const company = customer?.company_name || "your team";
  const title = contact.job_title || "your regulatory work";
  const cat = offering.offering_category || offering.offering_type;

  if (kind === "linkedin") {
    // Budgeted assembly — trim the longest parts first so we stay ≤300.
    let msg = `Hi ${first} — given your role as ${title} at ${company}, I think ${offering.offering_name} (our ${cat.toLowerCase()} ${/service/i.test(offering.offering_type) ? "service" : "module"}) is worth 2 minutes of your time. Happy to share a short overview — open to it?`;
    if (msg.length > LINKEDIN_LIMIT) {
      msg = `Hi ${first} — given your role at ${company}, I think ${offering.offering_name} is worth 2 minutes of your time. Happy to share a short overview — open to it?`;
    }
    if (msg.length > LINKEDIN_LIMIT) msg = msg.slice(0, LINKEDIN_LIMIT - 1) + "…";
    return { kind, message: msg, source: "template", limit: LINKEDIN_LIMIT };
  }

  const snippet = descSnippet(offering);
  const subject = `${offering.offering_name} for ${company}`;
  const message = [
    `Hi ${first},`,
    ``,
    `Your work as ${title} at ${company} is exactly where ${offering.offering_name} tends to land well.`,
    ``,
    snippet
      ? `In one line: ${snippet}`
      : `${FREYR_CONTEXT}`,
    ``,
    `${
      /current/i.test(offering.current_availability)
        ? "It's available today"
        : offering.current_availability
        ? `Availability: ${offering.current_availability}`
        : "It's part of the Freya platform"
    } — and I can walk you through how teams like ${company}'s use it in 15 minutes.`,
    ``,
    `Would next week work for a quick call?`,
    ``,
    `Best,`,
    `Suren Dheen`,
    `Freyr Solutions`,
  ].join("\n");
  return { kind, subject, message, source: "template" };
}

// Live path — grounded Claude generation with the SAME inputs; falls back to
// the template when no key / forced mock (tests stay deterministic).
export async function generateMessage(
  input: OutreachInput
): Promise<OutreachDraft> {
  if (process.env.AGENT_FORCE_MOCK === "1" || !hasAnthropic()) {
    return generateMessageTemplate(input);
  }
  try {
    const { generateOutreachWithClaude } = await import("./claude");
    const out = await generateOutreachWithClaude({
      kind: input.kind,
      contactName: input.contact.full_name,
      contactTitle: input.contact.job_title || "",
      company: input.customer?.company_name || "",
      offeringName: input.offering.offering_name,
      offeringCategory:
        input.offering.offering_category || input.offering.offering_type,
      offeringDescription: descSnippet(input.offering, 600),
      materials: input.offering.materials.map((m) => m.label),
      freyrContext: FREYR_CONTEXT,
      extra: input.extra || "",
      linkedinLimit: LINKEDIN_LIMIT,
    });
    if (out) {
      return {
        kind: input.kind,
        subject: out.subject,
        message: out.message,
        source: "claude",
        limit: input.kind === "linkedin" ? LINKEDIN_LIMIT : undefined,
      };
    }
  } catch {
    // fall through to the template
  }
  return generateMessageTemplate(input);
}
