/** Human-readable, factual changes for the Solutioning audit trail. */
export function describeValueChange(label: string, before?: string | null, after?: string | null): string | null {
  const oldValue = before?.trim() || "";
  const newValue = after?.trim() || "";
  if (oldValue === newValue) return null;
  if (!oldValue) return `${label} set to ${newValue}`;
  if (!newValue) return `${label} cleared (was ${oldValue})`;
  return `${label} changed from ${oldValue} to ${newValue}`;
}

export function describeListChange(label: string, before: string[] = [], after: string[] = []): string[] {
  const old = new Map(before.map((name) => [name.trim().toLowerCase(), name.trim()]));
  const next = new Map(after.map((name) => [name.trim().toLowerCase(), name.trim()]));
  const changes: string[] = [];
  for (const [key, name] of next) if (key && !old.has(key)) changes.push(`Added ${name} ${label}`);
  for (const [key, name] of old) if (key && !next.has(key)) changes.push(`Removed ${name} ${label}`);
  return changes;
}

export function describeTextChange(label: string, before?: string, after?: string): string | null {
  const oldValue = before?.trim() || "";
  const newValue = after?.trim() || "";
  if (oldValue === newValue) return null;
  if (!newValue) return `${label} cleared (was: ${oldValue})`;
  if (!oldValue) return `${label} added: ${newValue}`;
  return `${label} changed from "${oldValue}" to "${newValue}"`;
}

export type WorkstreamAuditSnapshot = {
  lead?: string;
  primaryAssignee?: string;
  contributors: string[];
};

export function describeWorkstreamChanges(before: WorkstreamAuditSnapshot, after: WorkstreamAuditSnapshot): string[] {
  return [
    describeValueChange("Lead", before.lead, after.lead),
    describeValueChange("Primary assignee", before.primaryAssignee, after.primaryAssignee),
    ...describeListChange("as contributor", before.contributors, after.contributors),
  ].filter((change): change is string => Boolean(change));
}
