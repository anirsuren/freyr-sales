// THE ORDER FREYR'S CATALOGUE IS SEEDED IN, and the single source of truth for
// it. Position in this list decides an offering's icon and hue, which is the
// only way to guarantee no two offerings share a glyph: a hash cannot promise
// that, and it demonstrably did not (Anir, Jul 28: "no two icons should be the
// same for the offerings").
//
// This lives in its own module with NO other imports so a client component can
// read it without pulling `lib/offerings.ts` (and the Supabase SDK with it)
// into the browser bundle. `tests/verify.spec.ts` asserts it matches the live
// catalogue exactly, so a rename or a new offering fails the suite instead of
// silently falling back to the hash and colliding, which is what happened when
// Freya.Doc was renamed to Freya.Docs.
export const OFFERING_CATALOGUE_ORDER: string[] = [
  "Freya.Register",
  "Freya.Intelligence",
  "Freya.GRR-PAC (Global Regulatory Requirements for Post Approval Changes)",
  "Freya.Label",
  "Freya.Submit",
  "Freya.Artwork",
  "Freya.RTQ",
  "Freya.RA Changes",
  "Freya.Docs",
  "Freya.Register + Pia + Mia",
  "Freya.GRR-PAC + Via",
  "Freya.Register + Pia + Mia + Via",
  "Freya.Agents",
  "Freya.OmniObject",
  "Publishing",
  "Submissions Planning & Management",
  "Label Management",
  "Artwork Management",
  "Regulatory Affairs Strategy",
  "Regulatory Affairs - Initial Applications & Market Access",
  "Local Regulatory Affairs",
  "Post-Approval Regulatory Affairs",
  "Regulatory Intelligence Services",
  "Pharmacovigilance",
  "Medical Writing - Clinical",
  "Medical Writing - Non Clinical & Toxicology",
  "Compliance, Audit and Validation",
  "Medical & Scientific Communication",
  "RIMS Data Services",
];

/** The market that means "everywhere". */
export const GLOBAL_MARKET_ID = "mkt-global";

/**
 * Does an offering sold in `marketIds` cover `marketId`?
 *
 * GLOBAL COVERS EVERYTHING. Freya.Register is sold worldwide, so asking "is it
 * available in Japan?" must answer yes even though the record now says one
 * word instead of five (change request 11). Without this, collapsing the five
 * regional chips into "Global" would have silently made every market filter
 * and every agent answer say NO for the flagship offering.
 *
 * Lives here — the zero-import catalogue module — so the browser filter, the
 * agent and the server all apply one rule.
 */
export function servesMarket(
  marketIds: readonly string[] | undefined,
  marketId: string
): boolean {
  if (!marketIds?.length) return false;
  if (marketIds.includes(marketId)) return true;
  // Asking FOR Global is asking "is it sold everywhere" — a regional-only
  // offering is not, so this is deliberately one-directional.
  return marketId !== GLOBAL_MARKET_ID && marketIds.includes(GLOBAL_MARKET_ID);
}
