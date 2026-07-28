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
export const FILTER_PALETTE = [
  "#2563EB", // blue        · 220°
  "#E11D48", // rose        · 348°
  "#059669", // emerald     · 160°  (blue-green)
  "#7C3AED", // violet      · 265°
  "#EA580C", // orange      ·  22°  (deep enough to read as text, still orange)
  "#0891B2", // cyan        · 192°
  "#C026D3", // fuchsia     · 292°
  "#4F46E5", // indigo      · 244°
  "#166534", // forest      · 145°  (was amber; 7.1:1 on white, 47° clear of
  //                                 every hue within three slots — with yellow
  //                                 gone, 95°-192° is the only clean window
  //                                 left. Second green is allowed by rule 2:
  //                                 emerald sits six slots away and is far
  //                                 lighter, so they never read as one colour.)
  "#9E1A72", // magenta     · 320°  (was lime; 7.4:1 on white, and the widest
  //                                 remaining gap — 28° from both fuchsia and
  //                                 rose, and much darker than either, so the
  //                                 three never collapse into one pink.)
];

export const listAccent = (i: number) =>
  FILTER_PALETTE[i % FILTER_PALETTE.length];
