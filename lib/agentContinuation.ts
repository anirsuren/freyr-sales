export const OUTPUT_LIMIT_MARKER =
  "_Response paused at the output limit. Reply **continue** and I’ll finish from here._";

export type ContinuationDecision = "complete" | "continue" | "limit" | "empty";

/** Pure stop-reason policy, kept separate so output-limit boundaries are testable. */
export function continuationDecision(
  stopReason: string | null,
  hasText: boolean,
  continuationsUsed: number,
  maxContinuations: number
): ContinuationDecision {
  if (stopReason !== "max_tokens") return "complete";
  if (!hasText) return "empty";
  return continuationsUsed >= maxContinuations ? "limit" : "continue";
}
