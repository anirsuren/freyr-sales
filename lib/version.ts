/**
 * A VERSION ALWAYS READS WITH ITS V (Anir, Aug 9: "it's always gonna start
 * with V, cuz it's a version, right? So just hardcode that in").
 *
 * The imported sheet spells them inconsistently — "1.05" next to "V1.0.4" —
 * so this normalises rather than blindly prefixing: an existing v or V is
 * replaced, not doubled.
 *
 * It lives in lib rather than beside the components that use it because
 * FdlComponentsBrowser is a "use client" module, and importing a function
 * from a client module into a server component hands back a client reference
 * that throws when called on the server. A plain module is importable from
 * both sides.
 */
export function withV(version: string) {
  const v = String(version || "").trim();
  if (!v) return v;
  return /^v/i.test(v) ? `V${v.slice(1)}` : `V${v}`;
}
