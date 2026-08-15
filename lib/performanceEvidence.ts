/**
 * Where a performance claim's proof lives in Freya.Docs.
 *
 * Its own module because three routes need it (sign, complete, read) and a
 * Next route file may only export handlers — exporting the constant from one
 * of them fails the build.
 */
export const EVIDENCE_NAMESPACE = "perf-evidence/";
