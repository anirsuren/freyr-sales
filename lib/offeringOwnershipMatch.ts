// WHO OWNS AN OFFERING. Pure name matching, no request context, so it is unit
// testable and can be reasoned about on its own. The server-only wrapper that
// reads the session lives in lib/offeringOwnership.ts.
//
// The link between a person and an offering is the offering's POC field, which
// carries real Freyr names from Suren's master sheet ("Eswar Subramanian",
// "Mukundh Chouthoy / Suresh Modugu"). We match on the NAME because that is the
// only identifier the sheet gives us; a verified session email whose local part
// matches counts too, which covers people whose display name differs from the
// sheet spelling.

/** Lowercase, collapse whitespace, drop punctuation the two sources disagree on. */
function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The sheet separates two owners with a slash, never a comma: a comma is part
 *  of a single surname-first name ("Inayat, Tanudeep"). Same rule as the POC
 *  avatars on the offering cards. */
export function pocNames(poc: string | null | undefined): string[] {
  return (poc || "")
    .split(/[/&]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Inayat, Tanudeep" and "Tanudeep Inayat" are the same person: compare the
 *  set of name parts, not the order, so a surname-first sheet entry still
 *  matches a first-name-first session. */
function sameName(a: string, b: string): boolean {
  const pa = norm(a).split(" ").filter(Boolean);
  const pb = norm(b).split(" ").filter(Boolean);
  if (pa.length === 0 || pb.length === 0) return false;
  if (pa.length !== pb.length) return false;
  const sorted = (xs: string[]) => [...xs].sort().join(" ");
  return sorted(pa) === sorted(pb);
}

/** Does this identity own the offering whose POC field is `poc`?
 *  `isIdentified` is false for the generic/unauthenticated identity, which must
 *  own nothing: without it a blank POC would match and quietly grant write
 *  access. */
export function ownsOffering(
  poc: string | null | undefined,
  user: { name: string; email: string | null; isIdentified: boolean }
): boolean {
  if (!user.isIdentified) return false;
  const owners = pocNames(poc);
  if (owners.length === 0) return false;

  const name = (user.name || "").trim();
  if (name && owners.some((o) => sameName(o, name))) return true;

  const local = (user.email || "").split("@")[0];
  if (!local) return false;
  // "eswar.subramanian" / "eswar_subramanian" all normalise to the same parts
  // as the sheet's "Eswar Subramanian".
  const fromEmail = local.replace(/[._-]+/g, " ");
  return owners.some((o) => sameName(o, fromEmail));
}
