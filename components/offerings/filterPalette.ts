// Shared accent palette for master-list rows and filter dropdowns, indexed by
// position so the same entry reads the same colour everywhere (chip rule:
// every category/tag gets a colour + icon, never plain gray — and no muddy
// brown-orange, Suren).
export const FILTER_PALETTE = [
  "#0071E3", "#E11D48", "#7C3AED", "#059669", "#F59E0B",
  "#0F766E", "#DB2777", "#0369A1", "#EA580C", "#4F46E5",
];

export const listAccent = (i: number) =>
  FILTER_PALETTE[i % FILTER_PALETTE.length];
