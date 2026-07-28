// Shared accent palette for master-list rows and filter dropdowns, indexed by
// position so the same entry reads the same colour everywhere (chip rule:
// every category/tag gets a colour + icon, never plain gray — and no muddy
// brown-orange, Suren).
//
// Ordered so that NEIGHBOURS ARE FAR APART ON THE HUE WHEEL, because in a
// dropdown you compare each row against the one above it. The previous list
// put emerald (#059669) two slots from dark teal (#0F766E) and blue (#0071E3)
// near steel blue (#0369A1); side by side those read as the same colour
// (Anir, Jul 25: "some of these greens are so similar… it has to be distinct").
//
// Rules for editing this list:
//   1. No two entries within three positions may share a hue family.
//   2. Only one colour per family overall where possible — at ten slots the
//      wheel forces a second green, so they sit at opposite ends (index 3
//      blue-green vs index 7 yellow-green) and differ in lightness too.
//   3. Every entry must hold contrast on white for a 10px dot and 13px text.
//   4. LEGIBILITY OUTRANKS ORDERING. These accents are used as chip TEXT on a
//      pale tint of themselves, so every entry must survive that on its own.
//   5. NO YELLOW BAND AT ALL (Anir, Jul 27). Hiding amber/lime in the tail was
//      not enough: offering TYPES read this list at an offset of +3, so slot 8
//      was the live colour of the "Freyr Service" chip and it shipped as
//      mustard-on-cream. Suren: "Change this color. This color sucks. That
//      yellow, never use that yellow." Hues 35°-95° (#F59E0B, #EAB308,
//      #CA8A04, #D97706, #65A30D, #F5A623) are now banned everywhere as text
//      or chip accent, and darkening them into brown is banned too — so the
//      tail was rehued instead of reordered. Slots 8 and 9 are the ONLY two
//      that changed; 0-7 keep the colours the six categories already wear.
//   6. NO STATUS COLOUR AT ALL (Anir, Jul 28). Red, green and yellow are
//      reserved in this app for meaning: red is a problem, green is healthy,
//      #C2410C is caution. A category is an IDENTITY, so a category chip must
//      never borrow one. "Submissions and Document Operations" was shipping in
//      rose and "Global Regulatory Intelligence" in emerald, so two perfectly
//      healthy categories read as an error and an all-clear. His words: "you
//      have to understand that red means horrible, red means negative... colors
//      like red, green, and yellow are reserved for actually signifying
//      something else. The purple is fine, obviously, because that's a neutral
//      color." Rose, emerald, orange and forest are gone; the wheel now runs
//      through blues, purples, cyans, pinks and slate only, still keeping
//      rule 1 (no two hue-neighbours within three slots).
export const FILTER_PALETTE = [
  "#2563EB", // blue         · 220°
  "#C026D3", // fuchsia      · 292°
  "#0891B2", // cyan         · 192°
  "#4F46E5", // indigo       · 244°
  "#9E1A72", // magenta      · 320°
  "#0EA5E9", // sky          · 199°
  "#7C3AED", // violet       · 265°
  "#0F766E", // dark teal    · 178°  (blue-green, never reads as "healthy")
  "#475569", // slate        · 215°  (neutral, 7.5:1 on white)
  "#DB2777", // pink         · 333°
];

export const listAccent = (i: number) =>
  FILTER_PALETTE[i % FILTER_PALETTE.length];
