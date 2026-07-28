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
