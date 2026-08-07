/**
 * Compare the complete owner-editable offering payload.
 *
 * Keep the comparison in one small, tested function so a newly editable field
 * cannot quietly bypass the Save button. The caller builds both snapshots with
 * the same keys and value shapes used by the offering PATCH request.
 */
export function hasOfferingEditChanges(
  current: Record<string, unknown>,
  initial: Record<string, unknown>
): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}
