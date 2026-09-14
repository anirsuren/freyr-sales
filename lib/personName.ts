/**
 * FIRST NAME, LAST INITIAL — "Eswar S.", not "Eswar Subramanian".
 *
 * Anir, Aug 21, looking at the offerings table: "instead of saying the full
 * name, just say the first name and then last name initial. Wherever else too,
 * you don't really need the last name."
 *
 * Full names are what pushed the owner column into three wrapped lines on a
 * row whose job is to be scanned. The face beside the name and the hover card
 * behind it still carry the whole person; the printed string only has to be
 * enough to tell two colleagues apart.
 */
export function shortPersonName(name: string | null | undefined): string {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  // A surname already down to an initial keeps whatever punctuation it has,
  // so "Anir S" does not become "Anir S..".
  const initial = last.length <= 2 ? last : `${last[0]}.`;
  return `${parts[0]} ${initial}`;
}

/* A NAME READS AS A NAME (Sep 13 loop). LinkedIn hands names over the way
   people typed them: "Stephane COUSIN", "Shawn. Stragier", "Krishna Vamsi
   Kandimalla, PharmD, MSRA, RAC", "Ravi  Patel (MS-RA, MPharm, RPh)". Side by
   side in one list they looked like four different systems. A list shows the
   name alone in ordinary capitals; nothing stored changes. */

const CREDENTIAL =
  /^(mba|pmp®?|pmi-rmp®?|ph\.?d\.?|pharm\.?d\.?|md|do|ms|msc|mph|rph|rac|msra|mpharm|bpharm|bsc|cpa|cfa|rn|dvm|jd|llm|facc|frcp|mrcp|cqa|cqe|meng|beng)$/i;
const KEEP_PERIOD = /^(jr|sr|st|dr|mr|mrs|ms|prof)$/i;

export function displayPersonName(raw: string): string {
  const full = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!full) return full;
  const words = (full.split(/\s*[,(]/)[0].trim() || full).split(" ");
  while (words.length > 2 && CREDENTIAL.test(words[words.length - 1])) words.pop();
  return words
    .map((word) => {
      const bare = word.replace(/\.$/, "");
      /* "Shawn." before a surname is a typo; "O." and "Jr." are not. */
      const unstopped = word.endsWith(".") && bare.length >= 3 && !KEEP_PERIOD.test(bare) ? bare : word;
      return CREDENTIAL.test(unstopped)
        ? unstopped
        : unstopped.replace(/(?<![\p{L}'’])\p{Lu}{3,}(?!\p{L})/gu, (caps) => caps.charAt(0) + caps.slice(1).toLowerCase());
    })
    .join(" ");
}
