/**
 * DIVISIONS, AND WHO LEADS SOLUTIONING FOR EACH.
 *
 * Manoj's Pack 1, SOL-007: "When Opportunities are selected, automatically
 * derive the Division(s) represented in the Solutioning Request from the
 * selected Opportunities and their linked Offerings. Do not ask the Sales user
 * to re-enter Division information already available from the system."
 *
 * WHERE A DIVISION COMES FROM. The only offering-linked taxonomy the app
 * actually has is `offering_category` — the seven categories on the catalogue
 * (RIM, Submissions, GRI, Labeling, Platform, Regulatory Affairs, Others). An
 * opportunity names its offerings, an offering names its category, so the
 * derivation SOL-007 asks for is available without anybody typing anything.
 *
 * THIS IS AN INTERPRETATION, AND IT IS DELIBERATELY ONE EDIT WIDE. If Freyr
 * means its commercial divisions (the MPR / MDV / CON split the targets sheet
 * uses) rather than offering categories, change `divisionOfOffering` below and
 * every screen that shows a Division follows — nothing else hard-codes the
 * mapping. Flagged to Anir on Aug 31 rather than guessed silently.
 *
 * SOL-008 and SOL-009 hang off this: each division has a configured lead, the
 * app RECOMMENDS that lead, and sales may always pick somebody else. The
 * recommendation is advisory and never locks.
 */

export type DivisionLeadMap = Record<string, string>;

/**
 * The category a division is named after. Kept as the category NAME rather
 * than its id so a request stores something a person can read years later,
 * after a category has been renamed or removed.
 */
export function divisionOfOffering(offeringCategory: string | undefined): string {
  const name = (offeringCategory ?? "").trim();
  return name || "Unassigned";
}

/**
 * THE SHEET'S SHORTHAND, RESOLVED TO A DIVISION.
 *
 * An imported deal names its offering the way the pipeline workbook does —
 * "GRI", "Agent-VIA", "RTQ" — while the catalogue names products
 * ("Freya.intelligence + Agents", "Freya.RTQ"). Matching those two by exact
 * name never lands, so every one of the 76 imported deals derived no division
 * at all and SOL-007 quietly did nothing on the deals that matter most.
 *
 * Three passes, cheapest and most certain first: the catalogue's own category
 * names, then the workbook's shorthand, then a substring of a product name.
 * A label nothing recognises returns undefined rather than a guess.
 */
const LABEL_ALIASES: Record<string, string> = {
  gri: "Global Regulatory Intelligence",
  "ri report": "Global Regulatory Intelligence",
  "dashboards (market, competitive intel)": "Global Regulatory Intelligence",
  "agent-via": "Freya Fusion Platform & Agents",
  "agent - via": "Freya Fusion Platform & Agents",
  "ai agents": "Freya Fusion Platform & Agents",
  rtq: "Regulatory Affairs",
};

export function divisionFromLabel(
  label: string,
  offerings: { offering_name: string; offering_category?: string }[],
  categoryNames: string[]
): string | undefined {
  const key = label.trim().toLowerCase();
  if (!key) return undefined;
  const byCategory = categoryNames.find((c) => c.trim().toLowerCase() === key);
  if (byCategory) return byCategory;
  const alias = LABEL_ALIASES[key];
  if (alias) return alias;
  const byName = offerings.find(
    (o) =>
      o.offering_name.trim().toLowerCase() === key ||
      o.offering_name.trim().toLowerCase().includes(key)
  );
  return byName?.offering_category?.trim() || undefined;
}

/**
 * EVERY DIVISION REPRESENTED IN A SET OF OFFERINGS, ONCE.
 *
 * SOL-007's acceptance criteria in one function: "Selecting multiple
 * Opportunities from the same Division shows that Division once. Selecting
 * Opportunities from different Divisions shows all represented Divisions."
 */
export function divisionsFor(
  offeringCategories: (string | undefined)[]
): string[] {
  const seen = new Set<string>();
  for (const c of offeringCategories) {
    const d = divisionOfOffering(c);
    if (d && d !== "Unassigned") seen.add(d);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * WHO THE APP SUGGESTS FOR A DIVISION.
 *
 * Advisory only (SOL-008: "The system must never automatically lock or
 * permanently assign the recommended Lead. Sales retains final selection
 * authority"). An unmapped division simply has no suggestion, which is a
 * better answer than suggesting the wrong person.
 */
export function recommendedLead(
  division: string,
  map: DivisionLeadMap
): string | undefined {
  const hit = map[division];
  return hit && hit.trim() ? hit.trim() : undefined;
}
