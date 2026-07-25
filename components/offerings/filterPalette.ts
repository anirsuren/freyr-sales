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
export const FILTER_PALETTE = [
  "#2563EB", // blue        · 220°
  "#F59E0B", // amber       ·  38°
  "#7C3AED", // violet      · 265°
  "#059669", // emerald     · 160°  (blue-green)
  "#E11D48", // rose        · 348°
  "#0891B2", // cyan        · 192°
  "#C026D3", // fuchsia     · 292°
  "#65A30D", // lime        ·  82°  (yellow-green — reads apart from emerald)
  "#EA580C", // orange      ·  22°  (deeper + redder than amber)
  "#4F46E5", // indigo      · 244°
];

export const listAccent = (i: number) =>
  FILTER_PALETTE[i % FILTER_PALETTE.length];
