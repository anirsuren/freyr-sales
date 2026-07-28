// SPLITTING A POC FIELD INTO PEOPLE.
//
// Freyr's master sheet lists more than one contact in a single cell, separated
// by a slash ("Mukundh Chouthoy / Suresh Modugu") or a comma ("Inayat,
// Tanudeep"). Both are separators: a comma is NOT part of one surname-first
// name. Anir, Jul 28, twice: "you're having two people, but you're showing one
// profile picture and combining their names. That's not how it's supposed to
// work."
//
// One shared helper so the cards, the grid and the detail page can never
// disagree about how many people are on an offering.
export function pocNames(poc: string | null | undefined): string[] {
  return (poc || "")
    .split(/[/&,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
