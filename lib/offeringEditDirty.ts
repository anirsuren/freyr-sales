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
  /* KEY ORDER IS NOT A CHANGE (Aug 27: a fresh edit page said "You have
     unsaved changes" because the two snapshots listed the same keys in a
     different order, and stringify faithfully preserved the accident). The
     two objects are built in two places by hand, so the comparison must not
     care where each line sits. Stable-sort every object's keys, then compare. */
  return stable(current) !== stable(initial);
}

function stable(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}
