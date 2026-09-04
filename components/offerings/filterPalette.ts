// Shared accent palette for master-list rows, filter dropdowns and the tile
// eyebrows, indexed by position so the same entry reads the same colour
// everywhere (chip rule: every category/tag gets a colour + icon, never plain
// gray).
//
// ONE RULE ABOVE ALL THE OTHERS: NEIGHBOURS MUST NOT LOOK ALIKE (Anir, Aug 24,
// reading the eight category names down a page: "can we have very distinctive
// font colours? Since we need essentially seven font colours, there shouldn't
// be four shades of blue, because that makes it slightly difficult to digest.
// Let's just keep them as varied as possible — some yellow, some pink, some
// green.")
//
// He was describing a real defect, not a preference. The previous list spent
// five of its ten slots on blue-family hues (blue, cyan, indigo, sky, slate),
// so five of the eight categories arrived in some shade of blue and the colour
// stopped carrying information. The wheel is now walked in big steps: no two
// consecutive entries are within ~40° of each other, and every hue family
// appears once.
//
// Rules for editing this list:
//   1. No two entries within three positions may share a hue family. Offering
//      TYPES read this same list at an offset of +3, so a slot's neighbours are
//      different in the two lists — check both.
//   2. Every entry must hold contrast for a 10px dot, a 10px uppercase eyebrow
//      and 13px text (all >= 4.5:1) IN BOTH THEMES. That is why these are
//      tokens and not hexes: a literal here can only be tuned for one ground,
//      and four of them were failing on the dark one while reading fine on
//      white. Add a slot by adding a --cat-* pair in globals.css, never by
//      dropping a hex in this list.
//   3. STAY OFF THE STATUS TONES. Red, green and amber mean something in this
//      app — #DC2626 sent back, #16A34A verified / "Available now", #7A4A00
//      "Available <month>" — and an identity colour must never be mistaken for
//      one (Anir, Jul 28: "red means horrible, red means negative... colours
//      like red, green and yellow are reserved for actually signifying
//      something else"). That rule and the Aug 24 ask meet here: the warm and
//      green slots exist, but they are the tones a status pill never wears —
//      olive/moss instead of emerald, bronze-gold instead of mustard or amber.
//      Nothing here is #16A34A, #DC2626, #F59E0B, #EAB308 or #7A4A00.
export const FILTER_PALETTE = [
  "var(--cat-blue)", // blue          · 220°
  "var(--cat-pink)", // pink          · 333°
  "var(--cat-teal)", // teal          · 175°
  // WAS #B45309, AND IT READ AS MUD (Anir, Aug 27: "this is an ugly color, I
  // don't know why you're using that brown"). That ochre is what a dark
  // orange becomes at low chroma. #C2410C is the app's OWN warm token — the
  // one charts/palette.ts already uses for the caution series — so this slot
  // now matches the rest of the product instead of inventing a browner
  // cousin of it. Brighter, cleanly orange, and 5.18:1 on white.
  "var(--ink-orange)", // burnt orange  ·  20°  (the warm slot; the app-wide warm token)
  "var(--ink-violet-soft)", // violet        · 265°
  "var(--cat-olive)", // olive green   ·  83°  (moss, not the emerald of "Available now")
  "var(--cat-cyan)", // cyan          · 192°
  "var(--cat-magenta)", // magenta       · 320°
  "var(--cat-slate)", // slate         · 215°  (neutral, 7.5:1 on white)
  "var(--cat-purple)", // deep purple   · 262°  (second purple, far darker than slot 4)
];

export const listAccent = (i: number) =>
  FILTER_PALETTE[i % FILTER_PALETTE.length];
