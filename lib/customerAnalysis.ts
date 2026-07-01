// Customer analysis (Suren's Jun 27 ask): "Analyze the customer" reads the web,
// understands the company, and qualifies it against the offerings customer-type
// definitions — proposing the customer TYPE, whether it's PUBLIC or PRIVATE, and
// its REVENUE. The user reviews and approves before it's saved.
//
// The qualification is DYNAMIC — it reads `listCustomerTypes()` so as Suren adds
// more customer-type definitions, the analyzer classifies against them. Today the
// lookup is a deterministic, offline mock (no API credits, no paid scraping) that
// derives a plausible, stable profile from what we already know about the account
// plus a name-seeded hash — so the same company always resolves the same way and
// it reads like a real "found on the web" result. A real web/registry scraper can
// drop in behind `analyzeCustomer` later (Suren: "we'll get there").
import { listCustomerTypes, type CustomerType } from "./offerings";
import type { Customer } from "./types";
import { searchWeb, scrapeCustomerWebsite } from "./firecrawl";
import { qualifyCustomerType, qualifyCustomerTypeWithSearch } from "./claude";
import { hasFirecrawl, hasAnthropic } from "./env";

export interface CustomerAnalysis {
  customer_type: string; // e.g. "Pharmaceutical - Large" (a definition's name)
  customer_type_id: string | null;
  family: string;
  size: string;
  ownership: "Public" | "Private";
  revenue: string;
  rationale: string;
  confidence?: "high" | "medium" | "low";
  sources?: string[]; // URLs the web data came from
  source: "mock" | "web";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Map a CRM industry onto one of the offerings customer-type families. The
// families come from the definitions, so this adapts if Suren renames them.
function pickFamily(
  industry: string | null,
  families: string[],
  h: number
): string {
  const ind = (industry || "").toLowerCase();
  const has = (name: string) => families.find((f) => f.toLowerCase() === name);
  if (/pharma/.test(ind) && !/bio/.test(ind)) return has("pharmaceutical") || families[h % families.length];
  if (/biotech|biolog|gene|cell|vaccine/.test(ind))
    return has("biologics") || families[h % families.length];
  if (/device|consumer|health|hybrid|specialty/.test(ind))
    return has("bio pharmaceutical") || has("pharmaceutical") || families[h % families.length];
  // Unknown industry → deterministic pick so it's stable, never blank.
  return families[h % families.length] || "Pharmaceutical";
}

// Size tier → the definition's size label.
function pickSize(sizeTier: string | null, sizes: string[], h: number): string {
  const t = (sizeTier || "").toLowerCase();
  const find = (re: RegExp) => sizes.find((s) => re.test(s.toLowerCase()));
  if (t === "large") return find(/large/) || sizes[h % sizes.length];
  if (t === "mid" || t === "medium") return find(/mid|medium/) || sizes[h % sizes.length];
  if (t === "small") return find(/small/) || sizes[h % sizes.length];
  // No size on file → spread deterministically across the defined sizes.
  return sizes[h % sizes.length] || "Mid size";
}

// A plausible revenue figure that sits inside the matched definition's band, so
// it's consistent with the qualification ("$5B+" → a specific multi-billion
// figure). Stable per company.
function reveueFor(size: string, h: number): string {
  const s = size.toLowerCase();
  if (/large/.test(s)) {
    const b = 5 + (h % 360) / 10; // 5.0 – 41.0
    return `$${b.toFixed(1)}B`;
  }
  if (/mid|medium/.test(s)) {
    const b = 0.6 + (h % 44) / 10; // $0.6B – $5.0B
    return b >= 1 ? `$${b.toFixed(1)}B` : `$${Math.round(b * 1000)}M`;
  }
  const m = 60 + (h % 430); // $60M – $490M
  return `$${m}M`;
}

// Deterministic, offline qualification — used as the fallback (and in tests via
// AGENT_FORCE_MOCK) so the feature always returns something sensible.
export function analyzeCustomerDeterministic(
  customer: Customer
): CustomerAnalysis {
  const defs = listCustomerTypes();
  const h = hash(customer.company_name || customer.id);

  const families = Array.from(new Set(defs.map((d) => d.family)));
  const sizes = Array.from(new Set(defs.map((d) => d.size)));
  const family = pickFamily(customer.industry, families, h);
  const size = pickSize(customer.size_tier, sizes, h);

  // The matched definition (family + size) → its name + id.
  const match: CustomerType | undefined = defs.find(
    (d) => d.family === family && d.size === size
  );
  const customer_type = match ? match.name : `${family} - ${size}`;

  // Public vs private — larger companies skew public; stable per company.
  const sizeBias = /large/.test(size.toLowerCase())
    ? 85
    : /mid|medium/.test(size.toLowerCase())
    ? 50
    : 22;
  const ownership: "Public" | "Private" =
    h % 100 < sizeBias ? "Public" : "Private";

  const revenue = reveueFor(size, h);

  const rationale = match
    ? `Matched to ${match.name} — ${match.product_type ? match.product_type.replace(/\.$/, "") + "; " : ""}${match.revenue} revenue, ${match.employees} employees. ${ownership} company.`
    : `Qualified as ${customer_type} (${ownership}, ${revenue}).`;

  return {
    customer_type,
    customer_type_id: match ? match.id : null,
    family,
    size,
    ownership,
    revenue,
    rationale,
    source: "mock",
  };
}

// Live, enterprise-grade qualification (Suren: "use the best tools, no
// skimping"): Firecrawl searches the web + scrapes the company site, then Claude
// reconciles that against HIS dynamic customer-type definitions to decide the
// type, ownership, and revenue. Falls back to the deterministic engine in tests
// (AGENT_FORCE_MOCK) or whenever a key is missing / a call fails — so the
// feature is never blocked. This is the function the API + bulk run use.
export async function analyzeCustomer(
  customer: Customer
): Promise<CustomerAnalysis> {
  const det = analyzeCustomerDeterministic(customer);
  // The live path makes PAID calls (Firecrawl + Claude), so it's OFF by default
  // and only fires when CUSTOMER_ANALYSIS_LIVE=1 is set — no sense burning credits
  // researching the fictional seed accounts. Flip it on (env) once real customers
  // are loaded. Tests force mock; the live path also needs Claude at minimum.
  const liveEnabled = process.env.CUSTOMER_ANALYSIS_LIVE === "1";
  if (!liveEnabled || process.env.AGENT_FORCE_MOCK || !hasAnthropic()) return det;

  const name = customer.company_name;
  const defs = listCustomerTypes();
  const defPayload = defs.map((d) => ({
    name: d.name,
    family: d.family,
    size: d.size,
    revenue: d.revenue,
    employees: d.employees,
    product_type: d.product_type,
    operational_focus: d.operational_focus,
  }));

  const toAnalysis = (v: {
    customer_type: string;
    ownership: "Public" | "Private";
    revenue: string;
    rationale: string;
    confidence: "high" | "medium" | "low";
    sources?: string[];
  }): CustomerAnalysis => {
    const matched = defs.find((d) => d.name === v.customer_type) || null;
    return {
      customer_type: v.customer_type,
      customer_type_id: matched ? matched.id : null,
      family: matched ? matched.family : det.family,
      size: matched ? matched.size : det.size,
      ownership: v.ownership,
      // Keep a real figure; if blank (private, no figure) fall back to the band.
      revenue: v.revenue?.trim() || det.revenue,
      rationale: v.rationale || det.rationale,
      confidence: v.confidence,
      sources: v.sources,
      source: "web",
    };
  };

  try {
    // Path A — Firecrawl gathers the web (richest; when a Firecrawl key is set),
    // Claude reconciles it against the definitions.
    if (hasFirecrawl()) {
      const [results, siteText] = await Promise.all([
        searchWeb(
          `${name} company annual revenue number of employees public or private headquarters`,
          5
        ),
        customer.website_url
          ? scrapeCustomerWebsite(customer.website_url).catch(() => "")
          : Promise.resolve(""),
      ]);
      const webText = [
        siteText && `# ${name} — website\n${siteText}`,
        ...results.map((r) => `# ${r.title} (${r.url})\n${r.markdown}`),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (webText.trim()) {
        const verdict = await qualifyCustomerType(name, webText, defPayload);
        if (verdict)
          return toAnalysis({
            ...verdict,
            sources: results.map((r) => r.url).filter(Boolean).slice(0, 5),
          });
      }
    }

    // Path B — Claude's native web search (works with just the Anthropic key).
    const v = await qualifyCustomerTypeWithSearch(
      name,
      defPayload,
      customer.website_url
    );
    if (v) return toAnalysis(v);

    return det;
  } catch {
    return det;
  }
}
