/** A goal name can contain “Leads”; that does not make its progress a Leads-list question. */
export function asksAboutGoalProgress(message: string): boolean {
  return /\b(goals?|targets?|performance)\b/i.test(message) &&
    /\b(progress|verified|pending|sent[ -]?back|months?|breakdown|achieved|met)\b/i.test(message);
}

/** Explicit board/forecast questions must not take an Opportunities-only shortcut. */
export function asksAboutPipelineBoard(message: string): boolean {
  return /\b(?:pipeline\s+(?:page|board|deals?)|forecast|pitch[ -]sessions?|weighted\s+commit)\b/i.test(message);
}

/** Contract records require their own reader even when opportunity estimates are mentioned. */
export function asksAboutContractRecords(message: string): boolean {
  return /\bcontracts?\b/i.test(message);
}

/** Carry only the user's timezone on a direct answer to the pending reminder question. */
export function reminderTimeZone(message: string, history: {role: string; text: string}[] = []): string | undefined {
  const zone = (text: string) => text.match(/\b(?:[A-Za-z_]+\/){1,2}[A-Za-z_+-]+\b/)?.[0];
  const current = zone(message);
  if (current) return current;
  if (/\bremind(?:er|ers)?\b/i.test(message)) return undefined;
  if (!/\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon|midnight)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{4}-\d{2}-\d{2}\b/i.test(message)) return undefined;
  const last = history.at(-1);
  const previousUser = [...history].reverse().find(t => t.role === "user");
  if (last?.role !== "agent" || !/\b(?:day|date|time|when)\b/i.test(last.text) || !/\bremind(?:er)?\b/i.test(last.text) || !/\bremind(?:er)?\b/i.test(previousUser?.text || "")) return undefined;
  return zone(previousUser!.text);
}

/** CRM work must remain available even when a tracked company or updates are mentioned. */
export function asksAboutCustomerWork(message: string): boolean {
  return /\b(?:opportunit(?:y|ies)|solutioning|crm|customer\s+call|sales\s+(?:work|activity)|account\s+activity)\b/i.test(message);
}
