/**
 * A person's name in this workspace is FIRST AND LAST, always (Anir, Aug 13:
 * "they have to have their full name. You can't just be first name"). One
 * loose rule everywhere a name is typed: at least two words of two or more
 * letters. It never blocks longer names, initials with dots, or hyphens.
 */
export function isFullName(raw: string): boolean {
  const words = raw.trim().split(/\s+/).filter((w) => w.length >= 2);
  return words.length >= 2;
}

export const FULL_NAME_HINT = "Enter the full name, first and last.";
