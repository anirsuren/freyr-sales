// Data-viz palette — a plain (server-safe) module so BOTH server and client
// components can read these constants. The interactive chart components live in
// ChartsClient (a "use client" module); keeping the colours here means a server
// component can still do VIZ.blue / VIZ_SERIES[i] without crossing the client
// boundary.
export const VIZ = {
  blue: "#0071E3",
  sky: "#36A8F5",
  teal: "#19C3B1",
  indigo: "#5E5CE6",
  green: "#34C759",
  amber: "#FF9F0A",
  // Was a gray (#8E98A8) — Suren: never gray in a graph. Now a real violet.
  slate: "#A855F7",
  rose: "#F43F5E",
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
