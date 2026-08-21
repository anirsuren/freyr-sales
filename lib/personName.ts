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
