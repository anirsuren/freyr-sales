// Data-viz palette — a plain (server-safe) module so BOTH server and client
// components can read these constants. The interactive chart components live in
// ChartsClient (a "use client" module); keeping the colours here means a server
// component can still do VIZ.blue / VIZ_SERIES[i] without crossing the client
// boundary.
// Named hues. Kept deliberately far apart: `teal` and `green` used to be
// #19C3B1 and #34C759 — two greens a reader could not tell apart in a legend,
// and `sky` sat right on top of `blue` (Anir, Jul 25: "some of these greens are
// so similar… it has to be distinct"). Each name is now its own hue family.
export const VIZ = {
  blue: "#2563EB",
  sky: "#0891B2", // cyan — clearly not blue
  teal: "#0D9488", // deep blue-green
  indigo: "#4F46E5",
  // A true green. #65A30D pulled this too far toward yellow chasing separation
  // from teal, and the result read as murky olive on the campaign gauges (Anir,
  // Jul 26: "why are you using that weird green color?"). #22C55E is a clean
  // green that still sits ~30° off teal's blue-green and never looks drab.
  green: "#22C55E",
  amber: "#F59E0B",
  // Was a gray (#8E98A8) — Suren: never gray in a graph. Now a real violet.
  slate: "#A855F7",
  rose: "#E11D48",
};
// Categorical series ordered for MAX contrast between neighbours (Suren: the
// teal/blue/green trio was unreadable side by side). Every adjacent pair jumps
// across the hue wheel — blue → orange → violet → green → rose → cyan.
export const VIZ_SERIES = [
  VIZ.blue,
  VIZ.amber,
  VIZ.slate,
  VIZ.green,
  VIZ.rose,
  VIZ.teal,
  VIZ.sky,
];
