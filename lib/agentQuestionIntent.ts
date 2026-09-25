/** A goal name can contain “Leads”; that does not make its progress a Leads-list question. */
export function asksAboutGoalProgress(message: string): boolean {
  return /\b(goals?|targets?|performance)\b/i.test(message) &&
    /\b(progress|verified|pending|sent[ -]?back|months?|breakdown|achieved|met)\b/i.test(message);
}
