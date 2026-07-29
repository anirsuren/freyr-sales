import "server-only";

import { listOfferings, listCustomerTypes, listMarkets } from "./offerings";

/**
 * WHAT THE ASSISTANT KNOWS, beyond what is on screen.
 *
 * The dock has always answered from PAGE CONTENT — the text the rep is looking
 * at right now. That makes it useless the moment somebody asks a question whose
 * answer lives on another page: "which offering covers labelling in Japan?",
 * "what do we have for a mid-size biotech?", "is there a deck for Freya.Submit?"
 * (Wajeed, Jul 29: an AI chat layer where end users ask queries and get
 * responses based on all the content and materials available in the app).
 *
 * So this builds a searchable corpus out of the app's OWN records — every
 * offering with its description, capabilities, availability, contacts, markets
 * and customer types, plus every sales material and every master-list entry.
 * Nothing is invented and nothing is fetched: it is the same store the pages
 * render, so an answer can always be traced back to a record you can open.
 *
 * Retrieval is keyword scoring, deliberately, not embeddings: it needs no extra
 * API call, no index to keep warm, and no key — so the chat layer answers from
 * real content even on a keyless or offline run, and costs nothing per question.
 */

export type KnowledgePassage = {
  /** Stable id of the record this text came from. */
  id: string;
  /** What kind of thing it is, for the citation line. */
  kind: "offering" | "material" | "customer-type" | "market";
  /** Human title, e.g. the offering name. */
  title: string;
  /** Where a person can go to read it themselves. */
  href: string;
  /** The searchable body. */
  text: string;
};

/** Everything the assistant may quote, built fresh from the live store. */
export function buildKnowledgeBase(): KnowledgePassage[] {
  const out: KnowledgePassage[] = [];

  for (const o of listOfferings()) {
    const types = (o.customer_type_ids || [])
      .map((id) => listCustomerTypes().find((c) => c.id === id)?.name)
      .filter(Boolean);
    const markets = (o.market_ids || [])
      .map((id) => listMarkets().find((m) => m.id === id)?.name)
      .filter(Boolean);
    // The description verbatim, just flattened: bullet markers and newlines
    // become separators so the whole thing is one searchable line. Parsing it
    // into capability groups is a CLIENT concern (OfferingCapabilities is a
    // "use client" module, and a server import of it yields a client reference,
    // not the function) and retrieval does not need the structure anyway.
    const capText = (o.offering_description || "")
      .replace(/[•·]/g, " ")
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("; ");

    out.push({
      id: o.id,
      kind: "offering",
      title: o.offering_name,
      href: `/offerings/${o.id}`,
      text: [
        o.offering_name,
        o.offering_type && `Type: ${o.offering_type}`,
        o.offering_category && `Category: ${o.offering_category}`,
        capText,
        o.current_availability && `Availability: ${o.current_availability}`,
        o.future_availability && `Availability notes: ${o.future_availability}`,
        types.length ? `Suits: ${types.join(", ")}` : "",
        markets.length ? `Available in: ${markets.join(", ")}` : "",
        (o.contacts || []).length
          ? `Contacts: ${(o.contacts || [])
              .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
              .join(", ")}`
          : o.poc && `Contact: ${o.poc}`,
      ]
        .filter(Boolean)
        .join(". "),
    });

    // Each material is its own passage: "is there a demo video for X?" should
    // hit the material, not the whole offering blurb.
    for (const m of o.materials || []) {
      out.push({
        id: m.id,
        kind: "material",
        title: m.label,
        href: `/offerings/${o.id}`,
        text: [
          `${m.label} — a ${m.kind} for ${o.offering_name}`,
          m.journeyStage && `Journey stage: ${m.journeyStage}`,
          m.accessLevel && `Who can see it: ${m.accessLevel}`,
          o.offering_category && `Category: ${o.offering_category}`,
          m.url && `Link: ${m.url}`,
        ]
          .filter(Boolean)
          .join(". "),
      });
    }
  }

  for (const c of listCustomerTypes()) {
    out.push({
      id: c.id,
      kind: "customer-type",
      title: c.name,
      href: "/offerings/customer-types",
      text: [
        c.name,
        c.family && `Family: ${c.family}`,
        c.size && `Size: ${c.size}`,
        c.product_type && `Products: ${c.product_type}`,
        c.revenue && `Revenue band: ${c.revenue}`,
        c.employees && `Headcount: ${c.employees}`,
        c.operational_focus && `Focus: ${c.operational_focus}`,
      ]
        .filter(Boolean)
        .join(". "),
    });
  }

  for (const m of listMarkets()) {
    out.push({
      id: m.id,
      kind: "market",
      title: m.name,
      href: "/offerings",
      text: `${m.name} is a market the catalogue tracks availability against.`,
    });
  }

  return out;
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "is", "are",
  "was", "were", "do", "does", "did", "we", "our", "us", "you", "your", "it",
  "its", "this", "that", "with", "what", "which", "who", "whom", "how", "can",
  "any", "all", "have", "has", "had", "be", "been", "there", "their", "about",
  "me", "my", "i", "at", "as", "by", "from", "if", "so", "not", "no", "yes",
]);

function terms(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The passages most likely to answer this question.
 *
 * Scoring is deliberately simple and explainable: a term in the TITLE is worth
 * more than the same term in the body (asking about "Freya.Submit" should
 * surface Freya.Submit itself, not every offering that mentions submissions),
 * rarer terms are worth more than common ones, and a passage that matches more
 * DISTINCT query terms beats one that repeats a single term.
 */
export function searchKnowledge(
  question: string,
  limit = 6,
  corpus = buildKnowledgeBase()
): KnowledgePassage[] {
  const q = terms(question);
  if (q.length === 0) return [];

  // How many passages mention each term, for the rarity weight.
  const docCount = new Map<string, number>();
  const prepared = corpus.map((p) => {
    const body = terms(p.text);
    const title = terms(p.title);
    const seen = new Set([...body, ...title]);
    for (const t of seen) docCount.set(t, (docCount.get(t) || 0) + 1);
    return { p, body, title, seen };
  });

  const scored = prepared.map(({ p, body, title, seen }) => {
    let score = 0;
    let matched = 0;
    for (const t of q) {
      const rarity = Math.log(corpus.length / ((docCount.get(t) || 0) + 1) + 1);
      const inTitle = title.some((w) => w === t || w.startsWith(t));
      const hits = body.filter((w) => w === t || w.startsWith(t)).length;
      if (inTitle) score += 6 * rarity;
      if (hits) score += Math.min(hits, 4) * rarity;
      if (inTitle || hits) matched += 1;
      // A term nobody indexed is a miss; `seen` keeps the lookup honest.
      void seen;
    }
    // Reward breadth: matching three different words beats one word five times.
    score *= 1 + matched / q.length;
    return { p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}

/** The retrieved passages, formatted for the model with their sources. */
export function knowledgeBlock(passages: KnowledgePassage[]): string {
  if (passages.length === 0) return "";
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] ${p.kind.toUpperCase()} · ${p.title} (${p.href})\n${p.text}`
    )
    .join("\n\n");
}
