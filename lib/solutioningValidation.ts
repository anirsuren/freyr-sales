/** New requests require a real, non-past due date and a useful brief.
 * Internal deliverables inherited from existing requests retain their history. */
export function validateNewSolutioningRequest(
  input: { neededBy?: string; details?: string },
  today: string,
): void {
  const due = String(input.neededBy ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      Number.isNaN(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due) {
    throw new Error("Pick a valid due date.");
  }
  if (due < today) throw new Error("The needed date has to be today or later.");
  if (!String(input.details ?? "").trim()) {
    throw new Error("Tell the Solutioning team what they need to know.");
  }
}

/** Work raised from an existing request inherits that request's brief and due
 * date. Legacy requests may have no brief or a date that has since passed;
 * those facts must not prevent their owner from starting the deliverable. */
export function validateSolutioningCreation(
  input: { type?: string; requestId?: string; neededBy?: string; details?: string },
  today: string,
): void {
  const linkedWork =
    (input.type === "submission" || input.type === "presentation") &&
    !!input.requestId?.trim();
  if (!linkedWork) validateNewSolutioningRequest(input, today);
}

export function canAssignSolutioning(role: string, privileges: readonly string[]): boolean {
  return role === "admin" || privileges.includes("admin") || privileges.includes("sol_owner");
}
